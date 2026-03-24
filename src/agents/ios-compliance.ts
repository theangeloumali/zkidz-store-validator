import * as fs from "node:fs";
import * as path from "node:path";

import type {
  CheckResult,
  NormalizedAppConfig,
  RunOptions,
  ValidationAgent,
} from "../types.js";
import {
  fileExists,
  grepSourceFiles,
  parsePlist,
  readJsonFile,
  readTextFile,
} from "../utils.js";

const AGENT = "ios-compliance";

/** Maps usage description keys to source code patterns that justify their presence */
const USAGE_DESC_PATTERNS: Record<string, RegExp> = {
  NSMicrophoneUsageDescription:
    /getUserMedia|MediaRecorder|microphone|AudioRecorder/i,
  NSCameraUsageDescription: /camera|ImagePicker|takePhoto|CameraPreview/i,
  NSLocationWhenInUseUsageDescription:
    /geolocation|getCurrentPosition|watchPosition/i,
  NSFaceIDUsageDescription:
    /FaceID|biometric|LocalAuthentication|BiometricPrompt/i,
  NSPhotoLibraryUsageDescription:
    /ImagePicker|PhotoLibrary|launchImageLibrary/i,
};

/** Maps source code patterns to the required usage description key */
const REQUIRED_DESCRIPTIONS: Array<{ pattern: RegExp; key: string }> = [
  {
    pattern: /getUserMedia|MediaRecorder|microphone/i,
    key: "NSMicrophoneUsageDescription",
  },
  {
    pattern: /geolocation|getCurrentPosition/i,
    key: "NSLocationWhenInUseUsageDescription",
  },
  {
    pattern: /ImagePicker|camera|takePhoto/i,
    key: "NSCameraUsageDescription",
  },
];

export const iosComplianceAgent: ValidationAgent = {
  name: AGENT,

  async run(
    config: NormalizedAppConfig,
    _options: RunOptions,
  ): Promise<CheckResult[]> {
    const ios = config.ios;
    if (!ios) return [];

    const results: CheckResult[] = [];

    // 1. Bundle ID presence
    if (!ios.bundleId) {
      results.push({
        id: "ios.bundle-id",
        agent: AGENT,
        severity: "FAIL",
        title: "Bundle ID",
        message: "Bundle ID is empty",
      });
    } else {
      results.push({
        id: "ios.bundle-id",
        agent: AGENT,
        severity: "PASS",
        title: "Bundle ID",
        message: ios.bundleId,
      });
    }

    // 2. Bundle ID format
    const validBundleId = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/;
    if (ios.bundleId && !validBundleId.test(ios.bundleId)) {
      results.push({
        id: "ios.bundle-id-format",
        agent: AGENT,
        severity: "WARN",
        title: "Bundle ID format",
        message: `"${ios.bundleId}" does not match recommended reverse-domain format`,
        docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundleidentifier",
      });
    } else if (ios.bundleId) {
      results.push({
        id: "ios.bundle-id-format",
        agent: AGENT,
        severity: "PASS",
        title: "Bundle ID format",
        message: "Bundle ID follows naming conventions",
      });
    }

    // 3. Display name
    if (!ios.appName) {
      results.push({
        id: "ios.display-name",
        agent: AGENT,
        severity: "WARN",
        title: "Display name",
        message: "App display name is empty",
      });
    } else {
      results.push({
        id: "ios.display-name",
        agent: AGENT,
        severity: "PASS",
        title: "Display name",
        message: ios.appName,
      });
    }

    // 4. Encryption declaration
    if (!ios.encryptionDeclared) {
      results.push({
        id: "ios.encryption",
        agent: AGENT,
        severity: "FAIL",
        title: "Encryption declaration",
        message: "ITSAppUsesNonExemptEncryption not found in Info.plist",
        docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/itsappusesnonexemptencryption",
      });
    } else {
      results.push({
        id: "ios.encryption",
        agent: AGENT,
        severity: "PASS",
        title: "Encryption declaration",
        message: "ITSAppUsesNonExemptEncryption is declared",
      });
    }

    // 5. Usage descriptions — check none are empty strings
    const usageKeys = Object.keys(ios.usageDescriptions);
    const emptyDescriptions = usageKeys.filter(
      (key) => ios.usageDescriptions[key] === "",
    );

    if (emptyDescriptions.length > 0) {
      for (const key of emptyDescriptions) {
        results.push({
          id: "ios.usage-descriptions-present",
          agent: AGENT,
          severity: "FAIL",
          title: "Usage description value",
          message: `${key} has an empty description string (App Store rejection risk)`,
          docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/protected_resources",
        });
      }
    } else {
      results.push({
        id: "ios.usage-descriptions-present",
        agent: AGENT,
        severity: "PASS",
        title: "Usage description values",
        message: `${usageKeys.length} usage description(s) all have non-empty values`,
      });
    }

    // 6. Required usage descriptions based on source grep
    const missingRequired: string[] = [];
    for (const { pattern, key } of REQUIRED_DESCRIPTIONS) {
      const usesFeature = grepSourceFiles(config.sourceCodeDirs, pattern);
      if (usesFeature && !(key in ios.usageDescriptions)) {
        missingRequired.push(key);
      }
    }

    if (missingRequired.length > 0) {
      for (const key of missingRequired) {
        results.push({
          id: "ios.usage-descriptions-empty",
          agent: AGENT,
          severity: "WARN",
          title: "Missing required usage description",
          message: `Source code uses a protected API but ${key} is not declared`,
          docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/protected_resources",
        });
      }
    } else {
      results.push({
        id: "ios.usage-descriptions-empty",
        agent: AGENT,
        severity: "PASS",
        title: "Required usage descriptions",
        message:
          "All source-detected protected APIs have matching usage descriptions",
      });
    }

    // 7. Unused capabilities — declared usage descriptions without source evidence
    const unusedDescriptions: string[] = [];
    for (const key of usageKeys) {
      const pattern = USAGE_DESC_PATTERNS[key];
      if (!pattern) continue; // Unknown key, skip

      const hasEvidence = grepSourceFiles(config.sourceCodeDirs, pattern);
      if (!hasEvidence) {
        unusedDescriptions.push(key);
      }
    }

    if (unusedDescriptions.length > 0) {
      for (const key of unusedDescriptions) {
        results.push({
          id: "ios.unused-capabilities",
          agent: AGENT,
          severity: "WARN",
          title: "Unused usage description",
          message: `${key} is declared but no matching API usage found in source (common App Store rejection)`,
          docs: "https://developer.apple.com/app-store/review/guidelines/#5.1.1",
        });
      }
    } else {
      results.push({
        id: "ios.unused-capabilities",
        agent: AGENT,
        severity: "PASS",
        title: "Usage description relevance",
        message: "All declared usage descriptions have source code evidence",
      });
    }

    // 8. Launch storyboard
    if (ios.infoPlistPath) {
      const plist = parsePlist(ios.infoPlistPath);
      if (plist && !("UILaunchStoryboardName" in plist)) {
        results.push({
          id: "ios.launch-storyboard",
          agent: AGENT,
          severity: "WARN",
          title: "Launch storyboard",
          message:
            "UILaunchStoryboardName not found in Info.plist (required for modern iOS)",
          docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/uilaunchstoryboardname",
        });
      } else if (plist) {
        results.push({
          id: "ios.launch-storyboard",
          agent: AGENT,
          severity: "PASS",
          title: "Launch storyboard",
          message: "UILaunchStoryboardName is configured",
        });
      } else {
        results.push({
          id: "ios.launch-storyboard",
          agent: AGENT,
          severity: "WARN",
          title: "Launch storyboard",
          message: `Could not parse Info.plist at ${ios.infoPlistPath}`,
        });
      }
    } else {
      results.push({
        id: "ios.launch-storyboard",
        agent: AGENT,
        severity: "SKIP",
        title: "Launch storyboard",
        message: "No infoPlistPath configured",
      });
    }

    // 9. AASA validation
    if (ios.aasaPath) {
      if (!fileExists(ios.aasaPath)) {
        results.push({
          id: "ios.aasa-valid",
          agent: AGENT,
          severity: "WARN",
          title: "Apple App Site Association",
          message: `AASA file not found at ${ios.aasaPath}`,
          docs: "https://developer.apple.com/documentation/xcode/supporting-associated-domains",
        });
      } else {
        const parsed = readJsonFile(ios.aasaPath);
        if (parsed === null) {
          results.push({
            id: "ios.aasa-valid",
            agent: AGENT,
            severity: "WARN",
            title: "Apple App Site Association",
            message: "AASA file exists but is not valid JSON",
            docs: "https://developer.apple.com/documentation/xcode/supporting-associated-domains",
          });
        } else {
          results.push({
            id: "ios.aasa-valid",
            agent: AGENT,
            severity: "PASS",
            title: "Apple App Site Association",
            message: "AASA file exists and is valid JSON",
          });
        }
      }
    } else {
      results.push({
        id: "ios.aasa-valid",
        agent: AGENT,
        severity: "SKIP",
        title: "Apple App Site Association",
        message: "No aasaPath configured",
      });
    }

    // 10. Background modes evidence
    const backgroundModeEvidence: Record<string, RegExp> = {
      audio: /AVAudioSession|AudioContext|<audio|useAudio|audioSession/,
      location:
        /CLLocationManager|geolocation|watchPosition|startUpdatingLocation|getCurrentPosition/,
      fetch:
        /BGAppRefreshTask|performFetchWithCompletionHandler|setMinimumBackgroundFetchInterval|background.*fetch/i,
      "remote-notification":
        /registerForRemoteNotifications|didReceiveRemoteNotification|pushNotification|PushNotifications/,
      voip: /PKPushRegistry|pushkit|CallKit/,
      "bluetooth-central": /CBCentralManager|BleManager|bluetooth/i,
      "bluetooth-peripheral": /CBPeripheralManager/,
      processing: /BGProcessingTask/,
      "external-accessory": /EAAccessoryManager/,
    };

    if (ios.backgroundModes && ios.backgroundModes.length > 0) {
      let allModesHaveEvidence = true;
      for (const mode of ios.backgroundModes) {
        const pattern = backgroundModeEvidence[mode];
        if (!pattern) {
          // Unknown mode — warn but don't fail
          results.push({
            id: "ios.background-modes",
            agent: AGENT,
            severity: "WARN",
            title: "Background mode evidence",
            message: `Unknown background mode "${mode}" declared — cannot verify source evidence`,
          });
          continue;
        }
        const hasEvidence = grepSourceFiles(config.sourceCodeDirs, pattern);
        if (!hasEvidence) {
          allModesHaveEvidence = false;
          results.push({
            id: "ios.background-modes",
            agent: AGENT,
            severity: "FAIL",
            title: "Background mode evidence",
            message: `Background mode "${mode}" is declared but no matching API usage found in source (high rejection risk)`,
            docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/uibackgroundmodes",
          });
        }
      }
      if (allModesHaveEvidence) {
        results.push({
          id: "ios.background-modes",
          agent: AGENT,
          severity: "PASS",
          title: "Background mode evidence",
          message: `All ${ios.backgroundModes.length} declared background mode(s) have source code evidence`,
        });
      }
    } else {
      results.push({
        id: "ios.background-modes",
        agent: AGENT,
        severity: "PASS",
        title: "Background modes",
        message: "No background modes declared",
      });
    }

    // 11. Privacy manifest (PrivacyInfo.xcprivacy)
    const iosDir = path.join(config.projectRoot, "ios");
    let privacyManifestFound = false;

    function searchForPrivacyManifest(dir: string): boolean {
      if (!fs.existsSync(dir)) return false;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name === "PrivacyInfo.xcprivacy") {
          return true;
        }
        if (entry.isDirectory()) {
          if (searchForPrivacyManifest(path.join(dir, entry.name))) {
            return true;
          }
        }
      }
      return false;
    }

    if (fs.existsSync(iosDir)) {
      privacyManifestFound = searchForPrivacyManifest(iosDir);
    }

    if (!privacyManifestFound) {
      results.push({
        id: "ios.privacy-manifest",
        agent: AGENT,
        severity: "WARN",
        title: "Privacy manifest",
        message:
          "PrivacyInfo.xcprivacy not found in ios/ directory (required since 2024 for apps using certain APIs)",
        docs: "https://developer.apple.com/documentation/bundleresources/privacy_manifest_files",
      });
    } else {
      results.push({
        id: "ios.privacy-manifest",
        agent: AGENT,
        severity: "PASS",
        title: "Privacy manifest",
        message: "PrivacyInfo.xcprivacy found",
      });
    }

    // 12. ATT tracking
    const trackingPattern =
      /advertisingIdentifier|ASIdentifierManager|ATTrackingManager|requestTrackingAuthorization|idfa|IDFA/;
    const usesTracking = grepSourceFiles(
      config.sourceCodeDirs,
      trackingPattern,
    );
    const hasTrackingDescription =
      "NSUserTrackingUsageDescription" in ios.usageDescriptions;

    if (usesTracking && !hasTrackingDescription) {
      results.push({
        id: "ios.att-tracking",
        agent: AGENT,
        severity: "FAIL",
        title: "App Tracking Transparency",
        message:
          "Source code uses IDFA/ATT APIs but NSUserTrackingUsageDescription is not declared",
        docs: "https://developer.apple.com/documentation/apptrackingtransparency",
      });
    } else if (usesTracking && hasTrackingDescription) {
      results.push({
        id: "ios.att-tracking",
        agent: AGENT,
        severity: "PASS",
        title: "App Tracking Transparency",
        message:
          "IDFA/ATT usage detected and NSUserTrackingUsageDescription is declared",
      });
    } else {
      results.push({
        id: "ios.att-tracking",
        agent: AGENT,
        severity: "PASS",
        title: "App Tracking Transparency",
        message: "No IDFA/ATT usage detected in source code",
      });
    }

    // 13. ATS exceptions
    if (ios.atsAllowsArbitraryLoads === true) {
      results.push({
        id: "ios.ats-exceptions",
        agent: AGENT,
        severity: "WARN",
        title: "ATS exceptions",
        message:
          "NSAllowsArbitraryLoads is enabled. Apple may reject without justification.",
        docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity",
      });
    } else {
      results.push({
        id: "ios.ats-exceptions",
        agent: AGENT,
        severity: "PASS",
        title: "ATS exceptions",
        message: "App Transport Security is not bypassed",
      });
    }

    // 14. Minimum deployment target
    if (ios.minimumOSVersion) {
      const majorVersion = parseInt(ios.minimumOSVersion.split(".")[0], 10);
      if (!isNaN(majorVersion) && majorVersion < 16) {
        results.push({
          id: "ios.min-deployment-target",
          agent: AGENT,
          severity: "WARN",
          title: "Minimum deployment target",
          message: `Minimum deployment target ${ios.minimumOSVersion} is below iOS 16. Consider updating.`,
          docs: "https://developer.apple.com/documentation/xcode/setting-the-minimum-deployment-target",
        });
      } else {
        results.push({
          id: "ios.min-deployment-target",
          agent: AGENT,
          severity: "PASS",
          title: "Minimum deployment target",
          message: `Minimum deployment target is ${ios.minimumOSVersion}`,
        });
      }
    } else {
      results.push({
        id: "ios.min-deployment-target",
        agent: AGENT,
        severity: "PASS",
        title: "Minimum deployment target",
        message: "No minimum OS version specified",
      });
    }

    // 15. Required device capabilities
    if (
      ios.requiredDeviceCapabilities &&
      ios.requiredDeviceCapabilities.length > 0
    ) {
      const restrictive = [
        "metal",
        "arkit",
        "nfc",
        "accelerometer",
        "gyroscope",
        "magnetometer",
        "healthkit",
      ];
      const declaredRestrictive = ios.requiredDeviceCapabilities.filter((cap) =>
        restrictive.includes(cap),
      );

      if (declaredRestrictive.length > 0) {
        results.push({
          id: "ios.required-device-capabilities",
          agent: AGENT,
          severity: "WARN",
          title: "Required device capabilities",
          message: `Declared capabilities may limit device compatibility: ${declaredRestrictive.join(", ")}`,
          docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/uirequireddevicecapabilities",
        });
      } else {
        results.push({
          id: "ios.required-device-capabilities",
          agent: AGENT,
          severity: "PASS",
          title: "Required device capabilities",
          message: `Declared capabilities: ${ios.requiredDeviceCapabilities.join(", ")}`,
        });
      }
    } else {
      results.push({
        id: "ios.required-device-capabilities",
        agent: AGENT,
        severity: "PASS",
        title: "Required device capabilities",
        message: "No restrictive device capabilities declared",
      });
    }

    // 16. Info.plist required keys
    if (ios.infoPlistPath) {
      const plist = parsePlist(ios.infoPlistPath);
      if (plist) {
        const requiredKeys = [
          "CFBundleIdentifier",
          "CFBundleName",
          "CFBundleVersion",
          "CFBundleShortVersionString",
        ];
        const missingKeys = requiredKeys.filter((key) => !(key in plist));

        if (missingKeys.length > 0) {
          for (const key of missingKeys) {
            results.push({
              id: "ios.info-plist-required-keys",
              agent: AGENT,
              severity: "FAIL",
              title: "Info.plist required key",
              message: `Required key "${key}" is missing from Info.plist`,
              docs: "https://developer.apple.com/documentation/bundleresources/information_property_list",
            });
          }
        } else {
          results.push({
            id: "ios.info-plist-required-keys",
            agent: AGENT,
            severity: "PASS",
            title: "Info.plist required keys",
            message:
              "All required keys present (CFBundleIdentifier, CFBundleName, CFBundleVersion, CFBundleShortVersionString)",
          });
        }
      } else {
        results.push({
          id: "ios.info-plist-required-keys",
          agent: AGENT,
          severity: "WARN",
          title: "Info.plist required keys",
          message: `Could not parse Info.plist at ${ios.infoPlistPath}`,
        });
      }
    } else {
      results.push({
        id: "ios.info-plist-required-keys",
        agent: AGENT,
        severity: "SKIP",
        title: "Info.plist required keys",
        message: "No infoPlistPath configured",
      });
    }

    // 17. Push notification entitlements
    {
      const pushPattern =
        /registerForRemoteNotifications|UNUserNotificationCenter|PushNotifications|requestPermission.*notification|pushNotification/i;
      const usesPush = grepSourceFiles(config.sourceCodeDirs, pushPattern);

      if (usesPush) {
        if (ios.entitlementsPath && fileExists(ios.entitlementsPath)) {
          const entitlements = parsePlist(ios.entitlementsPath);
          if (entitlements && "aps-environment" in entitlements) {
            results.push({
              id: "ios.push-entitlements",
              agent: AGENT,
              severity: "PASS",
              title: "Push notification entitlements",
              message:
                "Push notification code detected and aps-environment entitlement is configured",
            });
          } else {
            results.push({
              id: "ios.push-entitlements",
              agent: AGENT,
              severity: "WARN",
              title: "Push notification entitlements",
              message:
                "Push notification code detected but aps-environment key not found in entitlements",
              docs: "https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns",
            });
          }
        } else {
          results.push({
            id: "ios.push-entitlements",
            agent: AGENT,
            severity: "WARN",
            title: "Push notification entitlements",
            message:
              "Push notification code detected but no entitlements file found",
            docs: "https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns",
          });
        }
      } else {
        results.push({
          id: "ios.push-entitlements",
          agent: AGENT,
          severity: "PASS",
          title: "Push notification entitlements",
          message: "No push notification code detected in source",
        });
      }
    }

    // 18. URL scheme conflicts
    if (ios.infoPlistPath) {
      const plistRaw = readTextFile(ios.infoPlistPath);
      if (plistRaw) {
        const systemSchemes = ["http", "https", "tel", "mailto", "sms"];
        const urlSchemesSection = plistRaw.match(
          /CFBundleURLSchemes[\s\S]*?<array>([\s\S]*?)<\/array>/,
        );
        const conflicting: string[] = [];

        if (urlSchemesSection) {
          const schemeRegex = /<string>([^<]+)<\/string>/g;
          let schemeMatch: RegExpExecArray | null;
          while (
            (schemeMatch = schemeRegex.exec(urlSchemesSection[1])) !== null
          ) {
            const scheme = schemeMatch[1].toLowerCase();
            if (systemSchemes.includes(scheme)) {
              conflicting.push(schemeMatch[1]);
            }
          }
        }

        if (conflicting.length > 0) {
          results.push({
            id: "ios.url-schemes",
            agent: AGENT,
            severity: "WARN",
            title: "URL scheme conflicts",
            message: `URL scheme(s) conflict with system schemes: ${conflicting.join(", ")}`,
            docs: "https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app",
          });
        } else {
          results.push({
            id: "ios.url-schemes",
            agent: AGENT,
            severity: "PASS",
            title: "URL scheme conflicts",
            message: "No URL scheme conflicts with system schemes",
          });
        }
      } else {
        results.push({
          id: "ios.url-schemes",
          agent: AGENT,
          severity: "WARN",
          title: "URL scheme conflicts",
          message: `Could not read Info.plist at ${ios.infoPlistPath}`,
        });
      }
    } else {
      results.push({
        id: "ios.url-schemes",
        agent: AGENT,
        severity: "SKIP",
        title: "URL scheme conflicts",
        message: "No infoPlistPath configured",
      });
    }

    // 19. Orientation support
    if (ios.infoPlistPath) {
      const orientationPlist = parsePlist(ios.infoPlistPath);
      if (orientationPlist) {
        const orientations =
          orientationPlist["UISupportedInterfaceOrientations"];
        if (Array.isArray(orientations)) {
          if (orientations.length === 0) {
            results.push({
              id: "ios.orientation-support",
              agent: AGENT,
              severity: "WARN",
              title: "Orientation support",
              message:
                "UISupportedInterfaceOrientations is empty (app may not launch)",
              docs: "https://developer.apple.com/documentation/bundleresources/information_property_list/uisupportedinterfaceorientations",
            });
          } else {
            results.push({
              id: "ios.orientation-support",
              agent: AGENT,
              severity: "PASS",
              title: "Orientation support",
              message: `${orientations.length} orientation(s) supported`,
            });
          }
        } else {
          results.push({
            id: "ios.orientation-support",
            agent: AGENT,
            severity: "PASS",
            title: "Orientation support",
            message:
              "UISupportedInterfaceOrientations not explicitly set (system defaults apply)",
          });
        }
      } else {
        results.push({
          id: "ios.orientation-support",
          agent: AGENT,
          severity: "WARN",
          title: "Orientation support",
          message: `Could not parse Info.plist at ${ios.infoPlistPath}`,
        });
      }
    } else {
      results.push({
        id: "ios.orientation-support",
        agent: AGENT,
        severity: "SKIP",
        title: "Orientation support",
        message: "No infoPlistPath configured",
      });
    }

    return results;
  },
};
