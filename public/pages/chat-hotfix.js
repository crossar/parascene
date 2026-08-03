/**
 * Chat-only runtime fixes loaded after the Rollup bundle (see pages/chat.html).
 * Groups consecutive share-link / upload media embeds in message bubbles.
 */
function assetQuery() {
	const v = document.querySelector('meta[name="asset-version"]')?.content?.trim();
	return v ? `?v=${encodeURIComponent(v)}` : '';
}

function isWhitespaceOnlyInlineMediaGap(node) {
	return node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.textContent || '');
}

const INLINE_MEDIA_GROUP_MIN_ITEMS = 4;

function isUngroupedInlineMediaGroupMember(el) {
	return el instanceof HTMLElement && !el.closest('.user-text-inline-media-group');
}

function isGroupableInlineImageWrap(el) {
	return (
		isUngroupedInlineMediaGroupMember(el) && el.classList.contains('user-text-inline-image-wrap')
	);
}

function isGroupableChatCreationEmbed(el) {
	if (!isUngroupedInlineMediaGroupMember(el)) return false;
	if (!el.classList.contains('connect-chat-creation-embed')) return false;
	if (el.classList.contains('connect-chat-creation-embed--error')) return false;
	if (el.querySelector('.connect-chat-creation-embed-inner--group-carousel')) return false;
	if (el.querySelector('[data-generic-video-embed]')) return false;
	return true;
}

function isInlineMediaGroupUnit(el) {
	return isGroupableInlineImageWrap(el) || isGroupableChatCreationEmbed(el);
}

function domNodesForInlineMediaGroupUnit(unit) {
	if (isGroupableChatCreationEmbed(unit)) {
		const nodes = [];
		let prev = unit.previousSibling;
		while (prev && isWhitespaceOnlyInlineMediaGap(prev)) prev = prev.previousSibling;
		if (
			prev instanceof HTMLAnchorElement &&
			prev.classList.contains('connect-chat-creation-embed-paired-link')
		) {
			nodes.push(prev);
		}
		nodes.push(unit);
		return nodes;
	}
	return [unit];
}

function skipInlineMediaGroupGaps(nodes, startIdx) {
	let i = startIdx;
	let brCount = 0;
	while (i < nodes.length) {
		const node = nodes[i];
		if (isWhitespaceOnlyInlineMediaGap(node)) {
			i += 1;
			continue;
		}
		if (node instanceof HTMLBRElement) {
			brCount += 1;
			if (brCount >= 2) return { nextIdx: i, paragraphBreak: true };
			i += 1;
			continue;
		}
		break;
	}
	return { nextIdx: i, paragraphBreak: false };
}

function resolveInlineMediaGroupUnitAt(nodes, i) {
	const node = nodes[i];
	if (node instanceof HTMLElement && isInlineMediaGroupUnit(node)) {
		return { unit: node, nextIdx: i + 1 };
	}
	if (
		node instanceof HTMLAnchorElement &&
		node.classList.contains('connect-chat-creation-embed-paired-link')
	) {
		let j = i + 1;
		while (j < nodes.length && isWhitespaceOnlyInlineMediaGap(nodes[j])) j += 1;
		const maybe = nodes[j];
		if (maybe instanceof HTMLElement && isGroupableChatCreationEmbed(maybe)) {
			return { unit: maybe, nextIdx: j + 1 };
		}
	}
	return null;
}

function stripBridgesBetweenUnits(container, units) {
	for (let u = 0; u < units.length - 1; u += 1) {
		const lastNodes = domNodesForInlineMediaGroupUnit(units[u]);
		const firstNodes = domNodesForInlineMediaGroupUnit(units[u + 1]);
		const endNode = lastNodes[lastNodes.length - 1];
		const startNode = firstNodes[0];
		if (!endNode?.parentNode || !startNode) continue;
		let n = endNode.nextSibling;
		while (n && n !== startNode) {
			const next = n.nextSibling;
			if (n instanceof HTMLBRElement || isWhitespaceOnlyInlineMediaGap(n)) {
				container.removeChild(n);
			}
			n = next;
		}
	}
}

function mountInlineMediaGroup(container, units) {
	if (units.length < INLINE_MEDIA_GROUP_MIN_ITEMS) return;
	stripBridgesBetweenUnits(container, units);
	const firstDomNodes = domNodesForInlineMediaGroupUnit(units[0]);
	const anchor = firstDomNodes[0];
	if (!(anchor instanceof Node) || !anchor.parentNode) return;

	const group = document.createElement('div');
	group.className = 'user-text-inline-media-group';
	group.dataset.inlineImageGroup = '1';
	container.insertBefore(group, anchor);
	for (const unit of units) {
		for (const node of domNodesForInlineMediaGroupUnit(unit)) {
			group.appendChild(node);
		}
	}

	const countEl = document.createElement('span');
	countEl.className = 'user-text-inline-media-group-count';
	countEl.setAttribute('aria-hidden', 'true');
	countEl.textContent = String(units.length);
	group.appendChild(countEl);

	const firstLink = group.querySelector('a.user-text-inline-image-link');
	if (firstLink instanceof HTMLAnchorElement) {
		firstLink.setAttribute('aria-label', `View media (${units.length})`);
	}
	const firstVideoInner = group.querySelector('.connect-chat-creation-embed-inner--video');
	if (firstVideoInner instanceof HTMLElement) {
		firstVideoInner.setAttribute('aria-label', `View videos (${units.length})`);
		firstVideoInner.setAttribute('title', `View videos (${units.length})`);
	}
}

function hydrateConsecutiveInlineImageGroups(rootEl) {
	const root =
		rootEl instanceof Element || rootEl instanceof Document ? rootEl : document;
	if (!root || typeof root.querySelectorAll !== 'function') return;

	const containers = new Set();
	for (const el of root.querySelectorAll(
		'.user-text-inline-image-wrap, .connect-chat-creation-embed'
	)) {
		if (el.closest('.user-text-inline-media-group')) continue;
		const parent = el.parentElement;
		if (parent) containers.add(parent);
	}

	for (const container of containers) {
		const nodes = Array.from(container.childNodes);
		const runs = [];
		let run = [];
		let i = 0;
		while (i < nodes.length) {
			const gap = skipInlineMediaGroupGaps(nodes, i);
			if (gap.paragraphBreak && run.length > 0) {
				if (run.length >= INLINE_MEDIA_GROUP_MIN_ITEMS) runs.push(run);
				run = [];
			}
			i = gap.nextIdx;
			if (i >= nodes.length) break;

			const resolved = resolveInlineMediaGroupUnitAt(nodes, i);
			if (resolved) {
				run.push(resolved.unit);
				i = resolved.nextIdx;
				continue;
			}
			if (run.length >= INLINE_MEDIA_GROUP_MIN_ITEMS) runs.push(run);
			run = [];
			i += 1;
		}
		if (run.length >= INLINE_MEDIA_GROUP_MIN_ITEMS) runs.push(run);

		for (const units of runs) {
			mountInlineMediaGroup(container, units);
		}
		trimBridgesTrailingMediaGroup(container);
	}
}

function trimBridgesTrailingMediaGroup(container) {
	if (!(container instanceof HTMLElement)) return;
	for (const group of container.querySelectorAll('.user-text-inline-media-group')) {
		let n = group.nextSibling;
		while (n instanceof HTMLBRElement) {
			const rm = n;
			n = n.nextSibling;
			container.removeChild(rm);
		}
	}
}

function collectInlineMediaGroupGallery(groupEl, clickedLink = null, clickedEmbed = null) {
	const out = {
		slides: [],
		galleryUrls: [],
		galleryImgs: [],
		galleryIndex: 0,
		creationId: '',
		videoSlides: [],
	};
	if (!(groupEl instanceof HTMLElement)) return out;

	const pushImageSlide = (url, creationId, sourceImg) => {
		const src = String(url || '').trim();
		if (!src) return;
		const cid = String(creationId || '').trim();
		out.slides.push({
			kind: 'image',
			url: src,
			creationId: cid,
			...(sourceImg instanceof HTMLImageElement ? { sourceImg } : {}),
		});
		if (sourceImg instanceof HTMLImageElement) out.galleryImgs.push(sourceImg);
		out.galleryUrls.push(src);
	};

	const pushVideoSlide = (url, creationId, sourceVideo, posterUrl) => {
		const src = String(url || '').trim();
		if (!src) return;
		const cid = String(creationId || '').trim();
		out.slides.push({
			kind: 'video',
			url: src,
			creationId: cid,
			...(sourceVideo instanceof HTMLVideoElement ? { sourceVideo } : {}),
			...(posterUrl ? { posterUrl: String(posterUrl).trim() } : {}),
		});
		out.videoSlides.push({ url: src, creationId: cid });
	};

	for (const child of groupEl.children) {
		if (!(child instanceof HTMLElement)) continue;
		if (child.classList.contains('user-text-inline-media-group-count')) continue;
		if (child.classList.contains('connect-chat-creation-embed-paired-link')) continue;

		if (child.classList.contains('user-text-inline-image-wrap')) {
			const img = child.querySelector('img.user-text-inline-image');
			if (!(img instanceof HTMLImageElement)) continue;
			pushImageSlide(img.currentSrc || img.getAttribute('src') || '', '', img);
			continue;
		}

		if (!child.classList.contains('connect-chat-creation-embed')) continue;

		const creationId = String(child.getAttribute('data-creation-id') || '').trim();
		const vid = child.querySelector('video.connect-chat-creation-embed-video');
		if (vid instanceof HTMLVideoElement) {
			pushVideoSlide(
				vid.currentSrc || vid.getAttribute('src') || '',
				creationId,
				vid,
				vid.getAttribute('poster') || ''
			);
			continue;
		}
		const img = child.querySelector('img.connect-chat-creation-embed-img');
		if (img instanceof HTMLImageElement) {
			pushImageSlide(img.currentSrc || img.getAttribute('src') || '', creationId, img);
		}
	}

	out.galleryUrls = out.galleryUrls.filter(Boolean);
	out.galleryImgs = out.galleryImgs.filter((img) => img instanceof HTMLImageElement);

	const slideIndexForEmbed = (embed) => {
		if (!(embed instanceof HTMLElement)) return -1;
		const cid = String(embed.getAttribute('data-creation-id') || '').trim();
		const video = embed.querySelector('video.connect-chat-creation-embed-video');
		if (video instanceof HTMLVideoElement) {
			const url = String(video.currentSrc || video.getAttribute('src') || '').trim();
			return out.slides.findIndex(
				(slide) =>
					slide.kind === 'video' &&
					slide.url === url &&
					(!cid || slide.creationId === cid)
			);
		}
		const image = embed.querySelector('img.connect-chat-creation-embed-img');
		if (image instanceof HTMLImageElement) {
			const url = String(image.currentSrc || image.getAttribute('src') || '').trim();
			return out.slides.findIndex(
				(slide) =>
					slide.kind === 'image' &&
					slide.url === url &&
					(!cid || slide.creationId === cid)
			);
		}
		return -1;
	};

	if (clickedEmbed instanceof HTMLElement) {
		const idx = slideIndexForEmbed(clickedEmbed);
		if (idx >= 0) out.galleryIndex = idx;
		out.creationId = String(clickedEmbed.getAttribute('data-creation-id') || '').trim();
	} else if (clickedLink instanceof HTMLAnchorElement) {
		const embedWrap = clickedLink.closest('.connect-chat-creation-embed');
		if (embedWrap instanceof HTMLElement) {
			const idx = slideIndexForEmbed(embedWrap);
			if (idx >= 0) out.galleryIndex = idx;
			out.creationId = String(embedWrap.getAttribute('data-creation-id') || '').trim();
		} else {
			const thumb = clickedLink.querySelector('img.user-text-inline-image');
			if (thumb instanceof HTMLImageElement) {
				const url = String(thumb.currentSrc || thumb.getAttribute('src') || '').trim();
				const idx = out.slides.findIndex((slide) => slide.kind === 'image' && slide.url === url);
				if (idx >= 0) out.galleryIndex = idx;
			}
		}
	}

	return out;
}

let hydrateScheduled = false;
const hydratePendingRoots = new Set();

function scheduleHydrateInlineImageGroups(root) {
	if (!(root instanceof Element)) return;
	hydratePendingRoots.add(root);
	if (hydrateScheduled) return;
	hydrateScheduled = true;
	requestAnimationFrame(() => {
		hydrateScheduled = false;
		const roots = Array.from(hydratePendingRoots);
		hydratePendingRoots.clear();
		for (const r of roots) {
			try {
				hydrateConsecutiveInlineImageGroups(r);
			} catch {
				// ignore
			}
		}
	});
}

function scanHydrateRoots() {
	for (const sel of ['[data-chat-messages]', '[data-chat-canvas-body-view]']) {
		const el = document.querySelector(sel);
		if (el instanceof HTMLElement) {
			scheduleHydrateInlineImageGroups(el);
			for (const bubble of el.querySelectorAll(
				'.connect-chat-msg-bubble, .chat-page-canvas-body-view, .comment-text'
			)) {
				trimBridgesTrailingMediaGroup(bubble);
			}
		}
	}
}

function observeHydrateRoots() {
	const seen = new WeakSet();
	const attach = (el) => {
		if (!(el instanceof HTMLElement) || seen.has(el)) return;
		seen.add(el);
		scheduleHydrateInlineImageGroups(el);
		const mo = new MutationObserver(() => {
			scheduleHydrateInlineImageGroups(el);
		});
		mo.observe(el, { childList: true, subtree: true });
	};

	for (const sel of ['[data-chat-messages]', '[data-chat-canvas-body-view]']) {
		const el = document.querySelector(sel);
		if (el) attach(el);
	}

	const rootMo = new MutationObserver(() => {
		for (const sel of ['[data-chat-messages]', '[data-chat-canvas-body-view]']) {
			const el = document.querySelector(sel);
			if (el) attach(el);
		}
	});
	const chatPage = document.querySelector('[data-chat-page]');
	if (chatPage instanceof HTMLElement) {
		rootMo.observe(chatPage, { childList: true, subtree: true });
	}
}

scanHydrateRoots();
observeHydrateRoots();

/** @type {Promise<object> | null} */
let lightboxModPromise = null;
function loadLightboxMod() {
	if (!lightboxModPromise) {
		lightboxModPromise = import(`/shared/chatInlineImageLightbox.js${assetQuery()}`);
	}
	return lightboxModPromise;
}

document.addEventListener(
	'click',
	(e) => {
		const chatPage = document.querySelector('[data-chat-page]');
		if (!(chatPage instanceof HTMLElement) || !(e.target instanceof Element)) return;
		if (!chatPage.contains(e.target)) return;

		if (e.target.closest('.connect-chat-creation-embed-inner--group-carousel')) return;
		if (e.target.closest('.connect-chat-creation-embed-group-nav')) return;

		const scope = e.target.closest(
			'.connect-chat-msg-bubble, .chat-page-canvas-body-view, .comment-text'
		);
		if (!scope) return;

		const videoInner = e.target.closest('.connect-chat-creation-embed-inner--video');
		if (videoInner instanceof HTMLElement && scope.contains(videoInner)) {
			const wrap = videoInner.closest('.connect-chat-creation-embed');
			const vid = wrap?.querySelector?.('.connect-chat-creation-embed-video');
			if (!(vid instanceof HTMLVideoElement)) return;
			const src = String(vid.currentSrc || vid.getAttribute('src') || '').trim();
			if (!src) return;
			const inlineMediaGroup = wrap?.closest?.('.user-text-inline-media-group');
			if (!(inlineMediaGroup instanceof HTMLElement)) return;

			e.preventDefault();
			e.stopImmediatePropagation();

			void loadLightboxMod().then(
				({ openChatInlineMediaGroupLightbox, openChatAttachmentPreviewLightbox }) => {
					const gallery = collectInlineMediaGroupGallery(
						inlineMediaGroup,
						null,
						wrap instanceof HTMLElement ? wrap : null
					);
					const creationId =
						gallery.creationId ||
						(wrap instanceof HTMLElement
							? String(wrap.getAttribute('data-creation-id') || '').trim()
							: '');
					if (gallery.slides.length > 1) {
						openChatInlineMediaGroupLightbox(gallery.slides, {
							galleryLabel: 'Media',
							startIndex: gallery.galleryIndex,
							autoAdvanceOnEnded: false,
							loopPerSlide: true,
							loopGallery: true,
							creationId,
						});
						return;
					}
					openChatAttachmentPreviewLightbox(src, 'video', {
						...(creationId ? { creationId } : {}),
						sourceVideo: vid,
					});
				}
			);
			return;
		}

		const a = e.target.closest('a.user-text-inline-image-link');
		if (!(a instanceof HTMLAnchorElement)) return;
		if (!scope.contains(a)) return;

		const inlineMediaGroup = a.closest('.user-text-inline-media-group');
		if (!(inlineMediaGroup instanceof HTMLElement)) return;

		e.preventDefault();
		e.stopImmediatePropagation();

		void loadLightboxMod().then(({ openChatInlineMediaGroupLightbox, openChatInlineImageLightbox }) => {
			const thumb =
				a.querySelector('img.user-text-inline-image') ||
				a.querySelector('img.connect-chat-creation-embed-img');
			let src = '';
			if (thumb instanceof HTMLImageElement) {
				src = thumb.currentSrc || thumb.getAttribute('src') || '';
			}
			if (!src) src = a.getAttribute('href') || '';

			const embedWrap = a.closest('.connect-chat-creation-embed');
			let creationId =
				embedWrap instanceof HTMLElement
					? String(embedWrap.getAttribute('data-creation-id') || '').trim()
					: '';

			const gallery = collectInlineMediaGroupGallery(inlineMediaGroup, a);
			if (gallery.creationId) creationId = gallery.creationId;

			if (gallery.slides.length > 1) {
				openChatInlineMediaGroupLightbox(gallery.slides, {
					galleryLabel: 'Media',
					startIndex: gallery.galleryIndex,
					autoAdvanceOnEnded: false,
					loopPerSlide: true,
					loopGallery: true,
					creationId,
				});
				return;
			}

			openChatInlineImageLightbox(src, {
				...(creationId ? { creationId } : {}),
				...(gallery.galleryUrls.length > 1
					? {
							galleryUrls: gallery.galleryUrls,
							galleryImgs: gallery.galleryImgs,
							galleryIndex: gallery.galleryIndex,
						}
					: {}),
				...(thumb instanceof HTMLImageElement ? { sourceImg: thumb } : {}),
			});
		});
	},
	true
);

/**
 * Profile overlay Message → DM: stale chat.bundle.js shellOut still full-reloads.
 * Embed posts `prsn-chat-shell-navigate-from-embed`; close overlay + SPA-navigate here.
 */
function initChatOverlayEmbedDmNavigation() {
	window.addEventListener('message', (event) => {
		if (event.origin !== window.location.origin) return;
		const data = event.data;
		if (!data || typeof data !== 'object') return;
		if (data.type !== 'prsn-chat-shell-navigate-from-embed') return;
		const href = String(data.href || '').trim();
		if (!href) return;
		void handleChatOverlayEmbedDmNavigation(href);
	});
}

async function handleChatOverlayEmbedDmNavigation(href) {
	const qs = assetQuery();
	const [overlayMod, submitMod] = await Promise.all([
		import(`/shared/spaPageOverlay.js${qs}`),
		import(`/shared/createSubmit.js${qs}`),
	]);
	if (typeof overlayMod.closeSpaPageOverlay === 'function') {
		overlayMod.closeSpaPageOverlay({ skipScrollRestore: true });
	}
	if (typeof submitMod.navigateToChatPathFromOverlay === 'function') {
		if (submitMod.navigateToChatPathFromOverlay(href)) return;
	}
	window.location.assign(href.startsWith('/') ? href : `/${href}`);
}

/**
 * Creation-detail embed #tag click: dismiss overlay first, then run channel-vs-tag chooser
 * on the chat shell (same UX as in-bubble hashtags).
 */
function initChatOverlayEmbedHashtagIntent() {
	window.addEventListener('message', (event) => {
		if (event.origin !== window.location.origin) return;
		const data = event.data;
		if (!data || typeof data !== 'object') return;
		if (data.type !== 'prsn-chat-hashtag-intent') return;
		const slug = String(data.slug || '')
			.trim()
			.toLowerCase();
		if (!slug) return;
		void handleChatOverlayEmbedHashtagIntent(slug);
	});
}

async function handleChatOverlayEmbedHashtagIntent(slug) {
	const qs = assetQuery();
	const [overlayMod, hashtagMod, submitMod] = await Promise.all([
		import(`/shared/spaPageOverlay.js${qs}`),
		import(`/shared/hashtagDestination.js${qs}`),
		import(`/shared/createSubmit.js${qs}`),
	]);
	if (typeof overlayMod.closeSpaPageOverlay === 'function') {
		overlayMod.closeSpaPageOverlay({ skipScrollRestore: true });
	}
	if (typeof hashtagMod.openHashtagDestination !== 'function') return;

	// Cover the exists-check gap after overlay dismiss (same veil as overlay shell-out).
	if (typeof overlayMod.showShellOutVeil === 'function') {
		overlayMod.showShellOutVeil();
	}

	const navigateFromHashtag = (href) => {
		const raw = String(href || '').trim();
		if (!raw) return;
		let pathOnly = raw;
		try {
			pathOnly = new URL(raw, window.location.origin).pathname;
		} catch {
			pathOnly = raw.split('?')[0].split('#')[0];
		}
		pathOnly = String(pathOnly || '').replace(/\/+$/, '') || '/';
		// Chat SPA: same as create-submit — in-shell nav paints lane/thread skeleton (no veil).
		if (
			(pathOnly === '/chat' || pathOnly.startsWith('/chat/')) &&
			typeof submitMod.navigateToChatPathFromOverlay === 'function' &&
			submitMod.navigateToChatPathFromOverlay(raw)
		) {
			if (typeof overlayMod.hideShellOutVeil === 'function') {
				overlayMod.hideShellOutVeil();
			}
			return;
		}
		if (typeof overlayMod.assignWithShellOutVeil === 'function') {
			overlayMod.assignWithShellOutVeil(raw);
			return;
		}
		window.location.assign(raw.startsWith('/') ? raw : `/${raw}`);
	};

	await hashtagMod.openHashtagDestination(slug, {
		onBeforeChoice: () => {
			if (typeof overlayMod.hideShellOutVeil === 'function') {
				overlayMod.hideShellOutVeil();
			}
		},
		navigate: navigateFromHashtag,
	});
}

initChatOverlayEmbedDmNavigation();
initChatOverlayEmbedHashtagIntent();

/**
 * Stale chat.bundle.js sets iframe src to about:blank before navigating — visible flash.
 * Swap blank for a themed srcdoc placeholder until the embed URL loads.
 */
function shellBackgroundColor() {
	try {
		const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
		if (bg) return bg;
	} catch {
		// ignore
	}
	return '#0f0d1a';
}

function themedOverlayFramePlaceholderSrcdoc(bg) {
	const safe = String(bg || '').replace(/[<>"']/g, '');
	return `<!DOCTYPE html><html style="background:${safe};margin:0"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"></head><body style="background:${safe};margin:0"></body></html>`;
}

function guardOverlayFrameAgainstAboutBlank(frame) {
	if (!(frame instanceof HTMLIFrameElement)) return;
	if (frame.dataset.prsnOverlayBlankGuard === '1') return;
	frame.dataset.prsnOverlayBlankGuard = '1';

	const protoSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
	if (!protoSrc?.get || !protoSrc?.set) return;

	Object.defineProperty(frame, 'src', {
		configurable: true,
		enumerable: true,
		get() {
			return protoSrc.get.call(this);
		},
		set(value) {
			if (value === 'about:blank') {
				try {
					this.removeAttribute('src');
					this.srcdoc = themedOverlayFramePlaceholderSrcdoc(shellBackgroundColor());
				} catch {
					// ignore
				}
				return;
			}
			try {
				this.removeAttribute('srcdoc');
			} catch {
				// ignore
			}
			protoSrc.set.call(this, value);
		},
	});

	const current = frame.getAttribute('src');
	if (current === 'about:blank') {
		frame.src = 'about:blank';
	}
}

function initOverlayIframeBlankFlashGuard() {
	const scan = (root) => {
		if (!(root instanceof Element || root instanceof Document)) return;
		for (const frame of root.querySelectorAll?.('.creation-detail-overlay-frame') || []) {
			guardOverlayFrameAgainstAboutBlank(frame);
		}
	};

	scan(document);
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof Element)) continue;
				if (node.matches?.('.creation-detail-overlay-frame')) {
					guardOverlayFrameAgainstAboutBlank(node);
					continue;
				}
				scan(node);
			}
		}
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
}

initOverlayIframeBlankFlashGuard();

/**
 * Pin banner: force first-line snippet + visible “Read more”.
 * Hotfix CSS already lays out copy as a column; this covers cases where the
 * preview was painted with wrapped full text or “Read more” stayed [hidden].
 */
function plainTextHonoringBreaksFromHtml(root) {
	if (!(root instanceof HTMLElement)) return '';
	const clone = root.cloneNode(true);
	for (const br of clone.querySelectorAll('br')) {
		br.replaceWith('\n');
	}
	for (const block of clone.querySelectorAll('p, li, div, h1, h2, h3, h4, h5, h6')) {
		if (block.nextSibling) block.append('\n');
	}
	return String(clone.textContent || '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.replace(/\u2028/g, '\n')
		.replace(/\u2029/g, '\n');
}

function firstPinnedBannerLine(body) {
	const lines = String(body || '')
		.split('\n')
		.map((l) => l.replace(/[ \t]+/g, ' ').trim())
		.filter(Boolean);
	if (lines.length === 0) return '';
	// Full first hard line — CSS wraps / clamps beside “Read more”.
	return lines[0];
}

function syncPinnedBannerPreviewFromDom() {
	const banner = document.querySelector('[data-chat-pinned-banner]');
	if (!(banner instanceof HTMLElement) || banner.hasAttribute('hidden')) return;
	const previewEl = banner.querySelector('[data-chat-pinned-banner-preview]');
	let moreEl = banner.querySelector('[data-chat-pinned-banner-more]');
	const copyEl = banner.querySelector('.chat-page-pinned-banner-copy');
	if (!(previewEl instanceof HTMLElement)) return;
	if (previewEl.classList.contains('is-loading')) return;

	const pinnedBody =
		document.querySelector('.connect-chat-msg--channel-pinned .connect-chat-msg-bubble') || null;
	const source = pinnedBody instanceof HTMLElement ? plainTextHonoringBreaksFromHtml(pinnedBody) : '';
	const wantLine = firstPinnedBannerLine(source);
	const current = String(previewEl.textContent || '').replace(/\s+/g, ' ').trim();
	const want = wantLine.replace(/\s+/g, ' ').trim();

	// If the in-stream pinned bubble has a shorter first line than what’s painted, trim.
	if (want && current && current !== want && current.startsWith(want.slice(0, Math.min(24, want.length)))) {
		previewEl.textContent = wantLine;
	} else if (want && !current) {
		previewEl.textContent = wantLine;
	}

	if (!(moreEl instanceof HTMLElement) && copyEl instanceof HTMLElement) {
		moreEl = document.createElement('span');
		moreEl.className = 'chat-page-pinned-banner-more';
		moreEl.setAttribute('data-chat-pinned-banner-more', '');
		moreEl.textContent = 'Read more';
		copyEl.appendChild(moreEl);
	} else if (
		moreEl instanceof HTMLElement &&
		copyEl instanceof HTMLElement &&
		previewEl instanceof HTMLElement &&
		moreEl.parentElement === copyEl &&
		previewEl.nextElementSibling !== moreEl
	) {
		copyEl.appendChild(moreEl);
	}
	if (moreEl instanceof HTMLElement && current) {
		moreEl.hidden = false;
		moreEl.removeAttribute('hidden');
		if (!String(moreEl.textContent || '').trim()) moreEl.textContent = 'Read more';
	}
}

function initPinnedBannerPreviewFix() {
	const run = () => {
		try {
			syncPinnedBannerPreviewFromDom();
		} catch {
			// ignore
		}
	};
	run();
	const observer = new MutationObserver(() => {
		window.clearTimeout(initPinnedBannerPreviewFix._t);
		initPinnedBannerPreviewFix._t = window.setTimeout(run, 50);
	});
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['hidden', 'class'],
	});
}

initPinnedBannerPreviewFix();

/**
 * Pinned overlay: replace bare @handle author with the same meta header
 * as in-stream messages (avatar, handle, relative time, pin mark).
 * Bundle may still paint the old author line until it refreshes.
 */
function syncPinnedOverlayMessageHeader() {
	const overlay = document.querySelector('.chat-page-pinned-message-overlay');
	if (!(overlay instanceof HTMLElement)) return;
	const body = overlay.querySelector('.chat-page-pinned-message-modal-body');
	if (!(body instanceof HTMLElement)) return;
	if (body.querySelector('.connect-chat-msg-meta')) return;

	const author = body.querySelector('.chat-page-pinned-message-author');
	const streamMeta = document.querySelector(
		'.connect-chat-msg--channel-pinned .connect-chat-msg-meta'
	);
	if (!(streamMeta instanceof HTMLElement)) return;

	const clone = streamMeta.cloneNode(true);
	if (!(clone instanceof HTMLElement)) return;
	clone.classList.add('chat-page-pinned-message-meta');
	if (!clone.querySelector('.connect-chat-msg-pin-mark')) {
		const mark = document.createElement('span');
		mark.className = 'connect-chat-msg-pin-mark';
		mark.setAttribute('aria-hidden', 'true');
		mark.innerHTML =
			'<svg class="connect-chat-msg-pin-mark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>';
		clone.appendChild(mark);
	}
	if (author instanceof HTMLElement) {
		author.replaceWith(clone);
	} else {
		body.insertBefore(clone, body.firstChild);
	}
}

function initPinnedOverlayMessageHeaderFix() {
	const run = () => {
		try {
			syncPinnedOverlayMessageHeader();
		} catch {
			// ignore
		}
	};
	run();
	const mo = new MutationObserver(() => {
		window.clearTimeout(initPinnedOverlayMessageHeaderFix._t);
		initPinnedOverlayMessageHeaderFix._t = window.setTimeout(run, 30);
	});
	mo.observe(document.documentElement, { childList: true, subtree: true });
}

initPinnedOverlayMessageHeaderFix();

/**
 * Reaction picker is portaled to <body> at z-index 1000 in the bundle CSS,
 * which sits under .modal-overlay (99999). Lift it whenever it appears.
 */
function liftCommentReactionPicker(el) {
	if (!(el instanceof HTMLElement) || !el.classList.contains('comment-reaction-picker')) return;
	el.style.zIndex = '100050';
}

function initReactionPickerStackFix() {
	for (const el of document.querySelectorAll('.comment-reaction-picker')) {
		liftCommentReactionPicker(el);
	}
	const mo = new MutationObserver((records) => {
		for (const rec of records) {
			for (const node of rec.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				liftCommentReactionPicker(node);
				if (node.querySelectorAll) {
					for (const el of node.querySelectorAll('.comment-reaction-picker')) {
						liftCommentReactionPicker(el);
					}
				}
			}
		}
	});
	mo.observe(document.documentElement, { childList: true, subtree: true });
}

initReactionPickerStackFix();

/**
 * Organize SPA fold-in for stale chat.bundle.js:
 * - Keep a hidden organizer-sidebar host so eligibility still works
 * - Prefer an in-pane Organize CTA (same size as Vote); clear any header/menu Organize entry
 * - Navigate Challenges ↔ Organize via `prsn-chat-open-path` (no full reload)
 * - When booting via `prsn-chat-organize-boot`, mount the board from `/@src`
 */
function normalizeChatPathname(pathname) {
	return String(pathname || '').replace(/\/+$/, '') || '/';
}

function isChallengesMainPath() {
	return normalizeChatPathname(window.location.pathname) === '/challenges';
}

function isChallengesOrganizeBootPending() {
	try {
		return window.sessionStorage?.getItem('prsn-chat-organize-boot') === '1';
	} catch {
		return false;
	}
}

function clearChallengesOrganizeBootFlag() {
	try {
		window.sessionStorage?.removeItem('prsn-chat-organize-boot');
	} catch {
		// ignore
	}
}

function ensureOrganizerSidebarHostForEligibility() {
	const scope =
		document.querySelector('[data-chat-canvas-scope]') ||
		document.querySelector('[data-chat-main-split]') ||
		document.body;
	if (!(scope instanceof HTMLElement)) return;
	let host = scope.querySelector('[data-chat-challenges-organizer-sidebar]');
	if (host instanceof HTMLElement) {
		host.hidden = true;
		host.setAttribute('aria-hidden', 'true');
		return;
	}
	host = document.createElement('div');
	host.className = 'chat-page-challenges-organizer-sidebar';
	host.setAttribute('data-chat-challenges-organizer-sidebar', '');
	host.hidden = true;
	host.setAttribute('aria-hidden', 'true');
	scope.appendChild(host);
}

function relabelOrganizerEntryButtons(root) {
	const scope = root instanceof HTMLElement ? root : document;
	clearHeaderOrganizeButtons();
	for (const btn of scope.querySelectorAll('.challenge-pane-organize-entry-btn')) {
		if (!(btn instanceof HTMLElement)) continue;
		btn.dataset.chatChallengesOrganizerOpen = '';
		const label = btn.querySelector('.challenge-pane-organize-entry-btn-label');
		if (label instanceof HTMLElement) label.textContent = 'Organize';
		else if (!btn.textContent?.trim()) btn.textContent = 'Organize';
	}
}

/**
 * Prefer in-shell SPA navigation (chatPage listens for `prsn-chat-open-path`).
 * Only full-reload when the chat shell is not ready.
 * @param {string} href
 * @param {Event | null | undefined} ev
 */
function navigateChatSpa(href, ev) {
	if (ev) {
		ev.preventDefault();
		ev.stopPropagation();
	}
	const raw = String(href || '').trim();
	if (!raw) return;

	let pathOnly = raw.split('?')[0].split('#')[0];
	try {
		pathOnly = normalizeChatPathname(new URL(raw, window.location.origin).pathname);
	} catch {
		pathOnly = normalizeChatPathname(pathOnly);
	}
	if (pathOnly === normalizeChatPathname(window.location.pathname)) return;

	const onChatPage =
		document.body?.classList?.contains('chat-page') ||
		document.documentElement?.classList?.contains('chat-page') ||
		document.body?.dataset?.entry === 'chat';
	if (onChatPage && document.querySelector('[data-chat-page], [data-chat-messages]')) {
		try {
			document.dispatchEvent(
				new CustomEvent('prsn-chat-open-path', {
					bubbles: true,
					detail: { href: raw }
				})
			);
			return;
		} catch {
			// fall through
		}
	}
	window.location.assign(raw);
}

function navigateToChallengesOrganize(ev) {
	navigateChatSpa(`/challenges/organize${window.location.search || ''}`, ev);
}

async function mountOrganizeBoardViaSrc() {
	const messagesEl = document.querySelector('[data-chat-messages]');
	if (!(messagesEl instanceof HTMLElement)) return false;
	if (messagesEl.querySelector('[data-organize-board], .challenges-organize-root--spa')) {
		clearChallengesOrganizeBootFlag();
		return true;
	}

	let mountOrganizeLane = null;
	try {
		const mod = await import(`/@src/chat/challenges/organizePageMain.js${assetQuery()}`);
		mountOrganizeLane = mod?.mountOrganizeLane;
	} catch (err) {
		console.warn('[chat-hotfix] organize /@src import failed', err);
		return false;
	}
	if (typeof mountOrganizeLane !== 'function') return false;

	document.body?.classList.add('chat-page--challenges-organize');
	messagesEl.innerHTML = '';
	const mountWrap = document.createElement('div');
	mountWrap.className = 'challenges-organize-root challenges-organize-root--spa';
	mountWrap.setAttribute('aria-live', 'polite');
	messagesEl.appendChild(mountWrap);

	const titleEl = document.querySelector('[data-chat-title]');
	if (titleEl instanceof HTMLElement) {
		titleEl.setAttribute('data-chat-title-label', 'Challenges › Organize');
		titleEl.innerHTML =
			'<span class="chat-page-header-title-text chat-page-header-title-text--breadcrumb"><a href="/challenges" class="chat-page-header-breadcrumb-link" data-chat-organize-back>Challenges</a><span class="chat-page-header-breadcrumb-sep" aria-hidden="true">›</span><span class="chat-page-header-breadcrumb-current">Organize</span></span>';
		titleEl.removeAttribute('data-chat-title-awaiting');
		titleEl.removeAttribute('aria-hidden');
	}
	const mobileTitle = document.querySelector('[data-chat-mobile-chrome-channel]');
	if (mobileTitle instanceof HTMLElement) {
		mobileTitle.textContent = 'Organize';
	}
	const caret = document.querySelector('[data-chat-mobile-chrome-sheet-trigger]');
	if (caret instanceof HTMLButtonElement) {
		caret.hidden = true;
		caret.setAttribute('aria-hidden', 'true');
	}
	const topbarBack = document.querySelector('.chat-page-topbar .chat-page-back');
	if (topbarBack instanceof HTMLAnchorElement) {
		topbarBack.href = '/challenges';
		topbarBack.setAttribute('aria-label', 'Back to Challenges');
	}
	const mobileBack = document.querySelector('[data-chat-mobile-chrome-back]');
	if (mobileBack instanceof HTMLElement) {
		mobileBack.setAttribute('aria-label', 'Back to Challenges');
	}

	try {
		const st =
			window.history?.state && typeof window.history.state === 'object'
				? { ...window.history.state, prsnChat: true }
				: { prsnChat: true };
		window.history.replaceState(st, '', `/challenges/organize${window.location.search || ''}`);
	} catch {
		// ignore
	}

	await mountOrganizeLane(mountWrap, {
		onEligibility: () => {},
		onOceanman: (isOceanman) => {
			const show = Boolean(isOceanman);
			for (const btn of document.querySelectorAll('[data-chat-organize-settings]')) {
				if (!(btn instanceof HTMLButtonElement)) continue;
				btn.hidden = !show;
			}
		}
	});
	clearChallengesOrganizeBootFlag();
	return true;
}

function clearHeaderOrganizeButtons() {
	for (const btn of document.querySelectorAll(
		'[data-chat-topbar-pinned-canvas], [data-chat-mobile-pinned-canvas]'
	)) {
		if (!(btn instanceof HTMLButtonElement)) continue;
		const isOrganize =
			btn.hasAttribute('data-chat-challenges-organizer-open') ||
			btn.textContent?.trim() === 'Organize';
		if (!isOrganize) continue;
		delete btn.dataset.chatChallengesOrganizerOpen;
		btn.removeAttribute('data-chat-challenges-organizer-open');
		btn.hidden = true;
		btn.textContent = '';
		btn.removeAttribute('aria-label');
	}
	for (const item of document.querySelectorAll(
		'[data-chat-topbar-menu-dynamic] [data-chat-challenges-organizer-open], [data-chat-mobile-chrome-sheet-body] [data-chat-challenges-organizer-open]'
	)) {
		if (!(item instanceof HTMLElement)) continue;
		if (item.classList.contains('challenge-pane-organize-entry-btn')) continue;
		item.remove();
	}
}

function injectOrganizeEntryButtons() {
	if (!isChallengesMainPath()) return;
	clearHeaderOrganizeButtons();

	const pane = document.querySelector('.challenge-pane-root .challenge-pane, .challenge-pane');
	if (!(pane instanceof HTMLElement)) return;
	if (pane.querySelector('.challenge-pane-organize-entry-btn')) return;

	const section = document.createElement('section');
	section.className = 'challenge-pane-section challenge-pane-organize-entry';
	const link = document.createElement('a');
	link.href = '/challenges/organize';
	link.className = 'challenge-pane-organize-entry-btn';
	link.dataset.chatChallengesOrganizerOpen = '';
	link.innerHTML = '<span class="challenge-pane-organize-entry-btn-label">Organize</span>';
	section.appendChild(link);

	const list = pane.querySelector('.challenge-pane-active-list');
	if (list instanceof HTMLElement && list.parentNode) {
		list.insertAdjacentElement('beforebegin', section);
		return;
	}
	pane.prepend(section);
}

async function viewerLooksLikeChallengeOrganizer() {
	try {
		const res = await fetch('/api/profile', { credentials: 'include' });
		if (!res.ok) return false;
		const user = await res.json().catch(() => null);
		const prof = user?.profile && typeof user.profile === 'object' ? user.profile : {};
		const userName =
			typeof prof.user_name === 'string' && prof.user_name.trim() ? prof.user_name.trim() : '';
		if (!userName) return false;
		const admin = await import(`/@src/chat/challenges/challengeAdmin.js${assetQuery()}`);
		if (admin.isImpliedChallengeOrganizer?.(userName)) return true;

		const { readChallengesChannelCache } = await import(
			`/@src/chat/challenges/challengesChannelCache.js${assetQuery()}`
		);
		const cached = readChallengesChannelCache?.();
		if (cached && Array.isArray(cached.messages) && cached.messages.length) {
			const names = admin.resolveChallengeOrganizerAllowlistFromMessages?.(cached.messages);
			return Boolean(admin.isChallengeChannelAdmin?.(userName, names));
		}

		// Fall back: show entry for logged-in organizers-to-be; Organize page still gates.
		return true;
	} catch {
		return true;
	}
}

let organizeEligibilityPromise = null;
function ensureOrganizeEntryWhenEligible() {
	if (!isChallengesMainPath()) return;
	if (!organizeEligibilityPromise) {
		organizeEligibilityPromise = viewerLooksLikeChallengeOrganizer().finally(() => {
			window.setTimeout(() => {
				organizeEligibilityPromise = null;
			}, 5000);
		});
	}
	void organizeEligibilityPromise.then((ok) => {
		if (!ok) return;
		if (!isChallengesMainPath()) return;
		injectOrganizeEntryButtons();
		relabelOrganizerEntryButtons(document);
	});
}

function initChallengesOrganizeSpaHotfix() {
	ensureOrganizerSidebarHostForEligibility();

	document.addEventListener(
		'click',
		(e) => {
			const t = e.target;
			if (!(t instanceof Element)) return;
			if (t.closest('[data-chat-organize-back]')) {
				clearChallengesOrganizeBootFlag();
				navigateChatSpa(`/challenges${window.location.search || ''}`, e);
				return;
			}
			const openBtn = t.closest('[data-chat-challenges-organizer-open]');
			if (!(openBtn instanceof HTMLElement)) return;
			navigateToChallengesOrganize(e);
		},
		true
	);

	const syncLabels = () => {
		ensureOrganizerSidebarHostForEligibility();
		if (isChallengesMainPath() || isChallengesOrganizeBootPending()) {
			relabelOrganizerEntryButtons(document);
			ensureOrganizeEntryWhenEligible();
		}
	};
	syncLabels();
	const mo = new MutationObserver(() => {
		window.clearTimeout(initChallengesOrganizeSpaHotfix._t);
		initChallengesOrganizeSpaHotfix._t = window.setTimeout(syncLabels, 40);
	});
	mo.observe(document.documentElement, { childList: true, subtree: true });

	const tryBootOrganize = () => {
		if (!isChallengesOrganizeBootPending()) return;
		if (document.querySelector('[data-organize-board], .challenges-organize-root--spa')) {
			clearChallengesOrganizeBootFlag();
			return;
		}
		void mountOrganizeBoardViaSrc();
	};
	tryBootOrganize();
	window.setTimeout(tryBootOrganize, 250);
	window.setTimeout(tryBootOrganize, 1200);
	window.setTimeout(ensureOrganizeEntryWhenEligible, 300);
	window.setTimeout(ensureOrganizeEntryWhenEligible, 1500);
}

initChallengesOrganizeSpaHotfix();

void import(`/shared/consoleGen.js${assetQuery()}`)
	.then((mod) => {
		mod.installConsoleGen?.();
	})
	.catch(() => {});
