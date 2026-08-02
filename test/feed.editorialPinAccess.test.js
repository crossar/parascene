import { describe, expect, test } from '@jest/globals';
import { canViewUnpublishedCreationViaEditorialPin } from '../api_routes/feed/editorialPin.js';
import { FEED_EDITORIAL_PINS_POLICY_KEY } from '../api_routes/feed/editorialPinPolicy.js';

function queriesWithPins(pins) {
	return {
		selectPolicyByKey: {
			get: async (key) => {
				if (key !== FEED_EDITORIAL_PINS_POLICY_KEY) return null;
				return {
					value: JSON.stringify({
						defaults: {},
						pins
					})
				};
			}
		}
	};
}

describe('canViewUnpublishedCreationViaEditorialPin', () => {
	const nowMs = Date.parse('2026-08-02T12:00:00.000Z');

	test('allows unpublished creation while pin is active', async () => {
		const queries = queriesWithPins([
			{
				id: 'challenge-open-weekly-1',
				created_image_id: 9001,
				enabled: true,
				starts_at: '2026-08-01T00:00:00.000Z',
				until: '2026-08-10T00:00:00.000Z',
				surfaces: ['all']
			}
		]);
		const ok = await canViewUnpublishedCreationViaEditorialPin(queries, {
			ancestorRow: { id: 9001, unavailable_at: null },
			nowMs
		});
		expect(ok).toBe(true);
	});

	test('denies when pin expired or id mismatch', async () => {
		const queries = queriesWithPins([
			{
				id: 'challenge-open-weekly-1',
				created_image_id: 9001,
				enabled: true,
				until: '2026-07-01T00:00:00.000Z',
				surfaces: ['all']
			}
		]);
		expect(
			await canViewUnpublishedCreationViaEditorialPin(queries, {
				ancestorRow: { id: 9001 },
				nowMs
			})
		).toBe(false);
		expect(
			await canViewUnpublishedCreationViaEditorialPin(queries, {
				ancestorRow: { id: 9002 },
				nowMs
			})
		).toBe(false);
	});

	test('denies unavailable creations', async () => {
		const queries = queriesWithPins([
			{
				created_image_id: 9001,
				enabled: true,
				until: '2026-08-10T00:00:00.000Z',
				surfaces: ['all']
			}
		]);
		expect(
			await canViewUnpublishedCreationViaEditorialPin(queries, {
				ancestorRow: { id: 9001, unavailable_at: '2026-08-01T00:00:00.000Z' },
				nowMs
			})
		).toBe(false);
	});
});

describe('getCreationFeedPinStatus', () => {
	const nowMs = Date.parse('2026-08-02T12:00:00.000Z');

	test('summarizes active open pin for creation', async () => {
		const { getCreationFeedPinStatus } = await import('../api_routes/feed/editorialPin.js');
		const queries = queriesWithPins([
			{
				id: 'challenge-open-weekly-1',
				created_image_id: 9001,
				enabled: true,
				until: '2026-08-09T00:00:00.000Z',
				surfaces: ['all']
			}
		]);
		const status = await getCreationFeedPinStatus(queries, 9001, { nowMs });
		expect(status.active).toBe(true);
		expect(status.until).toBe('2026-08-09T00:00:00.000Z');
		expect(status.pins[0].kind).toBe('open');
	});
});
