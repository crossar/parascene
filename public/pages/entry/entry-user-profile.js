/**
 * User profile page: nav, nav-mobile, tabs, modals (profile, credits, notifications).
 * Page script (user-profile.js) is loaded separately in the HTML.
 */

import { embedWaitTags, importStandaloneAppChrome } from '../../shared/embedPageRuntime.js';

const TAGS = [
	'app-navigation',
	'app-navigation-mobile',
	'app-tabs',
	'app-modal-profile',
	'app-modal-credits',
	'app-modal-notifications',
];

function getImportQuery(version) {
	return version && typeof version === 'string' ? `?v=${encodeURIComponent(version)}` : '';
}

export async function init(version) {
	const qs = getImportQuery(version);
	await Promise.all([
		importStandaloneAppChrome(qs),
		import(`../../components/elements/tabs.js${qs}`),
	]);
	const { waitForComponents } = await import(`../../shared/pageInit.js${qs}`);
	await waitForComponents(embedWaitTags(TAGS));
}
