import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterBinding, ReconcileEvent, UseDetailOptions } from "./types";
import { useDetail } from "./use-detail";

interface User {
	id: string;
	name: string;
}

/** A master binding whose `setActive` / `reconcile` are spies. */
function makeMaster(): MasterBinding<User> {
	return {
		activeId: null,
		setActive: vi.fn<(id: string | null) => void>(),
		reconcile: vi.fn<(event: ReconcileEvent<User>) => void>(),
	};
}

/** A promise plus its externalised resolve/reject, for driving in-flight states. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function setup(overrides: Partial<UseDetailOptions<User>> = {}) {
	const onLoadRequest = vi.fn();
	const onSubmit = vi.fn(
		async (values: User, ctx: { mode: string; id?: string }) => ({
			id: ctx.id ?? "new-1",
			name: values.name,
		}),
	);
	const onDelete = vi.fn(async () => {});
	const master = makeMaster();

	const options: UseDetailOptions<User> = {
		getRowId: (row) => row.id,
		record: null,
		status: "idle",
		onLoadRequest,
		onSubmit,
		onDelete,
		master,
		...overrides,
	};

	const view = renderHook((props: UseDetailOptions<User>) => useDetail(props), {
		initialProps: options,
	});

	return { ...view, options, onLoadRequest, onSubmit, onDelete, master };
}

describe("useDetail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("initial state", () => {
		it("starts closed, in the initial mode, with no in-flight writes", () => {
			// Arrange / Act
			const { result } = setup({ initialMode: "create" });

			// Assert
			expect(result.current.mode).toBe("create");
			expect(result.current.isOpen).toBe(false);
			expect(result.current.isSubmitting).toBe(false);
			expect(result.current.isDeleting).toBe(false);
			expect(result.current.submitError).toBeUndefined();
		});

		it("defaults to view mode when no initialMode is given", () => {
			// Arrange / Act
			const { result } = setup();

			// Assert
			expect(result.current.mode).toBe("view");
		});

		it("surfaces controlled record / status / error straight through", () => {
			// Arrange
			const record = { id: "7", name: "Ann" };

			// Act
			const { result } = setup({ record, status: "success", error: undefined });

			// Assert
			expect(result.current.record).toEqual(record);
			expect(result.current.status).toBe("success");
		});
	});

	describe("open / openCreate", () => {
		it("requests a load, marks the row active, and opens in view by default", () => {
			// Arrange
			const { result, onLoadRequest, master } = setup();

			// Act
			act(() => result.current.open("42"));

			// Assert
			expect(onLoadRequest).toHaveBeenCalledWith("42");
			expect(master.setActive).toHaveBeenCalledWith("42");
			expect(result.current.mode).toBe("view");
			expect(result.current.isOpen).toBe(true);
		});

		it("can open directly into edit mode", () => {
			// Arrange
			const { result } = setup();

			// Act
			act(() => result.current.open("42", "edit"));

			// Assert
			expect(result.current.mode).toBe("edit");
		});

		it("openCreate opens a blank create with no load and clears the active row", () => {
			// Arrange
			const { result, onLoadRequest, master } = setup();

			// Act
			act(() => result.current.openCreate());

			// Assert
			expect(result.current.mode).toBe("create");
			expect(result.current.isOpen).toBe(true);
			expect(onLoadRequest).not.toHaveBeenCalled();
			expect(master.setActive).toHaveBeenCalledWith(null);
		});
	});

	describe("setMode (dirty guard)", () => {
		it("enters edit from view without invoking the guard", () => {
			// Arrange
			const confirmDiscard = vi.fn(() => true);
			const { result } = setup({
				initialMode: "view",
				isDirty: true,
				confirmDiscard,
			});

			// Act
			act(() => result.current.setMode("edit"));

			// Assert: leaving view never discards edits, so no prompt
			expect(confirmDiscard).not.toHaveBeenCalled();
			expect(result.current.mode).toBe("edit");
		});

		it("routes a dirty revert through the guard and aborts when declined", () => {
			// Arrange
			const confirmDiscard = vi.fn(() => false);
			const { result } = setup({
				initialMode: "edit",
				isDirty: true,
				confirmDiscard,
			});

			// Act
			act(() => result.current.setMode("view"));

			// Assert
			expect(confirmDiscard).toHaveBeenCalledTimes(1);
			expect(result.current.mode).toBe("edit");
		});

		it("applies the revert when the guard is accepted", () => {
			// Arrange
			const confirmDiscard = vi.fn(() => true);
			const { result } = setup({
				initialMode: "edit",
				isDirty: true,
				confirmDiscard,
			});

			// Act
			act(() => result.current.setMode("view"));

			// Assert
			expect(result.current.mode).toBe("view");
		});

		it("does not prompt when not dirty", () => {
			// Arrange
			const confirmDiscard = vi.fn(() => true);
			const { result } = setup({
				initialMode: "edit",
				isDirty: false,
				confirmDiscard,
			});

			// Act
			act(() => result.current.setMode("view"));

			// Assert
			expect(confirmDiscard).not.toHaveBeenCalled();
			expect(result.current.mode).toBe("view");
		});

		it("ignores setMode('create') (create is entered via openCreate)", () => {
			// Arrange
			const { result, master } = setup({
				initialMode: "view",
				record: { id: "1", name: "Ann" },
			});
			act(() => result.current.open("1"));
			vi.mocked(master.setActive).mockClear();

			// Act: the type rejects "create"; this guards the JS-caller path.
			act(() => (result.current.setMode as (m: string) => void)("create"));

			// Assert: no half-applied create transition
			expect(result.current.mode).toBe("view");
			expect(master.setActive).not.toHaveBeenCalled();
		});
	});

	describe("write supersession & reentrancy", () => {
		it("drops a stale save's side-effects once a newer open supersedes it", async () => {
			// Arrange: a save we can hold open mid-flight
			const gate = deferred<User>();
			const onSubmit = vi.fn(() => gate.promise);
			const { result, master } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
				onSubmit,
			});

			// Act: start a save, then navigate to another record before it resolves
			let saving!: Promise<void>;
			act(() => {
				saving = result.current.save({ id: "1", name: "Annabel" });
			});
			expect(result.current.isSubmitting).toBe(true);
			act(() => result.current.open("2", "view"));

			// Act: the now-stale save resolves
			await act(async () => {
				gate.resolve({ id: "1", name: "Annabel" });
				await saving;
			});

			// Assert: the stale save neither reconciles nor hijacks the active row
			expect(master.reconcile).not.toHaveBeenCalled();
			expect(master.setActive).toHaveBeenLastCalledWith("2");
			expect(result.current.isSubmitting).toBe(false);
		});

		it("ignores a re-entrant save while one is already in flight", async () => {
			// Arrange
			const gate = deferred<User>();
			const onSubmit = vi.fn(() => gate.promise);
			const { result } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
				onSubmit,
			});

			// Act: fire two saves before the first settles
			let first!: Promise<void>;
			act(() => {
				first = result.current.save({ id: "1", name: "A" });
			});
			act(() => {
				result.current.save({ id: "1", name: "B" });
			});

			// Assert: only the first submit ran
			expect(onSubmit).toHaveBeenCalledTimes(1);

			// Cleanup
			await act(async () => {
				gate.resolve({ id: "1", name: "A" });
				await first;
			});
		});
	});

	describe("close (dirty guard)", () => {
		it("closes immediately and clears the active row when not dirty", () => {
			// Arrange
			const { result, master } = setup({ initialMode: "edit" });
			act(() => result.current.open("1", "edit"));

			// Act
			act(() => result.current.close());

			// Assert
			expect(result.current.isOpen).toBe(false);
			expect(master.setActive).toHaveBeenLastCalledWith(null);
		});

		it("is blocked while dirty, then closes once the async guard confirms", async () => {
			// Arrange: a guard whose decision we control via a pending promise
			const gate = deferred<boolean>();
			const confirmDiscard = vi.fn(() => gate.promise);
			const { result, master } = setup({
				initialMode: "edit",
				isDirty: true,
				confirmDiscard,
			});

			// Act: request close, the guard is consulted but not yet resolved
			act(() => result.current.close());

			// Assert: still open, nothing cleared
			expect(confirmDiscard).toHaveBeenCalledTimes(1);
			expect(master.setActive).not.toHaveBeenCalled();

			// Act: user confirms the discard
			await act(async () => {
				gate.resolve(true);
				await gate.promise;
			});

			// Assert: now closed and cleared
			expect(master.setActive).toHaveBeenCalledWith(null);
		});
	});

	describe("save", () => {
		it("submits an edit with id context, reconciles 'saved', and returns to view", async () => {
			// Arrange
			const record = { id: "1", name: "Ann" };
			const { result, onSubmit, master } = setup({
				initialMode: "edit",
				record,
			});

			// Act
			await act(async () => {
				await result.current.save({ id: "1", name: "Annabel" });
			});

			// Assert
			expect(onSubmit).toHaveBeenCalledWith(
				{ id: "1", name: "Annabel" },
				{ mode: "edit", id: "1" },
			);
			expect(master.reconcile).toHaveBeenCalledWith({
				type: "saved",
				record: { id: "1", name: "Annabel" },
			});
			expect(master.setActive).toHaveBeenLastCalledWith("1");
			expect(result.current.mode).toBe("view");
		});

		it("submits a create with create context and reconciles 'created'", async () => {
			// Arrange
			const { result, onSubmit, master } = setup({ initialMode: "create" });

			// Act
			await act(async () => {
				await result.current.save({ id: "", name: "Zed" });
			});

			// Assert
			expect(onSubmit).toHaveBeenCalledWith(
				{ id: "", name: "Zed" },
				{ mode: "create" },
			);
			expect(master.reconcile).toHaveBeenCalledWith({
				type: "created",
				record: { id: "new-1", name: "Zed" },
			});
			expect(master.setActive).toHaveBeenLastCalledWith("new-1");
		});

		it("toggles isSubmitting around the round-trip", async () => {
			// Arrange: a submit we can hold open mid-flight
			const gate = deferred<User>();
			const onSubmit = vi.fn(() => gate.promise);
			const { result } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
				onSubmit,
			});

			// Act: start the save without awaiting it
			let saving!: Promise<void>;
			act(() => {
				saving = result.current.save({ id: "1", name: "Ann" });
			});

			// Assert: in flight
			expect(result.current.isSubmitting).toBe(true);

			// Act: let it finish
			await act(async () => {
				gate.resolve({ id: "1", name: "Ann" });
				await saving;
			});

			// Assert: settled
			expect(result.current.isSubmitting).toBe(false);
		});

		it("records submitError and stays in edit mode on failure", async () => {
			// Arrange
			const boom = new Error("save failed");
			const onSubmit = vi.fn(async () => {
				throw boom;
			});
			const { result } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
				onSubmit,
			});

			// Act
			await act(async () => {
				await result.current.save({ id: "1", name: "Ann" });
			});

			// Assert
			expect(result.current.submitError).toBe(boom);
			expect(result.current.mode).toBe("edit");
			expect(result.current.isSubmitting).toBe(false);
		});

		it("is a no-op in view mode", async () => {
			// Arrange
			const { result, onSubmit } = setup({
				initialMode: "view",
				record: { id: "1", name: "Ann" },
			});

			// Act
			await act(async () => {
				await result.current.save({ id: "1", name: "Ann" });
			});

			// Assert
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it("resolves without throwing when no master is bound", async () => {
			// Arrange
			const { result } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
				master: undefined,
			});

			// Act / Assert: should not reject
			await act(async () => {
				await expect(
					result.current.save({ id: "1", name: "Ann" }),
				).resolves.toBeUndefined();
			});
			expect(result.current.mode).toBe("view");
		});
	});

	describe("remove", () => {
		it("deletes the active record, reconciles 'deleted', and closes", async () => {
			// Arrange
			const { result, onDelete, master } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
			});
			act(() => result.current.open("1", "edit"));

			// Act
			await act(async () => {
				await result.current.remove();
			});

			// Assert
			expect(onDelete).toHaveBeenCalledWith("1");
			expect(master.reconcile).toHaveBeenCalledWith({
				type: "deleted",
				id: "1",
			});
			expect(master.setActive).toHaveBeenLastCalledWith(null);
			expect(result.current.isOpen).toBe(false);
		});

		it("is a no-op in create mode", async () => {
			// Arrange
			const { result, onDelete } = setup({ initialMode: "create" });

			// Act
			await act(async () => {
				await result.current.remove();
			});

			// Assert
			expect(onDelete).not.toHaveBeenCalled();
		});

		it("is a no-op when there is no resolvable id", async () => {
			// Arrange: edit mode but no record and no active id
			const { result, onDelete } = setup({ initialMode: "edit", record: null });

			// Act
			await act(async () => {
				await result.current.remove();
			});

			// Assert
			expect(onDelete).not.toHaveBeenCalled();
		});

		it("records submitError on failure", async () => {
			// Arrange
			const boom = new Error("delete failed");
			const onDelete = vi.fn(async () => {
				throw boom;
			});
			const { result } = setup({
				initialMode: "edit",
				record: { id: "1", name: "Ann" },
				onDelete,
			});

			// Act
			await act(async () => {
				await result.current.remove();
			});

			// Assert
			expect(result.current.submitError).toBe(boom);
			expect(result.current.isDeleting).toBe(false);
		});
	});

	describe("retry", () => {
		it("re-emits the load for the last opened id", () => {
			// Arrange
			const { result, onLoadRequest } = setup();
			act(() => result.current.open("99", "edit"));
			onLoadRequest.mockClear();

			// Act
			act(() => result.current.retry());

			// Assert
			expect(onLoadRequest).toHaveBeenCalledWith("99");
		});

		it("is a no-op before anything has been opened", () => {
			// Arrange
			const { result, onLoadRequest } = setup();

			// Act
			act(() => result.current.retry());

			// Assert
			expect(onLoadRequest).not.toHaveBeenCalled();
		});
	});
});
