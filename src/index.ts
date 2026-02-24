import { Command } from "commander";
import { VERSION } from "credat";
import { initCommand } from "./commands/init.js";
import { delegateCommand } from "./commands/delegate.js";
import { verifyCommand } from "./commands/verify.js";
import { demoCommand } from "./commands/demo.js";

const program = new Command();

program
	.name("credat")
	.description("CLI for Credat — agent identity and delegation")
	.version(`cli 0.1.0-alpha.1 (sdk ${VERSION})`);

program
	.command("init")
	.description("Create an agent identity with did:web")
	.requiredOption("-d, --domain <domain>", "Domain for did:web (e.g. acme.corp)")
	.option("-p, --path <path>", "Optional sub-path (e.g. agents/my-agent)")
	.option(
		"-a, --algorithm <algorithm>",
		"Signing algorithm: ES256, EdDSA, ES256K",
		"ES256",
	)
	.action(async (options) => {
		await initCommand({
			domain: options.domain,
			path: options.path,
			algorithm: options.algorithm,
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
		});
	});

program
	.command("verify [token]")
	.description("Verify a delegation token")
	.action(async (token, options) => {
		await verifyCommand(token, options);
	});

program
	.command("demo")
	.description("Run a full interactive trust flow demo")
	.action(async () => {
		await demoCommand();
	});

program.parseAsync();
