import pc from "picocolors";

// Truecolor logo — pixel-accurate replica of logo.png
// 14 chars wide × 7 lines (half-block rendering of 14×14 grid)
// Colors: Dark=#302C88, Medium=#4042AE, Bright=#4B50D2
const D = "\x1b[38;2;48;44;136m";
const B = "\x1b[38;2;75;80;210m";
const M = "\x1b[38;2;64;66;174m";
const R = "\x1b[0m";

// biome-ignore format: logo art
const LOGO_LINES: string[] = [
	`  ${D}██████████${R}  `,
	`${B}███${R}${M}${"\x1b[48;2;75;80;210m"}▀${R}${B}█████${R}${D}███${R}${B}██${R}`,
	`${D}██${R}${D}${"\x1b[48;2;64;66;174m"}▀${R}${D}${"\x1b[48;2;75;80;210m"}▀${R}      ${D}▀▀${R}${B}▀▀${R}`,
	`${D}██${R}${B}██${R}          `,
	`${D}██${R}${B}██${R}      ${D}▄▄${R}${B}▄▄${R}`,
	`${D}██${R}${B}██${R}${M}█${R}${B}${"\x1b[48;2;64;66;174m"}▀${R}${B}████${R}${B}${"\x1b[48;2;64;66;174m"}▀${R}${B}███${R}`,
	`  ${B}██${R}${D}████████${R}  `,
];

export function banner(sdkVersion: string): string {
	const cols = process.stdout.columns || 80;
	if (cols >= 60) return wideBanner(sdkVersion);
	if (cols >= 35) return compactBanner(sdkVersion);
	return minimalBanner();
}

function wideBanner(sdkVersion: string): string {
	const text = [
		"",
		"",
		pc.bold(pc.blue("C R E D A T")),
		pc.dim("Agent identity and delegation"),
		pc.dim(`cli ${CLI_VERSION} (sdk ${sdkVersion})`),
		"",
		"",
	];

	const lines = LOGO_LINES.map((line, i) => `  ${line}   ${text[i] ?? ""}`);
	return `\n${lines.join("\n")}\n`;
}

function compactBanner(sdkVersion: string): string {
	return [
		"",
		...LOGO_LINES.map((line) => `    ${line}`),
		"",
		`  ${pc.bold(pc.blue("C R E D A T"))}`,
		`  ${pc.dim("Agent identity and delegation")}`,
		`  ${pc.dim(`cli ${CLI_VERSION} (sdk ${sdkVersion})`)}`,
		"",
	].join("\n");
}

function minimalBanner(): string {
	return `\n  ${pc.bold(pc.blue("CREDAT"))}\n`;
}
