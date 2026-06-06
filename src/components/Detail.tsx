import {
	Button,
	CloseButton,
	Group,
	Skeleton,
	Stack,
	Text,
} from "@mantine/core";
import { type ReactNode, useCallback, useMemo } from "react";
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
		<Stack gap="sm" aria-busy="true" data-testid="detail-loading">
			<Skeleton height={12} width="40%" />
			<Skeleton height={36} />
			<Skeleton height={36} />
			<Skeleton height={36} width="70%" />
		</Stack>
	);
}

function DefaultErrorState({ retry }: { retry: () => void }) {
	return (
		<Stack gap="sm" role="alert">
			<Text c="red">Couldn't load this record.</Text>
			<Group>
				<Button size="xs" variant="light" onClick={retry}>
					Retry
				</Button>
			</Group>
		</Stack>
	);
}

/** Title bar: title, the View/Edit toggle, and close. All routed through the core's guard. */
function Header({ title: titleProp }: DetailHeaderProps) {
	const { detail, slots, title: ctxTitle, requestClose } = useDetailContext();
	if (slots.Header) {
		const Slot = slots.Header;
		return <Slot detail={detail} />;
	}
	const title = titleProp ?? ctxTitle ?? defaultTitle(detail.mode);
	return (
		<Group justify="space-between" wrap="nowrap" className={classes.header}>
			<Text fw={600} size="lg">
				{title}
			</Text>
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
			content = <Slot retry={detail.retry} />;
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

	const busy =
		detail.status === "loading" || detail.isSubmitting || detail.isDeleting;
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

	// In view mode the View→Edit toggle lives in the Header; Actions offers
	// only Delete/Close so the two parts don't duplicate the Edit affordance.
	if (detail.mode === "view") {
		return (
			<Group justify="flex-end" wrap="nowrap" className={classes.footer}>
				{deleteButton}
				<Button variant="default" disabled={busy} onClick={requestClose}>
					{closeLabel}
				</Button>
			</Group>
		);
	}

	// edit | create
	return (
		<Group justify="flex-end" wrap="nowrap" className={classes.footer}>
			{detail.mode === "edit" ? deleteButton : null}
			<Button variant="default" disabled={busy} onClick={requestCancel}>
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
	);
}

function renderPresentation(
	presentation: Presentation,
	isOpen: boolean,
	onClose: () => void,
	content: ReactNode,
): ReactNode {
	switch (presentation) {
		case "drawer":
			return (
				<DetailDrawer opened={isOpen} onClose={onClose} withCloseButton={false}>
					{content}
				</DetailDrawer>
			);
		case "modal":
			return (
				<DetailModal opened={isOpen} onClose={onClose} withCloseButton={false}>
					{content}
				</DetailModal>
			);
		case "panel":
			return <DetailPanel>{content}</DetailPanel>;
		case "inline":
			return content;
		default: {
			const _exhaustive: never = presentation;
			return _exhaustive;
		}
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
	// guarding here too would double-prompt.
	const dirtyPropProvided = isDirty !== undefined;
	const resolvedDirty = isDirty ?? detail.isDirty;

	const guardedRun = useCallback(
		(action: () => void) => {
			if (!(dirtyPropProvided && resolvedDirty && confirmDiscard)) {
				action();
				return;
			}
			const decision = confirmDiscard();
			if (typeof decision === "boolean") {
				if (decision) action();
				return;
			}
			void decision.then((ok) => {
				if (ok) action();
			});
		},
		[dirtyPropProvided, resolvedDirty, confirmDiscard],
	);

	const requestClose = useCallback(
		() => guardedRun(() => detail.close()),
		[guardedRun, detail],
	);
	const requestCancel = useCallback(
		() =>
			guardedRun(() =>
				detail.mode === "edit" ? detail.setMode("view") : detail.close(),
			),
		[guardedRun, detail],
	);

	const ctx = useMemo<DetailContextValue>(
		() => ({
			detail: detail as unknown as UseDetailReturn<unknown, unknown>,
			isDirty: resolvedDirty,
			title,
			slots: (slots ?? {}) as unknown as DetailSlots<unknown, unknown>,
			requestClose,
			requestCancel,
		}),
		[detail, resolvedDirty, title, slots, requestClose, requestCancel],
	);

	const content = <div className={classes.root}>{children}</div>;

	return (
		<DetailContext.Provider value={ctx}>
			{renderPresentation(presentation, detail.isOpen, requestClose, content)}
		</DetailContext.Provider>
	);
}

export const Detail = Object.assign(DetailRoot, { Header, Body, Actions });
