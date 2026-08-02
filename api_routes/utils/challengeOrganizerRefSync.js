import {
	pickChallengeHeroImageUrl,
	pickChallengeResultsCreationUrl,
	pickChallengeTopicVoteCreationUrl,
	isChallengeConfigSoftDeleted,
	mergeFullChallengeConfigForChallenge
} from '../../src/chat/challenges/challengeAdmin.js';
import { parseCreationIdFromChallengeHeroRef } from './challengeSubmitShared.js';
import {
	upsertChallengeOrganizerRefInMeta,
	removeChallengeOrganizerRefFromMeta,
	listChallengeOrganizerRefsFromMeta
} from '../../src/shared/challengeOrganizerRefMeta.js';

/**
 * @param {unknown} meta
 * @returns {object}
 */
function parseCreationMeta(meta) {
	if (meta && typeof meta === 'object' && !Array.isArray(meta)) return { ...meta };
	if (typeof meta === 'string') {
		try {
			const o = JSON.parse(meta);
			if (o && typeof o === 'object' && !Array.isArray(o)) return { ...o };
		} catch {
			// ignore
		}
	}
	return {};
}

/**
 * @param {object} queries
 * @param {number} creationId
 * @param {(meta: object) => object} mutator
 */
async function mutateCreationMeta(queries, creationId, mutator) {
	const cid = Number(creationId);
	if (!Number.isFinite(cid) || cid <= 0) return;
	if (typeof queries?.selectCreatedImageByIdAnyUser?.get !== 'function') return;
	if (typeof queries?.updateCreatedImageMetaAnyUser?.run !== 'function') return;
	const row = await queries.selectCreatedImageByIdAnyUser.get(cid);
	if (!row) return;
	const prev = parseCreationMeta(row.meta);
	const next = mutator(prev);
	await queries.updateCreatedImageMetaAnyUser.run(cid, next);
}

/** @typedef {'hero'|'results'|'topic_vote'} ChallengeOrganizerRefRole */

const ORGANIZER_REF_ROLES = /** @type {const} */ ([
	{ role: 'hero', pick: pickChallengeHeroImageUrl },
	{ role: 'results', pick: pickChallengeResultsCreationUrl },
	{ role: 'topic_vote', pick: pickChallengeTopicVoteCreationUrl }
]);

/**
 * @param {object | null | undefined} payload
 * @returns {{ role: ChallengeOrganizerRefRole, creationId: number }[]}
 */
function organizerRefsFromPayload(payload) {
	if (!payload || typeof payload !== 'object' || isChallengeConfigSoftDeleted(payload)) return [];
	const out = [];
	for (const { role, pick } of ORGANIZER_REF_ROLES) {
		const id = parseCreationIdFromChallengeHeroRef(pick(payload));
		if (Number.isFinite(id) && id > 0) out.push({ role, creationId: id });
	}
	return out;
}

/**
 * After a challenge_config write: stamp / clear organizer media refs on creations.
 * Uses merged challenge state so partial patches that omit media fields do not unstamp.
 *
 * @param {{
 *   queries: object,
 *   prevPayload?: object|null,
 *   nextPayload: object|null|undefined,
 *   sb?: import('@supabase/supabase-js').SupabaseClient | null,
 *   messagesNewestFirst?: { body?: unknown }[] | null
 * }} args
 */
export async function syncChallengeOrganizerCreationRefsOnConfigWrite(args) {
	const queries = args?.queries;
	const nextPayload = args?.nextPayload;
	const prevPayload = args?.prevPayload && typeof args.prevPayload === 'object' ? args.prevPayload : null;
	if (!queries || !nextPayload || typeof nextPayload !== 'object') return;

	const challengeId = String(nextPayload.challenge_id || prevPayload?.challenge_id || '').trim();
	if (!challengeId) return;

	let effectivePrev = prevPayload;
	let effectiveNext = nextPayload;

	try {
		const sb = args?.sb;
		let messages = Array.isArray(args?.messagesNewestFirst) ? args.messagesNewestFirst : null;
		if (!messages && sb) {
			const {
				findChallengesChannelThreadId,
				fetchThreadMessagesNewestFirst
			} = await import('./challengeSubmitShared.js');
			const tid = await findChallengesChannelThreadId(sb);
			if (tid) messages = await fetchThreadMessagesNewestFirst(sb, tid);
		}
		if (messages) {
			const { tryParseChallengeJsonBody } = await import('./challengeSubmitShared.js');
			/** @type {{ msg: object, payload: object }[]} */
			const entriesNewestFirst = [];
			for (const m of messages) {
				const p = tryParseChallengeJsonBody(m?.body);
				if (!p || String(p.kind || '').trim() !== 'challenge_config') continue;
				if (String(p.challenge_id || '').trim() !== challengeId) continue;
				entriesNewestFirst.push({ msg: m, payload: p });
			}
			// Sync runs after the DB write, so the newest row is already nextPayload.
			const chronological = [...entriesNewestFirst].reverse();
			const older = chronological.slice(0, -1);
			const mergedOlder = mergeFullChallengeConfigForChallenge(older, challengeId);
			effectivePrev =
				prevPayload && typeof prevPayload === 'object'
					? {
							...mergedOlder,
							...prevPayload,
							kind: 'challenge_config',
							challenge_id: challengeId
						}
					: mergedOlder;
			effectiveNext = mergeFullChallengeConfigForChallenge(chronological, challengeId);
			if (!effectiveNext || typeof effectiveNext !== 'object' || !Object.keys(effectiveNext).length) {
				effectiveNext = {
					...mergedOlder,
					...nextPayload,
					kind: 'challenge_config',
					challenge_id: challengeId
				};
			}
		}
	} catch (err) {
		console.warn('[challengeOrganizerRefSync] merge for sync', err?.message || err);
	}

	const deletedAt = isChallengeConfigSoftDeleted(effectiveNext);
	const prevRefs = organizerRefsFromPayload(effectivePrev);
	const nextRefs = deletedAt ? [] : organizerRefsFromPayload(effectiveNext);

	const prevByRole = new Map(prevRefs.map((r) => [r.role, r.creationId]));
	const nextByRole = new Map(nextRefs.map((r) => [r.role, r.creationId]));
	const roles = /** @type {ChallengeOrganizerRefRole[]} */ ([
		'hero',
		'results',
		'topic_vote'
	]);

	for (const role of roles) {
		const prevId = prevByRole.get(role);
		const nextId = nextByRole.get(role);
		const prevOk = Number.isFinite(prevId) && /** @type {number} */ (prevId) > 0;
		const nextOk = Number.isFinite(nextId) && /** @type {number} */ (nextId) > 0;

		if (prevOk && nextOk && prevId === nextId) {
			try {
				await mutateCreationMeta(queries, /** @type {number} */ (nextId), (meta) =>
					upsertChallengeOrganizerRefInMeta(meta, { challenge_id: challengeId, role })
				);
			} catch (err) {
				console.warn('[challengeOrganizerRefSync] refresh stamp', err?.message || err);
			}
			continue;
		}
		if (prevOk && (!nextOk || prevId !== nextId)) {
			try {
				await mutateCreationMeta(queries, /** @type {number} */ (prevId), (meta) =>
					removeChallengeOrganizerRefFromMeta(meta, { challenge_id: challengeId, role })
				);
			} catch (err) {
				console.warn('[challengeOrganizerRefSync] remove', err?.message || err);
			}
		}
		if (nextOk) {
			try {
				await mutateCreationMeta(queries, /** @type {number} */ (nextId), (meta) =>
					upsertChallengeOrganizerRefInMeta(meta, { challenge_id: challengeId, role })
				);
			} catch (err) {
				console.warn('[challengeOrganizerRefSync] add', err?.message || err);
			}
		}
	}
}

/**
 * Scan challenges channel configs → map creationId → refs that should be stamped.
 * Uses merged config per challenge_id (partial updates omit media on latest row).
 *
 * @param {{
 *   sb: import('@supabase/supabase-js').SupabaseClient,
 *   messagesNewestFirst?: { body?: unknown }[] | null
 * }} args
 * @returns {Promise<Map<number, { challenge_id: string, role: ChallengeOrganizerRefRole }[]>>}
 */
export async function collectChallengeOrganizerRefsByCreationId(args) {
	const sb = args?.sb;
	/** @type {Map<number, { challenge_id: string, role: ChallengeOrganizerRefRole }[]>} */
	const byCreation = new Map();
	if (!sb) return byCreation;

	const {
		findChallengesChannelThreadId,
		fetchThreadMessagesNewestFirst,
		tryParseChallengeJsonBody
	} = await import('./challengeSubmitShared.js');

	let messages = Array.isArray(args?.messagesNewestFirst) ? args.messagesNewestFirst : null;
	if (!messages) {
		const tid = await findChallengesChannelThreadId(sb);
		if (!tid) return byCreation;
		messages = await fetchThreadMessagesNewestFirst(sb, tid);
	}

	/** @type {Map<string, { msg: object, payload: object }[]>} */
	const entriesByChallenge = new Map();
	for (const m of messages || []) {
		const p = tryParseChallengeJsonBody(m?.body);
		if (!p || String(p.kind || '').trim() !== 'challenge_config') continue;
		const cid = String(p.challenge_id || '').trim();
		if (!cid) continue;
		if (!entriesByChallenge.has(cid)) entriesByChallenge.set(cid, []);
		entriesByChallenge.get(cid)?.push({ msg: m, payload: p });
	}

	for (const [challengeId, newestFirstEntries] of entriesByChallenge.entries()) {
		const chronological = [...newestFirstEntries].reverse();
		const merged = mergeFullChallengeConfigForChallenge(chronological, challengeId);
		if (isChallengeConfigSoftDeleted(merged)) continue;
		for (const { role, creationId } of organizerRefsFromPayload(merged)) {
			const list = byCreation.get(creationId) || [];
			if (!list.some((r) => r.challenge_id === challengeId && r.role === role)) {
				list.push({ challenge_id: challengeId, role });
			}
			byCreation.set(creationId, list);
		}
	}
	return byCreation;
}

/**
 * If this creation is referenced by a merged challenge_config role but meta lacks the stamp, write it.
 *
 * @param {{
 *   queries: object,
 *   sb: import('@supabase/supabase-js').SupabaseClient,
 *   creationId: number,
 *   meta: object|null|undefined,
 *   refsByCreationId?: Map<number, { challenge_id: string, role: ChallengeOrganizerRefRole }[]> | null
 * }} args
 * @returns {Promise<object|null>} updated meta when healed, else null
 */
export async function healChallengeOrganizerRefsForCreation(args) {
	const queries = args?.queries;
	const sb = args?.sb;
	const creationId = Number(args?.creationId);
	if (!queries || !sb || !Number.isFinite(creationId) || creationId <= 0) return null;

	let meta = parseCreationMeta(args?.meta);
	/** @type {{ challenge_id: string, role: ChallengeOrganizerRefRole }[]} */
	let found = [];
	try {
		if (args?.refsByCreationId instanceof Map) {
			found = args.refsByCreationId.get(creationId) || [];
		} else {
			const map = await collectChallengeOrganizerRefsByCreationId({ sb });
			found = map.get(creationId) || [];
		}
	} catch (err) {
		console.warn('[challengeOrganizerRefSync] heal scan', err?.message || err);
		return null;
	}

	if (found.length === 0) return null;

	const before = JSON.stringify(meta?.challenge_organizer_refs || []);
	for (const ref of found) {
		meta = upsertChallengeOrganizerRefInMeta(meta, ref);
	}
	const after = JSON.stringify(meta?.challenge_organizer_refs || []);
	if (before === after) return null;

	try {
		await mutateCreationMeta(queries, creationId, () => meta);
		return meta;
	} catch (err) {
		console.warn('[challengeOrganizerRefSync] heal write', err?.message || err);
		return null;
	}
}

/**
 * Heal missing organizer-ref stamps for a batch of library creations (one thread scan).
 *
 * @param {{
 *   queries: object,
 *   sb: import('@supabase/supabase-js').SupabaseClient,
 *   images: { id?: number, meta?: unknown }[]
 * }} args
 */
export async function healChallengeOrganizerRefsForCreationList(args) {
	const queries = args?.queries;
	const sb = args?.sb;
	const images = Array.isArray(args?.images) ? args.images : [];
	if (!queries || !sb || images.length === 0) return;

	let map;
	try {
		map = await collectChallengeOrganizerRefsByCreationId({ sb });
	} catch (err) {
		console.warn('[challengeOrganizerRefSync] list heal scan', err?.message || err);
		return;
	}
	if (!map.size) return;

	for (const img of images) {
		const id = Number(img?.id);
		if (!Number.isFinite(id) || id <= 0) continue;
		const needed = map.get(id);
		if (!needed?.length) continue;
		const meta = parseCreationMeta(img.meta);
		const existing = listChallengeOrganizerRefsFromMeta(meta);
		const missing = needed.filter(
			(ref) =>
				!existing.some((e) => e.challenge_id === ref.challenge_id && e.role === ref.role)
		);
		if (missing.length === 0) continue;
		try {
			const healed = await healChallengeOrganizerRefsForCreation({
				queries,
				sb,
				creationId: id,
				meta,
				refsByCreationId: map
			});
			if (healed) img.meta = healed;
		} catch {
			// ignore per-row failures
		}
	}
}
