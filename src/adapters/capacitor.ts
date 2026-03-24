import * as fs from "node:fs";
import * as path from "node:path";
import type {
  PlatformAdapter,
  NormalizedAppConfig,
  AndroidConfig,
  IosConfig,
  IconEntry,
  DeepLinkConfig,
} from "../types.js";
import {
  fileExists,
  readJsonFile,
  parseCapacitorConfig,
  parsePlist,
  parseAndroidManifest,
} from "../utils.js";

/** Shape of apple-app-site-association JSON */
interface AasaJson {
  applinks?: {
    details?: Array<{
      appID?: string;
      appIDs?: string[];
      paths?: string[];
      components?: Array<Record<string, unknown>>;
    }>;
  };
}

const ICON_SIZES = [
  "192x192",
  "512x512",
  "1024x1024",
  "180x180",
  "167x167",
  "152x152",
  "120x120",
];

export const capacitorAdapter: PlatformAdapter = {
  platform: "capacitor",

  detect(cwd: string): boolean {
    return (
      fileExists(path.join(cwd, "capacitor.config.ts")) ||
      fileExists(path.join(cwd, "capacitor.config.json"))
    );
  },

  normalize(cwd: string): NormalizedAppConfig {
    // Parse Capacitor config (prefer .ts, fall back to .json)
    const configTsPath = path.join(cwd, "capacitor.config.ts");
    const configJsonPath = path.join(cwd, "capacitor.config.json");
    const configPath = fileExists(configTsPath) ? configTsPath : configJsonPath;
    const capConfig = parseCapacitorConfig(configPath);

    const appId = capConfig?.appId ?? "unknown";
    const appName = capConfig?.appName ?? "Unknown App";

    // iOS configuration
    const ios = buildIosConfig(cwd, appId, appName);

    // Android configuration
    const android = buildAndroidConfig(cwd, appId, appName);

    // Icons
    const icons = readIcons(cwd);

    // Deep links from AASA
    const deepLinks = readDeepLinks(cwd);

    // Source code directories
    const candidateDirs = ["app/", "components/", "lib/", "src/"];
    const sourceCodeDirs = candidateDirs.filter((dir) => {
      const fullPath = path.join(cwd, dir);
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    // Store listing path
    const storeListingPath = path.join(cwd, "docs", "appstore-listing.txt");

    return {
      platform: "capacitor",
      android: android ?? undefined,
      ios: ios ?? undefined,
      appName,
      icons,
      privacyPolicyUrl: undefined,
      deepLinks,
      storeListingPath: fileExists(storeListingPath)
        ? storeListingPath
        : undefined,
      sourceCodeDirs: sourceCodeDirs.map((dir) => path.join(cwd, dir)),
      projectRoot: cwd,
    };
  },
};

function buildIosConfig(
  cwd: string,
  appId: string,
  appName: string,
): IosConfig | null {
  const infoPlistPath = path.join(cwd, "ios", "App", "App", "Info.plist");
  const entitlementsPath = path.join(
    cwd,
    "ios",
    "App",
    "App",
    "App.entitlements",
  );

  // If neither iOS config file exists, skip iOS config
  if (!fileExists(infoPlistPath) && !fileExists(entitlementsPath)) {
    return null;
  }

  const plist = parsePlist(infoPlistPath);

  // Extract version info from plist
  const version =
    plist && typeof plist["CFBundleShortVersionString"] === "string"
      ? plist["CFBundleShortVersionString"]
      : "1.0.0";
  const buildNumber =
    plist && typeof plist["CFBundleVersion"] === "string"
      ? plist["CFBundleVersion"]
      : "1";

  // Extract usage descriptions: keys starting with "NS" and ending with "UsageDescription" or "Description"
  const usageDescriptions: Record<string, string> = {};
  if (plist) {
    for (const [key, value] of Object.entries(plist)) {
      if (
        key.startsWith("NS") &&
        (key.endsWith("UsageDescription") || key.endsWith("Description")) &&
        typeof value === "string"
      ) {
        usageDescriptions[key] = value;
      }
    }
  }

  // Check encryption declaration
  let encryptionDeclared = false;
  if (plist && typeof plist["ITSAppUsesNonExemptEncryption"] === "boolean") {
    encryptionDeclared = true;
  }

  // Parse entitlements for capabilities
  const capabilities = readCapabilities(entitlementsPath);

  // AASA path
  const aasaPath = path.join(
    cwd,
    "public",
    ".well-known",
    "apple-app-site-association",
  );

  return {
    bundleId: appId,
    appName,
    version,
    buildNumber,
    infoPlistPath: fileExists(infoPlistPath) ? infoPlistPath : undefined,
    usageDescriptions,
    capabilities,
    encryptionDeclared,
    aasaPath: fileExists(aasaPath) ? aasaPath : undefined,
    entitlementsPath: fileExists(entitlementsPath)
      ? entitlementsPath
      : undefined,
  };
}

function readCapabilities(entitlementsPath: string): string[] {
  const plist = parsePlist(entitlementsPath);
  if (!plist) return [];

  // Entitlement keys represent capabilities
  // e.g. "com.apple.developer.associated-domains", "aps-environment"
  return Object.keys(plist);
}

function buildAndroidConfig(
  cwd: string,
  appId: string,
  appName: string,
): AndroidConfig | null {
  const manifestPath = path.join(
    cwd,
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml",
  );

  if (!fileExists(manifestPath)) {
    return null;
  }

  const manifestData = parseAndroidManifest(manifestPath);
  const permissions = manifestData?.permissions ?? [];
  const packageId = manifestData?.packageId ?? appId;

  // Read asset links for fingerprints
  const assetLinksPath = path.join(
    cwd,
    "public",
    ".well-known",
    "assetlinks.json",
  );

  interface AssetLinksEntry {
    target?: { sha256_cert_fingerprints?: string[] };
  }

  const assetLinks = readJsonFile<AssetLinksEntry[]>(assetLinksPath);
  const assetLinksFingerprints: string[] = [];
  if (Array.isArray(assetLinks)) {
    for (const entry of assetLinks) {
      const certs = entry?.target?.sha256_cert_fingerprints;
      if (Array.isArray(certs)) {
        for (const cert of certs) {
          if (typeof cert === "string") {
            assetLinksFingerprints.push(cert);
          }
        }
      }
    }
  }

  return {
    packageId,
    appName,
    versionCode: 1,
    versionName: "1.0.0",
    minSdkVersion: 22,
    targetSdkVersion: 34,
    permissions,
    signingConfigured: false,
    assetLinksPath: fileExists(assetLinksPath) ? assetLinksPath : undefined,
    assetLinksFingerprints:
      assetLinksFingerprints.length > 0 ? assetLinksFingerprints : undefined,
  };
}

function readIcons(cwd: string): IconEntry[] {
  const icons: IconEntry[] = [];

  for (const size of ICON_SIZES) {
    const iconPath = path.join(cwd, "public", "icons", `icon-${size}.png`);
    icons.push({
      size,
      path: iconPath,
      exists: fileExists(iconPath),
    });
  }

  return icons;
}

function readDeepLinks(cwd: string): DeepLinkConfig[] {
  const deepLinks: DeepLinkConfig[] = [];

  // iOS deep links from AASA
  const aasaPath = path.join(
    cwd,
    "public",
    ".well-known",
    "apple-app-site-association",
  );
  const aasa = readJsonFile<AasaJson>(aasaPath);
  if (aasa?.applinks?.details) {
    const routes: string[] = [];
    for (const detail of aasa.applinks.details) {
      if (Array.isArray(detail.paths)) {
        for (const p of detail.paths) {
          if (typeof p === "string") {
            routes.push(p);
          }
        }
      }
    }
    if (routes.length > 0) {
      deepLinks.push({ platform: "ios", routes });
    }
  }

  // Android deep links from asset links (presence indicates DAL verification)
  const assetLinksPath = path.join(
    cwd,
    "public",
    ".well-known",
    "assetlinks.json",
  );
  if (fileExists(assetLinksPath)) {
    deepLinks.push({ platform: "android", routes: [] });
  }

  return deepLinks;
}
