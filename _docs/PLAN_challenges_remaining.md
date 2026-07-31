# Plan: Challenges — what is left

Scope: leftover work after Organize SPA fold-in, shared channel cache, Draft/Public listing, board/card polish, and feed draft filtering.

Already shipped (do not re-do): SPA `/challenges/organize`, board CRUD + calendar + soft-delete, Draft vs Public in the edit modal, public Next / feed focus ignore unlisted drafts, shared challenges cache + soft live reconcile + save conflict, card chrome polish (pills, track meta, neutral cards).

## Still to build

### 1. Lifecycle actions on the board (phase 3 UI)

Handlers for announce / close-voting / publish-winners already live in `mountOrganizerSidebar.js` but are not exposed on cards.

- Surface phase-appropriate card actions again (or equivalent modal controls).
- Keep clock-driven phases; these are human overrides / announcements only.
- Optional: simple payout checklist on pending/results cards (no auto credit transfer).

Done when: organizers can close voting, announce, and publish winners from Organize without hand-editing JSON.

### 2. Editorial pins from Organize

Wire lifecycle to existing feed editorial pins (`editorialPinPolicy` / `editorialPin`) — do not invent a second promo system.

- Announce / new-challenge teaser → timed pin to a creation.
- Publish winners → timed pin to highlights creation.
- Use `starts_at` / `until` / `respect_challenge` so pins sit correctly next to the live challenge engagement card.

Done when: Organize actions write the same pin rows admin already manages.

### 3. Multi-track participant lane

Monthly + Weekly + Music can run concurrent; lane/feed still behave mostly single-focus.

- Participant `/challenges` shows concurrent open tracks clearly.
- When multiple challenges accept submissions, submit targets the chosen challenge (not a silent default).
- Feed engagement remains one primary card; pins cover promo/winners windows.

Done when: two open tracks are both usable for submit/vote without colliding.

### 4. Feed snapshot freshness

Feed challenge card reads a cached snapshot (~20 min TTL). Listing or schedule changes can lag.

- Invalidate / rebuild challenge feed snapshot when organize saves configs that affect focus, listing, or phase windows.
- Confirm inactive card copy (active + finalizing) stays correct after rebuild.

Done when: Draft → Public or schedule edits show on the feed card without waiting out TTL.

### 5. Cleanup / thin leftovers

- Retire or permanently redirect standalone `pages/challenges-organize.html` if anything still serves it.
- Participant setup-timeline strip: revive only if product still wants it; otherwise leave dead.
- Optional later (explicitly not required now): auto-list N days before start; server If-Match on config messages.

## Suggested order

1. Board lifecycle actions (unblocks organizers day-to-day).
2. Feed snapshot invalidate on save (stops draft/listing lag).
3. Editorial pins from those actions.
4. Multi-track lane + submit targeting.
5. Cleanup.

## Out of scope

- Auto credit payouts.
- Rebuilding a right-rail organizer panel.
- Field-level merge of concurrent form edits.
- Redesigning the live challenge engagement card as a multi-challenge dashboard.
