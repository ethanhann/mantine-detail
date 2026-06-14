import { useCallback, useEffect, useRef, useState } from "react";
import type {
	DetailStatus,
	RemoveFn,
	SubmitFn,
	UseDetailFetcherOptions,
	UseDetailReturn,
} from "./types";
import { useDetail } from "./use-detail";

/**
 * A thin async wrapper over {@link useDetail}. You provide `load` / `submit` /
 * `remove`; this hook owns the async `record` / `status` / `error` (filling
 * them by calling `load` from inside the core's `onLoadRequest`) and delegates
 * all orchestration (mode, dirty-guarding, reconciliation, open/close) to the
 * core.
 */
export function useDetailFetcher<TData, TForm = TData>(
	options: UseDetailFetcherOptions<TData, TForm>,
): UseDetailReturn<TData, TForm> {
	const [record, setRecord] = useState<TData | null>(null);
	const [status, setStatus] = useState<DetailStatus>("idle");
	const [error, setError] = useState<unknown>(undefined);

	const latest = useRef(options);
	latest.current = options;
	// Monotonic token for every write to `record` (load, submit-adopt, delete),
	// so a slow one can never overwrite a newer record. The single token across
	// all three is what keeps "which record is showing" coherent.
	const loadToken = useRef(0);

	const onLoadRequest = useCallback(async (id: string) => {
		const token = ++loadToken.current;
		setStatus("loading");
		setError(undefined);
		try {
			const loaded = await latest.current.load(id);
			if (token !== loadToken.current) return; // superseded by a newer load
			setRecord(loaded);
			setStatus("success");
		} catch (err) {
			if (token !== loadToken.current) return;
			setError(err);
			setStatus("error");
		}
	}, []);

	const onSubmit = useCallback<SubmitFn<TData, TForm>>(async (values, ctx) => {
		// Persist, then adopt the returned record so the post-save view shows it.
		// Share the load token (it represents "which record is showing"), so a
		// load/open started before this resolves supersedes the adopt and a stale
		// save can't clobber a newer record. Mirrors the core's write-token guard.
		const token = ++loadToken.current;
		const saved = await latest.current.submit(values, ctx);
		if (token === loadToken.current) setRecord(saved);
		return saved;
	}, []);

	const onDelete = useCallback<RemoveFn>(async (id) => {
		const token = ++loadToken.current;
		await latest.current.remove?.(id);
		if (token === loadToken.current) setRecord(null);
	}, []);

	const detail = useDetail<TData, TForm>({
		getRowId: options.getRowId,
		record,
		status,
		error,
		onLoadRequest,
		onSubmit,
		// Wire delete only when a remover is configured, so the core's remove()
		// stays a no-op otherwise and never reconciles a phantom delete.
		onDelete: options.remove ? onDelete : undefined,
		master: options.master,
		isDirty: options.isDirty,
		confirmDiscard: options.confirmDiscard,
		initialMode: options.initialMode,
	});

	// Entering create performs no load, so reset the load-scoped state. Keyed on
	// the resolved mode, this runs only once a (possibly guarded) transition has
	// actually landed on create, never when the guard declines it.
	const mode = detail.mode;
	useEffect(() => {
		if (mode === "create") {
			loadToken.current++; // cancel any in-flight load
			setRecord(null);
			setStatus("idle");
			setError(undefined);
		}
	}, [mode]);

	return detail;
}
