import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

// Externalize every peer dependency so they are never bundled into the library.
// Subpath-only peers (dataview, @mantine/form, react-hook-form) are external too:
// they are reached exclusively through their own entry points.
const external =
	/^(react($|\/)|react-dom($|\/)|@mantine\/|@ethanhann\/mantine-dataview($|\/)|react-hook-form($|\/))/;

export default defineConfig({
	plugins: [
		react(),
		dts({
			bundleTypes: false,
			entryRoot: resolve(__dirname, "src"),
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: [
				"src/**/*.stories.{ts,tsx}",
				"src/**/*.test.{ts,tsx}",
				"src/stories/**",
			],
			compilerOptions: { rootDir: resolve(__dirname, "src") },
		}),
	],
	build: {
		cssCodeSplit: false,
		sourcemap: true,
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				"dataview/index": resolve(__dirname, "src/dataview/index.ts"),
				"mantine-form/index": resolve(__dirname, "src/mantine-form/index.ts"),
				"react-hook-form/index": resolve(
					__dirname,
					"src/react-hook-form/index.ts",
				),
			},
			// ESM-only: React libraries are consumed through bundlers, which all
			// support ESM. No CJS output keeps the package and its types simple.
			formats: ["es"],
			fileName: (_format, entryName) => `${entryName}.js`,
		},
		rollupOptions: {
			external,
			output: {
				assetFileNames: (asset) =>
					asset.names?.some((n) => n.endsWith(".css"))
						? "mantine-detail.css"
						: "[name][extname]",
			},
		},
	},
});
