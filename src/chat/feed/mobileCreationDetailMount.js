/**
 * In-shell mobile creation detail: seed-first hero + related grid in the chat overlay.
 * Standalone `/creations/:id` remains for desktop, share, and full chrome.
 */

import { readCreationDetailSeed, writeCreationDetailSeed, feedItemToCreationDetailSeed, creationDetailChromeHtmlFromSeed, bindCreationDetailDescriptionCollapse } from '../../shared/creationDetailSeed.js';

function escapeHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function isMobileChatLayout() {
	try {
		return window.matchMedia('(max-width: 768px)').matches;
	} catch {
		return false;
	}
}

export function shouldUseInShellCreationDetail() {
	if (typeof window === 'undefined') return false;
	if (!isMobileChatLayout()) return false;
	const body = document.body;
	return Boolean(
		body?.classList?.contains('chat-page') ||
			document.documentElement?.classList?.contains('chat-page') ||
			body?.dataset?.entry === 'chat'
	);
}

function seedToHeroHtml(seed, creationId) {
	const img =
		(typeof seed?.image_url === 'string' && seed.image_url.trim()) ||
		(typeof seed?.thumbnail_url === 'string' && seed.thumbnail_url.trim()) ||
		'';
	const title = typeof seed?.title === 'string' ? seed.title.trim() : '';
	const w = Number(seed?.width);
	const h = Number(seed?.height);
	const ratio = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 ? `${w} / ${h}` : '1 / 1';
	const chrome = creationDetailChromeHtmlFromSeed(seed);
	return `
		<div class="mobile-creation-detail" data-mobile-creation-detail="${creationId}">
			<div class="creation-detail-image-wrapper mobile-creation-detail-hero" style="--hero-aspect-ratio: ${ratio};">
				${img ? `<img class="mobile-creation-detail-img" src="${escapeHtml(img)}" alt="${escapeHtml(title || 'Creation')}" decoding="async">` : ''}
			</div>
			<div class="mobile-creation-detail-panel" data-mobile-creation-panel>
				${chrome}
				<div class="mobile-creation-detail-related" data-mobile-creation-related>
					<h2 class="mobile-creation-detail-related-heading">Related</h2>
					<div class="mobile-creation-detail-related-grid" data-mobile-creation-related-grid></div>
				</div>
			</div>
		</div>
	`;
}

async function hydrateFromApi(root, creationId, onNavigate) {
	try {
		const res = await fetch(`/api/create/images/${creationId}`, { credentials: 'include' });
		if (!res.ok) return;
		const creation = await res.json();
		const seed = feedItemToCreationDetailSeed({
			created_image_id: creation.id || creationId,
			image_url: creation.url || creation.image_url,
			thumbnail_url: creation.thumbnail_url,
			video_url: creation.video_url,
			media_type: creation.media_type,
			width: creation.width,
			height: creation.height,
			title: creation.title,
			summary: creation.summary || creation.description,
			like_count: creation.like_count,
			viewer_liked: creation.viewer_liked,
			nsfw: creation.nsfw,
			user_id: creation.user_id,
			author_user_name: creation.creator?.user_name,
			author_display_name: creation.creator?.display_name,
			author_avatar_url: creation.creator?.avatar_url,
			author_plan: creation.creator?.plan === 'founder' ? 'founder' : '',
			created_at: creation.created_at,
			published_at: creation.published_at || creation.created_at,
			published: creation.published,
			meta: creation.meta,
		});
		if (seed) writeCreationDetailSeed(seed);
		const imgEl = root.querySelector('.mobile-creation-detail-img');
		const nextUrl = seed?.image_url || seed?.thumbnail_url;
		if (imgEl instanceof HTMLImageElement && nextUrl && imgEl.src !== nextUrl) {
			imgEl.src = nextUrl;
		}
		const hero = root.querySelector('.mobile-creation-detail-hero');
		const w = Number(seed?.width);
		const h = Number(seed?.height);
		if (hero instanceof HTMLElement && Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
			hero.style.setProperty('--hero-aspect-ratio', `${w} / ${h}`);
		}
		const panel = root.querySelector('[data-mobile-creation-panel]');
		if (panel instanceof HTMLElement && seed) {
			const related = panel.querySelector('[data-mobile-creation-related]');
			const relatedHtml = related instanceof HTMLElement ? related.outerHTML : '';
			panel.innerHTML = `${creationDetailChromeHtmlFromSeed(seed)}${relatedHtml}`;
			bindCreationDetailDescriptionCollapse(panel);
		}
	} catch {
		// keep seed paint
	}
	void loadRelated(root, creationId, onNavigate);
}

async function loadRelated(root, creationId, onNavigate) {
	const grid = root.querySelector('[data-mobile-creation-related-grid]');
	if (!(grid instanceof HTMLElement)) return;
	try {
		const res = await fetch(`/api/creations/${creationId}/related?limit=12`, { credentials: 'include' });
		if (!res.ok) return;
		const data = await res.json().catch(() => ({}));
		const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.creations) ? data.creations : [];
		grid.innerHTML = '';
		for (const item of items) {
			const cid = Number(item?.created_image_id ?? item?.id);
			if (!Number.isFinite(cid) || cid <= 0) continue;
			const thumb =
				(typeof item.thumbnail_url === 'string' && item.thumbnail_url.trim()) ||
				(typeof item.image_url === 'string' && item.image_url.trim()) ||
				'';
			const a = document.createElement('a');
			a.className = 'mobile-creation-detail-related-card';
			a.href = `/creations/${cid}?from=${encodeURIComponent(String(creationId))}`;
			a.addEventListener('click', (ev) => {
				ev.preventDefault();
				const nextSeed = feedItemToCreationDetailSeed(item) || { id: cid, image_url: thumb, thumbnail_url: thumb };
				writeCreationDetailSeed(nextSeed);
				if (typeof onNavigate === 'function') onNavigate(a.getAttribute('href') || `/creations/${cid}`);
			});
			if (thumb) {
				const img = document.createElement('img');
				img.src = thumb;
				img.alt = '';
				img.loading = 'lazy';
				img.decoding = 'async';
				a.appendChild(img);
			}
			grid.appendChild(a);
		}
	} catch {
		// ignore
	}
}

/**
 * @param {HTMLElement} rootEl
 * @param {{ creationId: number, onNavigate?: (href: string) => void }} opts
 */
export function mountInShellCreationDetail(rootEl, opts) {
	if (!(rootEl instanceof HTMLElement)) return () => {};
	const creationId = Number(opts?.creationId);
	if (!Number.isFinite(creationId) || creationId <= 0) return () => {};
	const seed = readCreationDetailSeed(creationId);
	rootEl.innerHTML = seedToHeroHtml(seed, creationId);
	bindCreationDetailDescriptionCollapse(rootEl);
	rootEl.scrollTop = 0;
	void hydrateFromApi(rootEl, creationId, opts.onNavigate);
	return () => {
		rootEl.innerHTML = '';
	};
}
