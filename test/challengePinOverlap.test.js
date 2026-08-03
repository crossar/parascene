import { describe, expect, test } from '@jest/globals';
import {
	challengePinWindowsOverlap,
	findOverlappingChallengeEditorialPin
} from '../api_routes/utils/challengeLifecycle.js';

describe('challengePinWindowsOverlap', () => {
	test('detects overlap and adjacent inclusive edges', () => {
		expect(
			challengePinWindowsOverlap(
				'2026-08-01T00:00:00.000Z',
				'2026-08-07T23:59:59.000Z',
				'2026-08-05T00:00:00.000Z',
				'2026-08-10T00:00:00.000Z'
			)
		).toBe(true);
		expect(
			challengePinWindowsOverlap(
				'2026-08-01T00:00:00.000Z',
				'2026-08-05T00:00:00.000Z',
				'2026-08-05T00:00:00.000Z',
				'2026-08-10T00:00:00.000Z'
			)
		).toBe(true);
	});

	test('returns false when windows are fully disjoint', () => {
		expect(
			challengePinWindowsOverlap(
				'2026-08-01T00:00:00.000Z',
				'2026-08-04T00:00:00.000Z',
				'2026-08-05T00:00:00.000Z',
				'2026-08-10T00:00:00.000Z'
			)
		).toBe(false);
	});
});

describe('findOverlappingChallengeEditorialPin', () => {
	test('ignores same pin id and non-challenge pins', () => {
		const pins = [
			{
				id: 'challenge-open-weekly-1',
				starts_at: '2026-08-01T00:00:00.000Z',
				until: '2026-08-07T00:00:00.000Z'
			},
			{
				id: 'promo-other',
				starts_at: '2026-08-01T00:00:00.000Z',
				until: '2026-08-10T00:00:00.000Z'
			}
		];
		expect(
			findOverlappingChallengeEditorialPin(pins, {
				id: 'challenge-open-weekly-1',
				starts_at: '2026-08-02T00:00:00.000Z',
				until: '2026-08-06T00:00:00.000Z'
			})
		).toBeNull();
	});

	test('reports conflicting challenge pin with readable message', () => {
		const pins = [
			{
				id: 'challenge-open-weekly-1',
				starts_at: '2026-08-01T00:00:00.000Z',
				until: '2026-08-07T00:00:00.000Z',
				enabled: true
			}
		];
		const hit = findOverlappingChallengeEditorialPin(pins, {
			id: 'challenge-open-monthly-1',
			starts_at: '2026-08-05T00:00:00.000Z',
			until: '2026-08-12T00:00:00.000Z'
		});
		expect(hit).not.toBeNull();
		expect(hit?.pin?.id).toBe('challenge-open-weekly-1');
		expect(hit?.message).toMatch(/challenge-open-weekly-1/);
		expect(hit?.message).toMatch(/Only one challenge pin/);
	});

	test('skips disabled pins', () => {
		const pins = [
			{
				id: 'challenge-open-weekly-1',
				starts_at: '2026-08-01T00:00:00.000Z',
				until: '2026-08-07T00:00:00.000Z',
				enabled: false
			}
		];
		expect(
			findOverlappingChallengeEditorialPin(pins, {
				id: 'challenge-open-monthly-1',
				starts_at: '2026-08-05T00:00:00.000Z',
				until: '2026-08-12T00:00:00.000Z'
			})
		).toBeNull();
	});
});
