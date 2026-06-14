import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type { DetailStatus, UseDetailReturn } from "../types";
import { Detail } from "./Detail";

interface User {
	id: string;
	name: string;
}

/** A fully-stubbed lifecycle return; pass overrides to drive mode/status. */
function makeDetail(
	overrides: Partial<UseDetailReturn<User>> = {},
): UseDetailReturn<User> {
	return {
		mode: "view",
		record: { id: "1", name: "Ann" },
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
		save: vi.fn(async () => {}),
		remove: vi.fn(async () => {}),
		retry: vi.fn(),
		...overrides,
	};
}

function renderWithProvider(ui: ReactElement) {
	return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("<Detail>", () => {
	describe("structure & mode-aware actions", () => {
		it("renders header title, body children, and a view-mode action set", () => {
			// Arrange
			const detail = makeDetail({ mode: "view" });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel" title="User">
					<Detail.Header />
					<Detail.Body>
						<p>read view</p>
					</Detail.Body>
					<Detail.Actions />
				</Detail>,
			);

			// Assert
			expect(screen.getByText("User")).toBeInTheDocument();
			expect(screen.getByText("read view")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Save" }),
			).not.toBeInTheDocument();
		});

		it("shows Save and Cancel in edit mode", () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Assert
			expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Cancel" }),
			).toBeInTheDocument();
		});
	});

	describe("action wiring", () => {
		it("Save calls onSave", async () => {
			// Arrange
			const onSave = vi.fn();
			const detail = makeDetail({ mode: "edit" });
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={onSave} />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Save" }));

			// Assert
			expect(onSave).toHaveBeenCalledTimes(1);
		});

		it("disables Save when no onSave is provided", () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions />
				</Detail>,
			);

			// Assert
			expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		});

		it("Edit (view mode) switches to edit", async () => {
			// Arrange
			const detail = makeDetail({ mode: "view" });
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Header />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Edit" }));

			// Assert
			expect(detail.setMode).toHaveBeenCalledWith("edit");
		});

		it("Cancel reverts to view in edit mode", async () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

			// Assert
			expect(detail.setMode).toHaveBeenCalledWith("view");
		});

		it("Cancel closes in create mode (no view to return to)", async () => {
			// Arrange
			const detail = makeDetail({ mode: "create", record: null });
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

			// Assert
			expect(detail.close).toHaveBeenCalledTimes(1);
			expect(detail.setMode).not.toHaveBeenCalled();
		});

		it("the header close button closes the detail", async () => {
			// Arrange
			const detail = makeDetail({ mode: "view" });
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Header />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Close" }));

			// Assert
			expect(detail.close).toHaveBeenCalledTimes(1);
		});

		it("disables actions while a submit is in flight", () => {
			// Arrange
			const detail = makeDetail({ mode: "edit", isSubmitting: true });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Assert
			expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		});

		it("surfaces a submit/delete error in the default footer", () => {
			// Arrange: a failed save lands on submitError (never on load status)
			const detail = makeDetail({
				mode: "edit",
				submitError: new Error("Save failed"),
			});

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Assert
			expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
		});

		it("shows and wires a Delete button when deletable", async () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Actions onSave={vi.fn()} deletable />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Delete" }));

			// Assert
			expect(detail.remove).toHaveBeenCalledTimes(1);
		});
	});

	describe("body load states", () => {
		it("renders the loading skeleton while loading (view/edit)", () => {
			// Arrange
			const detail = makeDetail({
				mode: "view",
				status: "loading" as DetailStatus,
			});

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Body>
						<p>fields</p>
					</Detail.Body>
				</Detail>,
			);

			// Assert
			expect(screen.getByTestId("detail-loading")).toBeInTheDocument();
			expect(screen.queryByText("fields")).not.toBeInTheDocument();
		});

		it("still renders children in create mode even when status is stale", () => {
			// Arrange: create never loads, so load states are ignored
			const detail = makeDetail({
				mode: "create",
				status: "loading" as DetailStatus,
				record: null,
			});

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Body>
						<p>blank form</p>
					</Detail.Body>
				</Detail>,
			);

			// Assert
			expect(screen.getByText("blank form")).toBeInTheDocument();
			expect(screen.queryByTestId("detail-loading")).not.toBeInTheDocument();
		});

		it("renders the error state with a working retry", async () => {
			// Arrange
			const detail = makeDetail({
				mode: "view",
				status: "error" as DetailStatus,
			});
			renderWithProvider(
				<Detail detail={detail} presentation="panel">
					<Detail.Body>
						<p>fields</p>
					</Detail.Body>
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Retry" }));

			// Assert
			expect(detail.retry).toHaveBeenCalledTimes(1);
		});
	});

	describe("slots", () => {
		it("renders a custom Header slot instead of the default", () => {
			// Arrange
			const detail = makeDetail({ mode: "view" });

			// Act
			renderWithProvider(
				<Detail
					detail={detail}
					presentation="panel"
					slots={{ Header: ({ detail: d }) => <h2>Custom {d.mode}</h2> }}
				>
					<Detail.Header />
				</Detail>,
			);

			// Assert
			expect(
				screen.getByRole("heading", { name: "Custom view" }),
			).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Edit" }),
			).not.toBeInTheDocument();
		});

		it("renders a custom Actions slot instead of the default", () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });

			// Act
			renderWithProvider(
				<Detail
					detail={detail}
					presentation="panel"
					slots={{ Actions: () => <button type="button">Apply</button> }}
				>
					<Detail.Actions />
				</Detail>,
			);

			// Assert
			expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Save" }),
			).not.toBeInTheDocument();
		});
	});

	describe("presentations", () => {
		it("renders inline content with no surrounding chrome", () => {
			// Arrange
			const detail = makeDetail({ mode: "view" });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="inline">
					<Detail.Body>
						<p>inline body</p>
					</Detail.Body>
				</Detail>,
			);

			// Assert
			expect(screen.getByText("inline body")).toBeInTheDocument();
		});

		it("renders drawer content when open", () => {
			// Arrange
			const detail = makeDetail({ mode: "view", isOpen: true });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="drawer" title="In a drawer">
					<Detail.Header />
				</Detail>,
			);

			// Assert: drawer mounts into a portal
			expect(screen.getByText("In a drawer")).toBeInTheDocument();
		});

		it("does not render drawer content when closed", () => {
			// Arrange
			const detail = makeDetail({ mode: "view", isOpen: false });

			// Act
			renderWithProvider(
				<Detail detail={detail} presentation="drawer" title="Hidden">
					<Detail.Header />
				</Detail>,
			);

			// Assert
			expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
		});
	});

	describe("dirty guard (isDirty-prop path)", () => {
		it("prompts on cancel and stays when the guard declines", async () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });
			const confirmDiscard = vi.fn(() => false);
			renderWithProvider(
				<Detail
					detail={detail}
					presentation="panel"
					isDirty
					confirmDiscard={confirmDiscard}
				>
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

			// Assert
			expect(confirmDiscard).toHaveBeenCalledTimes(1);
			expect(detail.setMode).not.toHaveBeenCalled();
		});

		it("proceeds when the guard confirms", async () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });
			const confirmDiscard = vi.fn(() => true);
			renderWithProvider(
				<Detail
					detail={detail}
					presentation="panel"
					isDirty
					confirmDiscard={confirmDiscard}
				>
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

			// Assert
			expect(detail.setMode).toHaveBeenCalledWith("view");
		});

		it("does not prompt when the isDirty prop is false", async () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });
			const confirmDiscard = vi.fn(() => true);
			renderWithProvider(
				<Detail
					detail={detail}
					presentation="panel"
					isDirty={false}
					confirmDiscard={confirmDiscard}
				>
					<Detail.Actions onSave={vi.fn()} />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

			// Assert: clean → no prompt, transition runs
			expect(confirmDiscard).not.toHaveBeenCalled();
			expect(detail.setMode).toHaveBeenCalledWith("view");
		});

		it("guards the header close button too", async () => {
			// Arrange
			const detail = makeDetail({ mode: "edit" });
			const confirmDiscard = vi.fn(() => false);
			renderWithProvider(
				<Detail
					detail={detail}
					presentation="panel"
					isDirty
					confirmDiscard={confirmDiscard}
				>
					<Detail.Header />
				</Detail>,
			);

			// Act
			await userEvent.click(screen.getByRole("button", { name: "Close" }));

			// Assert
			expect(confirmDiscard).toHaveBeenCalledTimes(1);
			expect(detail.close).not.toHaveBeenCalled();
		});
	});

	describe("misuse", () => {
		it("throws when a part is rendered outside <Detail>", () => {
			// Arrange / Act / Assert
			expect(() => renderWithProvider(<Detail.Header />)).toThrow(
				/inside <Detail>/,
			);
		});
	});

	describe("accessibility", () => {
		it("has no axe violations in a panel presentation", async () => {
			// Arrange
			const detail = makeDetail({ mode: "view" });
			const { container } = renderWithProvider(
				<Detail detail={detail} presentation="panel" title="Accessible">
					<Detail.Header />
					<Detail.Body>
						<p>content</p>
					</Detail.Body>
					<Detail.Actions deletable />
				</Detail>,
			);

			// Act
			const results = await axe(container);

			// Assert
			expect(results).toHaveNoViolations();
		});

		it("gives the modal dialog an accessible name from the title", async () => {
			// Arrange
			const detail = makeDetail({ mode: "view", isOpen: true });
			renderWithProvider(
				<Detail detail={detail} presentation="modal" title="Accessible modal">
					<Detail.Header />
					<Detail.Body>
						<p>content</p>
					</Detail.Body>
				</Detail>,
			);

			// Assert: the portal dialog is labelled, and axe is clean
			expect(
				screen.getByRole("dialog", { name: "Accessible modal" }),
			).toBeInTheDocument();
			expect(await axe(document.body)).toHaveNoViolations();
		});

		it("gives the drawer dialog an accessible name from the title", async () => {
			// Arrange
			const detail = makeDetail({ mode: "view", isOpen: true });
			renderWithProvider(
				<Detail detail={detail} presentation="drawer" title="Accessible drawer">
					<Detail.Header />
					<Detail.Body>
						<p>content</p>
					</Detail.Body>
				</Detail>,
			);

			// Assert
			expect(
				screen.getByRole("dialog", { name: "Accessible drawer" }),
			).toBeInTheDocument();
			expect(await axe(document.body)).toHaveNoViolations();
		});
	});
});
