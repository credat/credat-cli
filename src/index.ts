import { Command, Option } from "commander";
import { VERSION } from "credat";
import pc from "picocolors";
import { banner } from "./banner.js";
import { auditCommand } from "./commands/audit.js";
import {
	completionsCommand,
	completionsInstallCommand,
} from "./commands/completions.js";
import { delegateCommand } from "./commands/delegate.js";
import { demoCommand } from "./commands/demo.js";
import {
	handshakeChallengeCommand,
	handshakeDemoCommand,
	handshakePresentCommand,
	handshakeVerifyCommand,
} from "./commands/handshake.js";
import { initCommand } from "./commands/init.js";
import { inspectCommand } from "./commands/inspect.js";
import {
	keysExportCommand,
	keysImportCommand,
	keysListCommand,
} from "./commands/keys.js";
import { renewCommand } from "./commands/renew.js";
import { revokeCommand } from "./commands/revoke.js";
import { statusCommand } from "./commands/status.js";
import { verifyCommand } from "./commands/verify.js";

const program = new Command();

program
	.name("credat")
	.description("CLI for Credat — agent identity and delegation")
	.version(`cli ${CLI_VERSION} (sdk ${VERSION})`)
	.option("--json", "Output as JSON instead of colored text")
	.addHelpText("before", () => banner(VERSION));

program
	.command("init")
	.description("Create an agent identity with did:web")
	.requiredOption(
		"-d, --domain <domain>",
		"Domain for did:web (e.g. acme.corp)",
	)
	.option("-p, --path <path>", "Optional sub-path (e.g. agents/my-agent)")
	.addOption(
		new Option("-a, --algorithm <algorithm>", "Signing algorithm")
			.choices(["ES256", "EdDSA"])
			.default("ES256"),
	)
	.option("-f, --force", "Overwrite existing agent identity")
	.option("-o, --output <file>", "Write agent to custom file path")
	.action(async (options) => {
		await initCommand({
			domain: options.domain,
			path: options.path,
			algorithm: options.algorithm,
			force: options.force,
			output: options.output,
		});
	});

program
	.command("delegate")
	.description("Issue a delegation credential to an agent")
	.option("-a, --agent <did>", "Agent DID (defaults to .credat/agent.json)")
	.requiredOption(
		"-s, --scopes <scopes>",
		"Comma-separated scopes (e.g. payments:read,invoices:create)",
	)
	.option("-m, --max-value <number>", "Maximum transaction value constraint")
	.option("-u, --until <date>", "Expiration date (ISO 8601)")
	.option("-o, --output <file>", "Write delegation to custom file path")
	.action(async (options) => {
		await delegateCommand({
			agent: options.agent,
			scopes: options.scopes,
			maxValue: options.maxValue,
			until: options.until,
			json: program.opts().json,
			output: options.output,
		});
	});

program
	.command("verify [token]")
	.description("Verify a delegation token")
	.action(async (token) => {
		await verifyCommand(token, { json: program.opts().json });
	});

program
	.command("inspect [token]")
	.description("Decode and inspect a delegation token (no verification)")
	.option("-f, --file <path>", "Read token from a file")
	.action(async (token, options) => {
		await inspectCommand(token, {
			file: options.file,
			json: program.opts().json,
		});
	});

program
	.command("revoke")
	.description("Revoke a delegation credential via status list")
	.option("-t, --token <token>", "Delegation token to revoke")
	.option(
		"-s, --status-list <path>",
		"Path to status list file (default: .credat/status-list.json)",
	)
	.option("-i, --index <number>", "Status list index to revoke")
	.action(async (options) => {
		await revokeCommand({
			token: options.token,
			statusList: options.statusList,
			index: options.index,
			json: program.opts().json,
		});
	});

program
	.command("audit [token]")
	.description("Validate a delegation token against security best practices")
	.action(async (token) => {
		await auditCommand(token, { json: program.opts().json });
	});

program
	.command("renew")
	.description("Renew a delegation with a new expiry date")
	.requiredOption("-u, --until <date>", "New expiration date (ISO 8601)")
	.action(async (options) => {
		await renewCommand({
			until: options.until,
			json: program.opts().json,
		});
	});

// ── Handshake subcommands ──

const handshake = program
	.command("handshake")
	.description("Challenge/response trust verification flow");

handshake
	.command("challenge")
	.description("Create a challenge for an agent")
	.requiredOption("--from <did>", "Challenger DID")
	.action((options) => {
		handshakeChallengeCommand({
			from: options.from,
			json: program.opts().json,
		});
	});

handshake
	.command("present")
	.description("Present credentials in response to a challenge")
	.requiredOption("--challenge <json>", "Challenge JSON string")
	.action(async (options) => {
		await handshakePresentCommand({
			challenge: options.challenge,
			json: program.opts().json,
		});
	});

handshake
	.command("verify")
	.description("Verify a presentation against a challenge")
	.requiredOption("--presentation <json>", "Presentation JSON string")
	.requiredOption("--challenge <json>", "Challenge JSON string")
	.action(async (options) => {
		await handshakeVerifyCommand({
			presentation: options.presentation,
			challenge: options.challenge,
			json: program.opts().json,
		});
	});

handshake
	.command("demo")
	.description("Run a full handshake demo between two local agents")
	.action(async () => {
		await handshakeDemoCommand({ json: program.opts().json });
	});

// ── Keys subcommands ──

const keys = program
	.command("keys")
	.description("Import, export, and list key pairs");

keys
	.command("export")
	.description("Export key pair in JWK format")
	.addOption(
		new Option("--as <type>", "Key type to export")
			.choices(["agent", "owner"])
			.default("agent"),
	)
	.action((options) => {
		keysExportCommand({ as: options.as, json: program.opts().json });
	});

keys
	.command("import <jwk-data>")
	.description("Import key pair from JWK JSON")
	.addOption(
		new Option("--as <type>", "Import as agent or owner")
			.choices(["agent", "owner"])
			.default("agent"),
	)
	.action((jwkData, options) => {
		keysImportCommand(jwkData, {
			as: options.as,
			json: program.opts().json,
		});
	});

keys
	.command("list")
	.description("List current key fingerprints")
	.action(() => {
		keysListCommand({ json: program.opts().json });
	});

// ── Completions ──

const completions = program
	.command("completions")
	.description("Generate shell completion scripts");

completions
	.command("bash")
	.description("Generate bash completions")
	.action(() => completionsCommand("bash"));

completions
	.command("zsh")
	.description("Generate zsh completions")
	.action(() => completionsCommand("zsh"));

completions
	.command("fish")
	.description("Generate fish completions")
	.action(() => completionsCommand("fish"));

completions
	.command("install")
	.description("Show install instructions for your shell")
	.action(() => completionsInstallCommand());

// ── Status & Demo ──

program
	.command("status")
	.description("Show current .credat/ state")
	.action(() => {
		statusCommand({ json: program.opts().json });
	});

program
	.command("demo")
	.description("Run a full interactive trust flow demo")
	.action(async () => {
		await demoCommand();
	});

program.parseAsync().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err);
	console.error(`\n  ${pc.red("Error:")} ${message}\n`);
	process.exit(1);
});
