import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: false,
	splitting: false,
	clean: true,
	sourcemap: true,
	banner: {
		js: "#!/usr/bin/env node",
	},
	define: {
		CLI_VERSION: JSON.stringify(version),
	},
});
