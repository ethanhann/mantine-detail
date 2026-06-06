import { Select, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import {
	Detail,
	type Presentation,
	type UseDetailReturn,
	useDetailFetcher,
	useDirtyGuard,
} from "../index";
import { useMantineFormDetail } from "../mantine-form/use-mantine-form-detail";

export interface DemoUser {
	id: string;
	name: string;
	email: string;
	role: "admin" | "member" | "viewer";
}

export const ROLES = [
	{ value: "admin", label: "Admin" },
	{ value: "member", label: "Member" },
	{ value: "viewer", label: "Viewer" },
];

const SEED: DemoUser[] = [
	{ id: "1", name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
	{ id: "2", name: "Alan Turing", email: "alan@example.com", role: "member" },
	{ id: "3", name: "Grace Hopper", email: "grace@example.com", role: "admin" },
	{
		id: "4",
		name: "Katherine Johnson",
		email: "katherine@example.com",
		role: "member",
	},
	{
		id: "5",
		name: "Edsger Dijkstra",
		email: "edsger@example.com",
		role: "viewer",
	},
];

const latency = (ms = 450) => new Promise((r) => setTimeout(r, ms));

export interface DemoApiOptions {
	/** Make `load` reject, to demonstrate the error state. */
	failLoad?: boolean;
}

/** A tiny in-memory user store with simulated latency for the stories. */
export function createDemoApi(options: DemoApiOptions = {}) {
	let rows: DemoUser[] = SEED.map((r) => ({ ...r }));
	return {
		list: () => rows,
		firstId: () => rows[0]?.id ?? "",
		load: async (id: string): Promise<DemoUser> => {
			await latency();
			if (options.failLoad) throw new Error("Failed to load user");
			const found = rows.find((r) => r.id === id);
			if (!found) throw new Error(`User ${id} not found`);
			return { ...found };
		},
		save: async (
			values: DemoUser,
			ctx: { mode: "edit" | "create"; id?: string },
		): Promise<DemoUser> => {
			await latency();
			if (ctx.mode === "create") {
				const created = { ...values, id: `u-${Date.now()}` };
				rows = [created, ...rows];
				return created;
			}
			const updated = { ...values, id: ctx.id ?? values.id };
			rows = rows.map((r) => (r.id === updated.id ? updated : r));
			return updated;
		},
		remove: async (id: string): Promise<void> => {
			await latency();
			rows = rows.filter((r) => r.id !== id);
		},
	};
}

export type DemoApi = ReturnType<typeof createDemoApi>;

/** Wire a demo fetcher for the given api. */
export function useUserDetail(api: DemoApi) {
	return useDetailFetcher<DemoUser>({
		getRowId: (u) => u.id,
		load: api.load,
		submit: api.save,
		remove: api.remove,
	});
}

function UserReadView({ record }: { record: DemoUser | null }) {
	if (!record) return <Text c="dimmed">No user loaded.</Text>;
	return (
		<Stack gap={4}>
			<Text>
				<b>Name:</b> {record.name}
			</Text>
			<Text>
				<b>Email:</b> {record.email}
			</Text>
			<Text>
				<b>Role:</b> {record.role}
			</Text>
		</Stack>
	);
}

/**
 * The consumer-owned form body: a `@mantine/form` form wired via the adapter,
 * with the read view and the form branched on `detail.mode`, and the dirty
 * guard fed from the form.
 */
export function UserDetail({
	detail,
	presentation,
}: {
	detail: UseDetailReturn<DemoUser>;
	presentation: Presentation;
}) {
	const form = useForm<DemoUser>({
		mode: "controlled",
		initialValues: { id: "", name: "", email: "", role: "member" },
		validate: {
			name: (value) => (value.trim() ? null : "Name is required"),
			email: (value) =>
				/^[^@\s]+@[^@\s]+$/.test(value) ? null : "Invalid email",
		},
	});
	const bind = useMantineFormDetail(detail, form);
	const guard = useDirtyGuard({
		when: bind.isDirty,
		message: "Discard your changes to this user?",
	});

	const title =
		detail.mode === "create" ? "New user" : (detail.record?.name ?? "User");

	return (
		<Detail
			detail={detail}
			presentation={presentation}
			isDirty={bind.isDirty}
			confirmDiscard={guard.confirmDiscard}
			title={title}
		>
			<Detail.Header />
			<Detail.Body>
				{detail.mode === "view" ? (
					<UserReadView record={detail.record} />
				) : (
					<Stack gap="sm">
						<TextInput label="Name" {...form.getInputProps("name")} />
						<TextInput label="Email" {...form.getInputProps("email")} />
						<Select
							label="Role"
							data={ROLES}
							allowDeselect={false}
							{...form.getInputProps("role")}
						/>
					</Stack>
				)}
			</Detail.Body>
			<Detail.Actions onSave={bind.onSave} deletable />
		</Detail>
	);
}
