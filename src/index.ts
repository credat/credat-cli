import { Command, Option } from "commander";
import { VERSION } from "credat";
import pc from "picocolors";
import { banner } from "./banner.js";
import { delegateCommand } from "./commands/delegate.js";
import { demoCommand } from "./commands/demo.js";
import { initCommand } from "./commands/init.js";
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
	.action(async (options) => {
		await initCommand({
			domain: options.domain,
			path: options.path,
			algorithm: options.algorithm,
			force: options.force,
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
	.action(async (options) => {
		await delegateCommand({
			agent: options.agent,
			scopes: options.scopes,
			maxValue: options.maxValue,
			until: options.until,
			json: program.opts().json,
		});
	});

program
	.command("verify [token]")
	.description("Verify a delegation token")
	.action(async (token) => {
		await verifyCommand(token, { json: program.opts().json });
	});

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
