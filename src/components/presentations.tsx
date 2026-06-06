import {
	Drawer,
	type DrawerProps,
	Modal,
	type ModalProps,
	Paper,
	type PaperProps,
} from "@mantine/core";
import type { ReactNode } from "react";

/** Drawer presentation. Thin wrapper over Mantine `Drawer` with right/md defaults. */
export type DetailDrawerProps = DrawerProps;

export function DetailDrawer({
	position = "right",
	size = "md",
	children,
	...rest
}: DetailDrawerProps) {
	return (
		<Drawer position={position} size={size} {...rest}>
			{children}
		</Drawer>
	);
}

/** Modal presentation. Thin wrapper over Mantine `Modal` with an lg default. */
export type DetailModalProps = ModalProps;

export function DetailModal({
	size = "lg",
	children,
	...rest
}: DetailModalProps) {
	return (
		<Modal size={size} {...rest}>
			{children}
		</Modal>
	);
}

/** Panel presentation: a bordered surface for side-by-side / inline-on-route layouts. */
export interface DetailPanelProps extends PaperProps {
	children?: ReactNode;
}

export function DetailPanel({
	withBorder = true,
	p = "md",
	radius = "md",
	children,
	...rest
}: DetailPanelProps) {
	return (
		<Paper withBorder={withBorder} p={p} radius={radius} {...rest}>
			{children}
		</Paper>
	);
}
