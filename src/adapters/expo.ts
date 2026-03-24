import * as fs from "node:fs";
import * as path from "node:path";
import type {
  PlatformAdapter,
  NormalizedAppConfig,
  IconEntry,
  DeepLinkConfig,
} from "../types.js";
import { fileExists, readJsonFile } from "../utils.js";

/** Shape of the Expo config inside app.json */
interface ExpoConfig {
  name?: string;
  slug?: string;
  version?: string;
  icon?: string;
  ios?: {
    bundleIdentifier?: string;
    buildNumber?: string;
    icon?: string;
    supportsTablet?: boolean;
    infoPlist?: Record<string, unknown>;
  };
  android?: {
    package?: string;
    versionCode?: number;
    icon?: string;
    adaptiveIcon?: {
      foregroundImage?: string;
      backgroundColor?: string;
    };
    permissions?: string[];
  };
  plugins?: unknown[];
}

/** Shape of eas.json */
interface EasJson {
  build?: {
    production?: Record<string, unknown>;
    [profile: string]: unknown;
  };
}

export const expoAdapter: PlatformAdapter = {
  platform: "expo",

  detect(cwd: string): boolean {
    // Check for app.json with "expo" key
    const appJsonPath = path.join(cwd, "app.json");
    if (fileExists(appJsonPath)) {
      const appJson = readJsonFile<Record<string, unknown>>(appJsonPath);
      if (appJson && "expo" in appJson) {
        return true;
      }
    }

    // Check for app.config.js or app.config.ts
    if (
      fileExists(path.join(cwd, "app.config.js")) ||
      fileExists(path.join(cwd, "app.config.ts"))
    ) {
      return true;
    }

    return false;
  },

  normalize(cwd: string): NormalizedAppConfig {
    const appJsonPath = path.join(cwd, "app.json");
    const appJson = readJsonFile<{ expo?: ExpoConfig }>(appJsonPath);
    const expo = appJson?.expo ?? {};

    const easJsonPath = path.join(cwd, "eas.json");
    const easJson = readJsonFile<EasJson>(easJsonPath);
    const hasEas = fileExists(easJsonPath);
    const hasProductionProfile = !!easJson?.build?.production;

    // ── App name ────────────────────────────────────────────────────────────
    const appName = expo.name ?? "Unknown";

    // ── Version info ────────────────────────────────────────────────────────
    const versionName = expo.version ?? "1.0.0";

    // ── Android config ──────────────────────────────────────────────────────
    const androidPackage = expo.android?.package ?? "";
    const androidVersionCode = expo.android?.versionCode ?? 1;
    const androidPermissions = (expo.android?.permissions ?? []).map((perm) =>
      perm.startsWith("android.permission.")
        ? perm
        : `android.permission.${perm}`,
    );

    // ── iOS config ──────────────────────────────────────────────────────────
    const iosBundleId = expo.ios?.bundleIdentifier ?? "";
    const iosBuildNumber = expo.ios?.buildNumber ?? "1";
    const infoPlist = expo.ios?.infoPlist ?? {};

    // Extract usage descriptions (keys matching NS*Description)
    const usageDescriptions: Record<string, string> = {};
    for (const [key, value] of Object.entries(infoPlist)) {
      if (
        key.startsWith("NS") &&
        key.endsWith("Description") &&
        typeof value === "string"
      ) {
        usageDescriptions[key] = value;
      }
    }

    // Encryption declaration
    const encryptionDeclared =
      typeof infoPlist.ITSAppUsesNonExemptEncryption === "boolean"
        ? !infoPlist.ITSAppUsesNonExemptEncryption
        : false;

    // ── Icons ───────────────────────────────────────────────────────────────
    const icons: IconEntry[] = [];
    const iconPaths: { label: string; relativePath: string | undefined }[] = [
      { label: "expo.icon", relativePath: expo.icon },
      { label: "expo.ios.icon", relativePath: expo.ios?.icon },
      { label: "expo.android.icon", relativePath: expo.android?.icon },
      {
        label: "expo.android.adaptiveIcon",
        relativePath: expo.android?.adaptiveIcon?.foregroundImage,
      },
    ];

    for (const { label, relativePath } of iconPaths) {
      if (relativePath) {
        const fullPath = path.resolve(cwd, relativePath);
        icons.push({
          size: label,
          path: relativePath,
          exists: fileExists(fullPath),
        });
      }
    }

    // ── Source code directories ──────────────────────────────────────────────
    const candidateDirs = ["app/", "src/", "components/", "screens/"];
    const sourceCodeDirs = candidateDirs.filter((dir) => {
      const fullPath = path.join(cwd, dir);
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    // ── Deep links ──────────────────────────────────────────────────────────
    const deepLinks: DeepLinkConfig[] = [];

    return {
      platform: "expo",
      appName,
      icons,
      deepLinks,
      sourceCodeDirs,
      projectRoot: cwd,
      android: {
        packageId: androidPackage,
        appName,
        versionCode: androidVersionCode,
        versionName,
        minSdkVersion: 21,
        targetSdkVersion: 34,
        permissions: androidPermissions,
        signingConfigured: hasProductionProfile,
      },
      ios: {
        bundleId: iosBundleId,
        appName,
        version: versionName,
        buildNumber: iosBuildNumber,
        usageDescriptions,
        capabilities: [],
        encryptionDeclared,
      },
    };
  },
};
