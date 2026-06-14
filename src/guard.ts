import type { ConfirmDiscardFn } from "./types";

/**
 * Run `action`, optionally behind a confirm gate. With no `confirm` the action
 * runs immediately. A synchronous (`boolean`) decision keeps the whole
 * transition synchronous; a promise defers the action until it resolves. Shared
 * by the core's programmatic guard ({@link useDetail}) and the component's
 * prop-path guard (`<Detail>`) so the two stay in lockstep.
 */
export function runWithConfirm(
	action: () => void,
	confirm?: ConfirmDiscardFn | null,
): void {
	if (!confirm) {
		action();
		return;
	}
	const decision = confirm();
	if (typeof decision === "boolean") {
		if (decision) action();
		return;
	}
	void decision.then((ok) => {
		if (ok) action();
	});
}
