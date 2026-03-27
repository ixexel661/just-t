import { defineConfig } from "rolldown";

export default defineConfig({
	input: "src/index.ts",
	external: [/^node:/],
	output: {
		file: "dist/index.js",
		format: "esm",
		sourcemap: false,
	},
	platform: "neutral",
	minify: true,
});

