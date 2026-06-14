import type { ComponentType, ReactNode } from "react";
import type { ConfirmDiscardFn, UseDetailReturn } from "../types";

/** Where the detail surface is presented. `inline` adds no chrome (use on a route). */
export type Presentation = "drawer" | "modal" | "panel" | "inline";

/**
 * Render overrides for the standard parts. `Header` / `Actions` receive the
 * live `detail`; `LoadingDetail` / `ErrorState` replace the body's load states.
 */
export interface DetailSlots<TData = unknown, TForm = TData> {
	Header?: ComponentType<{ detail: UseDetailReturn<TData, TForm> }>;
	Actions?: ComponentType<{ detail: UseDetailReturn<TData, TForm> }>;
	LoadingDetail?: ComponentType;
	/** Replaces the body's load-error state. Receives the load `error` so it can
	 * render a meaningful message, plus `retry` to re-emit `load()`. */
	ErrorState?: ComponentType<{ retry: () => void; error?: unknown }>;
}

export interface DetailProps<TData, TForm = TData> {
	/** The lifecycle from `useDetail` / `useDetailFetcher`. */
	detail: UseDetailReturn<TData, TForm>;
	/** Presentation surface. Defaults to `panel`. */
	presentation?: Presentation;
	/**
	 * Live dirty signal from your form. When provided it overrides
	 * `detail.isDirty` as the source the guard and Actions read.
	 */
	isDirty?: boolean;
	/**
	 * Confirm gate for close/cancel when the form lives inside `<Detail>` (the
	 * `isDirty`-prop path). Typically `useDirtyGuard().confirmDiscard`. Consulted
	 * only when the `isDirty` prop is provided; otherwise the hook's own
	 * `confirmDiscard` guards programmatic transitions.
	 */
	confirmDiscard?: ConfirmDiscardFn;
	/** Default title for `<Detail.Header>` (per-Header `title` wins). */
	title?: ReactNode;
	/** Render overrides for the standard parts. */
	slots?: DetailSlots<TData, TForm>;
	children?: ReactNode;
}

export interface DetailHeaderProps {
	/** Overrides the title for this header (falls back to `<Detail title>`). */
	title?: ReactNode;
}

export interface DetailBodyProps {
	children?: ReactNode;
}

export interface DetailActionsProps {
	/**
	 * Invoked by the Save button. The hook never owns form values, so the bare
	 * `<Detail.Actions>` needs this to submit, e.g.
	 * `onSave={() => detail.save(form.getValues())}`. It must handle its own
	 * errors (the shipped adapters route them through `detail.save`, which
	 * surfaces them on `detail.submitError`); a rejection here is not caught.
	 */
	onSave?: () => void | Promise<void>;
	/** Show a Delete button in view/edit modes. */
	deletable?: boolean;
	saveLabel?: ReactNode;
	cancelLabel?: ReactNode;
	deleteLabel?: ReactNode;
	closeLabel?: ReactNode;
}
