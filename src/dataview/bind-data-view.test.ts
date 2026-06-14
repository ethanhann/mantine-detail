import type { UseDataViewReturn } from "@ethanhann/mantine-dataview";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReconcileEvent } from "../types";
import { bindDataView } from "./bind-data-view";

interface User {
	id: string;
	name: string;
}

/**
 * A minimal stand-in for a dataview instance. `refetch` and the in-place
 * primitives (`patchRow`/`insertRow`/`removeRow`) are exercised by the binding;
 * `selection` is included so we can assert it is never touched.
 */
function makeView() {
	const refetch = vi.fn();
	const patchRow = vi.fn();
	const insertRow = vi.fn();
	const removeRow = vi.fn();
	const clearSelection = vi.fn();
	const selection = {
		count: 1,
		ids: ["other"],
		rows: [],
		clear: clearSelection,
	};
	const view = {
		refetch,
		patchRow,
		insertRow,
		removeRow,
		selection,
	} as unknown as UseDataViewReturn<User>;
	return {
		view,
		refetch,
		patchRow,
		insertRow,
		removeRow,
		selection,
		clearSelection,
	};
}

function renderBinding(
	view: UseDataViewReturn<User>,
	options?: Parameters<typeof bindDataView<User>>[1],
) {
	return renderHook(
		({ v }: { v: UseDataViewReturn<User> }) => bindDataView<User>(v, options),
		{
			initialProps: { v: view },
		},
	);
}

describe("bindDataView", () => {
	describe("reconcile → refetch", () => {
		it("refetches on a 'saved' event", () => {
			// Arrange
			const { view, refetch } = makeView();
			const { result } = renderBinding(view);

			// Act
			act(() =>
				result.current.reconcile({
					type: "saved",
					record: { id: "1", name: "Ann" },
				}),
			);

			// Assert
			expect(refetch).toHaveBeenCalledTimes(1);
		});

		it("refetches on a 'created' event", () => {
			// Arrange
			const { view, refetch } = makeView();
			const { result } = renderBinding(view);

			// Act
			act(() =>
				result.current.reconcile({
					type: "created",
					record: { id: "2", name: "Bee" },
				}),
			);

			// Assert
			expect(refetch).toHaveBeenCalledTimes(1);
		});

		it("refetches on a 'deleted' event", () => {
			// Arrange
			const { view, refetch } = makeView();
			const { result } = renderBinding(view);

			// Act
			act(() => result.current.reconcile({ type: "deleted", id: "3" }));

			// Assert
			expect(refetch).toHaveBeenCalledTimes(1);
		});

		it("refetches once per event across a full lifecycle", () => {
			// Arrange
			const { view, refetch } = makeView();
			const { result } = renderBinding(view);
			const events: ReconcileEvent<User>[] = [
				{ type: "created", record: { id: "1", name: "Ann" } },
				{ type: "saved", record: { id: "1", name: "Annabel" } },
				{ type: "deleted", id: "1" },
			];

			// Act
			act(() => {
				for (const event of events) result.current.reconcile(event);
			});

			// Assert
			expect(refetch).toHaveBeenCalledTimes(3);
		});

		it("refetches when strategy is set to 'refetch' explicitly", () => {
			// Arrange
			const { view, refetch, patchRow } = makeView();
			const { result } = renderBinding(view, { strategy: "refetch" });

			// Act
			act(() =>
				result.current.reconcile({
					type: "saved",
					record: { id: "1", name: "Ann" },
				}),
			);

			// Assert
			expect(refetch).toHaveBeenCalledTimes(1);
			expect(patchRow).not.toHaveBeenCalled();
		});
	});

	describe("reconcile → patch", () => {
		it("maps 'saved' to patchRow without refetching", () => {
			// Arrange
			const { view, refetch, patchRow } = makeView();
			const { result } = renderBinding(view, { strategy: "patch" });
			const record = { id: "1", name: "Ann" };

			// Act
			act(() => result.current.reconcile({ type: "saved", record }));

			// Assert: in-place mutation, no eager round-trip (dataview revalidates)
			expect(patchRow).toHaveBeenCalledWith(record);
			expect(refetch).not.toHaveBeenCalled();
		});

		it("maps 'created' to insertRow", () => {
			// Arrange
			const { view, insertRow, refetch } = makeView();
			const { result } = renderBinding(view, { strategy: "patch" });
			const record = { id: "2", name: "Bee" };

			// Act
			act(() => result.current.reconcile({ type: "created", record }));

			// Assert
			expect(insertRow).toHaveBeenCalledWith(record);
			expect(refetch).not.toHaveBeenCalled();
		});

		it("maps 'deleted' to removeRow by id", () => {
			// Arrange
			const { view, removeRow, refetch } = makeView();
			const { result } = renderBinding(view, { strategy: "patch" });

			// Act
			act(() => result.current.reconcile({ type: "deleted", id: "3" }));

			// Assert
			expect(removeRow).toHaveBeenCalledWith("3");
			expect(refetch).not.toHaveBeenCalled();
		});

		it("dispatches one primitive per event across a full lifecycle", () => {
			// Arrange
			const { view, patchRow, insertRow, removeRow } = makeView();
			const { result } = renderBinding(view, { strategy: "patch" });
			const events: ReconcileEvent<User>[] = [
				{ type: "created", record: { id: "1", name: "Ann" } },
				{ type: "saved", record: { id: "1", name: "Annabel" } },
				{ type: "deleted", id: "1" },
			];

			// Act
			act(() => {
				for (const event of events) result.current.reconcile(event);
			});

			// Assert
			expect(insertRow).toHaveBeenCalledTimes(1);
			expect(patchRow).toHaveBeenCalledTimes(1);
			expect(removeRow).toHaveBeenCalledTimes(1);
		});
	});

	describe("reconcile → patch fallback (dataview < 0.8)", () => {
		it("falls back to refetch when the in-place primitives are missing", () => {
			// Arrange: a view without patchRow/insertRow/removeRow
			const refetch = vi.fn();
			const view = { refetch } as unknown as UseDataViewReturn<User>;
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const { result } = renderBinding(view, { strategy: "patch" });

			// Act
			act(() =>
				result.current.reconcile({
					type: "saved",
					record: { id: "1", name: "Ann" },
				}),
			);

			// Assert: degrades to a full refetch rather than throwing
			expect(refetch).toHaveBeenCalledTimes(1);
			expect(warn).toHaveBeenCalledTimes(1);
			warn.mockRestore();
		});
	});

	describe("activeId (independent of bulk selection)", () => {
		it("starts with no active record", () => {
			// Arrange / Act
			const { view } = makeView();
			const { result } = renderBinding(view);

			// Assert
			expect(result.current.activeId).toBeNull();
		});

		it("setActive updates activeId without touching dataview's selection", () => {
			// Arrange
			const { view, selection, clearSelection } = makeView();
			const { result } = renderBinding(view);

			// Act
			act(() => result.current.setActive("42"));

			// Assert: active record tracked here, bulk selection left alone
			expect(result.current.activeId).toBe("42");
			expect(clearSelection).not.toHaveBeenCalled();
			expect(selection.ids).toEqual(["other"]);
		});

		it("setActive(null) clears the active record", () => {
			// Arrange
			const { view } = makeView();
			const { result } = renderBinding(view);
			act(() => result.current.setActive("42"));

			// Act
			act(() => result.current.setActive(null));

			// Assert
			expect(result.current.activeId).toBeNull();
		});
	});
});
