import * as fs from "node:fs";
import * as path from "node:path";
import type { CheckResult, ResultSummary } from "./types.js";
import { green, yellow, red, bold, dim } from "./utils.js";

const pkgPath = path.resolve(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
  version: string;
};

const TOOL_NAME = "store-validator";
const TOOL_VERSION = pkg.version;
const SEPARATOR = "\u2550".repeat(52);

/** Map platform type to human-readable label */
function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    twa: "TWA (Bubblewrap)",
    capacitor: "Capacitor",
    expo: "Expo",
    flutter: "Flutter",
    "react-native": "React Native",
  };
  return labels[platform] ?? platform;
}

/** Print the tool header with detected platforms */
export function printHeader(platforms: string[]): void {
  const platformList = platforms.map(platformLabel).join(" + ");
  const topBottom = "\u2550".repeat(50);
  console.log(`\u2554${topBottom}\u2557`);
  console.log(
    `\u2551  ${bold(`${TOOL_NAME} v${TOOL_VERSION}`)}${"".padEnd(50 - `  ${TOOL_NAME} v${TOOL_VERSION}`.length)}\u2551`,
  );
  console.log(
    `\u2551  ${dim("by ZKidz Dev")}${"".padEnd(50 - "  by ZKidz Dev".length)}\u2551`,
  );
  console.log(`\u255A${topBottom}\u255D`);
  console.log(`Detected: ${platformList}`);
}

/** Format a severity tag with color */
function severityTag(severity: string): string {
  switch (severity) {
    case "PASS":
      return green("[PASS]");
    case "WARN":
      return yellow("[WARN]");
    case "FAIL":
      return red("[FAIL]");
    case "SKIP":
      return dim("[SKIP]");
    default:
      return `[${severity}]`;
  }
}

/** Print results grouped by agent */
export function printAgentResults(
  agentName: string,
  results: CheckResult[],
): void {
  const count = results.length;
  const heading = `\u2500\u2500 ${agentName} (${count} check${count !== 1 ? "s" : ""}) `;
  const padding = "\u2500".repeat(Math.max(0, 52 - heading.length));
  console.log(`${heading}${padding}`);

  for (const result of results) {
    const tag = severityTag(result.severity);
    console.log(`  ${tag} ${result.title}: ${result.message}`);
  }

  console.log("");
}

/** Calculate summary counts from an array of check results */
export function calculateSummary(results: CheckResult[]): ResultSummary {
  const summary: ResultSummary = {
    total: results.length,
    pass: 0,
    warn: 0,
    fail: 0,
    skip: 0,
  };

  for (const result of results) {
    switch (result.severity) {
      case "PASS":
        summary.pass++;
        break;
      case "WARN":
        summary.warn++;
        break;
      case "FAIL":
        summary.fail++;
        break;
      case "SKIP":
        summary.skip++;
        break;
    }
  }

  return summary;
}

/** Print the final summary with overall status */
export function printSummary(results: CheckResult[]): void {
  const summary = calculateSummary(results);

  console.log(SEPARATOR);
  console.log(
    `SUMMARY: ${green(`${summary.pass} passed`)}, ${yellow(`${summary.warn} warning${summary.warn !== 1 ? "s" : ""}`)}, ${red(`${summary.fail} failed`)}`,
  );
  console.log("");

  if (summary.fail > 0) {
    console.log(red(bold("BLOCKED")) + " \u2014 fix FAILs before submission");
  } else if (summary.warn > 0) {
    console.log(yellow(bold("CAUTION")) + " \u2014 review WARNs");
  } else {
    console.log(green(bold("READY")) + " for store submission");
  }
  console.log(
    dim(
      "  Powered by ZKidz Dev \u2014 github.com/theangeloumali/zkidz-store-validator",
    ),
  );
}

/** Format all results as a JSON string for machine consumption */
export function formatJsonOutput(
  platforms: string[],
  results: CheckResult[],
): string {
  const summary = calculateSummary(results);

  return JSON.stringify(
    {
      tool: TOOL_NAME,
      version: TOOL_VERSION,
      author: "ZKidz Dev",
      platforms,
      results,
      summary,
    },
    null,
    2,
  );
}
