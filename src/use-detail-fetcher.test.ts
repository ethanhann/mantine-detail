import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	MasterBinding,
	ReconcileEvent,
	UseDetailFetcherOptions,
} from "./types";
import { useDetailFetcher } from "./use-detail-fetcher";

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

/** A promise plus its externalised resolve, for driving in-flight states. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function setup(overrides: Partial<UseDetailFetcherOptions<User>> = {}) {
	const load = vi.fn(async (id: string) => ({ id, name: `User ${id}` }));
	const submit = vi.fn(
		async (values: User, ctx: { mode: string; id?: string }) => ({
			id: ctx.id ?? "new-1",
			name: values.name,
		}),
	);
	const remove = vi.fn(async () => {});
	const master = makeMaster();

	const options: UseDetailFetcherOptions<User> = {
		getRowId: (row) => row.id,
		load,
		submit,
		remove,
		master,
		...overrides,
	};

	const view = renderHook(
		(props: UseDetailFetcherOptions<User>) => useDetailFetcher(props),
		{
			initialProps: options,
		},
	);

	return { ...view, load, submit, remove, master, options };
}

describe("useDetailFetcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("load lifecycle", () => {
		it("open() transitions loading → success and stores the loaded record", async () => {
			// Arrange
			const { result, load } = setup();

			// Act
			await act(async () => {
				result.current.open("7");
			});

			// Assert
			expect(load).toHaveBeenCalledWith("7");
			expect(result.current.status).toBe("success");
			expect(result.current.record).toEqual({ id: "7", name: "User 7" });
		});

		it("reports loading while the fetch is in flight", async () => {
			// Arrange: a load we can hold open
			const gate = deferred<User>();
			const load = vi.fn(() => gate.promise);
			const { result } = setup({ load });

			// Act: start the load
			act(() => {
				result.current.open("7");
			});

			// Assert: in flight
			expect(result.current.status).toBe("loading");

			// Act: let it resolve
			await act(async () => {
				gate.resolve({ id: "7", name: "Ann" });
				await gate.promise;
			});

			// Assert: settled
			expect(result.current.status).toBe("success");
			expect(result.current.record).toEqual({ id: "7", name: "Ann" });
		});

		it("transitions to error and captures the cause on failure", async () => {
			// Arrange
			const boom = new Error("load failed");
			const load = vi.fn(async () => {
				throw boom;
			});
			const { result } = setup({ load });

			// Act
			await act(async () => {
				result.current.open("7");
			});

			// Assert
			expect(result.current.status).toBe("error");
			expect(result.current.error).toBe(boom);
		});

		it("ignores a stale load that resolves after a newer one", async () => {
			// Arrange: two loads, controlled independently
			const first = deferred<User>();
			const second = deferred<User>();
			const load = vi
				.fn<(id: string) => Promise<User>>()
				.mockImplementationOnce(() => first.promise)
				.mockImplementationOnce(() => second.promise);
			const { result } = setup({ load });

			// Act: open A, then B before A resolves
			act(() => {
				result.current.open("A");
			});
			act(() => {
				result.current.open("B");
			});

			// Act: resolve the newer load first, then the stale one
			await act(async () => {
				second.resolve({ id: "B", name: "Bee" });
				await second.promise;
			});
			await act(async () => {
				first.resolve({ id: "A", name: "Ay" });
				await first.promise;
			});

			// Assert: the newer load wins
			expect(result.current.record).toEqual({ id: "B", name: "Bee" });
			expect(result.current.status).toBe("success");
		});
	});

	describe("retry", () => {
		it("re-runs load for the last opened id", async () => {
			// Arrange
			const { result, load } = setup();
			await act(async () => {
				result.current.open("7");
			});
			load.mockClear();

			// Act
			await act(async () => {
				result.current.retry();
			});

			// Assert
			expect(load).toHaveBeenCalledWith("7");
		});
	});

	describe("save → reconcile", () => {
		it("persists an edit, adopts the returned record, and reconciles 'saved'", async () => {
			// Arrange
			const { result, submit, master } = setup({ initialMode: "edit" });
			await act(async () => {
				result.current.open("1", "edit");
			});

			// Act
			await act(async () => {
				await result.current.save({ id: "1", name: "Annabel" });
			});

			// Assert
			expect(submit).toHaveBeenCalledWith(
				{ id: "1", name: "Annabel" },
				{ mode: "edit", id: "1" },
			);
			expect(result.current.record).toEqual({ id: "1", name: "Annabel" });
			expect(master.reconcile).toHaveBeenCalledWith({
				type: "saved",
				record: { id: "1", name: "Annabel" },
			});
			expect(result.current.mode).toBe("view");
		});

		it("creates, adopts the new record, and reconciles 'created'", async () => {
			// Arrange
			const { result, submit, master } = setup({ initialMode: "create" });
			act(() => {
				result.current.openCreate();
			});

			// Act
			await act(async () => {
				await result.current.save({ id: "", name: "Zed" });
			});

			// Assert
			expect(submit).toHaveBeenCalledWith(
				{ id: "", name: "Zed" },
				{ mode: "create" },
			);
			expect(master.reconcile).toHaveBeenCalledWith({
				type: "created",
				record: { id: "new-1", name: "Zed" },
			});
			expect(result.current.record).toEqual({ id: "new-1", name: "Zed" });
			expect(result.current.mode).toBe("view");
		});
	});

	describe("remove → reconcile", () => {
		it("deletes, reconciles 'deleted', clears the record, and closes", async () => {
			// Arrange
			const { result, remove, master } = setup({ initialMode: "edit" });
			await act(async () => {
				result.current.open("1", "edit");
			});

			// Act
			await act(async () => {
				await result.current.remove();
			});

			// Assert
			expect(remove).toHaveBeenCalledWith("1");
			expect(master.reconcile).toHaveBeenCalledWith({
				type: "deleted",
				id: "1",
			});
			expect(result.current.record).toBeNull();
			expect(result.current.isOpen).toBe(false);
		});

		it("is a no-op when no remover is configured", async () => {
			// Arrange
			const { result, master } = setup({
				initialMode: "edit",
				remove: undefined,
			});
			await act(async () => {
				result.current.open("1", "edit");
			});

			// Act
			await act(async () => {
				await result.current.remove();
			});

			// Assert: nothing reconciled, detail stays open
			expect(master.reconcile).not.toHaveBeenCalled();
			expect(result.current.isOpen).toBe(true);
		});
	});

	describe("create reset & passthrough", () => {
		it("openCreate clears any previously loaded record and load state", async () => {
			// Arrange: load a record first
			const { result } = setup();
			await act(async () => {
				result.current.open("7");
			});
			expect(result.current.record).not.toBeNull();

			// Act
			await act(async () => {
				result.current.openCreate();
			});

			// Assert
			expect(result.current.record).toBeNull();
			expect(result.current.status).toBe("idle");
			expect(result.current.mode).toBe("create");
		});

		it("honors initialMode and isDirty passthrough", () => {
			// Arrange / Act
			const { result } = setup({ initialMode: "create", isDirty: true });

			// Assert
			expect(result.current.mode).toBe("create");
			expect(result.current.isDirty).toBe(true);
		});
	});
});
