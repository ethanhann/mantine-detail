import { Button, Group, Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";
import type { Presentation } from "../index";
import { createDemoApi, UserDetail, useUserDetail } from "./demo";

interface DemoProps {
	presentation: Presentation;
	/** Open straight into edit mode. */
	startMode?: "view" | "edit";
	/** Make load fail to show the error state. */
	failLoad?: boolean;
}

/**
 * Demonstrates the `<Detail>` lifecycle surface across each presentation. Open a
 * record (optionally straight into edit), create a new one, and exercise the
 * load, error, and dirty-guard states. The fields and read view are
 * consumer-rendered. The library owns the surface, the mode machine, and the
 * actions.
 */
function DetailDemo({ presentation, startMode, failLoad }: DemoProps) {
	const api = useMemo(() => createDemoApi({ failLoad }), [failLoad]);
	const detail = useUserDetail(api);
	const embedded = presentation === "panel" || presentation === "inline";

	return (
		<Stack maw={760}>
			<Group>
				<Button onClick={() => detail.open(api.firstId(), startMode)}>
					Open user
				</Button>
				<Button variant="light" onClick={() => detail.openCreate()}>
					New user
				</Button>
				{detail.isOpen && (
					<Button variant="subtle" color="gray" onClick={() => detail.close()}>
						Close
					</Button>
				)}
			</Group>
			{(!embedded || detail.isOpen) && (
				<UserDetail detail={detail} presentation={presentation} />
			)}
		</Stack>
	);
}

const meta = {
	title: "Detail/Presentations",
	component: DetailDemo,
	parameters: { layout: "padded" },
	argTypes: {
		presentation: {
			control: "select",
			options: ["drawer", "modal", "panel", "inline"],
			description: "Surface the detail is presented in.",
		},
		startMode: {
			control: "inline-radio",
			options: ["view", "edit"],
			description: "Mode the record opens into.",
		},
		failLoad: {
			control: "boolean",
			description: "Make load() reject so the body shows the error state.",
		},
	},
} satisfies Meta<typeof DetailDemo>;
export default meta;

type Story = StoryObj<typeof DetailDemo>;

/** Slide-over drawer. Opens and closes from `detail.isOpen`. */
export const Drawer: Story = { args: { presentation: "drawer" } };

/** Centered modal. Opens and closes from `detail.isOpen`. */
export const Modal: Story = { args: { presentation: "modal" } };

/** Embedded side panel (Mantine `Paper`). You control its visibility. */
export const Panel: Story = { args: { presentation: "panel" } };

/** No chrome. Render it on a detail route with `presentation="inline"`. */
export const Inline: Story = { args: { presentation: "inline" } };

/** Open directly in edit mode; change a field then Cancel/Close to see the dirty guard. */
export const EditAndDirtyGuard: Story = {
	args: { presentation: "drawer", startMode: "edit" },
};

/** Load rejects → the body shows the error state with a working Retry. */
export const LoadError: Story = {
	args: { presentation: "panel", failLoad: true },
};
