import { describe, expect, test } from '@jest/globals';
import { doomYoutubeFrameRect } from '../src/chat/feed/doomYoutubeLayout.js';

describe('doomYoutubeFrameRect', () => {
	test('full width, height is the band between chrome insets', () => {
		const wrapW = 390;
		const wrapH = 844;
		const topInset = 70;
		const bottomInset = 96;
		const rect = doomYoutubeFrameRect(wrapW, wrapH, { topInset, bottomInset });
		expect(rect).not.toBeNull();
		expect(rect.left).toBe(0);
		expect(rect.width).toBe(wrapW);
		expect(rect.top).toBe(topInset);
		expect(rect.height).toBe(wrapH - topInset - bottomInset);
		expect(rect.top + rect.height).toBe(wrapH - bottomInset);
	});

	test('without insets fills the wrap', () => {
		const rect = doomYoutubeFrameRect(390, 844);
		expect(rect).toEqual({ left: 0, top: 0, width: 390, height: 844 });
	});

	test('returns null for empty wrap or insets that consume the wrap', () => {
		expect(doomYoutubeFrameRect(0, 800)).toBeNull();
		expect(doomYoutubeFrameRect(390, 0)).toBeNull();
		expect(doomYoutubeFrameRect(390, 100, { topInset: 60, bottomInset: 60 })).toBeNull();
	});
});
