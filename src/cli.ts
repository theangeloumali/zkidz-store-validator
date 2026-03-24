#!/usr/bin/env node

import * as path from "node:path";
import type {
  CliArgs,
  CheckResult,
  NormalizedAppConfig,
  PlatformType,
} from "./types.js";
import { detectPlatforms } from "./detect.js";
import { getAdapter } from "./adapters/index.js";
import { allAgents } from "./agents/index.js";
import {
  printHeader,
  printAgentResults,
  printSummary,
  formatJsonOutput,
} from "./reporter.js";
import { bold, red } from "./utils.js";

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    offline: false,
    verbose: false,
    json: false,
    help: false,
    version: false,
    cwd: process.cwd(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--offline":
        args.offline = true;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--platform":
        args.platform = argv[++i] as PlatformType;
        break;
      case "--cwd":
        args.cwd = path.resolve(argv[++i]);
        break;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
${bold("store-validator")} — Pre-submission validation for App Store & Play Store

${bold("USAGE")}
  npx store-validator [options]

${bold("OPTIONS")}
  --platform <type>  Force platform (twa, capacitor, expo, flutter)
  --offline          Skip network checks (policy downloads, URL reachability)
  --verbose          Show detailed output for all checks
  --json             Output results as JSON (for CI integration)
  --cwd <path>       Set working directory (default: current directory)
  --help, -h         Show this help message
  --version, -v      Show version

${bold("SUPPORTED PLATFORMS")}
  TWA (Bubblewrap)   Detected via twa-manifest.json
  Capacitor          Detected via capacitor.config.ts/json
  Expo               Detected via app.json with "expo" key
  Flutter            Detected via pubspec.yaml with "flutter:" key

${bold("EXAMPLES")}
  npx store-validator                    # Auto-detect and validate
  npx store-validator --offline          # Skip network checks
  npx store-validator --json             # JSON output for CI
  npx store-validator --platform expo    # Force Expo adapter
  npx store-validator --cwd /path/to/app # Validate a different directory
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log("1.0.0");
    process.exit(0);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Detect or use forced platform
  let platforms: PlatformType[];
  if (args.platform) {
    platforms = [args.platform];
  } else {
    platforms = detectPlatforms(args.cwd);
  }

  if (platforms.length === 0) {
    console.error(
      red(
        "No supported platform detected. Run in a directory with twa-manifest.json, capacitor.config.ts, app.json (Expo), or pubspec.yaml (Flutter).",
      ),
    );
    process.exit(1);
  }

  // Print header (unless JSON mode)
  if (!args.json) {
    printHeader(platforms);
  }

  // Normalize configs for each detected platform
  const configs: NormalizedAppConfig[] = [];
  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    configs.push(adapter.normalize(args.cwd));
  }

  // Run all agents against all configs
  const allResults: CheckResult[] = [];
  const runOptions = {
    offline: args.offline,
    verbose: args.verbose,
    cwd: args.cwd,
  };

  for (const agent of allAgents) {
    const agentResults: CheckResult[] = [];

    for (const config of configs) {
      const results = await agent.run(config, runOptions);
      agentResults.push(...results);
    }

    // Deduplicate results with the same id (can happen with multi-platform)
    const seen = new Set<string>();
    const deduped: CheckResult[] = [];
    for (const result of agentResults) {
      const key = `${result.id}:${result.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(result);
      }
    }

    if (deduped.length > 0) {
      allResults.push(...deduped);
      if (!args.json) {
        printAgentResults(agent.name, deduped);
      }
    }
  }

  // Output
  if (args.json) {
    console.log(formatJsonOutput(platforms, allResults));
  } else {
    printSummary(allResults);
  }

  // Exit code
  const hasFail = allResults.some((r) => r.severity === "FAIL");
  process.exit(hasFail ? 1 : 0);
}

main().catch((err) => {
  console.error(
    red(`Fatal error: ${err instanceof Error ? err.message : String(err)}`),
  );
  process.exit(2);
});
