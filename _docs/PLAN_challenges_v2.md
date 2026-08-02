# Plan: Challenges v2 — organize and participate

Successor to PLAN_challenges_remaining.md. Supersedes its items 1–5 with agreed product direction.

Phases below are numbered in **ship order**. Phase 1 is song creations (Suno posts) so users can play with that while the rest of challenges v2 is built. Each phase ends with a team validation gate. User-facing journeys are spelled out in **User flows** near the end; phases point at them as `→ User flow Fn`.

## Direction, agreed

- Clock drives phases (unchanged). Pins + feed freshness fire automatically. Humans get one-click card actions: Announce, Close voting, Review results (swap winners before confirm; confirm pays out).
- Prizes: main 1st/2nd/3rd advertised. Participation prizes: top 3 submitters (entry count) + top 3 voters (votes cast), details revealed only at results.
- Prize structures are per-challenge config, inherited from the most recent same-track challenge. Only the first challenge of a track needs full definition.
- Feed keeps one engagement card. Focus = soonest deadline among active. "+N more open" chip when concurrent. `/challenges` lane is the canonical multi-track surface.
- Submit: context carries intent, confirm always names the target, picker when ambiguous, server rejects ambiguous submits. Media eligibility per track.
- Minimal song creations: paste Suno link → completed playable creation (cover + embed). Music track rides on this later (phase 9).
- Music challenges are sometimes remix contests (listen to a source Suno track on the challenge) and sometimes theme contests (like image challenges today). Remix source is optional on the challenge config — never required.

## Ship order at a glance

1. Song creations (Suno posts) — no deps; ship first
2. Foundations (debt + snapshot freshness)
3–6. Organizer console (prizes → publish → board actions → auto pins)
7–9. Multi-track participation (lane → submit targeting → Music challenge wiring)
10. Cleanup + data contract doc

Within 3–6 and 7–9, per-phase "done when" = engineer checkpoint; team validates at the end of each numbered phase below.

---

## Phase 1 — Song creations (Suno posts)

→ User flow F1 (post a Suno song as a creation).

No dependencies on anything else in this plan. Ship first / parallel with phase 2 so users get playable Suno creations while organizer work continues.

Reuse: Suno resolve (`api_routes/suno.js`), embed hydration + `.connect-chat-suno-embed` CSS, video pattern (cover on row, rich object in meta).

- `POST /api/create/import-suno` `{ url }`: auth; strict URL validation (suno.com song URL patterns only — this endpoint fetches remote URLs, treat as SSRF surface); resolve song id/title/creator; scrape og:image (validate resolved host, cap download size) → `storage.uploadImage` cover; per-user rate limit; insert `prsn_created_images` row directly, `status: 'completed'`, no credits/job:

```js
meta: {
	media_type: 'audio',
	import: { provider: 'suno', song_id, url, embed_url, title, creator }
}
```

Provider-keyed `meta.import` (not `meta.suno`) — Suno won't be the last external source.

- Import UX: resolve + cover scrape + upload takes 3–8s. Paste-link modal shows an explicit importing state; scrape has ~10s abort timeout; missing/failed `og:image` → placeholder cover, never a failed import.
- Entry point on create surface: "Import a song" → paste-link modal → open creation detail on success. (Music challenge card entry waits for phase 9.)
- Creation detail: audio branch = cover + Suno iframe, click-to-play (don't mount iframe on page load); gate image-only actions (recreate, poster, Vynly, share-audio).
- Feed card (`src/shared/feedCardBuild.js` ~1225–1286): cover + music badge ONLY — never an iframe in feed, must not hit video branch.
- Publish/unpublish works like other creations (completed + unpublished → publish to feed).

Team validate: paste a Suno link → playable creation with cover in under ~10s; plays on creation detail (click-to-play); publishes to feed as cover + music badge, no iframe in feed; bad/non-suno URL rejected cleanly; image-only actions absent on song detail.

---

## Phase 2 — Foundations (existing debt + snapshot freshness)

→ User flow F2 (Draft → Public shows on feed promptly). Mostly infrastructure; F2 is the user-visible proof.

Correctness bombs found in audit; fix before building organizer/publish paths on them. Can run parallel with phase 1.

Debt:

- Server message cap reads the WRONG END: `MESSAGE_FETCH_LIMIT = 500` + ascending order (`api_routes/utils/challengeSubmitShared.js:30-31, 172-180`) feeds submit eligibility and snapshot rebuild. Past 500 thread messages, both reason about the oldest slice — live challenges vanish, dead ones resurface. Fix: fetch newest-first (or filter to challenge kinds server-side), keep chronological merge order after fetch.
- Stats route scans ALL chat messages site-wide: `globalAverage` query has no thread filter (`api_routes/chat.js:2487-2513`), uncached, recomputed per call. Scope to the challenges thread + cache. Must land before the review modal (phase 5) depends on this route.
- Engagement endpoint bypasses its own cache: `GET /api/feed/challenge-engagement` defaults `fresh !== false` → force-rebuilds snapshot on every feed view (`api_routes/feed/challengeEngagementItem.js:26-34`). Flip default to trust cache; write-triggered invalidation (below) becomes the freshness mechanism. Also: client thumb hydrate re-downloads the entire thread per feed view (`public/.../challengeHistoryThumb.js:215-244`) — reuse the cached channel model instead.

Snapshot invalidation (organizer saves must show immediately; the 20-min TTL was fiction because of the always-fresh default above):

- `api_routes/chat.js` message POST/PATCH: when written `kind` is `challenge_config` (only in the `#challenges` thread; parse body defensively), invalidate `api_routes/feed/challengeFeedSnapshotCache.js` (Redis `feed-beta:challenge-snapshot:v2` + mem).
- Also invalidate from organize pins route (`chat.js` ~2370) and the publish-results route (phase 4).
- Single-flight the rebuild: in-process lock + Redis SETNX so concurrent feed requests after an invalidation don't all rebuild at once. While one rebuild runs, serve stale snapshot if present rather than blocking.
- Verify inactive card copy in `api_routes/feed/engagementAndNewbie.js` (~221–304) after rebuild.

Team validate: Draft → Public shows on the feed card on next load; organizer stats modal opens fast; feed card correct with a >500-message thread (seed a test thread); feed latency unchanged after invalidation storm (rapid saves).

---

## Phase 3 — Prize structures + track inheritance

→ User flow F3 (create / edit challenge prizes).

Extend `challenge_config`:

```js
prizes: {
	main: { first, second, third },                      // credits, advertised
	top_submitters: { enabled: true, amounts: [n,n,n] }, // by entry count, revealed at results
	top_voters:     { enabled: true, amounts: [n,n,n] }  // by votes cast, revealed at results
}
```

- Read legacy `reward_first/second/third` as fallback for `prizes.main`; write new block going forward.
- On create (`src/chat/challenges/mountOrganizerSidebar.js`): prefill `prizes` (and `accepted_media`, phase 8) from most recent non-deleted config of same track; fall back to presets in `model/tracks.js`.
- Edit modal (`views/adminView.js`): prizes tab = main amounts + enable/amounts for both participation categories.
- Participant/feed copy advertises main prizes only, plus "participation prizes revealed at results" line when enabled.
- Optional Music remix source (see phase 9 / User flow F9): config field for a Suno URL when the challenge is "remix this track"; leave empty for theme-only Music challenges. Edit modal: optional "Remix source" URL on the suno track (hidden/irrelevant for monthly/weekly).

Done when: new Weekly pre-fills last Weekly's structure; participation prizes configurable but not advertised in detail.

---

## Phase 4 — Canonical results + publish endpoint with payouts

→ User flow F5 (review + confirm winners / payouts) — server half. UI is phase 5.

Stats route already computes rankings: `GET .../challenges/:challengeId/stats` (`api_routes/chat.js` ~2465–2666: topCreations, topSubmitters, topVoters).

- Unify tie-breaks by deleting both implementations and writing ONE: new `src/chat/challenges/model/ranking.js` (canonical order: weighted score desc → vote count desc → earlier created_at → message id; plus top-submitters/top-voters counting). Client `participantSlice.js` (~148–180) and the stats route (~2576) both import it — the server already imports this model (`phases.js`, `challengeAdmin.js`); follow that pattern. Money rides on rankings; two implementations WILL drift (they already did).
- New route: `POST /api/chat/challenges/organize/:threadId/:challengeId/publish-results`, organizer-gated like pins route. Lives in a new `api_routes/challenges.js`, not appended to `chat.js` (3.6k lines). Body: final winner order (message ids), participation lists (defaulted from stats, overridable), final prize amounts.
- Server: validate winners belong to challenge; refuse if `results_published_at` already set (this guard is the payout idempotency); clamp every payout amount to the challenge's configured `prizes` (plus a hard per-payout ceiling) — NEVER trust client amounts, this route mints credits; authorize against that track's organizers + oceanman; record confirming user id in `results`. Then PATCH config with `results_published_at` plus:

```js
results: {
	version: 1,
	winners:        [{ place, message_id, created_image_id, user_id, score }],
	top_submitters: [{ user_id, count, prize }],
	top_voters:     [{ user_id, count, prize }],
	payouts:        [{ user_id, amount, reason, source, paid_at }]
}
```

- Payouts: one executor function taking a source — `{ type: 'system_mint' }` today; sponsor-wallet (`transferCredits`) is a future source, not built now. Mint = copy `grantFounderCredits` pattern (`api/webhooks/stripe.js` ~36–47) over `queries.updateUserCreditsBalance` (`db/supabase.js` ~7321–7349); ensure credits row exists first.
- Payout ordering (no ledger exists — get this exact):
  1. One PATCH publishes results with every payout row `{ user_id, amount, reason, source, paid_at: null }` (pending).
  2. Then execute grants; flip each row's `paid_at` as it succeeds.
  3. A crash mid-loop leaves pending rows visible; results card offers "Retry unpaid" which grants only rows with `paid_at: null`. Never pay before publishing (retry would double-pay); never treat publish guard as payment proof.
- Side effects (winners pin targeting `results_creation_url` else 1st-place creation, winners `challenge_announce` authored by the confirming organizer, snapshot invalidation) run via the lifecycle module (see Extensibility guardrails), not inline in the route.

Done when: one confirmed request publishes results, pays every recipient exactly once (with a visible retry path for partial failure), pins winners, refreshes feed.

---

## Phase 5 — Board lifecycle actions + review-and-confirm modal

→ User flows F4 (announce / close voting) and F5 (review + confirm winners).

Click wiring for `[data-organize-action]` exists (`mountOrganizerSidebar.js` ~1342); handlers ~1695–1803. Render buttons; build one new modal.

- `organizeActionsForPhase` (`views/organizeBoardView.js` ~47–64), per phase:
  - listed pre_submit / live: Announce (existing handler: `challenge_announce` + open pin). "Not announced" nudge chip on live cards until `announced_at` marker set.
  - voting / submit_and_vote: Close voting (existing handler, confirm dialog).
  - finalizing: Review results (replaces raw publish-winners).
- Review modal is a new view module `views/reviewResultsView.js` beside adminView.js; card-action wiring goes in a new `organizeActions.js`, not appended to `mountOrganizerSidebar.js` (already 1.8k lines). Modal behavior: fetch stats on open with a skeleton state; ranked entries with up/down swap for places 1–3; editable top submitters / top voters lists; editable prize amounts from config; total payout; single Confirm → phase 4 route. Disable while in flight; server refusal (already published) → reload prompt.
- Card actions update the local model optimistically and re-render in place — do NOT refetch the whole `#challenges` thread + remount per click (feels like a page reload). The existing soft reconcile catches drift.
- Results cards show paid/pending summary from `results.payouts` + "Retry unpaid" when any pending.

Done when: announce, close voting, and winner publication all happen from Organize cards, no JSON edits.

---

## Phase 6 — Auto open-pins at phase boundaries (lazy)

→ User flow F6 (challenge goes live; feed pin appears without organizer clicks).

Pins are authorless policy rows; announce messages need a human author. That's the auto/manual split.

- In snapshot build (`api_routes/feed/challengeFeedSnapshotShared.js`): listed challenge entered open phase + no `challenge-open-{id}` pin in policy → fire `onChallengeOpened` in the lifecycle module (which upserts the pin; pins-route logic extracted there).
- Idempotency = existence of the pin id in the policy. Do NOT stamp markers onto the config message from the server: server-side config PATCHes change the body fingerprint and trigger phantom save-conflict banners for organizers with the edit modal open.
- Pin upserts run after the feed response (fire-and-forget), inside the phase-2 single-flight lock. The pins policy is one JSON array under one key — unserialized concurrent upserts (feed rebuilds, admin UI) clobber each other.
- Winners pins handled by phase 4. No system bot.

Done when: a scheduled challenge going live gets its feed pin within one snapshot rebuild, zero clicks.

Team validate after phases 3–6 (organizer console): one full staged challenge cycle — create (prizes pre-filled from last same-track) → goes live on schedule → open pin appears with no clicks → Announce from card → Close voting from card → Review results shows computed rankings + swappable winners + participation lists + payout total → Confirm pays everyone once (check balances), pins winners, feed updates → second confirm attempt refused → "Retry unpaid" works after a simulated mid-payout failure.

---

## Phase 7 — Multi-track participant lane + per-challenge voting + results display

→ User flows F7 (browse + vote concurrent tracks), F10 (view past results), feed half of F6.

`mountPane.js` renders multiple active cards (~166–232) but votes/badges track global focus (~330–356).

- Each active card: track pill (Monthly/Weekly/Music) + phase deadline. Pill styles → `public/global.css` (shared with organize).
- Vote CTA + badge sync keyed by the card's `challenge_id`; `challengeVoteModal.js` receives that challenge's rankedSubmissions/phase from `participantSlice.js`, not focus slice.
- While in there: vote modal media uses thumbnail/fit variants, not full-size `url || thumb` (~L499-506); feed-initiated `onAfterVote` syncs badges only like the pane path — kill its full channel refetch (`chatPage.js` ~11683-11689). Participant hero uses fit variant too (`mountPane.js` ~31-37).
- Placement: the vote-sync logic lives in the challenges modules; `chatPage.js` (16k lines) gets thin calls only, no new challenge logic inline.
- Card submit CTA writes `challenge_id` into `public/shared/challengeSubmitContext.js`.
- Next/Previous exclude all active ids (today only `excludeIds[0]`).
- Media weight: with 2–3 active cards, below-fold card heroes/strips use `loading="lazy"` + thumbnail variants (`?variant=thumbnail`). Don't double the lane payload.
- Past/results cards render winners + top submitters + top voters from `config.results`; `results_creation_url` stays as optional link. Replaces hand-built highlights requirement.
- Feed: keep one engagement card; focus = soonest deadline among active; "+N more open" chip when concurrent.

Done when: two open tracks independently viewable/votable/submittable; finished challenges show real winners in-app.

---

## Phase 8 — Submit targeting (never silent)

→ User flow F8 (submit a creation to a named challenge).

- `accepted_media` on config: `['image','video']` monthly/weekly, `['audio']` suno; defaulted by track template, inherited like prizes.
- Server (`api_routes/utils/challengeSubmitShared.js`, eligibility in `create.js` ~609): eligibility returns full accepting list `{ challenge_id, title, track, ends_at }` filtered by creation `meta.media_type` vs `accepted_media`. POST requires explicit `challenge_id` when more than one accepting; delete newest-created fallback (`pickChallengeConfigAcceptingSubmissions` ~458–473) except sole-option shortcut. Validate media eligibility server-side.
- Deploy compat (bundles rebuild externally, not atomically with server): the new strictness only bites when multiple challenges accept at once — which can't occur before the multi-track lane exists. Ship phase 8 client + server together; server rejection message must be human-readable as the fallback for stale clients.
- Client (`public/pages/creation-detail.js` confirm modal): always display target challenge name; radio list in same modal when multiple eligible and no context; context pre-selects. Picker/eligibility rendering goes in a small shared module (beside `public/shared/challengeSubmitContext.js`), not more inline code in creation-detail.js (6.9k lines).
- Stale context: `challengeSubmitContext` lives 48h — a stored `challenge_id` may target a now-closed challenge. On server rejection or missing-from-eligible-list, fall back to the picker with fresh eligibility, never a dead-end error.

Done when: a submission can never land in a challenge the user did not see named on the confirm.

---

## Phase 9 — Music challenge wiring (on top of song creations)

→ User flow F9 (enter a Music challenge with a Suno song). Builds on F1 + F8. Remix source listening is part of F9 when configured.

Depends on phases 1, 3, and 8. Songs already exist from phase 1; this makes them first-class Music challenge entries.

- `accepted_media: ['audio']` on suno track template (and inheritance).
- Optional remix source on config (phase 3 field), e.g.:

```js
remix_source: null | { provider: 'suno', url, song_id, title?, creator? }
```

  Set when the challenge is "remix this track"; omit/null for theme-only Music challenges (same shape as today's image theme challenges — brief + prizes, no listen target).
- Participant Music card: when `remix_source` is set, show a Listen / play control for that source track (click-to-play Suno embed, same rules as song creations — no eager iframe). Theme-only Music cards skip this control.
- Organize edit: paste Suno URL → resolve (reuse `/api/suno/resolve`) → store `remix_source`. Clearable.
- Vote modal `injectVoteMediaFromCreation`: cover + click-to-play embed; at most one iframe mounted at a time, unmount on advance to next entry.
- Entry point: "Import a song" on Music challenge card → paste-link modal → on success, open standard submit confirm with context targeting that challenge.
- Update Music-track how-to copy in `detailsRewardView.js` (says image/video); mention remix source when present vs theme-only.

Done when: paste Suno link → playable creation → submit to Music challenge → votable in modal; remix challenges expose Listen on the source track; theme-only Music challenges work without it.

Team validate after phases 7–9: two concurrent open challenges (one Music); both cards visible with track pills + deadlines; voting on each targets the right challenge; submit from a card targets that challenge by name; submit from creation detail with both open shows the picker; song submits only offered to Music; stale submit context recovers to picker; finished challenge shows winners + top submitters + top voters in-app.

---

## Phase 10 — Cleanup + docs

- Write `_docs/CHALLENGES_data_contract.md` (see Extensibility guardrails) once schemas have settled.
- Delete dead stubs: `setupView.js`, `submitView.js`, `resultsView.js`, `organizeCache.js` shim, `mountChallengesOrganizerSidebar` stub + host in `chat.html`.
- Retire standalone organize: `pages/challenges-organize.html`, `public/pages/challenges-organize-main.js`, `entry/entry-challenges-organize.js`, rollup entry (`src/rollup.config.mjs` ~235–244).
- Remove orphaned `.challenge-pane-setup*` styles from `public/global.css`.

Team validate: /challenges and /challenges/organize regress-free after dead-code removal; data contract matches shipped schemas.

---

## Code placement (modularization that pays rent)

The repo already has the right pattern: `src/chat/challenges/model/` is an isomorphic domain model imported by BOTH client and server (`phases.js`, `participantSlice.js`, `challengeAdmin.js`, `constants.js` are imported by `challengeSubmitShared.js`, `challengeFeedSnapshotShared.js`, `chat.js`). v2 extends this pattern; it does not invent a new one.

Rule: a module earns its existence when v2 gives it a second consumer. Applied:

- `src/chat/challenges/model/ranking.js` — consumers: client lane, stats route, publish validation. (The one existing violation of the pattern — rankings inlined in `chat.js` — is exactly where client/server drift came from.)
- `api_routes/utils/challengeLifecycle.js` — consumers: publish route, snapshot build. Pin upsert helper lives inside it.
- `api_routes/utils/challengePayouts.js` (executor) — consumers: publish route, "Retry unpaid".
- `api_routes/challenges.js` — new challenge routes; existing organize pins + stats routes migrate here when touched.

Do NOT grow the god files: `chatPage.js` (16k), `create.js` (6.2k), `creation-detail.js` (6.9k), `chat.js` (3.6k), `mountOrganizerSidebar.js` (1.8k). New behavior = new module + thin call site.

Explicit non-goals (one consumer, no confirmed second — skip):

- No media renderer registry — three media types is a branch, not a plugin system.
- No event bus / pub-sub — the lifecycle module is three named functions called directly.
- No repository abstraction over chat messages; the existing fetch helpers are the layer.
- No track class hierarchy; the registry object in `model/tracks.js` is enough.
- Views stay template-string functions per existing convention.

## Extensibility guardrails (v2 discipline, not features)

Confirmed direction: sponsored/partner challenges plausible; cross-challenge progression maybe; per-community challenge scopes plausible. Hedges below are structure and contracts only — no speculative features.

- Lifecycle module: one server module (`api_routes/utils/challengeLifecycle.js`) owns `onChallengeOpened`, `onVotingClosed`, `onResultsPublished`. All side effects (pins, announces, invalidation, payouts) route through it. Future notifications/analytics/automations attach here, nowhere else.
- Thread scoping: every new server helper and route takes `threadId` as a parameter; the canonical `#challenges` thread is a default resolved at the edges only. No new code calls `findChallengesChannelThreadId` internally.
- Payout source: the payout executor takes a source arg (`system_mint` today); sponsor-wallet funding slots in later without touching the publish flow. `results.payouts[].source` records it.
- Track discipline: all track behavior reads the registry in `model/tracks.js`; no track-literal branches elsewhere. New tracks stay a one-file change until tracks become data.
- Data contract doc: write `_docs/CHALLENGES_data_contract.md` freezing event kinds and schemas (`challenge_config` fields incl. `prizes`/`accepted_media`/`remix_source`, `challenge_submission`, `challenge_announce`, `results` v1, payout rows). This is the source of truth for any future projection table (leaderboards, seasons, profile wins) — and for the implementer.

## Known non-issues (don't fix ghosts)

- Client-side config merge sees all pages (client paginates until exhausted); the oldest-slice bug is server-only (phase 2).
- `applyChallengeViewerOverlay` is cheap in-memory; the cost was the always-rebuild path (phase 2).
- Feed engagement fetch already defers past first feed paint.
- Participant submission lists are text-only; no image weight there.

## Deferred debt (monitor, not v2)

- Client full-thread fetch on every `/challenges` visit (fat bodies + reactions per message) — degrades linearly with thread growth. Proper fix is a kind-filtered/delta messages API; revisit after v2 or when thread size makes it bite.
- localStorage caches the whole messages array, silently gives up on quota (`challengesChannelCache.js:96-108`); soft refresh re-downloads everything. Same follow-up.

## Cross-cutting traps

- Thread growth: everything scans the `#challenges` thread, which only grows. Phase 2 fixes the correctness cliff (server oldest-500) and the stats scan; the linear-growth bandwidth cost is Deferred debt above.
- Any server-side PATCH to a config message invalidates organizer edit-modal baselines (client conflict fingerprints). Publish-results is acceptable (the actor is the organizer confirming); nothing else should write configs server-side.

## Tests (minimum bar, money paths)

`test/` convention exists (see `challengeResultsHighlights.test.js`). Required:

- `ranking.js`: tie-break order (score → vote count → created_at → message id), top-submitters/top-voters counting, own-entry exclusion.
- Publish-results: idempotency (second call refused), payout clamp vs config, payout ordering (pending → paid, retry pays only unpaid).
- Submit eligibility: media-type filtering, explicit-id requirement when multiple accepting, sole-option shortcut.
- Snapshot invalidation fires on challenge_config writes.

## Rollout & remediation

- Live challenges must survive every phase mid-flight: legacy `reward_*` fallback covers configs; publish-results only touches `finalizing` challenges.
- Payout misfire remediation: `db/maintenance/add_credits.js` with a negative delta (balance clamps at 0). Note it in the results card runbook comment; don't build UI for it.
- Vote integrity (alt accounts) is a known accepted limitation — do not build defenses in v2.
- Mobile: new modals (review, picker, import) and lane pills follow existing 768px patterns; swap controls are buttons (tap-friendly), not drag.

## Success signals (post-ship, derivable from existing data)

- Organizers publish results with zero hand-edited JSON (every results block written by the publish route).
- Submit conversion once picker exists; votes per challenge across concurrent tracks; feed card → /challenges click-through if cheap to observe.
- Song creation publish rate after phase 1 ships.
- No new analytics infrastructure for v2.

## User flows

High points only. Phases implement these; team validation walks them. `→ User flow Fn` in each phase points here.

F1 — Post a Suno song as a creation (phase 1)

1. User opens Create (`/create`).
2. Chooses Import a song (alongside generate).
3. Paste-link modal: pastes a suno.com song URL, confirms.
4. Importing state while server resolves song, stores cover, creates completed audio creation (a few seconds). Bad/non-Suno URL fails cleanly.
5. Lands on creation detail: cover + click-to-play Suno embed. Image-only actions hidden.
6. Edits title/description if wanted, then Publish (same as other creations).
7. Song appears in feed as cover + music badge — no iframe in feed.

F2 — Draft → Public shows on feed promptly (phase 2)

1. Organizer opens Organize, edits a challenge, switches Draft → Public (or changes schedule), saves.
2. Reloads feed (or next feed load): engagement card / Next teaser reflects the change without waiting out a long TTL.
3. Opening Organize stats stays snappy even on a large thread.

F3 — Create / edit challenge with prizes (phase 3)

1. Organizer creates a challenge of a track (e.g. Weekly).
2. Prizes tab is pre-filled from the most recent same-track challenge (or track presets if first).
3. Adjusts main 1st/2nd/3rd and optionally enables top-submitter / top-voter participation amounts.
4. If Music track: optionally pastes a Suno URL as remix source (resolve → stored). Leaves empty for theme-only Music challenges.
5. Saves. Participants later see main prizes advertised; participation prizes only noted as "revealed at results."

F4 — Announce and close voting from the board (phase 5)

1. Challenge is listed / live. Organize card shows Announce (and a "Not announced" nudge until done).
2. Organizer clicks Announce → announce message + open pin; board updates without a full page remount.
3. While voting is open, organizer can Close voting (confirm) → phase moves to finalizing without hand-editing dates.

F5 — Review and confirm winners + payouts (phases 4–5)

1. Challenge is finalizing. Organizer clicks Review results on the card.
2. Modal loads rankings (skeleton first): places 1–3 from votes, top submitters, top voters, prize amounts, total credits.
3. Organizer swaps places / edits lists / amounts as needed, then Confirm.
4. Server publishes results, pays each recipient (pending → paid), pins winners, refreshes feed. Second confirm refused.
5. If a payout failed mid-run, results card shows unpaid rows and Retry unpaid pays only those.

F6 — Challenge goes live; pin appears without clicks (phase 6 + feed)

1. Scheduled listed challenge crosses into an open phase on the clock.
2. Next snapshot rebuild upserts the open pin. No organizer action.
3. Feed shows the engagement card for the soonest-deadline challenge; if more than one is open, a "+N more open" chip links to `/challenges`.

F7 — Browse and vote on concurrent tracks (phase 7)

1. User opens `/challenges`. Sees one card per open challenge (track pill + deadline). Music cards with a remix source also offer Listen on that source track.
2. Opens Vote on challenge A → modal is for A's entries only; scores apply to A.
3. Opens Vote on challenge B → same, keyed to B. No silent cross-wiring.
4. From the feed engagement card, Vote still works and does not re-download the whole channel after each score.

F8 — Submit a creation to a named challenge (phase 8)

1. User has a completed unpublished creation eligible for at least one open challenge.
2. From a challenge card: Submit carries that challenge_id; confirm modal names that challenge.
3. From creation detail with no context: if one eligible challenge, confirm names it; if several, radio picker in the same confirm; if none, no submit.
4. Confirm always shows the target name before POST. Server rejects ambiguous/missing id when multiple are open.
5. Stale context (closed challenge): confirm falls back to fresh eligibility / picker — never a dead-end error.

F9 — Enter a Music challenge with a Suno song (phase 9; uses F1 + F8)

1. Music challenge is open. User on that card sees brief + prizes.
2. If remix source is set: Listen / play on the source Suno track (click-to-play embed) before or while deciding to enter. If theme-only: no Listen control — same as an image theme challenge.
3. Chooses Import a song on the card (or imports via Create first — F1).
4. Paste Suno URL → song creation created (F1 steps 3–5).
5. Submit confirm opens with Music challenge already targeted (F8).
6. Entry appears in that challenge; voters play entries click-to-play in the vote modal (one iframe at a time).

F10 — View past results in-app (phase 7)

1. User opens `/challenges` (or past section). Finished challenge shows winners + top submitters + top voters from published results.
2. Optional link to highlights creation if `results_creation_url` was set. No hand-built highlights required for results to exist.

## Out of scope

- Notifications (challenge opened / you won).
- Native audio hosting/upload (Suno embed only).
- Auto-publishing results without human confirm.
- Server If-Match on config messages; field-level merge.
- Credit ledger (payout audit lives in `results.payouts`; ledger is the follow-up if payouts grow).
