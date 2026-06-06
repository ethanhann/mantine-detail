import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useDirtyGuard } from "./use-dirty-guard";

function wrapper({ children }: { children: ReactNode }) {
	return (
		<MantineProvider>
			<ModalsProvider>{children}</ModalsProvider>
		</MantineProvider>
	);
}

describe("useDirtyGuard", () => {
	it("resolves true synchronously and shows no modal when clean", () => {
		// Arrange
		const { result } = renderHook(() => useDirtyGuard({ when: false }), {
			wrapper,
		});

		// Act
		const decision = result.current.confirmDiscard();

		// Assert
		expect(decision).toBe(true);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("prompts and resolves true when the user discards", async () => {
		// Arrange
		const { result } = renderHook(() => useDirtyGuard({ when: true }), {
			wrapper,
		});
		let decision: boolean | Promise<boolean> = false;
		act(() => {
			decision = result.current.confirmDiscard();
		});

		// Act
		await userEvent.click(
			await screen.findByRole("button", { name: "Discard" }),
		);

		// Assert
		await expect(Promise.resolve(decision)).resolves.toBe(true);
	});

	it("resolves false when the user keeps editing", async () => {
		// Arrange
		const { result } = renderHook(() => useDirtyGuard({ when: true }), {
			wrapper,
		});
		let decision: boolean | Promise<boolean> = true;
		act(() => {
			decision = result.current.confirmDiscard();
		});

		// Act
		await userEvent.click(
			await screen.findByRole("button", { name: "Keep editing" }),
		);

		// Assert
		await expect(Promise.resolve(decision)).resolves.toBe(false);
	});

	it("renders a custom title, message, and labels", async () => {
		// Arrange
		const { result } = renderHook(
			() =>
				useDirtyGuard({
					when: true,
					title: "Wait!",
					message: "Toss your changes?",
					labels: { confirm: "Toss", cancel: "Stay" },
				}),
			{ wrapper },
		);

		// Act
		act(() => {
			result.current.confirmDiscard();
		});

		// Assert
		expect(await screen.findByText("Wait!")).toBeInTheDocument();
		expect(screen.getByText("Toss your changes?")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Toss" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Stay" })).toBeInTheDocument();
	});

	it("mirrors `when` in isDirty", () => {
		// Arrange
		const { result, rerender } = renderHook(
			({ when }) => useDirtyGuard({ when }),
			{
				wrapper,
				initialProps: { when: true },
			},
		);

		// Assert
		expect(result.current.isDirty).toBe(true);

		// Act
		rerender({ when: false });

		// Assert
		expect(result.current.isDirty).toBe(false);
	});
});
