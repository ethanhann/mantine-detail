import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import type { Preview } from "@storybook/react";

const preview: Preview = {
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
