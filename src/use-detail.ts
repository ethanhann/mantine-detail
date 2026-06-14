import { useCallback, useRef, useState } from "react";
import { runWithConfirm } from "./guard";
import type {
	DetailMode,
	OpenMode,
	SetModeTarget,
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

	// Monotonic token guarding write side-effects, mirroring the fetcher's load
	// token. A nav transition (open/openCreate/close) or a newer write bumps it,
	// so a slow save/delete that resolves after the user has moved on can no
	// longer reconcile, re-activate a row, or force the mode back to view.
	const writeToken = useRef(0);
	// One write at a time: blocks a double-submit (e.g. a custom Actions slot or
	// a repeated programmatic call) while a save/delete is already in flight.
	const isWritingRef = useRef(false);

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
	 * confirm gate first.
	 */
	const runGuarded = useCallback((action: () => void) => {
		const isWriteMode =
			modeRef.current === "edit" || modeRef.current === "create";
		const confirmDiscard = latest.current.confirmDiscard;
		const shouldGuard = dirtyRef.current && isWriteMode && !!confirmDiscard;
		runWithConfirm(action, shouldGuard ? confirmDiscard : undefined);
	}, []);

	const open = useCallback(
		(id: string, openMode: OpenMode = "view") => {
			runGuarded(() => {
				writeToken.current++; // supersede any in-flight write
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
			writeToken.current++; // supersede any in-flight write
			lastLoadId.current = null;
			setSubmitError(undefined);
			setModeState("create");
			setIsOpen(true);
			latest.current.master?.setActive(null);
		});
	}, [runGuarded]);

	const setMode = useCallback(
		(target: SetModeTarget) => {
			// `create` is entered only via openCreate() (it also clears the active
			// row and load state); ignore it here so setMode stays the view↔edit
			// toggle and can't land a half-applied create transition. The cast
			// guards JS callers; the type already rejects it for TS callers.
			if ((target as DetailMode) === "create" || target === modeRef.current) {
				return;
			}
			runGuarded(() => {
				setSubmitError(undefined);
				setModeState(target);
			});
		},
		[runGuarded],
	);

	const close = useCallback(() => {
		runGuarded(() => {
			writeToken.current++; // supersede any in-flight write
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
		// One write at a time: ignore a re-entrant save while one is in flight.
		if (isWritingRef.current) return;

		const rec = latest.current.record;
		const ctx: SubmitContext =
			currentMode === "edit"
				? {
						mode: "edit",
						id: rec ? getRowId(rec) : (lastLoadId.current ?? undefined),
					}
				: { mode: "create" };

		const token = ++writeToken.current;
		isWritingRef.current = true;
		setIsSubmitting(true);
		setSubmitError(undefined);
		try {
			const saved = await onSubmit(values, ctx);
			// Drop the side-effects if a nav transition superseded this write.
			if (token === writeToken.current) {
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
			}
		} catch (err) {
			if (token === writeToken.current) setSubmitError(err);
		} finally {
			isWritingRef.current = false;
			setIsSubmitting(false);
		}
	}, []);

	const remove = useCallback(async () => {
		const currentMode = modeRef.current;
		const { getRowId, onDelete, master } = latest.current;
		if (currentMode === "create" || !onDelete) return;
		// One write at a time: ignore a re-entrant delete while one is in flight.
		if (isWritingRef.current) return;

		const rec = latest.current.record;
		const id = rec ? getRowId(rec) : (master?.activeId ?? lastLoadId.current);
		// Guard: nothing persisted to delete.
		if (!id) return;

		const token = ++writeToken.current;
		isWritingRef.current = true;
		setIsDeleting(true);
		setSubmitError(undefined);
		try {
			await onDelete(id);
			// Drop the side-effects if a nav transition superseded this delete.
			if (token === writeToken.current) {
				master?.reconcile({ type: "deleted", id });
				master?.setActive(null);
				setIsOpen(false);
			}
		} catch (err) {
			if (token === writeToken.current) setSubmitError(err);
		} finally {
			isWritingRef.current = false;
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
