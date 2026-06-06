import type { UseDataViewReturn } from "@ethanhann/mantine-dataview";
import { useCallback, useRef, useState } from "react";
import type {
	MasterBinding,
	ReconcileEvent,
	ReconcileStrategy,
} from "../types";

/** Options for {@link bindDataView}. */
export interface BindDataViewOptions {
	/**
	 * How lifecycle events are applied to the list (see {@link ReconcileStrategy}).
	 *
	 * - `"refetch"` (default) calls `view.refetch()` after every event. It is
	 *   always server truth at one round-trip per write.
	 * - `"patch"` applies the change in place via dataview's `patchRow`,
	 *   `insertRow`, and `removeRow` for instant feedback. dataview then
	 *   revalidates in the background to reconcile sort, filter membership,
	 *   paging, and facet counts. Requires `@ethanhann/mantine-dataview` >= 0.8.
	 */
	strategy?: ReconcileStrategy;
}

/**
 * Bind a `@ethanhann/mantine-dataview` instance (the return of `useDataView` /
 * `useDataViewFetcher`) as the master for a detail. Maps each lifecycle event
 * onto the master so saves/creates/deletes show up in the list.
 *
 * With the default `"refetch"` strategy, every event calls the master's existing
 * `refetch()`, so dataview needs no new API and the list always matches server
 * truth. With `"patch"`, events map onto dataview's in-place primitives
 * (`patchRow`/`insertRow`/`removeRow`, available in dataview >= 0.8): the row
 * updates instantly and dataview revalidates in the background. The optimistic
 * view is best-effort; the background fetch is the source of truth.
 *
 * This is a hook. Call it unconditionally during render (exported as
 * `bindDataView` for ergonomic call sites: `master: bindDataView(view)`). It
 * owns `activeId` (the record open in the detail, for row highlighting)
 * independently of dataview's checkbox `selection`, which drives bulk actions.
 *
 * @example
 * const view = useDataViewFetcher<User>({ columns, getRowId, fetcher });
 * const detail = useDetailFetcher<User>({
 *   getRowId, load, submit,
 *   master: bindDataView(view, { strategy: "patch" }),
 * });
 * // Optional sync indicator while dataview revalidates after an optimistic write:
 * {view.isRevalidating && <Loader size="xs" />}
 */
function useDataViewMaster<TData>(
	view: UseDataViewReturn<TData>,
	options: BindDataViewOptions = {},
): MasterBinding<TData> {
	const [activeId, setActiveId] = useState<string | null>(null);

	// Read the latest view/options imperatively so reconcile() stays referentially
	// stable even though dataview returns a fresh instance each render.
	const viewRef = useRef(view);
	viewRef.current = view;
	const strategyRef = useRef(options.strategy);
	strategyRef.current = options.strategy;

	const setActive = useCallback((id: string | null) => {
		setActiveId(id);
	}, []);

	const reconcile = useCallback((event: ReconcileEvent<TData>) => {
		const v = viewRef.current;

		// "refetch" (default): a full round-trip guarantees the list matches
		// server truth, meaning filter membership, sort position, page, and facet
		// counts, which under server-side filtering only the server can know.
		if (strategyRef.current !== "patch") {
			v.refetch();
			return;
		}

		// "patch": apply in place for instant feedback. dataview schedules a
		// background revalidate after each primitive, so server truth still wins.
		// A row that no longer matches the filter disappears, an off-page create is
		// repositioned, and counts correct themselves.
		switch (event.type) {
			case "saved":
				v.patchRow(event.record);
				return;
			case "created":
				v.insertRow(event.record);
				return;
			case "deleted":
				v.removeRow(event.id);
				return;
			default: {
				// Exhaustiveness guard: a new ReconcileEvent variant surfaces here.
				const _exhaustive: never = event;
				return _exhaustive;
			}
		}
	}, []);

	return { activeId, setActive, reconcile };
}

export { useDataViewMaster as bindDataView };
