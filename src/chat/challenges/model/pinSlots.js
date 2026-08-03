/**
 * Organizer Pins-tab slots: creation URL + local YMD window per role.
 * Defaults mirror calendar pin-window indicators (open 7d from start, winners 14d).
 */

import { addDaysYmd, isoToLocalYmd } from './dayBounds.js';
import { challengeConfigDayRange } from './tracks.js';

/** Same defaults the server applies when creating editorial pins. */
export const CHALLENGE_OPEN_PIN_DAYS = 7;
export const CHALLENGE_WINNERS_PIN_DAYS = 14;

/** @typedef {'open' | 'winners' | 'topic_vote'} ChallengePinSlotKind */

/**
 * Feed-pin windows for one challenge, derived from its schedule (indicator
 * only when no Pins-tab overrides): open pin runs from the start day, winners
 * pin from results publish (or the end day).
 *
 * @param {object | null | undefined} merged challenge config
 * @returns {{ kind: 'open' | 'winners', start: string, end: string }[]} ymd ranges (inclusive)
 */
export function pinWindowsFromChallengeConfig(merged) {
	const range = challengeConfigDayRange(merged);
	if (!range) return [];
	const out = [];
	if (range.start) {
		out.push({
			kind: 'open',
			start: range.start,
			end: addDaysYmd(range.start, CHALLENGE_OPEN_PIN_DAYS - 1)
		});
	}
	const publishedAtRaw =
		merged?.results_published_at != null ? String(merged.results_published_at).trim() : '';
	const publishedMs = publishedAtRaw ? Date.parse(publishedAtRaw) : NaN;
	const winnersStart = Number.isFinite(publishedMs)
		? isoToLocalYmd(publishedAtRaw)
		: range.end;
	if (winnersStart) {
		out.push({
			kind: 'winners',
			start: winnersStart,
			end: addDaysYmd(winnersStart, CHALLENGE_WINNERS_PIN_DAYS - 1)
		});
	}
	return out;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function ymdOrEmpty(raw) {
	const s = typeof raw === 'string' ? raw.trim().slice(0, 10) : '';
	return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/**
 * Default topic-vote window: winners/end day → +6 days (7 inclusive).
 * @param {object | null | undefined} cfg
 * @returns {{ start: string, end: string }}
 */
function defaultTopicVoteWindow(cfg) {
	const derived = pinWindowsFromChallengeConfig(cfg);
	const winners = derived.find((w) => w.kind === 'winners');
	const open = derived.find((w) => w.kind === 'open');
	const start = winners?.start || open?.end || '';
	if (!start) return { start: '', end: '' };
	return { start, end: addDaysYmd(start, CHALLENGE_OPEN_PIN_DAYS - 1) };
}

/**
 * Resolve display/edit windows for the three Pins slots (config override → schedule defaults).
 * @param {object | null | undefined} cfg
 * @returns {Record<ChallengePinSlotKind, { start: string, until: string }>}
 */
export function resolvePinSlotWindows(cfg) {
	const c = cfg && typeof cfg === 'object' ? cfg : {};
	const derived = pinWindowsFromChallengeConfig(c);
	const openD = derived.find((w) => w.kind === 'open');
	const winnersD = derived.find((w) => w.kind === 'winners');
	const topicD = defaultTopicVoteWindow(c);

	const openStart = ymdOrEmpty(c.pin_open_start_ymd) || openD?.start || '';
	const openUntil =
		ymdOrEmpty(c.pin_open_until_ymd) ||
		openD?.end ||
		(openStart ? addDaysYmd(openStart, CHALLENGE_OPEN_PIN_DAYS - 1) : '');

	const winnersStart = ymdOrEmpty(c.pin_winners_start_ymd) || winnersD?.start || '';
	const winnersUntil =
		ymdOrEmpty(c.pin_winners_until_ymd) ||
		winnersD?.end ||
		(winnersStart ? addDaysYmd(winnersStart, CHALLENGE_WINNERS_PIN_DAYS - 1) : '');

	const topicStart = ymdOrEmpty(c.pin_topic_vote_start_ymd) || topicD.start || '';
	const topicUntil =
		ymdOrEmpty(c.pin_topic_vote_until_ymd) ||
		topicD.end ||
		(topicStart ? addDaysYmd(topicStart, CHALLENGE_OPEN_PIN_DAYS - 1) : '');

	return {
		open: { start: openStart, until: openUntil },
		winners: { start: winnersStart, until: winnersUntil },
		topic_vote: { start: topicStart, until: topicUntil }
	};
}

/**
 * Calendar dots: prefer Announce-tab overrides, else schedule defaults.
 * @param {object | null | undefined} merged
 * @returns {{ kind: 'open' | 'winners' | 'topic_vote', start: string, end: string }[]}
 */
export function pinWindowsForCalendar(merged) {
	const windows = resolvePinSlotWindows(merged);
	const out = [];
	if (windows.open.start && windows.open.until) {
		out.push({ kind: 'open', start: windows.open.start, end: windows.open.until });
	}
	if (windows.topic_vote.start && windows.topic_vote.until) {
		out.push({
			kind: 'topic_vote',
			start: windows.topic_vote.start,
			end: windows.topic_vote.until
		});
	}
	if (windows.winners.start && windows.winners.until) {
		out.push({ kind: 'winners', start: windows.winners.start, end: windows.winners.until });
	}
	return out;
}

/**
 * Apply Pins-tab form values onto a challenge_config payload (URLs + YMD windows).
 * @param {object} payload
 * @param {FormData} fd
 * @param {{
 *   heroRef: string,
 *   resultsRef: string,
 *   topicVoteRef: string
 * }} refs
 */
export function applyPinSlotsToPayload(payload, fd, refs) {
	const heroRef = typeof refs.heroRef === 'string' ? refs.heroRef.trim() : '';
	const resultsRef = typeof refs.resultsRef === 'string' ? refs.resultsRef.trim() : '';
	const topicVoteRef = typeof refs.topicVoteRef === 'string' ? refs.topicVoteRef.trim() : '';

	if (heroRef) payload.hero_image_url = heroRef;
	else delete payload.hero_image_url;
	if (resultsRef) payload.results_creation_url = resultsRef;
	else delete payload.results_creation_url;
	if (topicVoteRef) payload.topic_vote_creation_url = topicVoteRef;
	else delete payload.topic_vote_creation_url;

	const openStart = ymdOrEmpty(fd.get('pin_open_start_ymd'));
	const openUntil = ymdOrEmpty(fd.get('pin_open_until_ymd'));
	const winnersStart = ymdOrEmpty(fd.get('pin_winners_start_ymd'));
	const winnersUntil = ymdOrEmpty(fd.get('pin_winners_until_ymd'));
	const topicStart = ymdOrEmpty(fd.get('pin_topic_vote_start_ymd'));
	const topicUntil = ymdOrEmpty(fd.get('pin_topic_vote_until_ymd'));

	if (openStart) payload.pin_open_start_ymd = openStart;
	else delete payload.pin_open_start_ymd;
	if (openUntil) payload.pin_open_until_ymd = openUntil;
	else delete payload.pin_open_until_ymd;
	if (winnersStart) payload.pin_winners_start_ymd = winnersStart;
	else delete payload.pin_winners_start_ymd;
	if (winnersUntil) payload.pin_winners_until_ymd = winnersUntil;
	else delete payload.pin_winners_until_ymd;
	if (topicStart) payload.pin_topic_vote_start_ymd = topicStart;
	else delete payload.pin_topic_vote_start_ymd;
	if (topicUntil) payload.pin_topic_vote_until_ymd = topicUntil;
	else delete payload.pin_topic_vote_until_ymd;
}

/**
 * Parse a creation id from a stored ref (client; share tokens may not resolve).
 * @param {unknown} raw
 * @returns {number}
 */
export function parseCreationIdFromPinRef(raw) {
	const s = typeof raw === 'string' ? raw.trim() : '';
	if (!s) return NaN;
	const m1 = s.match(/\/creations\/(\d+)(?:\D|$)/i);
	if (m1) return Number(m1[1]);
	const m2 = s.match(/\/(?:api\/)?create\/images\/(\d+)(?:\D|$)/i);
	if (m2) return Number(m2[1]);
	return NaN;
}

/**
 * Build pin sync ops from form refs + windows (for POST organize/pins after config save).
 * @param {string} challengeId
 * @param {{
 *   heroRef: string,
 *   resultsRef: string,
 *   topicVoteRef: string,
 *   openStart: string,
 *   openUntil: string,
 *   winnersStart: string,
 *   winnersUntil: string,
 *   topicStart: string,
 *   topicUntil: string,
 *   localStartOfDayToIso: (ymd: string) => string,
 *   localEndOfDayToIso: (ymd: string) => string
 * }} opts
 * @returns {{ kind: ChallengePinSlotKind, clear: boolean, created_image_id?: number, creation_ref?: string, starts_at?: string, until?: string }[]}
 */
export function buildPinSyncOps(_challengeId, opts) {
	/** @type {{ kind: ChallengePinSlotKind, ref: string, start: string, until: string }[]} */
	const slots = [
		{ kind: 'open', ref: opts.heroRef, start: opts.openStart, until: opts.openUntil },
		{ kind: 'winners', ref: opts.resultsRef, start: opts.winnersStart, until: opts.winnersUntil },
		{
			kind: 'topic_vote',
			ref: opts.topicVoteRef,
			start: opts.topicStart,
			until: opts.topicUntil
		}
	];

	return slots.map((slot) => {
		const ref = typeof slot.ref === 'string' ? slot.ref.trim() : '';
		if (!ref) {
			return { kind: slot.kind, clear: true };
		}
		const imageId = parseCreationIdFromPinRef(ref);
		const startsAt = slot.start ? opts.localStartOfDayToIso(slot.start) : '';
		const untilIso = slot.until ? opts.localEndOfDayToIso(slot.until) : '';
		/** @type {{ kind: ChallengePinSlotKind, clear: boolean, created_image_id?: number, creation_ref?: string, starts_at?: string, until?: string }} */
		const op = {
			kind: slot.kind,
			clear: false,
			creation_ref: ref
		};
		if (Number.isFinite(imageId) && imageId > 0) op.created_image_id = imageId;
		if (startsAt) op.starts_at = startsAt;
		if (untilIso) op.until = untilIso;
		return op;
	});
}
