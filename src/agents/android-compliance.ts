import type {
  CheckResult,
  NormalizedAppConfig,
  RunOptions,
  ValidationAgent,
} from "../types.js";
import { fileExists, grepSourceFiles, readJsonFile } from "../utils.js";

const AGENT = "android-compliance";

const PERMISSION_PATTERNS: Record<string, RegExp> = {
  CAMERA: /getUserMedia|ImagePicker|camera/i,
  ACCESS_FINE_LOCATION: /geolocation|getCurrentPosition|watchPosition/i,
  ACCESS_COARSE_LOCATION: /geolocation|getCurrentPosition|watchPosition/i,
  RECORD_AUDIO: /getUserMedia|AudioRecorder|microphone/i,
};

const PLACEHOLDER_NAMES = /TODO|placeholder|Example|MyApp/i;

export const androidComplianceAgent: ValidationAgent = {
  name: AGENT,

  async run(
    config: NormalizedAppConfig,
    _options: RunOptions,
  ): Promise<CheckResult[]> {
    const android = config.android;
    if (!android) return [];

    const results: CheckResult[] = [];

    // 1. Package ID presence
    if (!android.packageId) {
      results.push({
        id: "android.package-id",
        agent: AGENT,
        severity: "FAIL",
        title: "Package ID",
        message: "Package ID is empty",
      });
    } else {
      results.push({
        id: "android.package-id",
        agent: AGENT,
        severity: "PASS",
        title: "Package ID",
        message: android.packageId,
      });
    }

    // 2. Package ID format
    const validPackageId = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
    if (android.packageId && !validPackageId.test(android.packageId)) {
      results.push({
        id: "android.package-id-format",
        agent: AGENT,
        severity: "WARN",
        title: "Package ID format",
        message: `"${android.packageId}" does not match recommended format (lowercase, dots, no hyphens)`,
        docs: "https://developer.android.com/studio/build/application-id",
      });
    } else if (android.packageId) {
      results.push({
        id: "android.package-id-format",
        agent: AGENT,
        severity: "PASS",
        title: "Package ID format",
        message: "Package ID follows naming conventions",
      });
    }

    // 3. Target SDK
    if (android.targetSdkVersion < 34) {
      results.push({
        id: "android.target-sdk",
        agent: AGENT,
        severity: "FAIL",
        title: "Target SDK version",
        message: `targetSdkVersion ${android.targetSdkVersion} < 34 (Play Store minimum)`,
        docs: "https://developer.android.com/google/play/requirements/target-sdk",
      });
    } else {
      results.push({
        id: "android.target-sdk",
        agent: AGENT,
        severity: "PASS",
        title: "Target SDK version",
        message: `targetSdkVersion ${android.targetSdkVersion} meets Play Store requirement`,
      });
    }

    // 4. Min SDK
    if (android.minSdkVersion < 21) {
      results.push({
        id: "android.min-sdk",
        agent: AGENT,
        severity: "WARN",
        title: "Minimum SDK version",
        message: `minSdkVersion ${android.minSdkVersion} < 21 (Android 5.0). Consider raising for modern API support`,
      });
    } else {
      results.push({
        id: "android.min-sdk",
        agent: AGENT,
        severity: "PASS",
        title: "Minimum SDK version",
        message: `minSdkVersion ${android.minSdkVersion}`,
      });
    }

    // 5. App name placeholder check
    if (PLACEHOLDER_NAMES.test(android.appName)) {
      results.push({
        id: "android.app-name",
        agent: AGENT,
        severity: "FAIL",
        title: "App name",
        message: `App name "${android.appName}" appears to be a placeholder`,
      });
    } else {
      results.push({
        id: "android.app-name",
        agent: AGENT,
        severity: "PASS",
        title: "App name",
        message: android.appName,
      });
    }

    // 6. App name length
    if (android.appName.length > 30) {
      results.push({
        id: "android.app-name-length",
        agent: AGENT,
        severity: "WARN",
        title: "App name length",
        message: `App name is ${android.appName.length} characters (max recommended: 30)`,
        docs: "https://support.google.com/googleplay/android-developer/answer/9859152",
      });
    } else {
      results.push({
        id: "android.app-name-length",
        agent: AGENT,
        severity: "PASS",
        title: "App name length",
        message: `App name is ${android.appName.length} characters`,
      });
    }

    // 7. Version code
    if (!Number.isFinite(android.versionCode) || android.versionCode <= 0) {
      results.push({
        id: "android.version-code",
        agent: AGENT,
        severity: "WARN",
        title: "Version code",
        message: `versionCode ${android.versionCode} is invalid (must be a positive integer)`,
      });
    } else {
      results.push({
        id: "android.version-code",
        agent: AGENT,
        severity: "PASS",
        title: "Version code",
        message: `versionCode ${android.versionCode}`,
      });
    }

    // 8. Signing
    if (!android.signingConfigured) {
      results.push({
        id: "android.signing",
        agent: AGENT,
        severity: "FAIL",
        title: "Release signing",
        message:
          "No signing configuration detected. Play Store requires signed APKs/AABs",
        docs: "https://developer.android.com/studio/publish/app-signing",
      });
    } else {
      results.push({
        id: "android.signing",
        agent: AGENT,
        severity: "PASS",
        title: "Release signing",
        message: "Signing configuration detected",
      });
    }

    // 9. Asset Links
    if (android.assetLinksPath) {
      if (!fileExists(android.assetLinksPath)) {
        results.push({
          id: "android.asset-links",
          agent: AGENT,
          severity: "WARN",
          title: "Digital Asset Links",
          message: `Asset links file not found at ${android.assetLinksPath}`,
          docs: "https://developer.android.com/training/app-links/verify-android-applinks",
        });
      } else {
        const parsed = readJsonFile(android.assetLinksPath);
        if (parsed === null) {
          results.push({
            id: "android.asset-links",
            agent: AGENT,
            severity: "WARN",
            title: "Digital Asset Links",
            message: "Asset links file exists but is not valid JSON",
            docs: "https://developer.android.com/training/app-links/verify-android-applinks",
          });
        } else {
          results.push({
            id: "android.asset-links",
            agent: AGENT,
            severity: "PASS",
            title: "Digital Asset Links",
            message: "Asset links file exists and is valid JSON",
          });
        }
      }
    } else {
      results.push({
        id: "android.asset-links",
        agent: AGENT,
        severity: "SKIP",
        title: "Digital Asset Links",
        message: "No assetLinksPath configured",
      });
    }

    // 10. Permissions match source code
    const unmatchedPermissions: string[] = [];
    for (const permission of android.permissions) {
      // Extract the short permission name (e.g. "android.permission.CAMERA" → "CAMERA")
      const shortName = permission.includes(".")
        ? permission.split(".").pop()!
        : permission;

      const pattern = PERMISSION_PATTERNS[shortName];
      if (!pattern) continue; // No known pattern to check — skip

      const hasEvidence = grepSourceFiles(config.sourceCodeDirs, pattern);
      if (!hasEvidence) {
        unmatchedPermissions.push(shortName);
      }
    }

    if (unmatchedPermissions.length > 0) {
      results.push({
        id: "android.permissions-match",
        agent: AGENT,
        severity: "WARN",
        title: "Permission usage evidence",
        message: `Declared permissions without source code evidence: ${unmatchedPermissions.join(", ")}`,
        docs: "https://support.google.com/googleplay/android-developer/answer/9214102",
      });
    } else {
      results.push({
        id: "android.permissions-match",
        agent: AGENT,
        severity: "PASS",
        title: "Permission usage evidence",
        message:
          android.permissions.length > 0
            ? "All declared permissions have source code evidence"
            : "No permissions declared",
      });
    }

    // 11. AD_ID permission
    const hasAdId = android.permissions.some((p) => p.includes("AD_ID"));
    if (hasAdId) {
      const hasTrackingEvidence = grepSourceFiles(
        config.sourceCodeDirs,
        /AdMob|google\.android\.gms\.ads|AppTrackingTransparency|advertisingId|getAdvertisingId/i,
      );
      if (!hasTrackingEvidence) {
        results.push({
          id: "android.ad-id",
          agent: AGENT,
          severity: "WARN",
          title: "Advertising ID usage",
          message:
            "AD_ID permission declared but no advertising/tracking code found in source",
          docs: "https://support.google.com/googleplay/android-developer/answer/6048248",
        });
      } else {
        results.push({
          id: "android.ad-id",
          agent: AGENT,
          severity: "PASS",
          title: "Advertising ID usage",
          message: "AD_ID permission matches tracking code in source",
        });
      }
    } else {
      results.push({
        id: "android.ad-id",
        agent: AGENT,
        severity: "PASS",
        title: "Advertising ID usage",
        message: "No AD_ID permission declared",
      });
    }

    return results;
  },
};
