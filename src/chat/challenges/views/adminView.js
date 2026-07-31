import { esc } from '../constants.js';
import { MODAL_DISMISS_ICON_SVG } from '../../../shared/modalDismiss.js';
import {
	challengeRewardPrefillsForOrganizerForm,
	pickChallengeConfigTimestamp,
	pickChallengeHeroImageUrl,
	pickChallengeResultsCreationUrl,
	pickChallengeTopicVoteCreationUrl,
	isChallengeListedForUpcoming
} from '../challengeAdmin.js';
import { deriveChallengePhase } from '../model/phases.js';
import { isoToLocalYmd } from '../model/dayBounds.js';
import { pickChallengeTrack, CHALLENGE_TRACK_LABELS, normalizeChallengeTrack } from '../model/tracks.js';
import { renderOrganizeTemplatePickerHtml, renderOrganizeBoardHtml } from './organizeBoardView.js';
import { clock3Icon, pencilIcon, trophyIcon } from '/icons/svg-strings.js';

/** @param {object} latest @param {number} [nowMs] */
function isChallengeReadyForResultsConfig(latest, nowMs = Date.now()) {
	const phase = deriveChallengePhase(latest, nowMs);
	return phase === 'finalizing' || phase === 'results';
}

/**
 * Draft vs Public segmented toggle (create + edit while pre_submit).
 * @param {object} [cfg]
 * @param {{ defaultListed?: boolean }} [opts]
 */
function renderChallengeListingToggleHtml(cfg = {}, opts = {}) {
	const listed =
		opts.defaultListed === true
			? true
			: opts.defaultListed === false
				? false
				: isChallengeListedForUpcoming(cfg);
	return `<div class="challenges-organize-visibility" role="radiogroup" aria-label="Visibility" data-challenge-listing-row>
			<label class="challenges-organize-visibility-option${!listed ? ' is-active' : ''}">
				<input type="radio" name="challenge_list_as_upcoming" value="0" data-challenge-listing-toggle${!listed ? ' checked' : ''} />
				<span>Draft</span>
			</label>
			<label class="challenges-organize-visibility-option${listed ? ' is-active' : ''}">
				<input type="radio" name="challenge_list_as_upcoming" value="1" data-challenge-listing-toggle${listed ? ' checked' : ''} />
				<span>Public</span>
			</label>
		</div>`;
}

/**
 * Challenge type chips + optional Draft/Public toggle on one row.
 * @param {string} templatesHtml
 * @param {string} [listingHtml]
 */
function renderOrganizeModalToolbarHtml(templatesHtml, listingHtml = '') {
	return `<div class="challenges-organize-modal-toolbar">
		${templatesHtml}
		${listingHtml || ''}
	</div>`;
}

/**
 * Minimal publish toggle + conditional highlights field (edit only, after voting closes).
 * @param {object} latest
 * @param {number} [nowMs]
 */
function renderChallengeResultsSectionHtml(latest, nowMs = Date.now()) {
	if (!isChallengeReadyForResultsConfig(latest, nowMs)) {
		return '';
	}

	const resultsUrl = pickChallengeResultsCreationUrl(latest);
	const resultsPublishedAtRaw = pickChallengeResultsPublishedAtFromCfg(latest);
	const resultsPublishedAlready = Boolean(resultsPublishedAtRaw);
	const publishChecked = resultsPublishedAlready || Boolean(resultsUrl);

	return `<div class="challenge-pane-admin-results-row">
			<label class="challenge-pane-admin-checkbox-inline">
				<input type="checkbox" name="results_publish_now" value="1" data-challenge-results-toggle${publishChecked ? ' checked' : ''} />
				Publish results
			</label>
			<input type="hidden" name="results_published_at_existing" value="${esc(resultsPublishedAtRaw)}" />
			<div class="challenge-pane-admin-results-highlights" data-challenge-results-highlights${publishChecked ? '' : ' hidden'}>
				<label class="challenge-pane-label">Highlights creation
					<input type="text" name="results_creation_url" class="challenge-pane-input challenge-pane-organizer-results-url-input" maxlength="2000"
						placeholder="/creations/12787" autocomplete="off" value="${esc(resultsUrl)}" />
				</label>
			</div>
		</div>`;
}

/**
 * Show/hide highlights field when publish checkbox toggles.
 * @param {ParentNode} root
 */
export function bindChallengeResultsToggle(root) {
	const checkbox = root.querySelector('[data-challenge-results-toggle]');
	const highlights = root.querySelector('[data-challenge-results-highlights]');
	if (!(checkbox instanceof HTMLInputElement) || !(highlights instanceof HTMLElement)) {
		return;
	}
	const sync = () => {
		highlights.hidden = !checkbox.checked;
	};
	checkbox.addEventListener('change', sync);
	sync();
}

/**
 * Keep Draft/Public segment labels in sync with radio state.
 * @param {ParentNode} root
 */
export function bindChallengeListingToggle(root) {
	const group = root.querySelector('[data-challenge-listing-row]');
	if (!(group instanceof HTMLElement)) return;
	const options = [...group.querySelectorAll('.challenges-organize-visibility-option')];
	if (!options.length) return;
	const sync = () => {
		for (const opt of options) {
			const input = opt.querySelector('input[type="radio"]');
			opt.classList.toggle(
				'is-active',
				input instanceof HTMLInputElement && input.checked
			);
		}
	};
	group.addEventListener('change', sync);
	sync();
}

/** @param {object} latest */
function pickChallengeResultsPublishedAtFromCfg(latest) {
	if (latest.results_published_at != null) return String(latest.results_published_at).trim();
	if (latest.resultsPublishedAt != null) return String(latest.resultsPublishedAt).trim();
	return '';
}

function renderDatetimeFieldsHtml(values) {
	const v = values || {};
	const start = String(v.submission_start_ymd || v.submission_start_at || '').slice(0, 10);
	const end = String(v.submission_end_ymd || v.submission_end_at || '').slice(0, 10);
	return `<div class="challenge-pane-admin-datetimes challenges-organize-day-fields">
				<p class="challenge-pane-muted challenge-pane-admin-datetimes-label">Schedule (days only — local time)</p>
				<div class="challenges-organize-day-fields-row">
					<label class="challenge-pane-label">Starts
						<input type="date" name="schedule_start_ymd" class="challenge-pane-input" data-organize-start-ymd value="${esc(start)}" />
					</label>
					<label class="challenge-pane-label">Ends
						<input type="date" name="schedule_end_ymd" class="challenge-pane-input" data-organize-end-ymd value="${esc(end)}" />
					</label>
				</div>
				<input type="hidden" name="track" value="${esc(String(v.track || 'monthly'))}" data-organize-track-field />
				<div data-organize-calendar-mount></div>
			</div>`;
}

/**
 * Pre-fill map for day inputs from stored challenge_config.
 * @param {object} cfg
 */
export function challengeConfigDatetimeLocals(cfg) {
	const startIso = pickChallengeConfigTimestamp(cfg, 'submission_start_at');
	const endIso =
		pickChallengeConfigTimestamp(cfg, 'voting_end_at') ||
		pickChallengeConfigTimestamp(cfg, 'submission_end_at');
	const startYmd = isoToLocalYmd(startIso);
	const endYmd = isoToLocalYmd(endIso);
	return {
		submission_start_ymd: startYmd,
		submission_end_ymd: endYmd,
		submission_start_at: startYmd,
		submission_end_at: endYmd,
		track: pickChallengeTrack(cfg)
	};
}

const MODAL_FORM_LEAD = `<p class="challenge-pane-muted challenge-pane-admin-lead challenge-pane-organizer-modal-lead">Uses JSON configs in-thread. <strong>New challenge</strong> posts <code>challenge_config</code>; <strong>save changes</strong> updates the existing config message. <strong>Global settings</strong> manages <code>challenges_global_config</code>.</p>`;

/**
 * @param {{ monthly?: string[], weekly?: string[], suno?: string[] } | null | undefined} organizersByTrack
 * @param {number | null | undefined} configMessageId
 */
export function renderChallengeOrganizerGlobalConfigFormHtml(organizersByTrack, configMessageId) {
	const byTrack =
		organizersByTrack && typeof organizersByTrack === 'object' ? organizersByTrack : {};
	/** @param {unknown} list */
	const csv = (list) =>
		(Array.isArray(list) ? list : [])
			.map((u) => String(u || '').trim())
			.filter(Boolean)
			.join(', ');
	const mid =
		typeof configMessageId === 'number' &&
		Number.isFinite(configMessageId) &&
		configMessageId > 0
			? configMessageId
			: null;
	const hiddenMsg =
		mid != null
			? `<input type="hidden" name="global_config_message_id" value="${esc(String(mid))}" />`
			: '';
	const fields = [
		{ key: 'monthly', label: 'Monthly', name: 'organizers_monthly_csv', value: csv(byTrack.monthly) },
		{ key: 'weekly', label: 'Weekly', name: 'organizers_weekly_csv', value: csv(byTrack.weekly) },
		{ key: 'suno', label: 'Music', name: 'organizers_suno_csv', value: csv(byTrack.suno) }
	];
	const fieldRows = fields
		.map(
			(f) => `<label class="challenge-pane-label challenge-pane-organizer-global-track-label">${esc(f.label)}
				<input type="text" name="${esc(f.name)}" class="challenge-pane-input challenge-pane-organizer-global-config-input" maxlength="2000"
					placeholder="username1, username2" autocomplete="off" value="${esc(f.value)}" />
			</label>`
		)
		.join('');
	return `<form class="challenge-pane-admin-config-form challenge-pane-organizer-global-config-form" data-challenge-admin-config-form data-challenge-admin-form="global">
			${hiddenMsg}
			<p class="challenge-pane-muted challenge-pane-organizer-global-hint">Who can organize each challenge type. <strong>@oceanman</strong> is always included.</p>
			<div class="challenge-pane-organizer-global-tracks">${fieldRows}</div>
			<div class="challenge-pane-organizer-global-config-actions">
				<button type="submit" class="btn-primary challenge-pane-admin-submit challenge-pane-organizer-global-config-save">Save</button>
			</div>
			<div class="challenge-pane-form-error challenge-pane-admin-error" data-challenge-admin-error hidden role="alert"></div>
			<div class="challenge-pane-admin-success" data-challenge-admin-success hidden role="status" aria-live="polite"></div>
		</form>`;
}

/**
 * @param {object} prefills — reward_* strings from {@link challengeRewardPrefillsForOrganizerForm}
 * @param {{ variant?: 'full' | 'credits' }} [opts]
 */
function renderOrganizerRewardsSection(prefills, opts = {}) {
	const p = prefills || {};
	const variant = opts.variant === 'credits' ? 'credits' : 'full';
	const creditNum = (raw) => {
		const s = String(raw ?? '').trim();
		const m = s.match(/(\d+)/);
		return m ? m[1] : s;
	};
	if (variant === 'credits') {
		const rf = esc(creditNum(p.reward_first));
		const rs = esc(creditNum(p.reward_second));
		const rt = esc(creditNum(p.reward_third));
		return `<div class="challenge-pane-admin-rewards-group" role="group" aria-label="Rewards">
			<p class="challenge-pane-admin-rewards-legend">Prizes (credits)</p>
			<label class="challenge-pane-label">1st place
				<input type="number" name="reward_first" class="challenge-pane-input" min="0" step="1" inputmode="numeric"
					placeholder="1200" value="${rf}" autocomplete="off" />
			</label>
			<label class="challenge-pane-label">2nd place
				<input type="number" name="reward_second" class="challenge-pane-input" min="0" step="1" inputmode="numeric"
					placeholder="700" value="${rs}" autocomplete="off" />
			</label>
			<label class="challenge-pane-label">3rd place
				<input type="number" name="reward_third" class="challenge-pane-input" min="0" step="1" inputmode="numeric"
					placeholder="500" value="${rt}" autocomplete="off" />
			</label>
		</div>`;
	}

	const rf = esc(String(p.reward_first ?? ''));
	const rs = esc(String(p.reward_second ?? ''));
	const rt = esc(String(p.reward_third ?? ''));
	const rp = esc(String(p.reward_participation ?? ''));
	const rc = esc(String(p.reward_custom ?? ''));
	return `<div class="challenge-pane-admin-rewards-group" role="group" aria-label="Rewards">
			<p class="challenge-pane-admin-rewards-legend">Rewards</p>
			<p class="challenge-pane-muted challenge-pane-admin-rewards-lead">Optional placement prizes. Each filled row appears on the challenge card with a medal-style graphic. Leave blank to hide.</p>
			<label class="challenge-pane-label">1st place
				<input type="text" name="reward_first" class="challenge-pane-input" maxlength="400"
					placeholder="2000 credits" value="${rf}" autocomplete="off" />
			</label>
			<label class="challenge-pane-label">2nd place
				<input type="text" name="reward_second" class="challenge-pane-input" maxlength="400"
					placeholder="1250 credits" value="${rs}" autocomplete="off" />
			</label>
			<label class="challenge-pane-label">3rd place
				<input type="text" name="reward_third" class="challenge-pane-input" maxlength="400"
					placeholder="750 credits" value="${rt}" autocomplete="off" />
			</label>
			<label class="challenge-pane-label">Participation
				<input type="text" name="reward_participation" class="challenge-pane-input" maxlength="400"
					placeholder="Prizes for voting and submitting" value="${rp}" autocomplete="off" />
			</label>
			<label class="challenge-pane-label">Custom
				<input type="text" name="reward_custom" class="challenge-pane-input" maxlength="400"
					placeholder="Anything else — sponsor perk, raffle, honorable mention..." value="${rc}" autocomplete="off" />
			</label>
		</div>`;
}

/**
 * @param {object} latest
 * @param {number | null | undefined} configMessageId
 */
function editFormHiddenIds(latest, configMessageId) {
	const cid =
		latest?.challenge_id != null ? String(latest.challenge_id).trim() : '';
	const mid =
		typeof configMessageId === 'number' &&
		Number.isFinite(configMessageId) &&
		configMessageId > 0
			? configMessageId
			: null;
	const hiddenMsg =
		mid != null
			? `<input type="hidden" name="config_message_id" value="${esc(String(mid))}" />`
			: '';
	return `${hiddenMsg}
		<input type="hidden" name="challenge_id" value="${esc(cid)}" />`;
}

function editFormFooter(submitLabel = 'Save', opts = {}) {
	const showSoftDelete = Boolean(opts.showSoftDelete);
	const deleteBtn = showSoftDelete
		? `<button type="button" class="challenges-organize-soft-delete-btn" data-organize-soft-delete>Delete</button>`
		: '';
	const actionsRow = showSoftDelete
		? `<div class="challenge-pane-admin-form-footer-actions">
				${deleteBtn}
				<button type="submit" class="btn-primary challenge-pane-admin-submit">${esc(submitLabel)}</button>
			</div>`
		: `<button type="submit" class="btn-primary challenge-pane-admin-submit">${esc(submitLabel)}</button>`;
	return `<div class="challenge-pane-admin-form-footer${showSoftDelete ? ' has-soft-delete' : ''}">
			<div class="challenge-pane-form-error challenge-pane-admin-error" data-challenge-admin-error hidden role="alert"></div>
			<div class="challenge-pane-admin-success" data-challenge-admin-success hidden role="status" aria-live="polite"></div>
			${actionsRow}
		</div>`;
}

/**
 * Soft-delete confirm step (edit modal).
 * @param {{ title?: string }} [opts]
 */
export function renderOrganizeSoftDeleteConfirmHtml(opts = {}) {
	const title =
		typeof opts.title === 'string' && opts.title.trim() ? opts.title.trim() : 'this challenge';
	return `<div class="challenges-organize-soft-delete-confirm" data-organize-soft-delete-confirm>
		<h4 class="challenges-organize-soft-delete-confirm-title">Move to Deleted?</h4>
		<p class="challenges-organize-soft-delete-confirm-lead">“${esc(title)}” will leave Upcoming and free its schedule dates on this track.</p>
		<ul class="challenges-organize-soft-delete-confirm-list">
			<li>Participants will no longer see it.</li>
			<li>Title, description, prizes, and media links are kept.</li>
			<li>It can be restored later from the Deleted list.</li>
		</ul>
		<div class="challenges-organize-soft-delete-confirm-actions">
			<button type="button" class="btn-outlined" data-organize-soft-delete-cancel>Cancel</button>
			<button type="button" class="btn-danger" data-organize-soft-delete-confirm-yes>Move to Deleted</button>
		</div>
	</div>`;
}

/**
 * Media modal: theme vote + hero + results creations.
 * @param {object} latest
 */
function renderOrganizerMediaSectionHtml(latest) {
	const topicVote = pickChallengeTopicVoteCreationUrl(latest);
	const heroUrl = pickChallengeHeroImageUrl(latest);
	const resultsUrl = pickChallengeResultsCreationUrl(latest);
	return `<div class="challenges-organize-media-fields" role="group" aria-label="Challenge creations">
			<div class="challenges-organize-media-slot">
				<label class="challenge-pane-label">Announce / hero
					<input type="text" name="hero_image_url" class="challenge-pane-input" maxlength="2000"
						placeholder="/creations/123, share link, or image URL" autocomplete="off" value="${esc(heroUrl)}" />
				</label>
				<p class="challenge-pane-muted challenge-pane-organizer-image-hint">Promo image while the challenge is live.</p>
			</div>
			<div class="challenges-organize-media-slot">
				<label class="challenge-pane-label">Results / highlights
					<input type="text" name="results_creation_url" class="challenge-pane-input" maxlength="2000"
						placeholder="/creations/123" autocomplete="off" value="${esc(resultsUrl)}" />
				</label>
				<p class="challenge-pane-muted challenge-pane-organizer-image-hint">Winners showcase after voting closes. Use Publish winners on the card when ready.</p>
			</div>
			<div class="challenges-organize-media-slot">
				<label class="challenge-pane-label">Next challenge — theme vote
					<input type="text" name="topic_vote_creation_url" class="challenge-pane-input" maxlength="2000"
						placeholder="/creations/123, share link, or image URL" autocomplete="off" value="${esc(topicVote)}" />
				</label>
				<p class="challenge-pane-muted challenge-pane-organizer-image-hint">Creation used to collect votes on what the <strong>next</strong> challenge should be about — not this one.</p>
			</div>
		</div>`;
}

/**
 * Read-only field row for completed challenge view modal.
 * @param {string} label
 * @param {unknown} value
 * @param {{ href?: boolean }} [opts]
 */
function renderOrganizeViewField(label, value, opts = {}) {
	const raw = value == null ? '' : String(value).trim();
	let body;
	if (!raw) {
		body = `<span class="challenge-pane-muted">—</span>`;
	} else if (opts.href) {
		const safeHref = esc(raw);
		body = `<a class="challenges-organize-view-link" href="${safeHref}">${esc(raw)}</a>`;
	} else {
		body = esc(raw);
	}
	return `<div class="challenges-organize-view-field">
		<div class="challenges-organize-view-label">${esc(label)}</div>
		<div class="challenges-organize-view-value user-text">${body}</div>
	</div>`;
}

/**
 * Completed challenge: same tabs as edit, values only (no inputs).
 * @param {object} latest
 * @param {{ activeTab?: string }} [opts]
 */
export function renderChallengeOrganizerViewHtml(latest, opts = {}) {
	const cfg = latest && typeof latest === 'object' ? latest : {};
	const activeTabRaw = String(opts.activeTab || 'details').trim().toLowerCase();
	const activeTab =
		activeTabRaw === 'schedule' || activeTabRaw === 'prizes' ? activeTabRaw : 'details';
	const title = typeof cfg.title === 'string' ? cfg.title.trim() : '';
	const details =
		cfg.details == null
			? ''
			: typeof cfg.details === 'string'
				? cfg.details.trim()
				: String(cfg.details).trim();
	const rewardPrefills = challengeRewardPrefillsForOrganizerForm(cfg);
	const dt = challengeConfigDatetimeLocals(cfg);
	const track = normalizeChallengeTrack(dt.track || cfg.track);
	const trackLabel = CHALLENGE_TRACK_LABELS[track] || track;
	const startYmd = dt.submission_start_ymd || '';
	const endYmd = dt.submission_end_ymd || startYmd;
	const topicVote = pickChallengeTopicVoteCreationUrl(cfg);
	const heroUrl = pickChallengeHeroImageUrl(cfg);
	const resultsUrl = pickChallengeResultsCreationUrl(cfg);

	const tabBtn = (id, label, iconSvg) => {
		const on = id === activeTab;
		return `<button type="button" class="challenges-organize-edit-tab${on ? ' is-active' : ''}" role="tab" data-organize-edit-tab="${esc(id)}" aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}">
			${iconSvg || ''}
			<span>${esc(label)}</span>
		</button>`;
	};
	const panel = (id, inner) => {
		const on = id === activeTab;
		return `<div class="challenges-organize-edit-panel" role="tabpanel" data-organize-edit-panel="${esc(id)}"${on ? '' : ' hidden'}>${inner}</div>`;
	};

	const prizeRows = [
		['1st place', rewardPrefills.reward_first],
		['2nd place', rewardPrefills.reward_second],
		['3rd place', rewardPrefills.reward_third],
		['Participation', rewardPrefills.reward_participation],
		['Custom', rewardPrefills.reward_custom]
	]
		.map(([label, val]) => renderOrganizeViewField(label, val))
		.join('');

	return `<div class="challenges-organize-view" data-challenges-organize-view>
		<div class="challenges-organize-edit-tabs" role="tablist" aria-label="View challenge">
			${tabBtn('details', 'Details', pencilIcon('challenges-organize-edit-tab-svg'))}
			${tabBtn('schedule', 'Schedule', clock3Icon('challenges-organize-edit-tab-svg'))}
			${tabBtn('prizes', 'Prizes', trophyIcon('challenges-organize-edit-tab-svg'))}
		</div>
		${panel(
			'details',
			`${renderOrganizeViewField('Title', title)}
			${renderOrganizeViewField('Description', details)}
			${renderOrganizeViewField('Announce / hero', heroUrl, { href: Boolean(heroUrl) })}
			${renderOrganizeViewField('Results / highlights', resultsUrl, { href: Boolean(resultsUrl) })}
			${renderOrganizeViewField('Next challenge — theme vote', topicVote, { href: Boolean(topicVote) })}`
		)}
		${panel(
			'schedule',
			`${renderOrganizeViewField('Track', trackLabel)}
			${renderOrganizeViewField('Starts', startYmd)}
			${renderOrganizeViewField('Ends', endYmd)}
			<input type="hidden" data-organize-start-ymd value="${esc(startYmd)}" />
			<input type="hidden" data-organize-end-ymd value="${esc(endYmd)}" />
			<input type="hidden" data-organize-track-field value="${esc(track)}" />
			<input type="hidden" data-organize-view-challenge-id value="${esc(typeof cfg.challenge_id === 'string' || typeof cfg.challenge_id === 'number' ? String(cfg.challenge_id).trim() : '')}" />
			<div data-organize-calendar-mount></div>`
		)}
		${panel(
			'prizes',
			`<div class="challenge-pane-admin-rewards-group" role="group" aria-label="Rewards">
				<p class="challenge-pane-admin-rewards-legend">Rewards</p>
				${prizeRows}
			</div>`
		)}
	</div>`;
}

/**
 * Shared Details / Schedule / Prizes tabbed form (create + edit).
 * @param {{
 *   formRole?: 'create' | 'edit',
 *   cfg?: object,
 *   configMessageId?: number | null,
 *   activeTab?: string,
 *   submitLabel?: string,
 *   showSoftDelete?: boolean,
 *   showListingToggle?: boolean,
 *   defaultListed?: boolean,
 *   templatePickerHtml?: string
 * }} opts
 */
function renderChallengeOrganizerTabbedFormHtml(opts = {}) {
	const formRole = opts.formRole === 'create' ? 'create' : 'edit';
	const cfg = opts.cfg && typeof opts.cfg === 'object' ? opts.cfg : {};
	const activeTabRaw = String(opts.activeTab || 'details').trim().toLowerCase();
	const activeTab =
		activeTabRaw === 'schedule' || activeTabRaw === 'prizes' ? activeTabRaw : 'details';
	const submitLabel =
		typeof opts.submitLabel === 'string' && opts.submitLabel.trim()
			? opts.submitLabel.trim()
			: formRole === 'create'
				? 'Save challenge'
				: 'Save';
	const showSoftDelete = Boolean(opts.showSoftDelete);
	const showListingToggle =
		opts.showListingToggle === true ||
		(opts.showListingToggle !== false && formRole === 'create');
	const templatePickerHtml =
		typeof opts.templatePickerHtml === 'string' ? opts.templatePickerHtml : '';

	const title = typeof cfg.title === 'string' ? cfg.title : '';
	const details =
		cfg.details == null
			? ''
			: typeof cfg.details === 'string'
				? cfg.details
				: String(cfg.details);
	const rewardPrefills = challengeRewardPrefillsForOrganizerForm(cfg);
	const dtFromCfg = challengeConfigDatetimeLocals(cfg);
	const dt = {
		...dtFromCfg,
		submission_start_ymd:
			(typeof cfg.submission_start_ymd === 'string' && cfg.submission_start_ymd.trim()) ||
			dtFromCfg.submission_start_ymd ||
			'',
		submission_end_ymd:
			(typeof cfg.submission_end_ymd === 'string' && cfg.submission_end_ymd.trim()) ||
			dtFromCfg.submission_end_ymd ||
			'',
		track: String(cfg.track || dtFromCfg.track || 'monthly')
	};
	const cid =
		cfg.challenge_id != null ? String(cfg.challenge_id).trim() : '';

	const tabBtn = (id, label, iconSvg) => {
		const on = id === activeTab;
		return `<button type="button" class="challenges-organize-edit-tab${on ? ' is-active' : ''}" role="tab" data-organize-edit-tab="${esc(id)}" aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}">
			${iconSvg || ''}
			<span>${esc(label)}</span>
		</button>`;
	};
	const panel = (id, inner) => {
		const on = id === activeTab;
		return `<div class="challenges-organize-edit-panel" role="tabpanel" data-organize-edit-panel="${esc(id)}"${on ? '' : ' hidden'}>${inner}</div>`;
	};

	const ids =
		formRole === 'edit' ? editFormHiddenIds(cfg, opts.configMessageId) : '';
	const challengeIdField =
		formRole === 'create'
			? `<input type="hidden" name="challenge_id" value="${esc(cid)}" data-organize-challenge-id />`
			: '';
	const titleAttr = formRole === 'create' ? ' data-organize-title' : '';
	const formAttrs =
		formRole === 'edit'
			? 'data-challenge-admin-form="edit" data-challenge-admin-edit-section="all"'
			: 'data-challenge-admin-form="create"';
	const tablistLabel = formRole === 'create' ? 'New challenge' : 'Edit challenge';
	const listingToggle = showListingToggle
		? renderChallengeListingToggleHtml(cfg, {
				defaultListed:
					opts.defaultListed === true
						? true
						: opts.defaultListed === false
							? false
							: formRole === 'create'
								? false
								: undefined
			})
		: '';
	const toolbar =
		templatePickerHtml || listingToggle
			? renderOrganizeModalToolbarHtml(templatePickerHtml, listingToggle)
			: '';

	return `<form class="challenge-pane-admin-config-form" data-challenge-admin-config-form ${formAttrs}>
		${ids}
		${challengeIdField}
		<div class="challenge-pane-admin-form-main">
			${toolbar}
			<div class="challenges-organize-edit-tabs" role="tablist" aria-label="${esc(tablistLabel)}">
				${tabBtn('details', 'Details', pencilIcon('challenges-organize-edit-tab-svg'))}
				${tabBtn('schedule', 'Schedule', clock3Icon('challenges-organize-edit-tab-svg'))}
				${tabBtn('prizes', 'Prizes', trophyIcon('challenges-organize-edit-tab-svg'))}
			</div>
			${panel(
				'details',
				`<label class="challenge-pane-label">Title
					<input type="text" name="title" class="challenge-pane-input" maxlength="200" value="${esc(title)}"${titleAttr} />
				</label>
				<label class="challenge-pane-label challenge-pane-organizer-details-field">Description
					<textarea name="details" class="challenge-pane-input challenge-pane-admin-textarea challenge-pane-organizer-details-textarea" rows="8" maxlength="8000" placeholder="Rules, theme, etc.">${esc(details)}</textarea>
				</label>
				${renderOrganizerMediaSectionHtml(cfg)}`
			)}
			${panel('schedule', renderDatetimeFieldsHtml(dt))}
			${panel('prizes', renderOrganizerRewardsSection(rewardPrefills, { variant: 'full' }))}
		</div>
		${editFormFooter(submitLabel, { showSoftDelete })}
	</form>`;
}

/**
 * Section-scoped edit forms for the organize page.
 * Prefer `all` (tabbed Details / Schedule / Prizes). Legacy single-section keys still work.
 * @param {'all' | 'schedule' | 'prizes' | 'media' | 'details'} section
 * @param {object} latest
 * @param {number | null | undefined} configMessageId
 * @param {{ activeTab?: string, allowedTracks?: string[] | null }} [opts]
 */
export function renderChallengeOrganizerEditSectionHtml(section, latest, configMessageId, opts = {}) {
	const cfg = latest && typeof latest === 'object' ? latest : {};
	const sectionKey = String(section || 'all').trim() || 'all';

	if (sectionKey === 'all') {
		const track = pickChallengeTrack(cfg);
		const phase = deriveChallengePhase(cfg, Date.now());
		const trackLocked = phase !== 'pre_submit';
		const allowedTracks = Array.isArray(opts.allowedTracks) ? opts.allowedTracks : null;
		return `${renderChallengeOrganizerTabbedFormHtml({
			formRole: 'edit',
			cfg,
			configMessageId,
			activeTab: opts.activeTab,
			submitLabel: 'Save',
			showSoftDelete: phase === 'pre_submit',
			showListingToggle: phase === 'pre_submit',
			templatePickerHtml: renderOrganizeTemplatePickerHtml(track, {
				locked: trackLocked,
				allowedTracks,
				coerceActive: false
			})
		})}`;
	}

	const ids = editFormHiddenIds(cfg, configMessageId);
	const formOpen = `<form class="challenge-pane-admin-config-form" data-challenge-admin-config-form data-challenge-admin-form="edit" data-challenge-admin-edit-section="${esc(sectionKey)}">
			${ids}`;

	if (sectionKey === 'prizes') {
		const rewardPrefills = challengeRewardPrefillsForOrganizerForm(cfg);
		return `${formOpen}
			${renderOrganizerRewardsSection(rewardPrefills, { variant: 'full' })}
			${editFormFooter('Save rewards')}
		</form>`;
	}

	if (sectionKey === 'media' || sectionKey === 'details') {
		const title = typeof cfg.title === 'string' ? cfg.title : '';
		const details =
			cfg.details == null
				? ''
				: typeof cfg.details === 'string'
					? cfg.details
					: String(cfg.details);
		return `${formOpen}
			<label class="challenge-pane-label">Title
				<input type="text" name="title" class="challenge-pane-input" required maxlength="200" value="${esc(title)}" />
			</label>
			<label class="challenge-pane-label challenge-pane-organizer-details-field">Description
				<textarea name="details" class="challenge-pane-input challenge-pane-admin-textarea challenge-pane-organizer-details-textarea" rows="8" maxlength="8000" placeholder="Rules, theme, etc.">${esc(details)}</textarea>
			</label>
			${renderOrganizerMediaSectionHtml(cfg)}
			${editFormFooter('Save')}
		</form>`;
	}

	const dt = challengeConfigDatetimeLocals(cfg);
	return `${formOpen}
		${renderDatetimeFieldsHtml(dt)}
		${editFormFooter('Save schedule')}
	</form>`;
}

/**
 * @param {object} latest — challenge_config payload
 * @param {number | null | undefined} configMessageId
 */
export function renderChallengeOrganizerEditFormHtml(latest, configMessageId) {
	return renderChallengeOrganizerEditSectionHtml('all', latest, configMessageId);
}

/**
 * Create form: template picker + same tabbed Details / Schedule / Prizes modal as edit.
 * @param {string} [submitLabel]
 * @param {object} [opts]
 */
export function renderChallengeOrganizerCreateFormHtml(
	submitLabel = 'Save challenge',
	opts = {}
) {
	const track = String(opts.track || 'monthly');
	const titlePrefill = typeof opts.title === 'string' ? opts.title : '';
	const idPrefill = typeof opts.challenge_id === 'string' ? opts.challenge_id : '';
	const startYmd = typeof opts.startYmd === 'string' ? opts.startYmd : '';
	const endYmd = typeof opts.endYmd === 'string' ? opts.endYmd : '';
	const prizes = opts.prizes && typeof opts.prizes === 'object' ? opts.prizes : {};
	const activeTab = typeof opts.activeTab === 'string' ? opts.activeTab : 'details';
	const allowedTracks = Array.isArray(opts.allowedTracks) ? opts.allowedTracks : null;
	const cfg = {
		title: titlePrefill,
		challenge_id: idPrefill,
		track,
		submission_start_ymd: startYmd,
		submission_end_ymd: endYmd,
		...prizes
	};
	return `${renderChallengeOrganizerTabbedFormHtml({
			formRole: 'create',
			cfg,
			activeTab,
			submitLabel,
			showListingToggle: true,
			defaultListed: false,
			templatePickerHtml: renderOrganizeTemplatePickerHtml(track, { allowedTracks })
		})}`;
}

/**
 * Edit + create forms (no outer chrome). Legacy composite for embeds/tests.
 * @param {{ latestConfig?: object | null }} vm
 */
export function renderChallengeOrganizerFormsHtml(vm) {
	const latest =
		vm.latestConfig && typeof vm.latestConfig === 'object' ? vm.latestConfig : null;

	let html = `<div class="challenge-pane-organizer-forms">${MODAL_FORM_LEAD}`;

	if (latest) {
		html += `<h4 class="challenge-pane-admin-subh">Edit current challenge</h4>`;
		html += renderChallengeOrganizerEditFormHtml(latest);
		html += `<div class="challenge-pane-admin-divider" role="presentation"></div>
			<h4 class="challenge-pane-admin-subh">Create new challenge</h4>`;
	}

	html += renderChallengeOrganizerCreateFormHtml(
		latest ? 'Save new challenge' : 'Save challenge'
	);
	html += `</div>`;

	return html;
}

/**
 * @param {{ challenge_id: string, title: string }[]} rows
 * @param {{ gearIconSvg: string, statsIconSvg: string, plusIconSvg: string }} icons — trusted markup from app icon helpers
 */
export function renderChallengeOrganizerTableHtml(rows, icons) {
	const gearIconSvg = icons?.gearIconSvg || '';
	const statsIconSvg = icons?.statsIconSvg || '';
	const plusIconSvg = icons?.plusIconSvg || '';
	const bodyRows = (rows || [])
		.map((r) => {
			const title =
				r.title && String(r.title).trim()
					? esc(String(r.title).trim())
					: `<span class="challenge-pane-organizer-table-untitled">(untitled)</span>`;
			const cid = esc(r.challenge_id);
			return `<tr class="challenge-pane-organizer-table-row">
				<td class="challenge-pane-organizer-table-main">
					<div class="challenge-pane-organizer-table-title">${title}</div>
					<div class="challenge-pane-organizer-table-id">${cid}</div>
				</td>
				<td class="challenge-pane-organizer-table-actions">
					<div class="challenge-pane-organizer-table-actions-inner">
						<button type="button" class="challenge-pane-organizer-stats-trigger" data-challenges-organizer-stats="${cid}"
							aria-label="View challenge stats">${statsIconSvg}</button>
						<button type="button" class="challenge-pane-organizer-gear" data-challenges-organizer-edit="${cid}"
							aria-label="Edit challenge">${gearIconSvg}</button>
					</div>
				</td>
			</tr>`;
		})
		.join('');

	return `<div class="challenge-pane-organizer-table-shell">
			<div class="challenge-pane-organizer-table-wrap">
				<table class="challenge-pane-organizer-table">
					<thead>
						<tr>
							<th scope="col">Challenge</th>
							<th scope="col" class="challenge-pane-organizer-table-actions-head"><span class="challenge-pane-organizer-sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						${bodyRows}
					</tbody>
				</table>
			</div>
			<div class="challenge-pane-organizer-add-strip" data-challenges-organizer-add-row tabindex="0" role="button">
				<span class="challenge-pane-organizer-add-strip-inner">
					<span class="challenge-pane-organizer-add-strip-plus" aria-hidden="true">${plusIconSvg}</span>
					<span class="challenge-pane-organizer-add-strip-label">Add challenge</span>
				</span>
			</div>
		</div>`;
}

/**
 * @param {{
 *   challengeTitle?: string,
 *   globalAverage?: number,
 *   sortMode?: 'weighted' | 'average',
 *   topCreations?: {
 *     creationId: number | null,
 *     messageId: number | null,
 *     voteValue: number,
 *     voteCount: number,
 *     creatorUserId: number | null,
 *     creatorUserName: string | null,
 *   }[],
 *   topSubmitters?: { userId: number, submissionCount: number, userName: string | null }[],
 *   topVoters?: { userId: number, voteCount: number, userName: string | null }[],
 *   excludedUserNames?: string[],
 *   loading?: boolean,
 *   error?: string | null,
 * }} vm
 */
export function renderChallengeOrganizerStatsModalInnerHtml(vm) {
	const WEIGHTED_RATING_MIN_VOTES = 15;
	const loading = vm?.loading === true;
	const error = typeof vm?.error === 'string' ? vm.error.trim() : '';
	if (loading) {
		return `<p class="challenge-pane-muted">Loading stats…</p>`;
	}
	if (error) {
		return `<p class="challenge-pane-form-error challenge-pane-organizer-stats-error" role="alert">${esc(error)}</p>`;
	}
	const challengeTitle =
		typeof vm?.challengeTitle === 'string' && vm.challengeTitle.trim()
			? vm.challengeTitle.trim()
			: 'Challenge';
	const excludedUserNames = Array.isArray(vm?.excludedUserNames)
		? vm.excludedUserNames
		: [];
	const excludedSet = new Set(
		excludedUserNames
			.map((name) => String(name || '').trim().replace(/^@+/, '').toLowerCase())
			.filter(Boolean)
	);
	const excludedDisplayValue = excludedUserNames.join(', ');
	const sortMode = vm?.sortMode === 'average' ? 'average' : 'weighted';
	const topCreations = Array.isArray(vm?.topCreations) ? vm.topCreations : [];
	const globalAverageFromVm = Number(vm?.globalAverage);
	const fallbackTotals = topCreations.reduce(
		(acc, row) => {
			const voteValue = Number.isFinite(Number(row?.voteValue))
				? Math.max(0, Number(row.voteValue))
				: 0;
			const voteCount = Number.isFinite(Number(row?.voteCount))
				? Math.max(0, Number(row.voteCount))
				: 0;
			acc.voteValue += voteValue;
			acc.voteCount += voteCount;
			return acc;
		},
		{ voteValue: 0, voteCount: 0 }
	);
	const globalAverage =
		Number.isFinite(globalAverageFromVm) && globalAverageFromVm >= 0
			? globalAverageFromVm
			: fallbackTotals.voteCount > 0
				? fallbackTotals.voteValue / fallbackTotals.voteCount
				: 0;
	const filteredTopCreations = topCreations.filter((row) => {
		const creatorUserName =
			row?.creatorUserName != null ? String(row.creatorUserName).trim().toLowerCase() : '';
		return !creatorUserName || !excludedSet.has(creatorUserName);
	});
	const weightedRatingForRow = (row) => {
		const voteValue = Number.isFinite(Number(row?.voteValue))
			? Math.max(0, Math.floor(Number(row.voteValue)))
			: 0;
		const voteCount = Number.isFinite(Number(row?.voteCount))
			? Math.max(0, Math.floor(Number(row.voteCount)))
			: 0;
		const averageVote = voteCount > 0 ? voteValue / voteCount : 0;
		return (
			(voteCount * averageVote + WEIGHTED_RATING_MIN_VOTES * globalAverage) /
			(voteCount + WEIGHTED_RATING_MIN_VOTES)
		);
	};
	const sortedTopCreations = [...filteredTopCreations].sort((a, b) => {
		const aVoteCount = Number.isFinite(Number(a?.voteCount))
			? Math.max(0, Math.floor(Number(a.voteCount)))
			: 0;
		const bVoteCount = Number.isFinite(Number(b?.voteCount))
			? Math.max(0, Math.floor(Number(b.voteCount)))
			: 0;
		const aVoteValue = Number.isFinite(Number(a?.voteValue))
			? Math.max(0, Math.floor(Number(a.voteValue)))
			: 0;
		const bVoteValue = Number.isFinite(Number(b?.voteValue))
			? Math.max(0, Math.floor(Number(b.voteValue)))
			: 0;
		const aAverageVote = aVoteCount > 0 ? aVoteValue / aVoteCount : 0;
		const bAverageVote = bVoteCount > 0 ? bVoteValue / bVoteCount : 0;
		if (sortMode === 'weighted') {
			const aWeightedRating = weightedRatingForRow(a);
			const bWeightedRating = weightedRatingForRow(b);
			if (bWeightedRating !== aWeightedRating) {
				return bWeightedRating - aWeightedRating;
			}
		}
		if (bAverageVote !== aAverageVote) {
			return bAverageVote - aAverageVote;
		}
		return bVoteCount - aVoteCount;
	});
	const rowsHtml = sortedTopCreations
		.slice(0, 10)
		.map((row, i) => {
			const rank = i + 1;
			const cid =
				Number.isFinite(Number(row?.creationId)) && Number(row.creationId) > 0
					? Number(row.creationId)
					: null;
			const voteValue = Number.isFinite(Number(row?.voteValue))
				? Math.max(0, Math.floor(Number(row.voteValue)))
				: 0;
			const voteCount = Number.isFinite(Number(row?.voteCount))
				? Math.max(0, Math.floor(Number(row.voteCount)))
				: 0;
			const averageVote = voteCount > 0 ? voteValue / voteCount : 0;
			const averageVoteDisplay = Number.isFinite(averageVote) ? averageVote.toFixed(2) : '0.00';
			const weightedRating = weightedRatingForRow(row);
			const weightedRatingDisplay = Number.isFinite(weightedRating)
				? weightedRating.toFixed(2)
				: '0.00';
			const messageId =
				Number.isFinite(Number(row?.messageId)) && Number(row.messageId) > 0
					? Math.floor(Number(row.messageId))
					: null;
			const midAttr =
				messageId != null ? ` data-challenge-message-id="${esc(String(messageId))}"` : '';
			const thumbBlock = cid
				? `<span class="challenge-pane-organizer-stats-thumb-slot" data-challenge-stats-thumb-slot="" data-creation-id="${esc(String(cid))}"${midAttr}>
					<span class="challenge-pane-organizer-stats-thumb challenge-pane-organizer-stats-thumb--placeholder" aria-hidden="true"></span>
				</span>`
				: `<span class="challenge-pane-organizer-stats-thumb challenge-pane-organizer-stats-thumb--placeholder" aria-hidden="true"></span>`;
			const creatorUid =
				Number.isFinite(Number(row?.creatorUserId)) && Number(row.creatorUserId) > 0
					? Math.floor(Number(row.creatorUserId))
					: null;
			const creatorUnRaw =
				row?.creatorUserName != null && String(row.creatorUserName).trim()
					? String(row.creatorUserName).trim()
					: '';
			const creatorCell =
				creatorUnRaw && creatorUid != null
					? `<a class="challenge-pane-organizer-stats-voter-link" href="/p/${encodeURIComponent(creatorUnRaw.toLowerCase())}">@${esc(creatorUnRaw)}</a>`
					: creatorUid != null
						? `<span class="challenge-pane-muted">User ${esc(String(creatorUid))}</span>`
						: '<span class="challenge-pane-muted">Unknown</span>';
			const creationCell = cid
				? `<button type="button" class="challenge-pane-organizer-stats-creation" aria-label="Preview image" data-challenge-stats-creation-lightbox data-challenge-stats-creation-id="${esc(String(cid))}"${midAttr}>
					${thumbBlock}
				</button>`
				: '<span class="challenge-pane-muted">Unknown creation</span>';
			return `<tr>
				<td>${esc(String(rank))}</td>
				<td>${creationCell}</td>
				<td>${creatorCell}</td>
				<td>${esc(String(voteValue))}</td>
				<td>${esc(String(voteCount))}</td>
				<td>${esc(averageVoteDisplay)}</td>
				<td>${esc(weightedRatingDisplay)}</td>
			</tr>`;
		})
		.join('');
	const bodyTable = rowsHtml
		? `<table class="challenge-pane-organizer-stats-table">
			<thead>
				<tr>
					<th scope="col">#</th>
					<th scope="col">Creation</th>
					<th scope="col">Creator</th>
					<th scope="col">Vote value</th>
					<th scope="col">Votes</th>
					<th scope="col">Average vote</th>
					<th scope="col">Weighted rating</th>
				</tr>
			</thead>
			<tbody>${rowsHtml}</tbody>
		</table>`
		: `<p class="challenge-pane-muted challenge-pane-organizer-stats-empty">No submissions with votes yet.</p>`;

	const topSubmitters = Array.isArray(vm?.topSubmitters) ? vm.topSubmitters : [];
	const filteredTopSubmitters = topSubmitters.filter((row) => {
		const userName = row?.userName != null ? String(row.userName).trim().toLowerCase() : '';
		return !userName || !excludedSet.has(userName);
	});
	const submitterRowsHtml = filteredTopSubmitters
		.slice(0, 10)
		.map((row, i) => {
			const rank = i + 1;
			const uid = Number.isFinite(Number(row?.userId)) ? Math.floor(Number(row.userId)) : null;
			const submissionCount = Number.isFinite(Number(row?.submissionCount))
				? Math.max(0, Math.floor(Number(row.submissionCount)))
				: 0;
			const unRaw =
				row?.userName != null && String(row.userName).trim()
					? String(row.userName).trim()
					: '';
			const userCell =
				unRaw && uid != null
					? `<a class="challenge-pane-organizer-stats-voter-link" href="/p/${encodeURIComponent(unRaw.toLowerCase())}">@${esc(unRaw)}</a>`
					: uid != null
						? `<span class="challenge-pane-muted">User ${esc(String(uid))}</span>`
						: '<span class="challenge-pane-muted">Unknown</span>';
			return `<tr>
				<td>${esc(String(rank))}</td>
				<td>${userCell}</td>
				<td>${esc(String(submissionCount))}</td>
			</tr>`;
		})
		.join('');
	const submittersTable = submitterRowsHtml
		? `<table class="challenge-pane-organizer-stats-table challenge-pane-organizer-stats-table--submitters">
			<thead>
				<tr>
					<th scope="col">#</th>
					<th scope="col">Entrant</th>
					<th scope="col">Submissions</th>
				</tr>
			</thead>
			<tbody>${submitterRowsHtml}</tbody>
		</table>`
		: `<p class="challenge-pane-muted challenge-pane-organizer-stats-empty">No submissions yet.</p>`;

	const topVoters = Array.isArray(vm?.topVoters) ? vm.topVoters : [];
	const filteredTopVoters = topVoters.filter((row) => {
		const userName = row?.userName != null ? String(row.userName).trim().toLowerCase() : '';
		return !userName || !excludedSet.has(userName);
	});
	const voterRowsHtml = filteredTopVoters
		.slice(0, 10)
		.map((row, i) => {
			const rank = i + 1;
			const uid = Number.isFinite(Number(row?.userId)) ? Math.floor(Number(row.userId)) : null;
			const voteCount = Number.isFinite(Number(row?.voteCount))
				? Math.max(0, Math.floor(Number(row.voteCount)))
				: 0;
			const unRaw =
				row?.userName != null && String(row.userName).trim()
					? String(row.userName).trim()
					: '';
			const voterCell =
				unRaw && uid != null
					? `<a class="challenge-pane-organizer-stats-voter-link" href="/p/${encodeURIComponent(unRaw.toLowerCase())}">@${esc(unRaw)}</a>`
					: uid != null
						? `<span class="challenge-pane-muted">User ${esc(String(uid))}</span>`
						: '<span class="challenge-pane-muted">Unknown</span>';
			return `<tr>
				<td>${esc(String(rank))}</td>
				<td>${voterCell}</td>
				<td>${esc(String(voteCount))}</td>
			</tr>`;
		})
		.join('');
	const votersTable = voterRowsHtml
		? `<table class="challenge-pane-organizer-stats-table challenge-pane-organizer-stats-table--voters">
			<thead>
				<tr>
					<th scope="col">#</th>
					<th scope="col">Voter</th>
					<th scope="col">Votes</th>
				</tr>
			</thead>
			<tbody>${voterRowsHtml}</tbody>
		</table>`
		: `<p class="challenge-pane-muted challenge-pane-organizer-stats-empty">No votes cast yet.</p>`;

	return `<section class="challenge-pane-organizer-stats-view">
		<p class="challenge-pane-organizer-stats-kicker">${esc(challengeTitle)}</p>
		<h4 class="challenge-pane-organizer-stats-subhead">Top 10 creations by ${sortMode === 'average' ? 'average vote' : 'weighted rating'}</h4>
		<div class="challenge-pane-organizer-stats-controls-row">
			<div class="challenge-pane-organizer-stats-sort-toggle" role="group" aria-label="Top 10 sort mode">
				<span class="challenge-pane-organizer-stats-inline-label">Sort</span>
				<span class="challenge-pane-organizer-stats-sort-label${sortMode === 'average' ? ' is-active' : ''}">Avg</span>
				<button
					type="button"
					class="challenge-pane-organizer-stats-sort-switch"
					role="switch"
					aria-label="Toggle Top 10 sort mode"
					aria-checked="${sortMode === 'weighted' ? 'true' : 'false'}"
					data-challenge-stats-sort-switch
				>
					<span class="challenge-pane-organizer-stats-sort-switch-thumb" aria-hidden="true"></span>
				</button>
				<span class="challenge-pane-organizer-stats-sort-label${sortMode === 'weighted' ? ' is-active' : ''}">Weighted</span>
			</div>
			<form class="challenge-pane-organizer-stats-filter" data-challenge-stats-filter-form>
				<label class="challenge-pane-organizer-stats-inline-label" for="challenge-stats-excluded-usernames">Exclude</label>
				<input id="challenge-stats-excluded-usernames" type="text" class="challenge-pane-input challenge-pane-organizer-stats-filter-input" data-challenge-stats-filter-input name="excluded_usernames" value="${esc(excludedDisplayValue)}" placeholder="Exclude: user1, user2" autocomplete="off" />
				<button type="submit" class="btn-outlined challenge-pane-organizer-stats-filter-apply">Apply</button>
			</form>
		</div>
		<div class="challenge-pane-organizer-stats-table-wrap">${bodyTable}</div>
		<h4 class="challenge-pane-organizer-stats-subhead challenge-pane-organizer-stats-subhead--secondary">Top 10 entrants by submissions</h4>
		<div class="challenge-pane-organizer-stats-table-wrap">${submittersTable}</div>
		<h4 class="challenge-pane-organizer-stats-subhead challenge-pane-organizer-stats-subhead--secondary">Top 10 voters by votes cast</h4>
		<div class="challenge-pane-organizer-stats-table-wrap">${votersTable}</div>
	</section>`;
}

/**
 * @param {'create' | 'edit' | 'view' | 'global'} mode
 * @param {object | null} [editPayload] — challenge_config shape when mode is edit/view
 * @param {number | null | undefined} [configMessageId] — message row to update when editing
 * @param {object} [globalConfigVm]
 * @param {object} [createOpts] — template prefill for create mode; for edit/view: `{ section, activeTab }`
 */
export function renderChallengeOrganizerModalInnerHtml(
	mode,
	editPayload,
	configMessageId,
	globalConfigVm,
	createOpts
) {
	if (mode === 'global') {
		const vm =
			globalConfigVm && typeof globalConfigVm === 'object'
				? globalConfigVm
				: { organizersByTrack: { monthly: [], weekly: [], suno: [] }, configMessageId: null };
		return renderChallengeOrganizerGlobalConfigFormHtml(
			vm.organizersByTrack,
			vm.configMessageId
		);
	}
	if (mode === 'view' && editPayload && typeof editPayload === 'object') {
		const activeTab =
			createOpts && typeof createOpts.activeTab === 'string' ? createOpts.activeTab : 'details';
		return renderChallengeOrganizerViewHtml(editPayload, { activeTab });
	}
	if (mode === 'edit' && editPayload && typeof editPayload === 'object') {
		const section =
			createOpts && typeof createOpts.section === 'string' ? createOpts.section : 'all';
		const activeTab =
			createOpts && typeof createOpts.activeTab === 'string' ? createOpts.activeTab : 'details';
		const allowedTracks =
			createOpts && Array.isArray(createOpts.allowedTracks) ? createOpts.allowedTracks : null;
		return renderChallengeOrganizerEditSectionHtml(section, editPayload, configMessageId, {
			activeTab,
			allowedTracks
		});
	}
	return renderChallengeOrganizerCreateFormHtml('Save challenge', createOpts || {});
}

function renderChallengeOrganizerModalHtml() {
	return `<div class="modal-overlay chat-page-chat-modal" data-challenges-organizer-modal aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="challenges-organizer-modal-title">
		<div class="modal modal-medium chat-page-chat-modal-panel chat-page-challenges-organizer-modal-panel">
			<div class="modal-header">
				<h3 id="challenges-organizer-modal-title" data-challenges-organizer-modal-title>New challenge</h3>
				<button type="button" class="modal-dismiss chat-page-chat-modal-close" data-challenges-organizer-modal-close aria-label="Close">${MODAL_DISMISS_ICON_SVG}</button>
			</div>
			<div class="modal-body user-text challenge-pane-organizer-modal-body" data-challenges-organizer-modal-body></div>
		</div>
	</div>`;
}

/**
 * Chat right-rail bridge: link out to the standalone organize page (replaces in-pane tools).
 */
export function renderChallengeOrganizerSidebarMarkup() {
	return `<div class="chat-page-challenges-organizer-sidebar-inner">
			<div class="chat-page-canvas-panel-body">
				<div class="chat-page-canvas-panel-head chat-page-challenges-organizer-head">
					<div class="chat-page-canvas-panel-title-row">
						<h2 class="chat-page-canvas-panel-title">Organizer</h2>
						<div class="chat-page-canvas-panel-head-actions">
							<button type="button" class="modal-dismiss chat-page-canvas-close" data-chat-challenges-organizer-close
								aria-label="Close organizer tools">${MODAL_DISMISS_ICON_SVG}</button>
						</div>
					</div>
				</div>
				<div class="chat-page-canvas-panel-scroll">
					<div class="challenge-pane-organizer-sidebar-body user-text challenge-pane-organizer-bridge">
						<p class="challenge-pane-muted challenge-pane-organizer-bridge-copy">
							Challenge setup and stats live on the organizer page.
						</p>
						<a href="/challenges/organize" class="btn-primary challenge-pane-organizer-bridge-link">Open organizer</a>
					</div>
				</div>
			</div>
		</div>`;
}

/**
 * Full organizer tools for the standalone `/challenges/organize` page.
 * @param {{
 *   rows: { challenge_id: string, title: string, configMessageId?: number, latest?: object }[],
 *   configEntries?: { msg: object, payload: object }[],
 *   statsIconSvg?: string,
 *   contentIconSvg?: string,
 *   viewIconSvg?: string,
 *   scheduleIconSvg?: string,
 *   prizesIconSvg?: string,
 *   settingsIconSvg?: string,
 *   nowMs?: number,
 *   isOceanman?: boolean,
 * }} vm
 */
export function renderChallengeOrganizerPageMarkup(vm) {
	const board = renderOrganizeBoardHtml({
		rows: vm.rows || [],
		configEntries: vm.configEntries || [],
		statsIconSvg: vm.statsIconSvg || '',
		contentIconSvg: vm.contentIconSvg || '',
		viewIconSvg: vm.viewIconSvg || '',
		scheduleIconSvg: vm.scheduleIconSvg || '',
		prizesIconSvg: vm.prizesIconSvg || '',
		settingsIconSvg: vm.settingsIconSvg || '',
		nowMs: vm.nowMs,
		isOceanman: Boolean(vm.isOceanman)
	});
	const modal = renderChallengeOrganizerModalHtml();
	return `<div class="challenges-organize-tools">
			<div class="challenge-pane-organizer-sidebar-body user-text challenges-organize-tools-body">${board}</div>
			${modal}
		</div>`;
}
