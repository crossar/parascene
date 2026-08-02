import express from "express";

const SUNO_UUID_RE =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function extractSunoLinkTarget(url) {
	let parsed;
	try {
		parsed = new URL(String(url || ""));
	} catch {
		return null;
	}

	const host = parsed.hostname.toLowerCase();
	if (host !== "suno.com" && host !== "www.suno.com") return null;

	const pathname = parsed.pathname || "";

	const songMatch = pathname.match(/^\/song\/([a-f0-9-]{36})\/?$/i);
	if (songMatch?.[1] && SUNO_UUID_RE.test(songMatch[1])) {
		return { songId: songMatch[1].toLowerCase(), slug: "" };
	}

	const embedMatch = pathname.match(/^\/embed\/([a-f0-9-]{36})\/?$/i);
	if (embedMatch?.[1] && SUNO_UUID_RE.test(embedMatch[1])) {
		return { songId: embedMatch[1].toLowerCase(), slug: "" };
	}

	const shareMatch = pathname.match(/^\/s\/([A-Za-z0-9]{8,32})\/?$/);
	if (shareMatch?.[1]) {
		return { songId: "", slug: shareMatch[1] };
	}

	return null;
}

function normalizeUrl(raw) {
	const value = typeof raw === "string" ? raw.trim() : "";
	if (!value) return null;
	if (value.length > 2048) return null;
	if (!value.startsWith("https://") && !value.startsWith("http://")) return null;
	return value;
}

/** `/song/{uuid}` from a redirect Location (relative or absolute). */
export function extractSunoSongIdFromLocation(location) {
	const raw = String(location ?? "").trim();
	if (!raw) return "";

	let pathname = "";
	try {
		const parsed = new URL(raw, "https://suno.com");
		pathname = parsed.pathname || "";
	} catch {
		pathname = raw.split("?")[0] || "";
	}

	const m = pathname.match(/^\/song\/([a-f0-9-]{36})\/?$/i);
	if (!m?.[1] || !SUNO_UUID_RE.test(m[1])) return "";
	return m[1].toLowerCase();
}

export function extractSunoSongIdFromHtml(html) {
	const raw = String(html ?? "");
	const m = raw.match(/\/song\/([a-f0-9-]{36})/i);
	if (!m?.[1] || !SUNO_UUID_RE.test(m[1])) return "";
	return m[1].toLowerCase();
}

function extractOgMetaContent(html, property) {
	const raw = String(html ?? "");
	const prop = String(property || "").trim();
	if (!prop) return "";
	const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(
		`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
		"i"
	);
	const reSwap = new RegExp(
		`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
		"i"
	);
	const m = raw.match(re) || raw.match(reSwap);
	return m?.[1] ? String(m[1]).trim() : "";
}

export function parseSunoPageMeta(html) {
	const raw = String(html ?? "");
	const songId = extractSunoSongIdFromHtml(raw);
	if (!songId) return null;

	let title = extractOgMetaContent(raw, "og:title");
	const ogImage = extractOgMetaContent(raw, "og:image");

	let creator = "";
	const docTitle = raw.match(/<title>([^<]*)<\/title>/i);
	const titleBody = docTitle?.[1] ? docTitle[1].trim() : "";
	const byMatch = titleBody.match(/^(.+?)\s+by\s+(.+?)\s+\|\s+Suno\s*$/i);
	if (byMatch) {
		if (!title) title = byMatch[1].trim();
		creator = byMatch[2].trim();
	}

	return { songId, title, creator, ogImage: ogImage || "" };
}

/** Share links 307 to `/song/{uuid}?sh={slug}` — read Location instead of scraping HTML. */
export async function resolveSunoShareSlug(slug) {
	const shareUrl = `https://suno.com/s/${encodeURIComponent(slug)}`;
	const upstream = await fetch(shareUrl, {
		method: "HEAD",
		redirect: "manual",
		headers: {
			Accept: "text/html",
			"User-Agent": "parascene-suno-resolve",
		},
	});

	const location = upstream.headers.get("location") || "";
	const fromRedirect = extractSunoSongIdFromLocation(location);
	if (fromRedirect) return fromRedirect;

	// Fallback if redirect shape changes.
	const bodyRes = await fetch(shareUrl, {
		method: "GET",
		redirect: "manual",
		headers: {
			Accept: "text/html",
			"User-Agent": "parascene-suno-resolve",
		},
	});
	const bodyLocation = bodyRes.headers.get("location") || "";
	return extractSunoSongIdFromLocation(bodyLocation) || "";
}

async function fetchSunoSongMeta(songId) {
	const fetchUrl = `https://suno.com/song/${encodeURIComponent(songId)}`;
	const upstream = await fetch(fetchUrl, {
		method: "GET",
		headers: {
			Accept: "text/html",
			"User-Agent": "parascene-suno-resolve",
		},
	});

	if (!upstream.ok) return null;
	const html = await upstream.text();
	return parseSunoPageMeta(html);
}

/**
 * Resolve a permissive Suno song/share/embed URL to song id + page meta.
 * @param {string} rawUrl
 * @returns {Promise<{ songId: string, title: string, creator: string, ogImage: string, url: string, embedUrl: string }>}
 */
export async function resolveSunoSongFromUrl(rawUrl) {
	const url = normalizeUrl(rawUrl);
	if (!url) {
		const err = new Error("Missing url");
		err.code = "INVALID_URL";
		err.status = 400;
		throw err;
	}

	const target = extractSunoLinkTarget(url);
	if (!target) {
		const err = new Error("Invalid Suno url");
		err.code = "INVALID_SUNO_URL";
		err.status = 400;
		throw err;
	}

	let songId = target.songId;
	if (!songId && target.slug) {
		songId = await resolveSunoShareSlug(target.slug);
	}
	if (!songId) {
		const err = new Error("Could not resolve Suno song");
		err.code = "RESOLVE_FAILED";
		err.status = 502;
		throw err;
	}

	const meta = await fetchSunoSongMeta(songId);
	const canonicalUrl = `https://suno.com/song/${encodeURIComponent(songId)}`;
	return {
		songId,
		title: meta?.title || "",
		creator: meta?.creator || "",
		ogImage: meta?.ogImage || "",
		url: canonicalUrl,
		embedUrl: `https://suno.com/embed/${encodeURIComponent(songId)}`,
	};
}

export default function createSunoRoutes() {
	const router = express.Router();

	router.get("/api/suno/resolve", async (req, res) => {
		if (!req.auth?.userId) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const url = normalizeUrl(req.query?.url);
		if (!url) {
			return res.status(400).json({ error: "Missing url" });
		}

		res.setHeader(
			"Cache-Control",
			"public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
		);

		try {
			const resolved = await resolveSunoSongFromUrl(url);
			return res.json({
				songId: resolved.songId,
				title: resolved.title,
				creator: resolved.creator,
			});
		} catch (err) {
			const status = Number(err?.status) || 502;
			const message =
				typeof err?.message === "string" && err.message.trim()
					? err.message.trim()
					: "Suno resolve fetch failed";
			return res.status(status).json({ error: message });
		}
	});

	return router;
}
