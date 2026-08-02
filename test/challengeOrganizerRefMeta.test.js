import { describe, expect, test } from '@jest/globals';
import {
	upsertChallengeOrganizerRefInMeta,
	removeChallengeOrganizerRefFromMeta,
	creationMetaHasChallengeOrganizerRef,
	challengeOrganizerRefRoleLabel
} from '../src/shared/challengeOrganizerRefMeta.js';
import { creationMetaHasChallengeAnnotation } from '../src/shared/challengeSubmitMeta.js';
import { parseCreationIdFromChallengeHeroRef } from '../api_routes/utils/challengeSubmitShared.js';

describe('challenge organizer ref meta', () => {
	test('stamps and clears hero role', () => {
		let meta = upsertChallengeOrganizerRefInMeta({}, { challenge_id: 'weekly-1', role: 'hero' });
		expect(creationMetaHasChallengeOrganizerRef(meta)).toBe(true);
		expect(creationMetaHasChallengeAnnotation(meta)).toBe(true);
		expect(challengeOrganizerRefRoleLabel('hero')).toBe('Challenge hero');
		meta = removeChallengeOrganizerRefFromMeta(meta, { challenge_id: 'weekly-1', role: 'hero' });
		expect(creationMetaHasChallengeOrganizerRef(meta)).toBe(false);
	});

	test('parses creation ids from hero-style refs', () => {
		expect(parseCreationIdFromChallengeHeroRef('/creations/12234')).toBe(12234);
		expect(parseCreationIdFromChallengeHeroRef('https://www.parascene.com/creations/42')).toBe(42);
	});
});
