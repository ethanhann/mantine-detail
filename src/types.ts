// Core public types for @ethanhann/mantine-detail.

/** The record lifecycle mode the detail is currently in. */
export type DetailMode = "view" | "edit" | "create";

/** Modes that perform a write (`view` is read-only). */
export type WriteMode = Exclude<DetailMode, "view">;

/** Modes a record can be opened into via `open()` (create has its own entry). */
export type OpenMode = Exclude<DetailMode, "create">;

/**
 * Lifecycle of the `load()` round-trip only. Submit and delete have their own
 * `isSubmitting` / `isDeleting` flags on the hook return. `status` never
 * reflects a write.
 */
export type DetailStatus = "idle" | "loading" | "success" | "error";

/** Context passed to a submit callback, identifying the write being performed. */
export interface SubmitContext {
	mode: WriteMode;
	/** Present for `edit`, absent for `create`. */
	id?: string;
}

/** Fetch a single record for view/edit. Not called in create mode. */
export type LoadFn<TData> = (id: string) => Promise<NoInfer<TData>>;

/** Create or update a record; resolves with the persisted record. */
export type SubmitFn<TData, TForm> = (
	values: NoInfer<TForm>,
	ctx: SubmitContext,
) => Promise<NoInfer<TData>>;

/** Delete a record by id. */
export type RemoveFn = (id: string) => Promise<void>;

/**
 * Asks the user to confirm discarding unsaved changes; resolves/returns `true`
 * to proceed with the transition, `false` to abort. Typically supplied by
 * `useDirtyGuard`. When omitted, guarded transitions proceed immediately.
 */
export type ConfirmDiscardFn = () => boolean | Promise<boolean>;

/**
 * What the optional form-layer adapters (`/mantine-form`, `/react-hook-form`)
 * return. Feed `isDirty` to `<Detail isDirty>` / `useDirtyGuard`, and `onSave`
 * to `<Detail.Actions onSave>`.
 */
export interface FormDetailBinding {
	/** The form's dirty state. */
	isDirty: boolean;
	/** Validate, then `detail.save(values)`. */
	onSave: () => Promise<void>;
}

/**
 * A lifecycle result to apply to the master list. Discriminated on `type`;
 * reconcilers should `switch` exhaustively.
 */
export type ReconcileEvent<TData> =
	| { type: "saved"; record: TData }
	| { type: "created"; record: TData }
	| { type: "deleted"; id: string };

/**
 * How a {@link ReconcileEvent} is applied to the master.
 *
 * - `"refetch"` re-emits the master's request after every write. It always
 *   matches server truth (filter membership, sort, paging, facets) at the cost
 *   of one round-trip per write. This is the safe default.
 * - `"patch"` applies the change in place for instant feedback, then lets the
 *   master revalidate in the background (stale-while-revalidate). Requires a
 *   master that exposes in-place mutation primitives; `bindDataView` maps this
 *   onto `@ethanhann/mantine-dataview` >= 0.8's `patchRow`/`insertRow`/`removeRow`.
 *   The optimistic step is best-effort; the background fetch is the source of
 *   truth.
 */
export type ReconcileStrategy = "refetch" | "patch";

/**
 * The only seam between this library and a master list. Maps the active record
 * (for row highlight) and applies lifecycle results. `bindDataView` is one
 * implementation; any list can be bound.
 */
export interface MasterBinding<TData> {
	/** The record whose detail is currently active (distinct from bulk selection). */
	activeId: string | null;
	setActive: (id: string | null) => void;
	/** Apply a lifecycle result to the master list. */
	reconcile: (event: ReconcileEvent<TData>) => void;
}

/**
 * Options for the headless, fully controlled core. You supply `record` / `status`
 * and respond to `onLoadRequest`. The hook owns when save/delete run and
 * what happens after (reconcile, close), never the field state.
 * `useDetailFetcher` is a thin wrapper over this.
 */
export interface UseDetailOptions<TData, TForm = TData> {
	getRowId: (row: TData) => string;

	/** The currently loaded record (controlled), or `null`. */
	record: TData | null;
	/** Lifecycle of the current load (controlled). */
	status: DetailStatus;
	/** Last load error, if any. */
	error?: unknown;

	/** Called when the hook needs a record loaded (e.g. on `open(id)`). */
	onLoadRequest?: (id: string) => void;
	/** Invoked by `save(values)`; resolves with the persisted record. */
	onSubmit?: SubmitFn<TData, TForm>;
	/** Invoked by `remove()`. */
	onDelete?: RemoveFn;

	/** Bind to a master so saves/creates/deletes reconcile into the list. */
	master?: MasterBinding<TData>;
	/**
	 * Reconciliation strategy hint. For the dataview binding the strategy is
	 * configured on `bindDataView(view, { strategy })` (only the binding can
	 * mutate the list in place), so this option is informational there.
	 */
	reconcile?: ReconcileStrategy;

	/**
	 * Delegated dirty signal from your form. Use when dirtiness is known at
	 * hook-call site. The `<Detail isDirty>` prop takes precedence if provided.
	 */
	isDirty?: boolean;

	/**
	 * Confirmation gate for transitions that would discard unsaved edits
	 * (`close`, cancel/revert via `setMode`, and re-opening). Consulted only
	 * while dirty and in a write mode.
	 */
	confirmDiscard?: ConfirmDiscardFn;

	initialMode?: DetailMode;
}

/**
 * Options for the recommended path. You provide `load` / `submit` / `remove`;
 * the hook orchestrates mode, status, dirty, open/close, and reconciliation.
 */
export interface UseDetailFetcherOptions<TData, TForm = TData> {
	getRowId: (row: TData) => string;

	/** Fetch a single record for view/edit. Not called in create mode. */
	load: LoadFn<TData>;

	/** Create or update. Returns the persisted record. */
	submit: SubmitFn<TData, TForm>;

	/** Optional delete. */
	remove?: RemoveFn;

	/** Bind to a master so saves/creates/deletes reconcile into the list. */
	master?: MasterBinding<TData>;

	/**
	 * Reconciliation strategy hint. For the dataview binding the strategy is
	 * configured on `bindDataView(view, { strategy })` (only the binding can
	 * mutate the list in place), so this option is informational there.
	 */
	reconcile?: ReconcileStrategy;

	/** Delegated dirty signal from your form (see {@link UseDetailOptions.isDirty}). */
	isDirty?: boolean;

	/** Confirmation gate for discard-prone transitions (see {@link UseDetailOptions.confirmDiscard}). */
	confirmDiscard?: ConfirmDiscardFn;

	initialMode?: DetailMode;
}

/** What both `useDetail` and `useDetailFetcher` return. */
export interface UseDetailReturn<TData, TForm = TData> {
	mode: DetailMode;
	record: TData | null;

	/** Lifecycle of the `load()` round-trip only (not writes). */
	status: DetailStatus;
	/** Last load error (see {@link submitError} for write failures). */
	error?: unknown;
	/** A `save()` round-trip is in flight. */
	isSubmitting: boolean;
	/** A `remove()` round-trip is in flight. */
	isDeleting: boolean;
	/** Last `save()`/`remove()` error, distinct from a load error. */
	submitError?: unknown;

	isOpen: boolean;
	isDirty: boolean;

	/** Open a record for view/edit; loads via `load()` (defaults to `view`). */
	open: (id: string, mode?: OpenMode) => void;
	/** Open a blank form in `create` mode; no load. */
	openCreate: () => void;
	/** Switch mode (e.g. `view` → `edit`); routed through the dirty guard. */
	setMode: (mode: DetailMode) => void;
	/** Close the detail; honors the dirty guard. */
	close: () => void;

	/** `submit()` → `reconcile()`; manages `isSubmitting` / `submitError`. */
	save: (values: TForm) => Promise<void>;
	/** `remove()` → `reconcile()`; manages `isDeleting`. No-op without an active id. */
	remove: () => Promise<void>;

	/**
	 * Re-emit the current `load()`. Recovers from a load error only. A failed
	 * `save()` is retried by re-invoking `save(values)` with the form's values,
	 * since the hook never owns form state.
	 */
	retry: () => void;
}
