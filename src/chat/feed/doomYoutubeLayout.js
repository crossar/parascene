/**
 * YouTube in doom scroll: full-width player, height limited to the band between
 * the topbar and the username row (no crop, no 9:16 side-letterbox).
 */

/** Breathing room between the player and reserved chrome. */
export const DOOM_YOUTUBE_CHROME_GAP_PX = 8;

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} DoomYoutubeFrameRect
 * @typedef {{ topInset?: number, bottomInset?: number }} DoomYoutubeFrameInsets
 */

/**
 * Full-width box in `wrapW` × `wrapH`, height clipped by chrome insets.
 *
 * @param {number} wrapW
 * @param {number} wrapH
 * @param {DoomYoutubeFrameInsets} [insets]
 * @returns {DoomYoutubeFrameRect | null}
 */
export function doomYoutubeFrameRect(wrapW, wrapH, insets = {}) {
	if (!Number.isFinite(wrapW) || !Number.isFinite(wrapH) || wrapW <= 0 || wrapH <= 0) {
		return null;
	}
	const topInset = Math.max(0, Number(insets.topInset) || 0);
	const bottomInset = Math.max(0, Number(insets.bottomInset) || 0);
	const height = wrapH - topInset - bottomInset;
	if (height <= 0) return null;
	return {
		left: 0,
		top: topInset,
		width: wrapW,
		height
	};
}

/**
 * @param {DoomYoutubeFrameRect} rect
 * @returns {string}
 */
export function doomYoutubeFrameCssText(rect) {
	return [
		'position:absolute',
		`left:${rect.left}px`,
		`top:${rect.top}px`,
		`width:${rect.width}px`,
		`height:${rect.height}px`,
		'overflow:hidden',
		'right:auto',
		'bottom:auto',
		'transform:none'
	].join(';');
}
