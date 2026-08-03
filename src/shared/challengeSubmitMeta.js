/**
 * Challenge-related creation meta helpers (submissions + feed pins + organizer refs).
 * Submissions: meta.challenge_submissions
 * Feed pins (promo/winners): meta.challenge_feed_pins — stamped when organizers pin.
 * Organizer media: meta.challenge_organizer_refs — hero / results / topic_vote URLs.
 */

import { creationMetaHasChallengeOrganizerRef } from './challengeOrganizerRefMeta.js';

/**
 * True when this creation has been submitted to at least one challenge (see meta.challenge_submissions).
 * @param {unknown} meta
 */
export function creationMetaHasChallengeSubmission(meta) {
	return Array.isArray(meta?.challenge_submissions) && meta.challenge_submissions.length > 0;
}

/**
 * @param {unknown} meta
 * @param {number} [nowMs]
 * @returns {{ pin_id: string, challenge_id: string, kind: string, until: string|null, starts_at: string|null }[]}
 */
export function listActiveChallengeFeedPinsFromMeta(meta, nowMs = Date.now()) {
	const arr = meta?.challenge_feed_pins;
	if (!Array.isArray(arr)) return [];
	const now = typeof nowMs === 'number' ? nowMs : Date.now();
	const out = [];
	for (const raw of arr) {
		if (!raw || typeof raw !== 'object') continue;
		const pinId = raw.pin_id != null ? String(raw.pin_id).trim() : '';
		if (!pinId) continue;
		const startsAt =
			typeof raw.starts_at === 'string' && raw.starts_at.trim() ? raw.starts_at.trim() : null;
		const until = typeof raw.until === 'string' && raw.until.trim() ? raw.until.trim() : null;
		const startMs = startsAt ? Date.parse(startsAt) : NaN;
		if (Number.isFinite(startMs) && now < startMs) continue;
		const untilMs = until ? Date.parse(until) : NaN;
		if (Number.isFinite(untilMs) && now > untilMs) continue;
		const kindRaw = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
		const kind =
			kindRaw === 'winners' || kindRaw === 'open' || kindRaw === 'topic_vote' ? kindRaw : 'other';
		const challengeId =
			raw.challenge_id != null ? String(raw.challenge_id).trim() : '';
		out.push({
			pin_id: pinId,
			challenge_id: challengeId,
			kind,
			until,
			starts_at: startsAt
		});
	}
	return out;
}

/**
 * True while an organizer feed pin (promo/winners) is still in its active window.
 * @param {unknown} meta
 * @param {number} [nowMs]
 */
export function creationMetaHasActiveChallengeFeedPin(meta, nowMs = Date.now()) {
	return listActiveChallengeFeedPinsFromMeta(meta, nowMs).length > 0;
}

/**
 * Library / detail annotation: challenge entry, feed pin, or organizer-attached media.
 * @param {unknown} meta
 * @param {number} [nowMs]
 */
export function creationMetaHasChallengeAnnotation(meta, nowMs = Date.now()) {
	return (
		creationMetaHasChallengeSubmission(meta) ||
		creationMetaHasActiveChallengeFeedPin(meta, nowMs) ||
		creationMetaHasChallengeOrganizerRef(meta)
	);
}

/**
 * Upsert one feed-pin stamp onto creation meta (idempotent by pin_id).
 * @param {object|null|undefined} meta
 * @param {{
 *   pin_id: string,
 *   challenge_id?: string,
 *   kind?: string,
 *   until?: string|null,
 *   starts_at?: string|null
 * }} pin
 * @returns {object}
 */
export function upsertChallengeFeedPinInMeta(meta, pin) {
	const base = meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {};
	const pinId = pin?.pin_id != null ? String(pin.pin_id).trim() : '';
	if (!pinId) return base;
	const prev = Array.isArray(base.challenge_feed_pins) ? [...base.challenge_feed_pins] : [];
	const filtered = prev.filter((row) => {
		if (!row || typeof row !== 'object') return false;
		return String(row.pin_id || '').trim() !== pinId;
	});
	const kindRaw = typeof pin.kind === 'string' ? pin.kind.trim().toLowerCase() : '';
	filtered.push({
		pin_id: pinId,
		challenge_id: pin.challenge_id != null ? String(pin.challenge_id).trim() : '',
		kind: kindRaw === 'winners' || kindRaw === 'open' || kindRaw === 'topic_vote' ? kindRaw : 'other',
		until: typeof pin.until === 'string' && pin.until.trim() ? pin.until.trim() : null,
		starts_at:
			typeof pin.starts_at === 'string' && pin.starts_at.trim() ? pin.starts_at.trim() : null,
		pinned_at: new Date().toISOString()
	});
	base.challenge_feed_pins = filtered;
	return base;
}

/**
 * Remove one feed-pin stamp by pin_id (after pin clear/expire).
 * @param {object|null|undefined} meta
 * @param {string} pinId
 * @returns {object}
 */
export function removeChallengeFeedPinFromMeta(meta, pinId) {
	const base = meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {};
	const id = pinId != null ? String(pinId).trim() : '';
	if (!id) return base;
	const prev = Array.isArray(base.challenge_feed_pins) ? base.challenge_feed_pins : [];
	base.challenge_feed_pins = prev.filter((row) => {
		if (!row || typeof row !== 'object') return false;
		return String(row.pin_id || '').trim() !== id;
	});
	return base;
}
