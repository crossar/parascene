import { describe, expect, test } from '@jest/globals';
import { isFeedRowVideoCreation } from '../src/shared/chatFeedMobilePartition.js';

describe('isFeedRowVideoCreation', () => {
	test('native video with file url qualifies', () => {
		expect(
			isFeedRowVideoCreation({ media_type: 'video', video_url: 'https://x/v.mp4' })
		).toBe(true);
	});

	test('YouTube Shorts qualify without a file url', () => {
		expect(
			isFeedRowVideoCreation({
				media_type: 'video',
				meta: { import: { provider: 'youtube', kind: 'shorts' } }
			})
		).toBe(true);
	});

	test('YouTube watch imports do not qualify', () => {
		expect(
			isFeedRowVideoCreation({
				media_type: 'video',
				meta: { import: { provider: 'youtube', kind: 'watch' } }
			})
		).toBe(false);
	});
});
