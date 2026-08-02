/**
 * Organizer-attached creations on challenge_config:
 * hero_image_url, results_creation_url, topic_vote_creation_url.
 * Stamped onto the creation as meta.challenge_organizer_refs (like challenge_submissions).
 */

/** @typedef {'hero'|'results'|'topic_vote'} ChallengeOrganizerRefRole */

/**
 * @param {unknown} meta
 * @returns {{ challenge_id: string, role: ChallengeOrganizerRefRole, attached_at?: string }[]}
 */
export function listChallengeOrganizerRefsFromMeta(meta) {
	const arr = meta?.challenge_organizer_refs;
	if (!Array.isArray(arr)) return [];
	const out = [];
	for (const raw of arr) {
		if (!raw || typeof raw !== 'object') continue;
		const challengeId = raw.challenge_id != null ? String(raw.challenge_id).trim() : '';
		const roleRaw = typeof raw.role === 'string' ? raw.role.trim().toLowerCase() : '';
		/** @type {ChallengeOrganizerRefRole|null} */
		let role = null;
		if (roleRaw === 'hero' || roleRaw === 'results' || roleRaw === 'topic_vote') role = roleRaw;
		if (!challengeId || !role) continue;
		out.push({
			challenge_id: challengeId,
			role,
			attached_at: typeof raw.attached_at === 'string' ? raw.attached_at : undefined
		});
	}
	return out;
}

/**
 * @param {unknown} meta
 */
export function creationMetaHasChallengeOrganizerRef(meta) {
	return listChallengeOrganizerRefsFromMeta(meta).length > 0;
}

/**
 * @param {object|null|undefined} meta
 * @param {{ challenge_id: string, role: ChallengeOrganizerRefRole }} ref
 * @returns {object}
 */
export function upsertChallengeOrganizerRefInMeta(meta, ref) {
	const base = meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {};
	const challengeId = ref?.challenge_id != null ? String(ref.challenge_id).trim() : '';
	const role = ref?.role;
	if (!challengeId || (role !== 'hero' && role !== 'results' && role !== 'topic_vote')) {
		return base;
	}
	const prev = Array.isArray(base.challenge_organizer_refs) ? [...base.challenge_organizer_refs] : [];
	const filtered = prev.filter((row) => {
		if (!row || typeof row !== 'object') return false;
		const cid = String(row.challenge_id || '').trim();
		const r = String(row.role || '').trim().toLowerCase();
		return !(cid === challengeId && r === role);
	});
	filtered.push({
		challenge_id: challengeId,
		role,
		attached_at: new Date().toISOString()
	});
	base.challenge_organizer_refs = filtered;
	return base;
}

/**
 * @param {object|null|undefined} meta
 * @param {{ challenge_id: string, role?: ChallengeOrganizerRefRole }} args
 *  When role omitted, removes all roles for that challenge_id.
 * @returns {object}
 */
export function removeChallengeOrganizerRefFromMeta(meta, args) {
	const base = meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : {};
	const challengeId = args?.challenge_id != null ? String(args.challenge_id).trim() : '';
	if (!challengeId || !Array.isArray(base.challenge_organizer_refs)) return base;
	const role = args?.role;
	base.challenge_organizer_refs = base.challenge_organizer_refs.filter((row) => {
		if (!row || typeof row !== 'object') return false;
		const cid = String(row.challenge_id || '').trim();
		if (cid !== challengeId) return true;
		if (!role) return false;
		return String(row.role || '').trim().toLowerCase() !== role;
	});
	if (base.challenge_organizer_refs.length === 0) {
		delete base.challenge_organizer_refs;
	}
	return base;
}

/**
 * Human label for organizer-ref role (creation detail chip / banner).
 * @param {ChallengeOrganizerRefRole|string} role
 */
export function challengeOrganizerRefRoleLabel(role) {
	if (role === 'hero') return 'Challenge hero';
	if (role === 'results') return 'Challenge results';
	if (role === 'topic_vote') return 'Theme vote';
	return 'Challenge media';
}
