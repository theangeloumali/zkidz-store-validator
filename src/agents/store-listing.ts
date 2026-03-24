import * as path from "node:path";
import type {
  CheckResult,
  ValidationAgent,
  NormalizedAppConfig,
  RunOptions,
} from "../types.js";
import { readTextFile, fetchWithTimeout } from "../utils.js";

const PLACEHOLDER_NAMES = [
  "myapp",
  "example",
  "todo",
  "test app",
  "app",
  "new app",
];

const CONFIG_FILES_TO_CHECK = [
  "manifest.json",
  "app.json",
  "twa-manifest.json",
];

const PLACEHOLDER_PATTERN = /TODO|PLACEHOLDER|FIXME/i;

export const storeListingAgent: ValidationAgent = {
  name: "store-listing",

  async run(
    config: NormalizedAppConfig,
    options: RunOptions,
  ): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // ── listing.app-name-length ────────────────────────────────────────────
    {
      const len = config.appName.length;
      results.push({
        id: "listing.app-name-length",
        agent: "store-listing",
        severity: len > 30 ? "FAIL" : "PASS",
        title: "App name length",
        message:
          len > 30
            ? `App name "${config.appName}" is ${len} characters (max 30).`
            : `App name "${config.appName}" is ${len} characters.`,
        docs: "https://support.google.com/googleplay/android-developer/answer/9859152",
      });
    }

    // ── listing.app-name-placeholder ───────────────────────────────────────
    {
      const nameLower = config.appName.toLowerCase();
      const isPlaceholder = PLACEHOLDER_NAMES.some(
        (p) => nameLower === p || nameLower.includes(p),
      );

      results.push({
        id: "listing.app-name-placeholder",
        agent: "store-listing",
        severity: isPlaceholder ? "FAIL" : "PASS",
        title: "App name is not a placeholder",
        message: isPlaceholder
          ? `App name "${config.appName}" looks like a placeholder.`
          : `App name "${config.appName}" does not match known placeholders.`,
      });
    }

    // ── listing.icon-192 ───────────────────────────────────────────────────
    {
      const icon = config.icons.find((i) => i.size === "192x192");
      const exists = icon?.exists ?? false;

      results.push({
        id: "listing.icon-192",
        agent: "store-listing",
        severity: icon && exists ? "PASS" : "FAIL",
        title: "192x192 icon present",
        message:
          icon && exists
            ? `192x192 icon found at ${icon.path}.`
            : "Missing 192x192 icon (required for Android/PWA).",
        docs: "https://developer.android.com/distribute/google-play/resources/icon-design-specifications",
      });
    }

    // ── listing.icon-512 ───────────────────────────────────────────────────
    {
      const icon = config.icons.find((i) => i.size === "512x512");
      const exists = icon?.exists ?? false;

      results.push({
        id: "listing.icon-512",
        agent: "store-listing",
        severity: icon && exists ? "PASS" : "FAIL",
        title: "512x512 icon present",
        message:
          icon && exists
            ? `512x512 icon found at ${icon.path}.`
            : "Missing 512x512 icon (required for Play Store).",
        docs: "https://developer.android.com/distribute/google-play/resources/icon-design-specifications",
      });
    }

    // ── listing.icon-1024 ──────────────────────────────────────────────────
    {
      const icon = config.icons.find((i) => i.size === "1024x1024");
      const exists = icon?.exists ?? false;

      results.push({
        id: "listing.icon-1024",
        agent: "store-listing",
        severity: icon && exists ? "PASS" : "WARN",
        title: "1024x1024 icon present",
        message:
          icon && exists
            ? `1024x1024 icon found at ${icon.path}.`
            : "Missing 1024x1024 icon (required for App Store).",
        docs: "https://developer.apple.com/design/human-interface-guidelines/app-icons",
      });
    }

    // ── listing.privacy-policy ─────────────────────────────────────────────
    {
      const url = config.privacyPolicyUrl;

      if (!url) {
        results.push({
          id: "listing.privacy-policy",
          agent: "store-listing",
          severity: "FAIL",
          title: "Privacy policy URL",
          message:
            "No privacy policy URL configured. Required by both App Store and Play Store.",
          docs: "https://support.google.com/googleplay/android-developer/answer/9859455",
        });
      } else if (options.offline) {
        results.push({
          id: "listing.privacy-policy",
          agent: "store-listing",
          severity: "SKIP",
          title: "Privacy policy URL",
          message: `Privacy policy URL set to ${url}. Skipping reachability check (offline mode).`,
        });
      } else {
        const response = await fetchWithTimeout(url);
        results.push({
          id: "listing.privacy-policy",
          agent: "store-listing",
          severity: response.ok ? "PASS" : "FAIL",
          title: "Privacy policy URL",
          message: response.ok
            ? `Privacy policy at ${url} is reachable (HTTP ${response.status}).`
            : `Privacy policy at ${url} is not reachable (HTTP ${response.status}).`,
          docs: "https://support.google.com/googleplay/android-developer/answer/9859455",
        });
      }
    }

    // ── listing.no-todo-urls ───────────────────────────────────────────────
    {
      const foundIn: string[] = [];

      for (const fileName of CONFIG_FILES_TO_CHECK) {
        const filePath = path.join(config.projectRoot, fileName);
        const content = readTextFile(filePath);
        if (content === null) continue;

        if (PLACEHOLDER_PATTERN.test(content)) {
          foundIn.push(fileName);
        }
      }

      // Also check public/manifest.json
      const publicManifest = path.join(
        config.projectRoot,
        "public",
        "manifest.json",
      );
      const publicContent = readTextFile(publicManifest);
      if (publicContent !== null && PLACEHOLDER_PATTERN.test(publicContent)) {
        foundIn.push("public/manifest.json");
      }

      results.push({
        id: "listing.no-todo-urls",
        agent: "store-listing",
        severity: foundIn.length > 0 ? "FAIL" : "PASS",
        title: "No TODO/PLACEHOLDER in config files",
        message:
          foundIn.length > 0
            ? `Found TODO/PLACEHOLDER/FIXME in: ${foundIn.join(", ")}`
            : "No TODO/PLACEHOLDER/FIXME text found in config files.",
      });
    }

    return results;
  },
};
