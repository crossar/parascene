/**
 * Audio clip detail page: nav, nav-mobile, modals.
 */

import { embedWaitTags, importStandaloneAppChrome } from '../../shared/embedPageRuntime.js';

const TAGS = [
	"app-navigation",
	"app-navigation-mobile",
	"app-modal-profile",
	"app-modal-credits",
	"app-modal-notifications"
];

function getImportQuery(version) {
	return version && typeof version === "string" ? `?v=${encodeURIComponent(version)}` : "";
}

export async function init(version) {
	const qs = getImportQuery(version);
	await importStandaloneAppChrome(qs);
	const { waitForComponents } = await import(`../../shared/pageInit.js${qs}`);
	await waitForComponents(embedWaitTags(TAGS));
}
