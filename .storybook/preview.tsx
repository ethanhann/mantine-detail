import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import type { Preview } from "@storybook/react";

const preview: Preview = {
	// Generate a Docs page for every story file by default (Storybook 10 split
	// docs out of core, so this needs @storybook/addon-docs registered in main).
	tags: ["autodocs"],
	parameters: {
		controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
	},
	decorators: [
		(Story) => (
			<MantineProvider>
				<ModalsProvider>
					<Story />
				</ModalsProvider>
			</MantineProvider>
		),
	],
};

export default preview;
