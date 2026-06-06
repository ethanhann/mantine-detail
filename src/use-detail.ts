import { useCallback, useRef, useState } from "react";
import type {
	DetailMode,
	OpenMode,
	SubmitContext,
	UseDetailOptions,
	UseDetailReturn,
} from "./types";

/**
 * Headless, fully controlled core of the detail lifecycle. You supply
 * `record` / `status` / `error` and respond to `onLoadRequest`. The hook owns
 * the mode machine (view | edit | create), transitions (open, setMode, close)
 * and their dirty-guarding, and post-write behavior (reconcile into the master,
 * return to view / close). It never owns form values; `save(values)` receives
 * them from your form layer.
 *
 * `useDetailFetcher` is a thin wrapper that supplies the async `record`/`status`
 * by calling your `load` from inside `onLoadRequest`.
 */
export function useDetail<TData, TForm = TData>(
	options: UseDetailOptions<TData, TForm>,
): UseDetailReturn<TData, TForm> {
	const {
		record,
		status,
		error,
		isDirty = false,
		initialMode = "view",
	} = options;

	const [mode, setModeState] = useState<DetailMode>(initialMode);
	const [isOpen, setIsOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [submitError, setSubmitError] = useState<unknown>(undefined);

	// Id of the record last requested via open()/save(), used by retry().
	const lastLoadId = useRef<string | null>(null);

	// Latest props/state, read from inside the stable callbacks below so they
	// never close over stale values without needing to be re-created each render.
	const latest = useRef(options);
	latest.current = options;
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const dirtyRef = useRef(isDirty);
	dirtyRef.current = isDirty;

	/**
	 * Run `action`, but when the current edit is dirty, route it through the
	 * confirm gate first. A synchronous decision keeps the whole transition
	 * synchronous (easier to reason about); a promise defers it until resolved.
	 */
	const runGuarded = useCallback((action: () => void) => {
		const isWriteMode =
			modeRef.current === "edit" || modeRef.current === "create";
		const confirmDiscard = latest.current.confirmDiscard;

		if (!(dirtyRef.current && isWriteMode && confirmDiscard)) {
			action();
			return;
		}

		const decision = confirmDiscard();
		if (typeof decision === "boolean") {
			if (decision) action();
			return;
		}
		void decision.then((ok) => {
			if (ok) action();
		});
	}, []);

	const open = useCallback(
		(id: string, openMode: OpenMode = "view") => {
			runGuarded(() => {
				lastLoadId.current = id;
				setSubmitError(undefined);
				setModeState(openMode);
				setIsOpen(true);
				latest.current.master?.setActive(id);
				latest.current.onLoadRequest?.(id);
			});
		},
		[runGuarded],
	);

	const openCreate = useCallback(() => {
		runGuarded(() => {
			lastLoadId.current = null;
			setSubmitError(undefined);
			setModeState("create");
			setIsOpen(true);
			latest.current.master?.setActive(null);
		});
	}, [runGuarded]);

	const setMode = useCallback(
		(target: DetailMode) => {
			if (target === modeRef.current) return;
			runGuarded(() => {
				setSubmitError(undefined);
				setModeState(target);
			});
		},
		[runGuarded],
	);

	const close = useCallback(() => {
		runGuarded(() => {
			setIsOpen(false);
			setSubmitError(undefined);
			latest.current.master?.setActive(null);
		});
	}, [runGuarded]);

	const save = useCallback(async (values: TForm) => {
		const currentMode = modeRef.current;
		const { getRowId, onSubmit, master } = latest.current;
		// Nothing to submit in view mode, or with no submit handler wired.
		if (currentMode === "view" || !onSubmit) return;

		const rec = latest.current.record;
		const ctx: SubmitContext =
			currentMode === "edit"
				? {
						mode: "edit",
						id: rec ? getRowId(rec) : (lastLoadId.current ?? undefined),
					}
				: { mode: "create" };

		setIsSubmitting(true);
		setSubmitError(undefined);
		try {
			const saved = await onSubmit(values, ctx);
			master?.reconcile(
				currentMode === "create"
					? { type: "created", record: saved }
					: { type: "saved", record: saved },
			);
			const savedId = getRowId(saved);
			lastLoadId.current = savedId;
			master?.setActive(savedId);
			// A successful write returns to the read view of the persisted record;
			// dismiss instead by calling close() in response if your flow prefers.
			setModeState("view");
		} catch (err) {
			setSubmitError(err);
		} finally {
			setIsSubmitting(false);
		}
	}, []);

	const remove = useCallback(async () => {
		const currentMode = modeRef.current;
		const { getRowId, onDelete, master } = latest.current;
		if (currentMode === "create" || !onDelete) return;

		const rec = latest.current.record;
		const id = rec ? getRowId(rec) : (master?.activeId ?? lastLoadId.current);
		// Guard: nothing persisted to delete.
		if (!id) return;

		setIsDeleting(true);
		setSubmitError(undefined);
		try {
			await onDelete(id);
			master?.reconcile({ type: "deleted", id });
			master?.setActive(null);
			setIsOpen(false);
		} catch (err) {
			setSubmitError(err);
		} finally {
			setIsDeleting(false);
		}
	}, []);

	const retry = useCallback(() => {
		const id = lastLoadId.current;
		if (id == null) return;
		latest.current.onLoadRequest?.(id);
	}, []);

	return {
		mode,
		record,
		status,
		error,
		isSubmitting,
		isDeleting,
		submitError,
		isOpen,
		isDirty,
		open,
		openCreate,
		setMode,
		close,
		save,
		remove,
		retry,
	};
}
