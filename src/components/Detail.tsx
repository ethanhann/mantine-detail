import {
	Button,
	CloseButton,
	Group,
	Skeleton,
	Stack,
	Text,
	Title,
	VisuallyHidden,
} from "@mantine/core";
import type { ReactNode } from "react";
import { runWithConfirm } from "../guard";
import type { DetailMode, UseDetailReturn } from "../types";
import {
	DetailContext,
	type DetailContextValue,
	useDetailContext,
} from "./context";
import classes from "./Detail.module.css";
import { DetailDrawer, DetailModal, DetailPanel } from "./presentations";
import type {
	DetailActionsProps,
	DetailBodyProps,
	DetailHeaderProps,
	DetailProps,
	DetailSlots,
	Presentation,
} from "./types";

function defaultTitle(mode: DetailMode): string {
	if (mode === "create") return "New record";
	if (mode === "edit") return "Edit record";
	return "Details";
}

function DefaultLoadingDetail() {
	return (
		<Stack gap="sm" role="status" aria-busy="true" data-testid="detail-loading">
			<VisuallyHidden>Loading record…</VisuallyHidden>
			<Skeleton height={12} width="40%" />
			<Skeleton height={36} />
			<Skeleton height={36} />
			<Skeleton height={36} width="70%" />
		</Stack>
	);
}

function DefaultErrorState({
	retry,
	error,
}: {
	retry: () => void;
	error?: unknown;
}) {
	const detail = errorMessage(error);
	return (
		<Stack gap="sm" role="alert">
			<Text c="red">Couldn't load this record.</Text>
			{detail && (
				<Text c="dimmed" size="sm">
					{detail}
				</Text>
			)}
			<Group>
				<Button size="xs" variant="light" onClick={retry}>
					Retry
				</Button>
			</Group>
		</Stack>
	);
}

/** Best-effort human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string | null {
	if (error == null) return null;
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return null;
}

/** Title bar: title, the View/Edit toggle, and close. All routed through the core's guard. */
function Header({ title: titleProp }: DetailHeaderProps) {
	const {
		detail,
		slots,
		title: ctxTitle,
		presentation,
		requestClose,
	} = useDetailContext();
	if (slots.Header) {
		const Slot = slots.Header;
		return <Slot detail={detail} />;
	}
	// Modal/drawer render their own native title bar (which also names the
	// dialog for assistive tech), so the in-content header drops the title and
	// shows only the mode affordances to avoid a duplicate heading.
	const chromed = presentation === "modal" || presentation === "drawer";
	const title = titleProp ?? ctxTitle ?? defaultTitle(detail.mode);
	return (
		<Group
			justify={chromed ? "flex-end" : "space-between"}
			wrap="nowrap"
			className={classes.header}
		>
			{!chromed && (
				<Title order={2} size="h4" fw={600}>
					{title}
				</Title>
			)}
			<Group gap="xs" wrap="nowrap">
				{detail.mode === "view" && (
					<Button
						size="xs"
						variant="light"
						onClick={() => detail.setMode("edit")}
					>
						Edit
					</Button>
				)}
				<CloseButton aria-label="Close" onClick={requestClose} />
			</Group>
		</Group>
	);
}

/** Body: renders your fields/read view, or the load-scoped skeleton / error in view & edit. */
function Body({ children }: DetailBodyProps) {
	const { detail, slots } = useDetailContext();

	let content: ReactNode = children;
	// Load states only apply when a record is being loaded (never in create).
	if (detail.mode !== "create") {
		if (detail.status === "loading") {
			const Slot = slots.LoadingDetail ?? DefaultLoadingDetail;
			content = <Slot />;
		} else if (detail.status === "error") {
			const Slot = slots.ErrorState ?? DefaultErrorState;
			content = <Slot retry={detail.retry} error={detail.error} />;
		}
	}

	return <div className={classes.body}>{content}</div>;
}

/**
 * Action buttons, wired to the lifecycle and mode-aware. Save needs `onSave`
 * (the hook never owns form values); Cancel/Close route through the guard;
 * everything disables while loading or a write is in flight.
 */
function Actions({
	onSave,
	deletable = false,
	saveLabel = "Save",
	cancelLabel = "Cancel",
	deleteLabel = "Delete",
	closeLabel = "Close",
}: DetailActionsProps) {
	const { detail, slots, requestClose, requestCancel } = useDetailContext();
	if (slots.Actions) {
		const Slot = slots.Actions;
		return <Slot detail={detail} />;
	}

	// A write is in flight. Disables every action. Close/Cancel stay usable
	// while only a load is in flight (the load token supersedes it), but Save
	// and Delete also wait on the load since they act on the loaded record.
	const writing = detail.isSubmitting || detail.isDeleting;
	const busy = detail.status === "loading" || writing;
	const deleteButton = deletable ? (
		<Button
			color="red"
			variant="light"
			loading={detail.isDeleting}
			disabled={busy}
			onClick={() => detail.remove()}
		>
			{deleteLabel}
		</Button>
	) : null;

	// A failed save/delete lands on submitError but never on the load `status`,
	// so the default footer surfaces it inline (override via the Actions slot).
	const submitMessage = errorMessage(detail.submitError);
	const errorNode = submitMessage ? (
		<Text c="red" size="sm" role="alert" ta="right">
			{submitMessage}
		</Text>
	) : null;

	// In view mode the View→Edit toggle lives in the Header; Actions offers
	// only Delete/Close so the two parts don't duplicate the Edit affordance.
	if (detail.mode === "view") {
		return (
			<Stack gap="xs" className={classes.footer}>
				{errorNode}
				<Group justify="flex-end" wrap="nowrap">
					{deleteButton}
					<Button variant="default" disabled={writing} onClick={requestClose}>
						{closeLabel}
					</Button>
				</Group>
			</Stack>
		);
	}

	// edit | create
	return (
		<Stack gap="xs" className={classes.footer}>
			{errorNode}
			<Group justify="flex-end" wrap="nowrap">
				{detail.mode === "edit" ? deleteButton : null}
				<Button variant="default" disabled={writing} onClick={requestCancel}>
					{cancelLabel}
				</Button>
				<Button
					loading={detail.isSubmitting}
					disabled={busy || !onSave}
					onClick={() => onSave?.()}
				>
					{saveLabel}
				</Button>
			</Group>
		</Stack>
	);
}

function renderPresentation(
	presentation: Presentation,
	isOpen: boolean,
	onClose: () => void,
	content: ReactNode,
	// Mantine names the dialog via aria-labelledby only when its own `title` is
	// set, so chrome'd surfaces render the title in the native header bar.
	title: ReactNode,
): ReactNode {
	switch (presentation) {
		case "drawer":
			return (
				<DetailDrawer
					opened={isOpen}
					onClose={onClose}
					withCloseButton={false}
					title={title}
				>
					{content}
				</DetailDrawer>
			);
		case "modal":
			return (
				<DetailModal
					opened={isOpen}
					onClose={onClose}
					withCloseButton={false}
					title={title}
				>
					{content}
				</DetailModal>
			);
		case "panel":
			return <DetailPanel>{content}</DetailPanel>;
		case "inline":
			return content;
		default:
			// Exhaustive: an unknown presentation (untyped consumer) renders nothing.
			presentation satisfies never;
			return null;
	}
}

/**
 * Orchestrator surface for the detail lifecycle. Provides context to its parts
 * (`<Detail.Header>` / `<Detail.Body>` / `<Detail.Actions>`) and renders them in
 * the chosen presentation. Drawer/Modal use `detail.isOpen`; panel/inline are
 * embedded (visibility is the consumer's to control).
 */
function DetailRoot<TData, TForm = TData>({
	detail,
	presentation = "panel",
	isDirty,
	confirmDiscard,
	title,
	slots,
	children,
}: DetailProps<TData, TForm>) {
	// The component guards only on the isDirty-PROP path; otherwise the core
	// self-guards programmatic transitions with its hook-supplied isDirty, and
	// guarding here too would double-prompt. (`detail` is a fresh object every
	// render, so memoizing the callbacks/context below would buy nothing.)
	const dirtyPropProvided = isDirty !== undefined;
	const resolvedDirty = isDirty ?? detail.isDirty;
	const guardConfirm =
		dirtyPropProvided && resolvedDirty ? confirmDiscard : undefined;

	const requestClose = () => runWithConfirm(() => detail.close(), guardConfirm);
	const requestCancel = () =>
		runWithConfirm(
			() => (detail.mode === "edit" ? detail.setMode("view") : detail.close()),
			guardConfirm,
		);

	const ctx: DetailContextValue = {
		detail: detail as unknown as UseDetailReturn<unknown, unknown>,
		isDirty: resolvedDirty,
		title,
		presentation,
		slots: (slots ?? {}) as unknown as DetailSlots<unknown, unknown>,
		requestClose,
		requestCancel,
	};

	// Title for the modal/drawer native header (also names the dialog). Always
	// non-empty so the dialog is labelled even without an explicit `title`.
	const surfaceTitle = title ?? defaultTitle(detail.mode);
	const content = <div className={classes.root}>{children}</div>;

	return (
		<DetailContext.Provider value={ctx}>
			{renderPresentation(
				presentation,
				detail.isOpen,
				requestClose,
				content,
				surfaceTitle,
			)}
		</DetailContext.Provider>
	);
}

export const Detail = Object.assign(DetailRoot, { Header, Body, Actions });
