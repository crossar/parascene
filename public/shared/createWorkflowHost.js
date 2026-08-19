/**
 * Native create/mutate overlay host. When set, create/mutate runtimes
 * navigate via callbacks instead of iframe postMessage.
 */

/** @typedef {{
 *   root?: HTMLElement | null,
 *   onNavigate?: (href: string, options?: { forceReload?: boolean }) => void,
 *   onDismiss?: (options?: { creationId?: number }) => void,
 *   onShellOut?: (href: string) => void,
 *   onClose?: () => void,
 *   onShellSync?: (payload: object) => void,
 * }} CreateWorkflowHost */

/** @type {CreateWorkflowHost | null} */
let host = null;

/** @param {CreateWorkflowHost | null} next */
export function setCreateWorkflowHost(next) {
	host = next && typeof next === 'object' ? next : null;
}

export function clearCreateWorkflowHost() {
	host = null;
}

/** @returns {CreateWorkflowHost | null} */
export function getCreateWorkflowHost() {
	return host;
}

export function isCreateWorkflowNativeHost() {
	return Boolean(host);
}

/**
 * Mount point for in-workflow dialogs. Prefer the SPA overlay shell so they
 * stack above overlay chrome instead of under it on document.body.
 * @returns {HTMLElement}
 */
export function getCreateWorkflowModalParent() {
	const overlay = typeof document !== 'undefined'
		? document.querySelector('.creation-detail-overlay')
		: null;
	if (overlay instanceof HTMLElement) return overlay;
	return document.body;
}
