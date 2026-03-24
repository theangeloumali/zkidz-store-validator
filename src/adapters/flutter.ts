import * as fs from "node:fs";
import * as path from "node:path";
import type {
  PlatformAdapter,
  NormalizedAppConfig,
  IconEntry,
  DeepLinkConfig,
} from "../types.js";
import {
  fileExists,
  parseYamlFile,
  parseGradleFile,
  parseAndroidManifest,
  parsePlist,
  readTextFile,
} from "../utils.js";

/** Shape of pubspec.yaml */
interface PubspecYaml {
  name?: string;
  description?: string;
  version?: string;
  flutter?: Record<string, unknown>;
}

/**
 * Parse a Flutter version string "X.Y.Z+buildNumber".
 * Returns { versionName, buildNumber }.
 */
function parseFlutterVersion(version: string): {
  versionName: string;
  buildNumber: string;
} {
  const plusIndex = version.indexOf("+");
  if (plusIndex === -1) {
    return { versionName: version, buildNumber: "1" };
  }
  return {
    versionName: version.slice(0, plusIndex),
    buildNumber: version.slice(plusIndex + 1),
  };
}

/**
 * Extract deep link routes from an Android manifest's intent-filter entries.
 * Looks for <data android:scheme="..." android:host="..." android:pathPrefix="..." />
 */
function extractDeepLinksFromManifest(manifestPath: string): string[] {
  const text = readTextFile(manifestPath);
  if (!text) return [];

  const routes: string[] = [];
  const dataRegex =
    /<data\s+[^>]*android:scheme\s*=\s*["']([^"']+)["'][^>]*android:host\s*=\s*["']([^"']+)["'][^>]*/g;
  let match: RegExpExecArray | null;

  while ((match = dataRegex.exec(text)) !== null) {
    const scheme = match[1];
    const host = match[2];

    // Try to extract pathPrefix
    const fullTag = match[0];
    const pathPrefixMatch = fullTag.match(
      /android:pathPrefix\s*=\s*["']([^"']+)["']/,
    );
    const pathPrefix = pathPrefixMatch ? pathPrefixMatch[1] : "";

    routes.push(`${scheme}://${host}${pathPrefix}`);
  }

  return routes;
}

export const flutterAdapter: PlatformAdapter = {
  platform: "flutter",

  detect(cwd: string): boolean {
    const pubspec = parseYamlFile<PubspecYaml>(path.join(cwd, "pubspec.yaml"));
    if (!pubspec || !pubspec.flutter) return false;

    const hasAndroidDir = fileExists(path.join(cwd, "android"));
    const hasIosDir = fileExists(path.join(cwd, "ios"));

    return hasAndroidDir || hasIosDir;
  },

  normalize(cwd: string): NormalizedAppConfig {
    const pubspec =
      parseYamlFile<PubspecYaml>(path.join(cwd, "pubspec.yaml")) ?? {};

    // ── App name & version ──────────────────────────────────────────────────
    const appName = pubspec.name ?? "Unknown";
    const rawVersion = pubspec.version ?? "1.0.0+1";
    const { versionName, buildNumber } = parseFlutterVersion(rawVersion);

    // ── Android config ──────────────────────────────────────────────────────
    const gradlePath = path.join(cwd, "android", "app", "build.gradle");
    const gradleKtsPath = path.join(cwd, "android", "app", "build.gradle.kts");
    const gradleConfig =
      parseGradleFile(gradlePath) ?? parseGradleFile(gradleKtsPath);

    const manifestPath = path.join(
      cwd,
      "android",
      "app",
      "src",
      "main",
      "AndroidManifest.xml",
    );
    const manifest = parseAndroidManifest(manifestPath);

    const androidPackageId =
      gradleConfig?.applicationId ?? manifest?.packageId ?? "";
    const androidPermissions = manifest?.permissions ?? [];

    // ── iOS config ──────────────────────────────────────────────────────────
    const infoPlistPath = path.join(cwd, "ios", "Runner", "Info.plist");
    const plistData = parsePlist(infoPlistPath);

    const usageDescriptions: Record<string, string> = {};
    if (plistData) {
      for (const [key, value] of Object.entries(plistData)) {
        if (
          key.startsWith("NS") &&
          key.endsWith("Description") &&
          typeof value === "string"
        ) {
          usageDescriptions[key] = value;
        }
      }
    }

    const iosBundleId =
      plistData && typeof plistData.CFBundleIdentifier === "string"
        ? plistData.CFBundleIdentifier
        : "";
    const iosVersion =
      plistData && typeof plistData.CFBundleShortVersionString === "string"
        ? plistData.CFBundleShortVersionString
        : versionName;
    const iosBuildNumber =
      plistData && typeof plistData.CFBundleVersion === "string"
        ? plistData.CFBundleVersion
        : buildNumber;

    const encryptionDeclared =
      plistData && typeof plistData.ITSAppUsesNonExemptEncryption === "boolean"
        ? !plistData.ITSAppUsesNonExemptEncryption
        : false;

    // Extract capabilities from entitlements
    const capabilities: string[] = [];
    const entitlementsPath = path.join(
      cwd,
      "ios",
      "Runner",
      "Runner.entitlements",
    );
    if (fileExists(entitlementsPath)) {
      const entitlementsPlist = parsePlist(entitlementsPath);
      if (entitlementsPlist) {
        capabilities.push(...Object.keys(entitlementsPlist));
      }
    }

    // ── Icons ───────────────────────────────────────────────────────────────
    const icons: IconEntry[] = [];
    const iconCandidates = [
      {
        size: "android-xxxhdpi",
        path: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
      },
      {
        size: "android-xxhdpi",
        path: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
      },
      {
        size: "android-xhdpi",
        path: "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",
      },
      {
        size: "android-hdpi",
        path: "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
      },
      {
        size: "android-mdpi",
        path: "android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
      },
      {
        size: "ios-appicon",
        path: "ios/Runner/Assets.xcassets/AppIcon.appiconset/",
      },
      { size: "assets-icon", path: "assets/icon/icon.png" },
    ];

    for (const candidate of iconCandidates) {
      const fullPath = path.join(cwd, candidate.path);
      icons.push({
        size: candidate.size,
        path: candidate.path,
        exists: fileExists(fullPath),
      });
    }

    // ── Deep links ──────────────────────────────────────────────────────────
    const deepLinks: DeepLinkConfig[] = [];
    const androidRoutes = extractDeepLinksFromManifest(manifestPath);
    if (androidRoutes.length > 0) {
      deepLinks.push({ platform: "android", routes: androidRoutes });
    }

    // ── Source code directories ──────────────────────────────────────────────
    const sourceCodeDirs = ["lib/"].filter((dir) => {
      const fullPath = path.join(cwd, dir);
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    return {
      platform: "flutter",
      appName,
      icons,
      deepLinks,
      sourceCodeDirs,
      projectRoot: cwd,
      android: {
        packageId: androidPackageId,
        appName,
        versionCode:
          (gradleConfig?.versionCode ?? parseInt(buildNumber, 10)) || 1,
        versionName: gradleConfig?.versionName ?? versionName,
        minSdkVersion: gradleConfig?.minSdkVersion ?? 21,
        targetSdkVersion: gradleConfig?.targetSdkVersion ?? 34,
        permissions: androidPermissions,
        signingConfigured: gradleConfig?.hasSigningConfig ?? false,
      },
      ios: {
        bundleId: iosBundleId,
        appName,
        version: iosVersion,
        buildNumber: iosBuildNumber,
        infoPlistPath: fileExists(infoPlistPath) ? infoPlistPath : undefined,
        usageDescriptions,
        capabilities,
        encryptionDeclared,
        entitlementsPath: fileExists(entitlementsPath)
          ? entitlementsPath
          : undefined,
      },
    };
  },
};
