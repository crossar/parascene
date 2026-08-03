/**
 * Challenge lifecycle side effects — pins and feed invalidation so routes stay
 * thin. Pin upsert/remove, overlap exclusivity, and `onResultsPublished`.
 * #challenges is machine-readable only — do not post `challenge_announce`.
 */

import {
	loadEditorialPinPolicyDocument,
	parseEditorialPinPolicyDocument,
	serializeEditorialPinPolicyDocument,
	validateEditorialPinPolicyDocument,
	FEED_EDITORIAL_PINS_POLICY_KEY
} from "../feed/editorialPinPolicy.js";
import { bumpFeedVersionCounter } from "../feed/feedVersion.js";
import { invalidateAndRebuildChallengeFeedSnapshotCache } from "../feed/challengeFeedSnapshotCache.js";
import {
	upsertChallengeFeedPinInMeta,
	removeChallengeFeedPinFromMeta
} from "../../src/shared/challengeSubmitMeta.js";

export const OPEN_PIN_WINDOW_DAYS = 7;
export const WINNERS_PIN_WINDOW_DAYS = 14;

/**
 * @param {unknown} kind
 * @returns {'open' | 'winners' | 'topic_vote' | null}
 */
export function normalizeChallengePinKind(kind) {
	const k = String(kind || "").trim().toLowerCase();
	if (k === "winners" || k === "open" || k === "topic_vote") return k;
	return null;
}

/**
 * @param {'open' | 'winners' | 'topic_vote'} pinKind
 */
function windowDaysForPinKind(pinKind) {
	if (pinKind === "winners") return WINNERS_PIN_WINDOW_DAYS;
	return OPEN_PIN_WINDOW_DAYS;
}

/**
 * True when two half-open-ish ISO windows overlap (inclusive endpoints).
 * @param {string} aStart
 * @param {string} aUntil
 * @param {string} bStart
 * @param {string} bUntil
 */
export function challengePinWindowsOverlap(aStart, aUntil, bStart, bUntil) {
	const a0 = Date.parse(aStart);
	const a1 = Date.parse(aUntil);
	const b0 = Date.parse(bStart);
	const b1 = Date.parse(bUntil);
	if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
	return a0 <= b1 && b0 <= a1;
}

/**
 * Find another challenge-* editorial pin whose window overlaps the candidate.
 * Same pin id is ignored (upsert of self). Non-challenge pins ignored.
 *
 * @param {object[]} pins
 * @param {{ id: string, starts_at: string, until: string }} candidate
 * @returns {{ pin: object, message: string } | null}
 */
export function findOverlappingChallengeEditorialPin(pins, candidate) {
	const candId = String(candidate?.id || "").trim();
	const candStart = String(candidate?.starts_at || "").trim();
	const candUntil = String(candidate?.until || "").trim();
	if (!candId || !candStart || !candUntil) return null;
	const list = Array.isArray(pins) ? pins : [];
	for (const pin of list) {
		const id = String(pin?.id || "").trim();
		if (!id || id === candId) continue;
		if (!id.startsWith("challenge-")) continue;
		if (pin?.enabled === false) continue;
		const otherStart = String(pin?.starts_at || "").trim();
		const otherUntil = String(pin?.until || "").trim();
		if (!otherStart || !otherUntil) continue;
		if (!challengePinWindowsOverlap(candStart, candUntil, otherStart, otherUntil)) continue;
		const startLabel = otherStart.slice(0, 10);
		const untilLabel = otherUntil.slice(0, 10);
		return {
			pin,
			message: `Pin window overlaps ${id} (${startLabel} → ${untilLabel}). Only one challenge pin may be active at a time — adjust the dates.`
		};
	}
	return null;
}

/**
 * Upsert a timed challenge editorial pin (`challenge-{kind}-{challengeId}`)
 * and stamp the creation's meta (trophy annotation + publish/delete locks).
 * Same behavior as the organize pins route, with explicit window control.
 * Rejects when the window overlaps another challenge-* pin (one active at a time).
 *
 * @param {{
 *   queries: object,
 *   kind: 'open' | 'winners' | 'topic_vote',
 *   challengeId: string,
 *   createdImageId: number,
 *   startsAt?: string | null,   // ISO; defaults to now
 *   until?: string | null,      // ISO; defaults to now + kind window
 * }} args
 * @returns {Promise<{ ok: true, pin: object } | { ok: false, error: string }>}
 */
export async function upsertChallengeEditorialPin({
	queries,
	kind,
	challengeId,
	createdImageId,
	startsAt,
	until
}) {
	const pinKind = normalizeChallengePinKind(kind);
	const cid = String(challengeId || "").trim();
	const imageId = Number(createdImageId);
	if (!pinKind) {
		return { ok: false, error: "kind must be open, winners, or topic_vote" };
	}
	if (!cid || !Number.isFinite(imageId) || imageId <= 0) {
		return { ok: false, error: "challenge_id and created_image_id required" };
	}
	if (!queries?.upsertPolicyKey?.run) {
		return { ok: false, error: "Policy storage unavailable." };
	}

	const nowMs = Date.now();
	const startMs = startsAt ? Date.parse(startsAt) : NaN;
	const startIso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : new Date(nowMs).toISOString();
	const windowDays = windowDaysForPinKind(pinKind);
	const untilMs = until ? Date.parse(until) : NaN;
	const untilIso = Number.isFinite(untilMs)
		? new Date(untilMs).toISOString()
		: new Date(Date.parse(startIso) + windowDays * 86400000).toISOString();
	if (Date.parse(untilIso) <= Date.parse(startIso)) {
		return { ok: false, error: "Pin window must end after it starts." };
	}

	const doc = await loadEditorialPinPolicyDocument(queries);
	const pinId = `challenge-${pinKind}-${cid}`;
	const nextPin = {
		id: pinId,
		created_image_id: imageId,
		enabled: true,
		starts_at: startIso,
		until: untilIso,
		show_metadata: true,
		extra_spacing: true,
		surfaces: ["all"],
		inject: {
			slot: "min_index",
			respect_challenge: true,
			after_challenge_offset: 2
		}
	};
	const pins = Array.isArray(doc.pins) ? [...doc.pins] : [];
	const overlap = findOverlappingChallengeEditorialPin(pins, nextPin);
	if (overlap) {
		return { ok: false, error: overlap.message };
	}
	const idx = pins.findIndex((p) => String(p?.id || "") === pinId);
	if (idx >= 0) pins[idx] = { ...pins[idx], ...nextPin };
	else pins.push(nextPin);

	const parsed = parseEditorialPinPolicyDocument({ defaults: doc.defaults, pins });
	const validated = validateEditorialPinPolicyDocument(parsed);
	if (!validated.ok) return { ok: false, error: validated.error };
	await queries.upsertPolicyKey.run(
		FEED_EDITORIAL_PINS_POLICY_KEY,
		serializeEditorialPinPolicyDocument(validated.document),
		"Sitewide editorial feed pins: inject creations on page 1 with placement and display knobs."
	);
	await bumpFeedVersionCounter(queries);

	try {
		const row =
			typeof queries?.selectCreatedImageByIdAnyUser?.get === "function"
				? await queries.selectCreatedImageByIdAnyUser.get(imageId)
				: null;
		if (row) {
			let prevMeta = row.meta;
			if (typeof prevMeta === "string") {
				try {
					prevMeta = JSON.parse(prevMeta);
				} catch {
					prevMeta = {};
				}
			}
			if (!prevMeta || typeof prevMeta !== "object" || Array.isArray(prevMeta)) prevMeta = {};
			const nextMeta = upsertChallengeFeedPinInMeta(prevMeta, {
				pin_id: pinId,
				challenge_id: cid,
				kind: pinKind,
				until: untilIso,
				starts_at: startIso
			});
			if (typeof queries?.updateCreatedImageMetaAnyUser?.run === "function") {
				await queries.updateCreatedImageMetaAnyUser.run(imageId, nextMeta);
			}
		}
	} catch (stampErr) {
		console.warn("[challengeLifecycle] pin meta stamp", stampErr?.message || stampErr);
	}

	return { ok: true, pin: nextPin };
}

/**
 * Remove (or disable) a challenge editorial pin by kind + challenge id.
 * Clears the creation meta stamp when the prior pin had a created_image_id.
 *
 * @param {{
 *   queries: object,
 *   kind: 'open' | 'winners' | 'topic_vote',
 *   challengeId: string
 * }} args
 * @returns {Promise<{ ok: true, removed: boolean } | { ok: false, error: string }>}
 */
export async function removeChallengeEditorialPin({ queries, kind, challengeId }) {
	const pinKind = normalizeChallengePinKind(kind);
	const cid = String(challengeId || "").trim();
	if (!pinKind) {
		return { ok: false, error: "kind must be open, winners, or topic_vote" };
	}
	if (!cid) {
		return { ok: false, error: "challenge_id required" };
	}
	if (!queries?.upsertPolicyKey?.run) {
		return { ok: false, error: "Policy storage unavailable." };
	}

	const pinId = `challenge-${pinKind}-${cid}`;
	const doc = await loadEditorialPinPolicyDocument(queries);
	const pins = Array.isArray(doc.pins) ? [...doc.pins] : [];
	const idx = pins.findIndex((p) => String(p?.id || "") === pinId);
	if (idx < 0) {
		return { ok: true, removed: false };
	}
	const prev = pins[idx];
	const imageId = Number(prev?.created_image_id);
	pins.splice(idx, 1);

	const parsed = parseEditorialPinPolicyDocument({ defaults: doc.defaults, pins });
	const validated = validateEditorialPinPolicyDocument(parsed);
	if (!validated.ok) return { ok: false, error: validated.error };
	await queries.upsertPolicyKey.run(
		FEED_EDITORIAL_PINS_POLICY_KEY,
		serializeEditorialPinPolicyDocument(validated.document),
		"Sitewide editorial feed pins: inject creations on page 1 with placement and display knobs."
	);
	await bumpFeedVersionCounter(queries);

	if (Number.isFinite(imageId) && imageId > 0) {
		try {
			const row =
				typeof queries?.selectCreatedImageByIdAnyUser?.get === "function"
					? await queries.selectCreatedImageByIdAnyUser.get(imageId)
					: null;
			if (row) {
				let prevMeta = row.meta;
				if (typeof prevMeta === "string") {
					try {
						prevMeta = JSON.parse(prevMeta);
					} catch {
						prevMeta = {};
					}
				}
				if (!prevMeta || typeof prevMeta !== "object" || Array.isArray(prevMeta)) prevMeta = {};
				const nextMeta = removeChallengeFeedPinFromMeta(prevMeta, pinId);
				if (typeof queries?.updateCreatedImageMetaAnyUser?.run === "function") {
					await queries.updateCreatedImageMetaAnyUser.run(imageId, nextMeta);
				}
			}
		} catch (stampErr) {
			console.warn("[challengeLifecycle] pin meta clear", stampErr?.message || stampErr);
		}
	}

	return { ok: true, removed: true };
}

/**
 * Side effects after results publish: winners pin + feed snapshot invalidation.
 * Does not post channel messages — #challenges stays machine-readable
 * (configs / submissions / global settings only).
 *
 * @param {{
 *   queries: object,
 *   challengeId: string,
 *   winnersPin?: { createdImageId: number, startsAt?: string | null, until?: string | null } | null,
 * }} args
 * @returns {Promise<{ pin: object | null, pinError: string | null, announced: false }>}
 */
export async function onResultsPublished({ queries, challengeId, winnersPin }) {
	let pin = null;
	let pinError = null;

	if (winnersPin && Number(winnersPin.createdImageId) > 0) {
		const res = await upsertChallengeEditorialPin({
			queries,
			kind: "winners",
			challengeId,
			createdImageId: winnersPin.createdImageId,
			startsAt: winnersPin.startsAt,
			until: winnersPin.until
		});
		if (res.ok) pin = res.pin;
		else pinError = res.error;
	}

	invalidateAndRebuildChallengeFeedSnapshotCache();
	return { pin, pinError, announced: false };
}
