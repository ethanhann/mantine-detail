import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { type ReactNode, useCallback, useRef } from "react";
import type { ConfirmDiscardFn } from "./types";

export interface UseDirtyGuardOptions {
	/** Whether there are unsaved changes to guard against discarding. */
	when: boolean;
	/** Modal body content. */
	message?: ReactNode;
	/** Modal title. */
	title?: ReactNode;
	/** Confirm / cancel button labels. */
	labels?: { confirm: ReactNode; cancel: ReactNode };
}

export interface UseDirtyGuardReturn {
	/** Mirrors `when`. True while there are unsaved changes. */
	isDirty: boolean;
	/**
	 * Prompt to discard unsaved changes. Resolves `true` to proceed, `false` to
	 * stay. Returns `true` synchronously (no prompt) when `when` is false.
	 *
	 * Pass to the detail's `confirmDiscard` (via the hook option or the
	 * `<Detail confirmDiscard>` prop), or call directly from a router blocker
	 * (React Router `useBlocker`, TanStack Router `blocker`, etc.).
	 */
	confirmDiscard: ConfirmDiscardFn;
}

const DEFAULT_TITLE: ReactNode = "Unsaved changes";
const DEFAULT_MESSAGE: ReactNode = "You have unsaved changes. Discard them?";
const DEFAULT_CONFIRM: ReactNode = "Discard";
const DEFAULT_CANCEL: ReactNode = "Keep editing";

/**
 * A router-agnostic guard for unsaved changes. Renders a Mantine confirm modal
 * (requires `<ModalsProvider>` / `@mantine/modals`) and exposes
 * `confirmDiscard()` so the same prompt drives both in-app close/cancel and
 * external route blockers.
 *
 * @example
 * const dirty = form.isDirty();
 * const guard = useDirtyGuard({ when: dirty });
 * const detail = useDetailFetcher({ ..., isDirty: dirty, confirmDiscard: guard.confirmDiscard });
 */
export function useDirtyGuard({
	when,
	message,
	title,
	labels,
}: UseDirtyGuardOptions): UseDirtyGuardReturn {
	// Read the latest options inside a stable callback.
	const optsRef = useRef({ when, message, title, labels });
	optsRef.current = { when, message, title, labels };

	const confirmDiscard = useCallback<ConfirmDiscardFn>(() => {
		const opts = optsRef.current;
		// Nothing to discard, proceed synchronously (no prompt).
		if (!opts.when) return true;
		return new Promise<boolean>((resolve) => {
			modals.openConfirmModal({
				title: opts.title ?? DEFAULT_TITLE,
				children: <Text size="sm">{opts.message ?? DEFAULT_MESSAGE}</Text>,
				labels: {
					confirm: opts.labels?.confirm ?? DEFAULT_CONFIRM,
					cancel: opts.labels?.cancel ?? DEFAULT_CANCEL,
				},
				confirmProps: { color: "red" },
				onConfirm: () => resolve(true),
				// Covers Cancel button, Escape, overlay click, and the X. Fires
				// after onConfirm too, but the promise is already settled by then.
				onClose: () => resolve(false),
			});
		});
	}, []);

	return { isDirty: when, confirmDiscard };
}
