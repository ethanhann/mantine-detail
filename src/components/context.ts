import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { UseDetailReturn } from "../types";
import type { DetailSlots } from "./types";

export interface DetailContextValue {
	/** Generics are erased here; the public `<Detail>` props keep them typed. */
	detail: UseDetailReturn<unknown, unknown>;
	/** Resolved dirty signal (prop overrides `detail.isDirty`). */
	isDirty: boolean;
	title?: ReactNode;
	slots: DetailSlots<unknown, unknown>;
	/** Close, routed through the dirty guard. */
	requestClose: () => void;
	/** Cancel: revert to view in edit, close in create. Both guarded. */
	requestCancel: () => void;
}

export const DetailContext = createContext<DetailContextValue | null>(null);

export function useDetailContext(): DetailContextValue {
	const ctx = useContext(DetailContext);
	if (!ctx) {
		throw new Error(
			"<Detail.Header /> / <Detail.Body /> / <Detail.Actions /> must be rendered inside <Detail>.",
		);
	}
	return ctx;
}
