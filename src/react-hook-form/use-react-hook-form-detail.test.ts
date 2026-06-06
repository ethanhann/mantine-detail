import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { DetailMode, UseDetailReturn } from "../types";
import { useReactHookFormDetail } from "./use-react-hook-form-detail";

interface User {
	id: string;
	name: string;
}
type UserForm = { name: string };

function baseDetail(
	save: UseDetailReturn<User, UserForm>["save"],
): UseDetailReturn<User, UserForm> {
	return {
		mode: "edit",
		record: null,
		status: "success",
		error: undefined,
		isSubmitting: false,
		isDeleting: false,
		submitError: undefined,
		isOpen: true,
		isDirty: false,
		open: vi.fn(),
		openCreate: vi.fn(),
		setMode: vi.fn(),
		close: vi.fn(),
		save,
		remove: vi.fn(async () => {}),
		retry: vi.fn(),
	};
}

function setup(initial: { record: User | null; mode: DetailMode }) {
	const save = vi.fn(async () => {});
	const utils = renderHook(
		({ record, mode }: { record: User | null; mode: DetailMode }) => {
			const form = useForm<UserForm>({ defaultValues: { name: "" } });
			form.register("name", { required: "Required" });
			const detail = { ...baseDetail(save), record, mode };
			const bind = useReactHookFormDetail(detail, form, {
				toForm: (r) => ({ name: r.name }),
			});
			return { form, bind };
		},
		{ initialProps: initial },
	);
	return { ...utils, save };
}

describe("useReactHookFormDetail", () => {
	it("resets the form to each loaded record and starts pristine", () => {
		// Arrange / Act
		const { result, rerender } = setup({
			record: { id: "1", name: "Ann" },
			mode: "edit",
		});

		// Assert
		expect(result.current.form.getValues()).toEqual({ name: "Ann" });
		expect(result.current.bind.isDirty).toBe(false);

		// Act: a new record loads
		rerender({ record: { id: "2", name: "Bee" }, mode: "edit" });

		// Assert
		expect(result.current.form.getValues()).toEqual({ name: "Bee" });
		expect(result.current.bind.isDirty).toBe(false);
	});

	it("surfaces isDirty once the form is edited", () => {
		// Arrange
		const { result } = setup({
			record: { id: "1", name: "Ann" },
			mode: "edit",
		});
		expect(result.current.bind.isDirty).toBe(false);

		// Act
		act(() =>
			result.current.form.setValue("name", "Changed", { shouldDirty: true }),
		);

		// Assert
		expect(result.current.bind.isDirty).toBe(true);
	});

	it("onSave validates then saves the current values", async () => {
		// Arrange
		const { result, save } = setup({
			record: { id: "1", name: "Ann" },
			mode: "edit",
		});
		act(() =>
			result.current.form.setValue("name", "Annabel", { shouldDirty: true }),
		);

		// Act
		await act(async () => {
			await result.current.bind.onSave();
		});

		// Assert
		expect(save).toHaveBeenCalledWith({ name: "Annabel" });
	});

	it("onSave does not save when validation fails", async () => {
		// Arrange
		const { result, save } = setup({
			record: { id: "1", name: "Ann" },
			mode: "edit",
		});
		act(() => result.current.form.setValue("name", "", { shouldDirty: true }));

		// Act
		await act(async () => {
			await result.current.bind.onSave();
		});

		// Assert
		expect(save).not.toHaveBeenCalled();
	});

	it("resets to default values when entering create", () => {
		// Arrange
		const { result, rerender } = setup({
			record: { id: "1", name: "Ann" },
			mode: "edit",
		});

		// Act
		rerender({ record: null, mode: "create" });

		// Assert
		expect(result.current.form.getValues()).toEqual({ name: "" });
	});
});
