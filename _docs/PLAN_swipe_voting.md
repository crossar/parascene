# Plan: Swipe Voting for Challenges

## Goal

Add a per-challenge voting mode where participants vote by swiping left or right, similar to Tinder.

- Right swipe: like
- Left swipe: skip
- Each decision is final for that voter and submission
- Challenge admins choose the mode before the first vote is registered
- Existing challenges continue using the current 1-10 score voting mode

## Configuration

Add a voting mode field to `challenge_config`:

- Legacy or missing value: existing scored voting
- New value: `swipe`

Expose the setting in the challenge admin create/edit form. The setting should be editable until any vote exists for the challenge, then become locked.

The lock must be enforced server-side so stale forms or direct API requests cannot change the mode after voting begins.

## Backend

Update the challenge configuration validation in `api_routes/chat.js` to:

1. Normalize the requested voting mode.
2. Compare it with the previous mode.
3. Detect existing votes across submissions belonging to the challenge.
4. Reject mode changes after the first stored vote.

Update the reactions endpoint so swipe-mode challenges:

- Accept only the two binary outcomes.
- Keep the outcomes mutually exclusive.
- Treat repeated submissions of the same decision as idempotent.
- Reject removing or changing an existing decision.
- Leave the existing scored-voting behavior unchanged.

Use the existing challenge reaction storage unless a separate representation is required by the implementation.

## Frontend

Pass the challenge voting mode through the participant model into the vote modal.

For scored voting, preserve the current 1-10 heat slider.

For swipe voting, add:

- Horizontal left/right swipe gestures on the submission media.
- Clear left and right controls for mouse and keyboard users.
- Focus-visible and accessible labels.
- Busy and error states while saving a decision.
- Automatic advance to the next unvoted submission after a successful decision.
- An explicit navigation path that remains usable when horizontal gestures conflict with media playback.

Update vote badges and completion state so either binary decision counts as voted.

## Ranking and Statistics

Make challenge ranking and statistics mode-aware.

For swipe voting, rank submissions by positive/like decisions with deterministic tie-breaking and keep vote counts and voter totals consistent. Do not reinterpret existing scored-voting results.

Review feed snapshot and participant code that currently assumes numeric score reactions.

## Admin UI

Add the mode selector to the challenge organizer forms in:

- `src/chat/challenges/views/adminView.js`
- `src/chat/challenges/mountOrganizerSidebar.js`

Section-specific saves must preserve the mode when the mode control is not present. When a stale save attempts to change a locked mode, show the server error and refresh the organizer data.

## Styling

Update the challenge modal styles in `public/global.css` for:

- Swipe controls
- Drag feedback
- Disabled and final states
- Responsive layout
- Keyboard focus states

Keep duplicated modal rules in `public/pages/chat-hotfix.css` aligned where necessary.

## Tests

Add focused tests for:

- Legacy mode defaults
- Mode normalization
- Mode locking after the first vote
- Binary vote mapping and final decisions
- Swipe ranking and tie-breaking
- Admin form rendering and mode propagation
- Vote badges and completion state
- Existing scored voting behavior remaining unchanged

## Verification

Run:

```sh
npm test
npm run build
```

Also verify manually that:

- Existing challenges still show the score slider.
- Swipe challenges show left/right controls and respond to horizontal gestures.
- Decisions persist and cannot be changed.
- Admins can change the mode before the first vote.
- Mode changes are rejected after a vote.
- Desktop, mobile, and keyboard interactions remain usable.
