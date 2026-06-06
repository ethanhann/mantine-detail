import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		passWithNoTests: true,
		setupFiles: ["./vitest.setup.ts"],
		css: true,
		coverage: {
			provider: "v8",
			// json-summary emits coverage/coverage-summary.json, which the Deploy
			// Storybook workflow reads to build the coverage badge.
			reporter: ["text", "json-summary", "json"],
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/**/*.stories.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
		},
	},
});
