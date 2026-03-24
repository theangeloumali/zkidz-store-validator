import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CheckResult,
  ValidationAgent,
  NormalizedAppConfig,
  RunOptions,
} from "../types.js";
import { readTextFile } from "../utils.js";

const CONFIG_FILES = [
  "twa-manifest.json",
  "capacitor.config.ts",
  "capacitor.config.json",
  "app.json",
  "pubspec.yaml",
];

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Google API key", pattern: /AIza[A-Za-z0-9_-]{35}/ },
  { name: "OpenAI secret key", pattern: /sk-[A-Za-z0-9]{20,}/ },
  { name: "Stripe live secret key", pattern: /sk_live_/ },
  { name: "Stripe live publishable key", pattern: /pk_live_/ },
  { name: "AWS access key", pattern: /AKIA[A-Z0-9]{16}/ },
  { name: "Supabase key", pattern: /supabase.*key/i },
];

const ENV_FILES = [".env", ".env.local", ".env.production"];

const HTTP_EXCLUDE = [/http:\/\/localhost/i, /http:\/\/schemas\.android\.com/i];

export const securityAgent: ValidationAgent = {
  name: "security",

  async run(
    config: NormalizedAppConfig,
    _options: RunOptions,
  ): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // ── security.no-api-keys ───────────────────────────────────────────────
    {
      const found: string[] = [];

      for (const fileName of CONFIG_FILES) {
        const filePath = path.join(config.projectRoot, fileName);
        const content = readTextFile(filePath);
        if (content === null) continue;

        for (const { name, pattern } of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            found.push(`${name} in ${fileName}`);
          }
        }
      }

      results.push({
        id: "security.no-api-keys",
        agent: "security",
        severity: found.length > 0 ? "FAIL" : "PASS",
        title: "No API keys in config files",
        message:
          found.length > 0
            ? `Found secrets: ${found.join(", ")}`
            : "No API keys or secrets found in config files.",
      });
    }

    // ── security.no-env-public ─────────────────────────────────────────────
    {
      const publicDir = path.join(config.projectRoot, "public");
      const foundFiles: string[] = [];

      for (const envFile of ENV_FILES) {
        const envPath = path.join(publicDir, envFile);
        try {
          if (fs.existsSync(envPath)) {
            foundFiles.push(envFile);
          }
        } catch {
          // ignore
        }
      }

      results.push({
        id: "security.no-env-public",
        agent: "security",
        severity: foundFiles.length > 0 ? "FAIL" : "PASS",
        title: "No .env files in public directory",
        message:
          foundFiles.length > 0
            ? `Found environment files in public/: ${foundFiles.join(", ")}`
            : "No .env files found in public/ directory.",
      });
    }

    // ── security.https-urls ────────────────────────────────────────────────
    {
      const httpMatches: string[] = [];
      const httpPattern = /http:\/\/[^\s"']+/g;

      for (const fileName of CONFIG_FILES) {
        const filePath = path.join(config.projectRoot, fileName);
        const content = readTextFile(filePath);
        if (content === null) continue;

        let match: RegExpExecArray | null;
        while ((match = httpPattern.exec(content)) !== null) {
          const url = match[0];
          const isExcluded = HTTP_EXCLUDE.some((exclude) => exclude.test(url));
          if (!isExcluded) {
            httpMatches.push(`${url} in ${fileName}`);
          }
        }
      }

      results.push({
        id: "security.https-urls",
        agent: "security",
        severity: httpMatches.length > 0 ? "WARN" : "PASS",
        title: "HTTPS-only URLs in config",
        message:
          httpMatches.length > 0
            ? `Found non-HTTPS URLs: ${httpMatches.join(", ")}`
            : "All URLs in config files use HTTPS.",
      });
    }

    // ── security.no-keystore-in-repo ───────────────────────────────────────
    {
      const keystoreFiles: string[] = [];

      try {
        const entries = fs.readdirSync(config.projectRoot, {
          withFileTypes: true,
        });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (entry.name.endsWith(".keystore") || entry.name.endsWith(".jks")) {
            keystoreFiles.push(entry.name);
          }
        }
      } catch {
        // ignore
      }

      results.push({
        id: "security.no-keystore-in-repo",
        agent: "security",
        severity: keystoreFiles.length > 0 ? "WARN" : "PASS",
        title: "No keystore files in project root",
        message:
          keystoreFiles.length > 0
            ? `Found keystore files in root: ${keystoreFiles.join(", ")}. Consider moving them outside the repo.`
            : "No keystore files found in project root.",
      });
    }

    return results;
  },
};
