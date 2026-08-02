import { transformFeedCreationRow } from './transformFeedCreationRow.js';
import {
	EDITORIAL_PIN_POLICY_DEFAULTS,
	isEditorialPinActive,
	loadEditorialPinPolicyDocument,
	normalizeEditorialPinDefaults
} from './editorialPinPolicy.js';
import { listActiveChallengeFeedPinsFromMeta } from '../../src/shared/challengeSubmitMeta.js';

/**
 * @param {object|null|undefined} item
 * @returns {number|null}
 */
export function feedItemCreationId(item) {
	if (!item || typeof item !== 'object') return null;
	const raw = item.created_image_id ?? item.id;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isNonCreationFeedRow(item) {
	const type = typeof item?.type === 'string' ? item.type.trim().toLowerCase() : '';
	return type === 'tip' || type === 'blog_post' || type === 'engagement';
}

/**
 * @param {string} slot
 * @param {number} listLength
 * @returns {number}
 */
function slotNameToIndex(slot, listLength) {
	const n = listLength;
	if (slot === 'top') return 0;
	if (slot === 'after_first') return Math.min(1, n);
	if (slot === 'after_second') return Math.min(2, n);
	if (slot === 'after_third') return Math.min(3, n);
	if (slot === 'after_fourth') return Math.min(4, n);
	if (slot === 'after_fifth') return Math.min(5, n);
	return 0;
}

/**
 * @param {object[]} list
 * @param {import('./editorialPinPolicy.js').EditorialPinConfig} pin
 * @param {import('./editorialPinPolicy.js').EditorialPinPolicyDefaults} defaults
 * @param {{ slotPackPageOne?: boolean }} opts
 * @returns {number}
 */
export function resolveEditorialPinInsertIndex(list, pin, defaults, opts = {}) {
	const n = Array.isArray(list) ? list.length : 0;
	const inject = pin?.inject ?? {};
	const baseDefaults = defaults ?? EDITORIAL_PIN_POLICY_DEFAULTS;
	const minIdx = opts.slotPackPageOne
		? Number(inject.min_index_slot_pack ?? baseDefaults.min_index_slot_pack)
		: Number(inject.min_index_flat ?? baseDefaults.min_index_flat);

	let idx = Math.max(0, minIdx);
	const slot = typeof inject.slot === 'string' ? inject.slot : 'min_index';

	if (slot === 'fixed_index') {
		idx = Number.isFinite(Number(inject.fixed_index)) ? Number(inject.fixed_index) : idx;
	} else if (slot !== 'min_index') {
		idx = slotNameToIndex(slot, n);
	}

	if (inject.respect_challenge !== false) {
		const challengeIdx = (Array.isArray(list) ? list : []).findIndex(
			(item) => typeof item?.type === 'string' && item.type === 'engagement'
		);
		if (challengeIdx >= 0) {
			const off = Number(inject.after_challenge_offset ?? baseDefaults.after_challenge_offset);
			idx = Math.max(idx, challengeIdx + Math.max(0, off));
		}
	}

	idx = Math.max(idx, minIdx);
	idx = Math.min(Math.max(0, idx), n);

	while (
		idx > 0 &&
		idx < n &&
		!isNonCreationFeedRow(list[idx - 1]) &&
		isNonCreationFeedRow(list[idx])
	) {
		idx += 1;
	}

	return Math.min(idx, n);
}

/**
 * @param {object[]} list
 * @param {Set<number>} pinIds
 * @returns {object[]}
 */
export function removeEditorialPinsFromList(list, pinIds) {
	if (!(pinIds instanceof Set) || pinIds.size === 0) {
		return Array.isArray(list) ? [...list] : [];
	}
	return (Array.isArray(list) ? list : []).filter((item) => {
		const cid = feedItemCreationId(item);
		return cid == null || !pinIds.has(cid);
	});
}

/**
 * @param {object[]} list
 * @param {object} pinItem
 * @param {import('./editorialPinPolicy.js').EditorialPinConfig} pinConfig
 * @param {import('./editorialPinPolicy.js').EditorialPinPolicyDefaults} defaults
 * @param {{ limit: number, slotPackPageOne?: boolean }} opts
 * @returns {object[]}
 */
export function mergeEditorialPinIntoPage(list, pinItem, pinConfig, defaults, opts) {
	const limit = Math.min(Math.max(1, Number(opts?.limit) || 20), 100);
	const pinId = feedItemCreationId(pinItem);
	const pinIds = pinId != null ? new Set([pinId]) : new Set();
	let out = removeEditorialPinsFromList(list, pinIds);
	if (!pinItem || pinIds.size === 0 || !pinConfig) {
		return out.slice(0, limit);
	}

	const idx = resolveEditorialPinInsertIndex(out, pinConfig, defaults, {
		slotPackPageOne: Boolean(opts?.slotPackPageOne)
	});
	out.splice(idx, 0, pinItem);
	return out.slice(0, limit);
}

/**
 * @param {object} queries
 * @param {number[]} creationIds
 * @returns {Promise<object[]>}
 */
export async function loadEditorialPinCreationRows(queries, creationIds) {
	const fn = queries?.selectFeedItemsByCreationIds?.all;
	if (typeof fn !== 'function') return [];
	const ids = (Array.isArray(creationIds) ? creationIds : [])
		.map((id) => Number(id))
		.filter((id) => Number.isFinite(id) && id > 0);
	if (ids.length === 0) return [];
	try {
		return (await fn(ids)) ?? [];
	} catch {
		return [];
	}
}

/**
 * @param {object} row
 * @param {import('./editorialPinPolicy.js').EditorialPinConfig} pin
 * @returns {object}
 */
export function transformEditorialPinFeedItem(row, pin) {
	const item = transformFeedCreationRow(row);
	return {
		...item,
		editorial_pin: true,
		editorial_pin_id: pin.id,
		editorial_pin_show_metadata: pin.show_metadata !== false,
		editorial_pin_extra_spacing: pin.extra_spacing !== false
	};
}

/**
 * @param {object} queries
 * @param {{ enableNsfw: boolean, feedSurface?: string, nowMs?: number }} opts
 * @returns {Promise<{ items: object[], pins: import('./editorialPinPolicy.js').EditorialPinConfig[], defaults: import('./editorialPinPolicy.js').EditorialPinPolicyDefaults }>}
 */
export async function buildEditorialPinFeedItems(queries, opts) {
	const doc = await loadEditorialPinPolicyDocument(queries);
	const defaults = doc.defaults ?? EDITORIAL_PIN_POLICY_DEFAULTS;
	const nowMs = Number(opts?.nowMs) || Date.now();
	const feedSurface = typeof opts?.feedSurface === 'string' ? opts.feedSurface : '';
	const activePins = (doc.pins ?? []).filter((pin) =>
		isEditorialPinActive(pin, nowMs, feedSurface)
	);
	if (activePins.length === 0) {
		return { items: [], pins: [], defaults };
	}

	const ids = activePins.map((p) => Number(p.created_image_id));
	const rows = await loadEditorialPinCreationRows(queries, ids);
	const rowById = new Map(rows.map((r) => [Number(r.created_image_id ?? r.id), r]));
	const enableNsfw = Boolean(opts?.enableNsfw);

	const items = [];
	for (const pin of activePins) {
		const row = rowById.get(Number(pin.created_image_id));
		if (!row) continue;
		if (row.unavailable_at != null && row.unavailable_at !== '') continue;
		if (!enableNsfw && row.nsfw) continue;
		items.push({ item: transformEditorialPinFeedItem(row, pin), pin });
	}

	return {
		items: items.map((x) => x.item),
		pins: items.map((x) => x.pin),
		defaults
	};
}

/**
 * @param {object} queries
 * @param {number} [nowMs]
 * @param {string} [feedSurface]
 * @returns {Promise<import('./editorialPinPolicy.js').EditorialPinConfig[]>}
 */
export async function getActiveEditorialPins(queries, nowMs = Date.now(), feedSurface = '') {
	const doc = await loadEditorialPinPolicyDocument(queries);
	return (doc.pins ?? []).filter((pin) => isEditorialPinActive(pin, nowMs, feedSurface));
}

/**
 * Viewer may load an unpublished creation when it is the target of an active editorial feed pin
 * (organizer promo / winners — these stay unpublished by design).
 *
 * @param {object} queries
 * @param {{
 *   ancestorRow: { id?: unknown, unavailable_at?: unknown },
 *   nowMs?: number,
 *   feedSurface?: string,
 * }} args
 * @returns {Promise<boolean>}
 */
export async function canViewUnpublishedCreationViaEditorialPin(queries, args) {
	const ancestorRow = args?.ancestorRow;
	const cid = Number(ancestorRow?.id);
	if (!ancestorRow || !Number.isFinite(cid) || cid <= 0) return false;
	if (ancestorRow.unavailable_at != null && ancestorRow.unavailable_at !== '') return false;
	if (!queries) return false;
	try {
		const nowMs = Number(args?.nowMs) || Date.now();
		const feedSurface = typeof args?.feedSurface === 'string' ? args.feedSurface : '';
		const pins = await getActiveEditorialPins(queries, nowMs, feedSurface);
		return pins.some((pin) => Number(pin?.created_image_id) === cid);
	} catch {
		return false;
	}
}

/**
 * Active editorial pins that target a creation (for creation-detail lock / banner).
 *
 * @param {object} queries
 * @param {number|string} creationId
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<{
 *   active: boolean,
 *   until: string|null,
 *   pins: { id: string, kind: 'open'|'winners'|'other', until: string|null }[]
 * }>}
 */
export async function getCreationFeedPinStatus(queries, creationId, opts = {}) {
	const empty = { active: false, until: null, pins: [] };
	const cid = Number(creationId);
	if (!Number.isFinite(cid) || cid <= 0) return empty;
	const nowMs = Number(opts?.nowMs) || Date.now();

	/** @type {{ id: string, kind: 'open'|'winners'|'other', until: string|null }[]} */
	let pins = [];

	if (queries) {
		try {
			const activePins = await getActiveEditorialPins(queries, nowMs, '');
			for (const pin of activePins) {
				if (Number(pin?.created_image_id) !== cid) continue;
				const id = typeof pin?.id === 'string' ? pin.id : '';
				let kind = 'other';
				if (id.startsWith('challenge-open-')) kind = 'open';
				else if (id.startsWith('challenge-winners-')) kind = 'winners';
				const until = typeof pin?.until === 'string' && pin.until.trim() ? pin.until.trim() : null;
				pins.push({ id, kind, until });
			}
		} catch {
			// fall through to meta
		}
	}

	// Meta stamp (set on pin upsert) covers cases where policy lookup is unavailable.
	const metaPins = listActiveChallengeFeedPinsFromMeta(opts?.meta, nowMs);
	for (const mp of metaPins) {
		if (pins.some((p) => p.id === mp.pin_id)) continue;
		pins.push({
			id: mp.pin_id,
			kind: /** @type {'open'|'winners'|'other'} */ (mp.kind),
			until: mp.until
		});
	}

	if (pins.length === 0) return empty;
	let until = null;
	let untilMs = NaN;
	for (const p of pins) {
		const t = p.until ? Date.parse(p.until) : NaN;
		if (!Number.isFinite(t)) continue;
		if (!Number.isFinite(untilMs) || t > untilMs) {
			untilMs = t;
			until = p.until;
		}
	}
	return { active: true, until, pins };
}

/** @deprecated Use getActiveEditorialPins — kept for tests migrating off hardcoded promos. */
export function getActiveEditorialPinPromos(nowMs = Date.now()) {
	void nowMs;
	return [];
}
