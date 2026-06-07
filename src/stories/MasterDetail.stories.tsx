import "@ethanhann/mantine-dataview/styles.css";
import {
	col,
	DataViewer,
	type DataViewSlots,
	useDataViewFetcher,
} from "@ethanhann/mantine-dataview";
import { Button, Grid, Group, Loader, Stack, Table, Text } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";
import { bindDataView } from "../dataview/bind-data-view";
import type { ReconcileStrategy } from "../index";
import { useDetailFetcher } from "../index";
import { createDemoApi, type DemoUser, UserDetail } from "./demo";

/** The master + detail wiring shared by every variant. */
function useUsersScreen(strategy: ReconcileStrategy = "refetch") {
	const api = useMemo(() => createDemoApi(), []);
	const columns = useMemo(
		() => col<DemoUser>().text("name").text("email").text("role").build(),
		[],
	);

	const view = useDataViewFetcher<DemoUser>({
		columns,
		getRowId: (u) => u.id,
		fetcher: async () => {
			const rows = api.list();
			return { rows, rowCount: rows.length };
		},
	});

	const master = bindDataView(view, { strategy });
	const detail = useDetailFetcher<DemoUser>({
		getRowId: (u) => u.id,
		load: api.load,
		submit: api.save,
		remove: api.remove,
		master,
	});

	// Row click opens the detail; the active row is highlighted from the
	// binding's own activeId, independent of dataview's bulk selection.
	const slots: DataViewSlots<DemoUser> = {
		Row: ({ row, cells }) => (
			<Table.Tr
				style={{ cursor: "pointer" }}
				bg={
					master.activeId === row.original.id
						? "var(--mantine-color-blue-light)"
						: undefined
				}
				onClick={() => detail.open(row.original.id)}
			>
				{cells}
			</Table.Tr>
		),
	};

	return { view, detail, slots };
}

/**
 * Side-by-side master/detail with a create flow: the list narrows when the
 * panel opens, and "New user" opens a blank create form. On save the binding
 * reconciles via `view.refetch()`, so the new row reflects server truth.
 */
function SideBySideScreen() {
	const { view, detail, slots } = useUsersScreen();
	return (
		<Stack gap="sm">
			<Group justify="space-between" align="flex-end">
				<Button onClick={() => detail.openCreate()}>New user</Button>
				{/* After create + refetch, the new record appears only if it matches
				    the current sort / filter / page. The demo prepends, so it lands
				    at the top here. Under an active filter it could be off-screen. */}
				<Text size="xs" c="dimmed" maw={360} ta="right">
					New records reconcile via <code>refetch()</code>. Under a filter or a
					later page the created row may not be visible.
				</Text>
			</Group>
			<Grid>
				<Grid.Col span={detail.isOpen ? 7 : 12}>
					<DataViewer view={view} slots={slots} />
				</Grid.Col>
				{detail.isOpen && (
					<Grid.Col span={5}>
						<UserDetail detail={detail} presentation="panel" />
					</Grid.Col>
				)}
			</Grid>
		</Stack>
	);
}

/** Same wiring, drawer presentation: the list stays full-width. */
function DrawerScreen() {
	const { view, detail, slots } = useUsersScreen();
	return (
		<>
			<DataViewer view={view} slots={slots} />
			<UserDetail detail={detail} presentation="drawer" />
		</>
	);
}

/**
 * Optimistic reconciliation: `bindDataView(view, { strategy: "patch" })` applies
 * each write to the list in place for instant feedback, then dataview revalidates
 * in the background. `view.isRevalidating` drives a subtle sync indicator.
 */
function OptimisticPatchScreen() {
	const { view, detail, slots } = useUsersScreen("patch");
	return (
		<Stack gap="sm">
			<Group justify="space-between" align="flex-end">
				<Button onClick={() => detail.openCreate()}>New user</Button>
				<Group gap="xs">
					{view.isRevalidating && <Loader size="xs" />}
					<Text size="xs" c="dimmed" maw={340} ta="right">
						Edits apply in place instantly, then dataview revalidates. The
						server response is the source of truth.
					</Text>
				</Group>
			</Group>
			<Grid>
				<Grid.Col span={detail.isOpen ? 7 : 12}>
					<DataViewer view={view} slots={slots} />
				</Grid.Col>
				{detail.isOpen && (
					<Grid.Col span={5}>
						<UserDetail detail={detail} presentation="panel" />
					</Grid.Col>
				)}
			</Grid>
		</Stack>
	);
}

const meta = {
	title: "Detail/MasterDetail recipe",
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The `<MasterDetail>` layout is shipped as a recipe rather than a component, so it never recouples this library to dataview. Each story wires `useDataViewFetcher` to `useDetailFetcher` through `bindDataView`: a row click opens the detail, and saves, creates, and deletes reconcile back into the list. The variants below show side-by-side and drawer layouts plus optimistic in-place reconciliation.",
			},
		},
	},
} satisfies Meta;
export default meta;

/**
 * List and detail side by side. The list narrows to make room when the panel
 * opens. The "New user" button starts a create flow whose save reconciles the
 * new row into the list via `refetch()`.
 */
export const SideBySide: StoryObj = { render: () => <SideBySideScreen /> };

/** The same wiring with a drawer presentation, so the list stays full-width. */
export const WithDrawer: StoryObj = { render: () => <DrawerScreen /> };

/**
 * `bindDataView(view, { strategy: "patch" })` applies each write to the list in
 * place for instant feedback, then dataview revalidates in the background.
 * `view.isRevalidating` drives the subtle sync indicator.
 */
export const WithOptimisticPatch: StoryObj = {
	render: () => <OptimisticPatchScreen />,
};
