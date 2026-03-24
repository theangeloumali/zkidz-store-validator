import type {
  CheckResult,
  NormalizedAppConfig,
  RunOptions,
  ValidationAgent,
} from "../types.js";
import {
  fileExists,
  grepSourceFiles,
  readJsonFile,
  readTextFile,
} from "../utils.js";

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

    // 12. Foreground service types (SDK 34+)
    {
      const dangerousPerms = [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECORD_AUDIO",
        "CAMERA",
        "BODY_SENSORS",
      ];
      const hasDangerous = android.permissions.some((p) =>
        dangerousPerms.some((dp) => p.includes(dp)),
      );

      if (android.targetSdkVersion >= 34 && hasDangerous) {
        if (
          !android.foregroundServiceTypes ||
          android.foregroundServiceTypes.length === 0
        ) {
          results.push({
            id: "android.foreground-service-types",
            agent: AGENT,
            severity: "WARN",
            title: "Foreground service types",
            message:
              "Dangerous permissions declared but no foreground service types specified (required for targetSdk 34+)",
            docs: "https://developer.android.com/about/versions/14/changes/fgs-types-required",
          });
        } else {
          results.push({
            id: "android.foreground-service-types",
            agent: AGENT,
            severity: "PASS",
            title: "Foreground service types",
            message: `Foreground service types declared: ${android.foregroundServiceTypes.join(", ")}`,
          });
        }
      } else {
        results.push({
          id: "android.foreground-service-types",
          agent: AGENT,
          severity: "PASS",
          title: "Foreground service types",
          message: hasDangerous
            ? "targetSdkVersion < 34; foreground service type declaration not yet required"
            : "No dangerous permissions declared",
        });
      }
    }

    // 13. Exported components
    {
      if (android.hasExportedComponents === undefined) {
        results.push({
          id: "android.exported-components",
          agent: AGENT,
          severity: "SKIP",
          title: "Exported components",
          message: "No manifest parsed; cannot verify exported attribute",
        });
      } else if (!android.hasExportedComponents) {
        results.push({
          id: "android.exported-components",
          agent: AGENT,
          severity: "WARN",
          title: "Exported components",
          message:
            "Components with intent-filters missing explicit android:exported attribute",
          docs: "https://developer.android.com/guide/topics/manifest/activity-element#exported",
        });
      } else {
        results.push({
          id: "android.exported-components",
          agent: AGENT,
          severity: "PASS",
          title: "Exported components",
          message:
            "All components with intent-filters have explicit android:exported attribute",
        });
      }
    }

    // 14. Internet permission for web-wrapper apps
    {
      const hasInternet = android.permissions.some((p) =>
        p.includes("INTERNET"),
      );
      const isWebWrapper =
        config.platform === "twa" || config.platform === "capacitor";

      if (isWebWrapper && !hasInternet) {
        results.push({
          id: "android.internet-permission",
          agent: AGENT,
          severity: "WARN",
          title: "Internet permission",
          message:
            "INTERNET permission not declared. TWA/Capacitor apps require network access",
          docs: "https://developer.android.com/reference/android/Manifest.permission#INTERNET",
        });
      } else {
        results.push({
          id: "android.internet-permission",
          agent: AGENT,
          severity: "PASS",
          title: "Internet permission",
          message: hasInternet
            ? "INTERNET permission declared"
            : "Not a web-wrapper app; INTERNET permission is optional",
        });
      }
    }

    // 15. Backup rules (Android 12+)
    if (android.manifestPath) {
      const manifestContent = readTextFile(android.manifestPath);
      if (manifestContent && android.targetSdkVersion >= 31) {
        const hasDataExtractionRules = /android:dataExtractionRules/.test(
          manifestContent,
        );
        const hasFullBackupContent = /android:fullBackupContent/.test(
          manifestContent,
        );

        if (!hasDataExtractionRules && !hasFullBackupContent) {
          results.push({
            id: "android.backup-rules",
            agent: AGENT,
            severity: "WARN",
            title: "Backup rules",
            message:
              "Neither android:dataExtractionRules nor android:fullBackupContent found in manifest (recommended for targetSdk 31+)",
            docs: "https://developer.android.com/about/versions/12/backup-restore",
          });
        } else {
          results.push({
            id: "android.backup-rules",
            agent: AGENT,
            severity: "PASS",
            title: "Backup rules",
            message: "Backup/extraction rules configured in manifest",
          });
        }
      } else if (android.targetSdkVersion < 31) {
        results.push({
          id: "android.backup-rules",
          agent: AGENT,
          severity: "PASS",
          title: "Backup rules",
          message: `targetSdkVersion ${android.targetSdkVersion} < 31; explicit backup rules not required`,
        });
      } else {
        results.push({
          id: "android.backup-rules",
          agent: AGENT,
          severity: "SKIP",
          title: "Backup rules",
          message: "Could not read AndroidManifest.xml",
        });
      }
    } else {
      results.push({
        id: "android.backup-rules",
        agent: AGENT,
        severity: "SKIP",
        title: "Backup rules",
        message: "No manifestPath configured",
      });
    }

    // 16. AAB format recommendation
    {
      const isWebWrapper =
        config.platform === "twa" || config.platform === "capacitor";

      if (isWebWrapper) {
        results.push({
          id: "android.aab-format",
          agent: AGENT,
          severity: "PASS",
          title: "AAB format",
          message:
            "TWA/Capacitor apps handle AAB format via their build tooling",
        });
      } else if (config.platform === "flutter") {
        const gradlePath = `${config.projectRoot}/android/app/build.gradle`;
        const gradleContent = readTextFile(gradlePath);
        const gradleKtsPath = `${config.projectRoot}/android/app/build.gradle.kts`;
        const gradleKtsContent = readTextFile(gradleKtsPath);
        const content = gradleContent ?? gradleKtsContent;

        if (content && /bundle/.test(content)) {
          results.push({
            id: "android.aab-format",
            agent: AGENT,
            severity: "PASS",
            title: "AAB format",
            message: "Build configuration includes bundle task for AAB output",
          });
        } else {
          results.push({
            id: "android.aab-format",
            agent: AGENT,
            severity: "WARN",
            title: "AAB format",
            message:
              "Consider using Android App Bundle (AAB) format for Play Store submissions",
            docs: "https://developer.android.com/guide/app-bundle",
          });
        }
      } else if (config.platform === "expo") {
        const easPath = `${config.projectRoot}/eas.json`;
        const easContent = readTextFile(easPath);

        if (easContent && /app-bundle/.test(easContent)) {
          results.push({
            id: "android.aab-format",
            agent: AGENT,
            severity: "PASS",
            title: "AAB format",
            message: "EAS config specifies app-bundle build type",
          });
        } else {
          results.push({
            id: "android.aab-format",
            agent: AGENT,
            severity: "WARN",
            title: "AAB format",
            message:
              'Consider setting buildType to "app-bundle" in eas.json for Play Store submissions',
            docs: "https://developer.android.com/guide/app-bundle",
          });
        }
      } else {
        results.push({
          id: "android.aab-format",
          agent: AGENT,
          severity: "WARN",
          title: "AAB format",
          message:
            "Consider using Android App Bundle (AAB) format for Play Store submissions",
          docs: "https://developer.android.com/guide/app-bundle",
        });
      }
    }

    // 17. Large screens support
    if (android.manifestPath) {
      const manifestContent = readTextFile(android.manifestPath);
      if (manifestContent) {
        const resizeableMatch = manifestContent.match(
          /android:resizeableActivity\s*=\s*["'](\w+)["']/,
        );

        if (resizeableMatch && resizeableMatch[1] === "false") {
          results.push({
            id: "android.large-screens",
            agent: AGENT,
            severity: "WARN",
            title: "Large screen support",
            message:
              "android:resizeableActivity is set to false. App may be restricted on tablets and foldables",
            docs: "https://developer.android.com/guide/topics/large-screens/large-screen-compatibility-mode",
          });
        } else {
          results.push({
            id: "android.large-screens",
            agent: AGENT,
            severity: "PASS",
            title: "Large screen support",
            message: resizeableMatch
              ? "android:resizeableActivity is true"
              : "android:resizeableActivity not explicitly set (defaults to true)",
          });
        }
      } else {
        results.push({
          id: "android.large-screens",
          agent: AGENT,
          severity: "SKIP",
          title: "Large screen support",
          message: "Could not read AndroidManifest.xml",
        });
      }
    } else {
      results.push({
        id: "android.large-screens",
        agent: AGENT,
        severity: "SKIP",
        title: "Large screen support",
        message: "No manifestPath configured",
      });
    }

    return results;
  },
};
