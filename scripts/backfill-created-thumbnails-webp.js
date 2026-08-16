#!/usr/bin/env node
/**
 * Rebuild square (`?variant=thumbnail`) and fit (`?variant=fit`) thumbs as WebP.
 * Storage keys stay the same. Originals stay. Already-WebP thumbs are skipped
 * unless --force.
 *
 * Usage:
 *   node scripts/backfill-created-thumbnails-webp.js --dry-run
 *   node scripts/backfill-created-thumbnails-webp.js
 *   node scripts/backfill-created-thumbnails-webp.js --force
 *   node scripts/backfill-created-thumbnails-webp.js --limit 50
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadEnv } from "./repo-root.cjs";
import {
	buildFitThumbnailBuffer,
	buildSquareThumbnailBuffer,
	fitThumbnailStorageKey,
	shouldGenerateFitThumbnail
} from "../api_routes/utils/fitThumbnail.js";

loadEnv();

const CREATED_TABLE = "prsn_created_images";
const CREATED_BUCKET = "prsn_created-images";
const THUMB_BUCKET = "prsn_created-images-thumbnails";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitArg = readFlagValue(args, "--limit");
const maxRows = limitArg != null ? Number(limitArg) : Infinity;
const pageSize = 100;

function readFlagValue(list, flag) {
	const idx = list.indexOf(flag);
	if (idx < 0) return null;
	const value = list[idx + 1];
	if (!value || value.startsWith("--")) return null;
	return value;
}

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required env var: ${name}`);
	return value;
}

function formatBytes(n) {
	if (!Number.isFinite(n)) return "?";
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function download(supabase, bucket, key) {
	const { data, error } = await supabase.storage.from(bucket).download(key);
	if (error || !data) throw new Error(error?.message || `not found in ${bucket}: ${key}`);
	return Buffer.from(await data.arrayBuffer());
}

async function isWebpBuffer(buffer) {
	try {
		const meta = await sharp(buffer, { failOn: "none" }).metadata();
		return meta.format === "webp";
	} catch {
		return false;
	}
}

async function main() {
	const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
		auth: { persistSession: false }
	});

	console.log(
		[
			dryRun ? "[dry-run]" : "[write]",
			"created thumbs → webp, newest first",
			force ? "(force)" : "(skip existing webp)",
			Number.isFinite(maxRows) ? `limit=${maxRows}` : ""
		]
			.filter(Boolean)
			.join(" ")
	);

	let cursor = Number.POSITIVE_INFINITY;
	let scanned = 0;
	let skipped = 0;
	let updated = 0;
	let failed = 0;

	while (scanned < maxRows) {
		const take = Math.min(pageSize, maxRows - scanned);
		let query = supabase
			.from(CREATED_TABLE)
			.select("id, filename, width, height, status, unavailable_at")
			.order("id", { ascending: false })
			.limit(take);
		if (Number.isFinite(cursor) && cursor < Number.POSITIVE_INFINITY) {
			query = query.lt("id", cursor);
		}
		const { data, error } = await query;
		if (error) throw error;
		const rows = data ?? [];
		if (!rows.length) break;

		for (const row of rows) {
			cursor = Number(row.id);
			const filename = typeof row.filename === "string" ? row.filename.trim() : "";
			if (!filename || filename.includes("..")) continue;
			if (row.unavailable_at) continue;
			const status = typeof row.status === "string" ? row.status.trim() : "completed";
			if (status && status !== "completed") continue;

			scanned += 1;
			try {
				let squareNeeds = force;
				let fitNeeds = false;
				const w = Number(row.width) || 0;
				const h = Number(row.height) || 0;
				const wantsFit = w > 0 && h > 0 ? shouldGenerateFitThumbnail(w, h) : true;

				if (!force) {
					try {
						const existingSquare = await download(supabase, THUMB_BUCKET, filename);
						squareNeeds = !(await isWebpBuffer(existingSquare));
					} catch {
						squareNeeds = true;
					}
					if (wantsFit) {
						try {
							const existingFit = await download(
								supabase,
								THUMB_BUCKET,
								fitThumbnailStorageKey(filename)
							);
							fitNeeds = !(await isWebpBuffer(existingFit));
						} catch {
							fitNeeds = true;
						}
					}
				} else {
					fitNeeds = wantsFit;
				}

				if (!squareNeeds && !fitNeeds) {
					skipped += 1;
					continue;
				}

				const source = await download(supabase, CREATED_BUCKET, filename);

				if (squareNeeds) {
					const square = await buildSquareThumbnailBuffer(source);
					if (dryRun) {
						console.log(
							`  [dry-run] ${row.id} square ${formatBytes(source.length)} → ${formatBytes(square.length)}`
						);
					} else {
						const { error: upErr } = await supabase.storage.from(THUMB_BUCKET).upload(filename, square, {
							contentType: "image/webp",
							upsert: true
						});
						if (upErr) throw upErr;
					}
				}

				if (fitNeeds) {
					const dims =
						w > 0 && h > 0
							? { width: w, height: h }
							: await sharp(source, { failOn: "none" }).metadata();
					const dw = Number(dims.width) || 0;
					const dh = Number(dims.height) || 0;
					if (dw > 0 && dh > 0 && shouldGenerateFitThumbnail(dw, dh)) {
						const fit = await buildFitThumbnailBuffer(source);
						const fitKey = fitThumbnailStorageKey(filename);
						if (dryRun) {
							console.log(`  [dry-run] ${row.id} fit → ${formatBytes(fit.length)} ${fitKey}`);
						} else {
							const { error: fitErr } = await supabase.storage
								.from(THUMB_BUCKET)
								.upload(fitKey, fit, { contentType: "image/webp", upsert: true });
							if (fitErr) throw fitErr;
						}
					}
				}

				updated += 1;
				if (!dryRun && updated % 50 === 0) {
					console.log(`  … updated=${updated} scanned=${scanned} skipped=${skipped} failed=${failed}`);
				}
			} catch (err) {
				failed += 1;
				console.error(`  creation ${row.id}: ${err?.message || err}`);
			}
		}

		if (rows.length < take) break;
	}

	console.log(`done scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed}`);
	if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
