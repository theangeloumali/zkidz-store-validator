import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";

// ─── ANSI Color Helpers ──────────────────────────────────────────────────────

export function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

export function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

export function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

export function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}

// ─── File Reading Helpers ────────────────────────────────────────────────────

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export function readTextFile(filePath: string): string | null {
  try {
    if (!fileExists(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const text = readTextFile(filePath);
    if (text === null) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function parseYamlFile<T>(filePath: string): T | null {
  try {
    const text = readTextFile(filePath);
    if (text === null) return null;
    return YAML.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Info.plist Parser ───────────────────────────────────────────────────────

export function parsePlist(
  filePath: string,
): Record<string, string | boolean | string[]> | null {
  const text = readTextFile(filePath);
  if (text === null) return null;

  const result: Record<string, string | boolean | string[]> = {};

  // Match all <key>...</key> entries and capture what follows
  const keyRegex = /<key>([^<]+)<\/key>/g;
  let match: RegExpExecArray | null;

  while ((match = keyRegex.exec(text)) !== null) {
    const key = match[1];
    const afterKey = text.slice(match.index + match[0].length).trimStart();

    // Check for <string>value</string>
    const stringMatch = afterKey.match(/^<string>([^<]*)<\/string>/);
    if (stringMatch) {
      result[key] = stringMatch[1];
      continue;
    }

    // Check for <true/>
    if (/^<true\s*\/>/.test(afterKey)) {
      result[key] = true;
      continue;
    }

    // Check for <false/>
    if (/^<false\s*\/>/.test(afterKey)) {
      result[key] = false;
      continue;
    }

    // Check for <array> containing <string> elements
    const arrayMatch = afterKey.match(/^<array>([\s\S]*?)<\/array>/);
    if (arrayMatch) {
      const arrayContent = arrayMatch[1];
      const items: string[] = [];
      const itemRegex = /<string>([^<]*)<\/string>/g;
      let itemMatch: RegExpExecArray | null;
      while ((itemMatch = itemRegex.exec(arrayContent)) !== null) {
        items.push(itemMatch[1]);
      }
      result[key] = items;
      continue;
    }
  }

  return result;
}

// ─── Gradle File Parser ─────────────────────────────────────────────────────

export interface GradleConfig {
  applicationId: string | null;
  minSdkVersion: number | null;
  targetSdkVersion: number | null;
  versionCode: number | null;
  versionName: string | null;
  hasSigningConfig: boolean;
}

export function parseGradleFile(filePath: string): GradleConfig | null {
  const text = readTextFile(filePath);
  if (text === null) return null;

  const config: GradleConfig = {
    applicationId: null,
    minSdkVersion: null,
    targetSdkVersion: null,
    versionCode: null,
    versionName: null,
    hasSigningConfig: false,
  };

  // applicationId — Groovy: applicationId "com.foo" | Kotlin: applicationId = "com.foo"
  const appIdMatch = text.match(/applicationId\s*=?\s*["']([^"']+)["']/);
  if (appIdMatch) config.applicationId = appIdMatch[1];

  // minSdkVersion / minSdk — Groovy: minSdkVersion 21 | Kotlin: minSdk = 21
  const minSdkMatch = text.match(/(?:minSdkVersion|minSdk)\s*=?\s*(\d+)/);
  if (minSdkMatch) config.minSdkVersion = parseInt(minSdkMatch[1], 10);

  // targetSdkVersion / targetSdk
  const targetSdkMatch = text.match(
    /(?:targetSdkVersion|targetSdk)\s*=?\s*(\d+)/,
  );
  if (targetSdkMatch) config.targetSdkVersion = parseInt(targetSdkMatch[1], 10);

  // versionCode
  const versionCodeMatch = text.match(/versionCode\s*=?\s*(\d+)/);
  if (versionCodeMatch) config.versionCode = parseInt(versionCodeMatch[1], 10);

  // versionName — Groovy: versionName "1.0" | Kotlin: versionName = "1.0"
  const versionNameMatch = text.match(/versionName\s*=?\s*["']([^"']+)["']/);
  if (versionNameMatch) config.versionName = versionNameMatch[1];

  // signingConfig / signingConfigs presence
  config.hasSigningConfig = /signingConfig(?:s)?\s/.test(text);

  return config;
}

// ─── Capacitor Config Parser ─────────────────────────────────────────────────

export interface CapacitorConfig {
  appId: string | null;
  appName: string | null;
  serverUrl: string | null;
}

export function parseCapacitorConfig(filePath: string): CapacitorConfig | null {
  const text = readTextFile(filePath);
  if (text === null) return null;

  const config: CapacitorConfig = {
    appId: null,
    appName: null,
    serverUrl: null,
  };

  if (filePath.endsWith(".json")) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      config.appId = (json.appId as string) ?? null;
      config.appName = (json.appName as string) ?? null;
      const server = json.server as Record<string, unknown> | undefined;
      config.serverUrl = (server?.url as string) ?? null;
    } catch {
      return config;
    }
  } else {
    // TypeScript source — extract via regex
    const appIdMatch = text.match(/appId\s*:\s*["']([^"']+)["']/);
    if (appIdMatch) config.appId = appIdMatch[1];

    const appNameMatch = text.match(/appName\s*:\s*["']([^"']+)["']/);
    if (appNameMatch) config.appName = appNameMatch[1];

    // server.url or server: { url: "..." }
    const serverUrlMatch = text.match(
      /(?:server\s*:\s*\{[^}]*url\s*:\s*["']([^"']+)["']|url\s*:\s*["']([^"']+)["'])/,
    );
    if (serverUrlMatch)
      config.serverUrl = serverUrlMatch[1] ?? serverUrlMatch[2] ?? null;
  }

  return config;
}

// ─── Source Code Grep ────────────────────────────────────────────────────────

export function grepSourceFiles(
  dirs: string[],
  pattern: RegExp,
  extensions?: string[],
): boolean {
  const exts = extensions ?? [".ts", ".tsx", ".js", ".jsx"];

  function searchDir(dirPath: string): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip common non-source directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === "build" ||
          entry.name === ".next"
        ) {
          continue;
        }
        if (searchDir(fullPath)) return true;
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!exts.includes(ext)) continue;

        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (pattern.test(content)) return true;
        } catch {
          continue;
        }
      }
    }

    return false;
  }

  for (const dir of dirs) {
    if (searchDir(dir)) return true;
  }

  return false;
}

// ─── Android Manifest Parser ─────────────────────────────────────────────────

export function parseAndroidManifest(
  filePath: string,
): { permissions: string[]; packageId: string | null } | null {
  const text = readTextFile(filePath);
  if (text === null) return null;

  const permissions: string[] = [];
  const permRegex =
    /<uses-permission\s+android:name\s*=\s*["']([^"']+)["']\s*\/?\s*>/g;
  let permMatch: RegExpExecArray | null;
  while ((permMatch = permRegex.exec(text)) !== null) {
    permissions.push(permMatch[1]);
  }

  let packageId: string | null = null;
  const packageMatch = text.match(
    /<manifest[^>]+package\s*=\s*["']([^"']+)["']/,
  );
  if (packageMatch) packageId = packageMatch[1];

  return { permissions, packageId };
}

// ─── HTTP Fetch with Timeout ─────────────────────────────────────────────────

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10_000,
): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}
