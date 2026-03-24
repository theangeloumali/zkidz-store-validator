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

    return results;
  },
};
