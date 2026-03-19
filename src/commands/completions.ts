import pc from "picocolors";
import { success } from "../utils.js";

const COMMANDS = [
	"init",
	"delegate",
	"verify",
	"inspect",
	"revoke",
	"audit",
	"renew",
	"handshake",
	"keys",
	"status",
	"demo",
	"completions",
];

function bashCompletion(): string {
	return `# credat bash completion
_credat() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${COMMANDS.join(" ")}"

  case "\${prev}" in
    credat)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    init)
      COMPREPLY=( $(compgen -W "--domain --path --algorithm --force --output" -- "\${cur}") )
      return 0
      ;;
    delegate)
      COMPREPLY=( $(compgen -W "--agent --scopes --max-value --until --output --json" -- "\${cur}") )
      return 0
      ;;
    verify|inspect|audit)
      COMPREPLY=( $(compgen -W "--json --file" -- "\${cur}") )
      return 0
      ;;
    revoke)
      COMPREPLY=( $(compgen -W "--token --status-list --index --json" -- "\${cur}") )
      return 0
      ;;
    renew)
      COMPREPLY=( $(compgen -W "--until --json" -- "\${cur}") )
      return 0
      ;;
    handshake)
      COMPREPLY=( $(compgen -W "challenge present verify demo" -- "\${cur}") )
      return 0
      ;;
    keys)
      COMPREPLY=( $(compgen -W "export import list" -- "\${cur}") )
      return 0
      ;;
    completions)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
    --algorithm)
      COMPREPLY=( $(compgen -W "ES256 EdDSA" -- "\${cur}") )
      return 0
      ;;
  esac
}
complete -F _credat credat`;
}

function zshCompletion(): string {
	return `#compdef credat

_credat() {
  local -a commands
  commands=(
    'init:Create an agent identity with did:web'
    'delegate:Issue a delegation credential to an agent'
    'verify:Verify a delegation token'
    'inspect:Decode and inspect a delegation token'
    'revoke:Revoke a delegation credential'
    'audit:Validate token against security best practices'
    'renew:Renew a delegation with a new expiry'
    'handshake:Challenge/response trust verification'
    'keys:Import, export, and list key pairs'
    'status:Show current .credat/ state'
    'demo:Run a full interactive trust flow demo'
    'completions:Generate shell completion scripts'
  )

  _arguments -C \\
    '--json[Output as JSON]' \\
    '--version[Show version]' \\
    '--help[Show help]' \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'credat commands' commands
      ;;
    args)
      case $words[1] in
        init)
          _arguments \\
            '--domain[Domain for did:web]:domain:' \\
            '--path[Optional sub-path]:path:' \\
            '--algorithm[Signing algorithm]:algorithm:(ES256 EdDSA)' \\
            '--force[Overwrite existing]' \\
            '--output[Custom output file]:file:_files'
          ;;
        delegate)
          _arguments \\
            '--agent[Agent DID]:did:' \\
            '--scopes[Comma-separated scopes]:scopes:' \\
            '--max-value[Max transaction value]:number:' \\
            '--until[Expiration date]:date:' \\
            '--output[Custom output file]:file:_files' \\
            '--json[Output as JSON]'
          ;;
        handshake)
          _arguments '1:subcommand:(challenge present verify demo)'
          ;;
        keys)
          _arguments '1:subcommand:(export import list)'
          ;;
        completions)
          _arguments '1:shell:(bash zsh fish)'
          ;;
      esac
      ;;
  esac
}

_credat`;
}

function fishCompletion(): string {
	return `# credat fish completion
complete -c credat -e
complete -c credat -n '__fish_use_subcommand' -a 'init' -d 'Create an agent identity'
complete -c credat -n '__fish_use_subcommand' -a 'delegate' -d 'Issue a delegation credential'
complete -c credat -n '__fish_use_subcommand' -a 'verify' -d 'Verify a delegation token'
complete -c credat -n '__fish_use_subcommand' -a 'inspect' -d 'Decode and inspect a token'
complete -c credat -n '__fish_use_subcommand' -a 'revoke' -d 'Revoke a delegation credential'
complete -c credat -n '__fish_use_subcommand' -a 'audit' -d 'Validate token security'
complete -c credat -n '__fish_use_subcommand' -a 'renew' -d 'Renew a delegation'
complete -c credat -n '__fish_use_subcommand' -a 'handshake' -d 'Challenge/response flow'
complete -c credat -n '__fish_use_subcommand' -a 'keys' -d 'Manage key pairs'
complete -c credat -n '__fish_use_subcommand' -a 'status' -d 'Show .credat/ state'
complete -c credat -n '__fish_use_subcommand' -a 'demo' -d 'Run interactive demo'
complete -c credat -n '__fish_use_subcommand' -a 'completions' -d 'Generate completions'

complete -c credat -n '__fish_seen_subcommand_from init' -l domain -d 'Domain for did:web' -r
complete -c credat -n '__fish_seen_subcommand_from init' -l path -d 'Optional sub-path' -r
complete -c credat -n '__fish_seen_subcommand_from init' -l algorithm -d 'Signing algorithm' -ra 'ES256 EdDSA'
complete -c credat -n '__fish_seen_subcommand_from init' -l force -d 'Overwrite existing'
complete -c credat -n '__fish_seen_subcommand_from init' -l output -d 'Custom output file' -rF

complete -c credat -n '__fish_seen_subcommand_from delegate' -l agent -d 'Agent DID' -r
complete -c credat -n '__fish_seen_subcommand_from delegate' -l scopes -d 'Comma-separated scopes' -r
complete -c credat -n '__fish_seen_subcommand_from delegate' -l max-value -d 'Max transaction value' -r
complete -c credat -n '__fish_seen_subcommand_from delegate' -l until -d 'Expiration date' -r
complete -c credat -n '__fish_seen_subcommand_from delegate' -l output -d 'Custom output file' -rF

complete -c credat -n '__fish_seen_subcommand_from handshake' -a 'challenge present verify demo'
complete -c credat -n '__fish_seen_subcommand_from keys' -a 'export import list'
complete -c credat -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish'`;
}

export function completionsCommand(shell: string): void {
	switch (shell) {
		case "bash":
			console.log(bashCompletion());
			break;
		case "zsh":
			console.log(zshCompletion());
			break;
		case "fish":
			console.log(fishCompletion());
			break;
		default:
			throw new Error(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
	}
}

export function completionsInstallCommand(): void {
	const shell = process.env.SHELL ?? "";
	if (shell.includes("zsh")) {
		console.log(pc.dim("  Run:"));
		console.log(
			`  ${pc.bold("credat completions zsh > ~/.zsh/completions/_credat")}`,
		);
	} else if (shell.includes("fish")) {
		console.log(pc.dim("  Run:"));
		console.log(
			`  ${pc.bold("credat completions fish > ~/.config/fish/completions/credat.fish")}`,
		);
	} else {
		console.log(pc.dim("  Run:"));
		console.log(`  ${pc.bold("credat completions bash >> ~/.bashrc")}`);
	}
	console.log();
	success("Follow the command above to install completions");
}
