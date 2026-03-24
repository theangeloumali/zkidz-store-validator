import type {
  CheckResult,
  ValidationAgent,
  NormalizedAppConfig,
  RunOptions,
} from "../types.js";
import { fetchWithTimeout, readTextFile } from "../utils.js";
import { join } from "node:path";

export const crossPlatformAgent: ValidationAgent = {
  name: "cross-platform",

  async run(
    config: NormalizedAppConfig,
    _options: RunOptions,
  ): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const hasAndroid = !!config.android;
    const hasIos = !!config.ios;
    const hasBoth = hasAndroid && hasIos;

    // ── cross.package-id-match ─────────────────────────────────────────────
    {
      if (!hasBoth) {
        results.push({
          id: "cross.package-id-match",
          agent: "cross-platform",
          severity: "SKIP",
          title: "Package/Bundle ID match",
          message:
            "Only one platform configured. Skipping cross-platform check.",
        });
      } else {
        const androidId = config.android!.packageId;
        const iosId = config.ios!.bundleId;
        const match = androidId === iosId;

        results.push({
          id: "cross.package-id-match",
          agent: "cross-platform",
          severity: match ? "PASS" : "WARN",
          title: "Package/Bundle ID match",
          message: match
            ? `Package IDs match: ${androidId}`
            : `Android packageId "${androidId}" differs from iOS bundleId "${iosId}".`,
        });
      }
    }

    // ── cross.app-name-match ───────────────────────────────────────────────
    {
      if (!hasBoth) {
        results.push({
          id: "cross.app-name-match",
          agent: "cross-platform",
          severity: "SKIP",
          title: "App name match across platforms",
          message:
            "Only one platform configured. Skipping cross-platform check.",
        });
      } else {
        const androidName = config.android!.appName;
        const iosName = config.ios!.appName;
        const match = androidName === iosName;

        results.push({
          id: "cross.app-name-match",
          agent: "cross-platform",
          severity: match ? "PASS" : "WARN",
          title: "App name match across platforms",
          message: match
            ? `App names match: "${androidName}"`
            : `Android app name "${androidName}" differs from iOS app name "${iosName}".`,
        });
      }
    }

    // ── cross.deep-links-match ─────────────────────────────────────────────
    {
      const androidLinks = config.deepLinks.find(
        (d) => d.platform === "android",
      );
      const iosLinks = config.deepLinks.find((d) => d.platform === "ios");

      if (!androidLinks || !iosLinks) {
        results.push({
          id: "cross.deep-links-match",
          agent: "cross-platform",
          severity: "SKIP",
          title: "Deep links match across platforms",
          message:
            "Deep links not configured for both platforms. Skipping comparison.",
        });
      } else {
        const androidRoutes = new Set(androidLinks.routes);
        const iosRoutes = new Set(iosLinks.routes);

        const androidOnly = androidLinks.routes.filter(
          (r) => !iosRoutes.has(r),
        );
        const iosOnly = iosLinks.routes.filter((r) => !androidRoutes.has(r));

        const match = androidOnly.length === 0 && iosOnly.length === 0;

        let message: string;
        if (match) {
          message = `Deep link routes match across platforms (${androidRoutes.size} routes).`;
        } else {
          const parts: string[] = [];
          if (androidOnly.length > 0) {
            parts.push(`Android-only: ${androidOnly.join(", ")}`);
          }
          if (iosOnly.length > 0) {
            parts.push(`iOS-only: ${iosOnly.join(", ")}`);
          }
          message = `Deep link routes differ. ${parts.join(". ")}`;
        }

        results.push({
          id: "cross.deep-links-match",
          agent: "cross-platform",
          severity: match ? "PASS" : "WARN",
          title: "Deep links match across platforms",
          message,
        });
      }
    }

    // ── cross.privacy-policy-content ──────────────────────────────────────
    {
      if (!config.privacyPolicyUrl) {
        results.push({
          id: "cross.privacy-policy-content",
          agent: "cross-platform",
          severity: "SKIP",
          title: "Privacy policy content",
          message: "No privacy policy URL configured",
        });
      } else if (_options.offline) {
        results.push({
          id: "cross.privacy-policy-content",
          agent: "cross-platform",
          severity: "SKIP",
          title: "Privacy policy content",
          message: "Offline mode; skipping privacy policy fetch",
        });
      } else {
        try {
          const res = await fetchWithTimeout(config.privacyPolicyUrl);
          if (!res.ok) {
            results.push({
              id: "cross.privacy-policy-content",
              agent: "cross-platform",
              severity: "WARN",
              title: "Privacy policy content",
              message: `Privacy policy URL returned HTTP ${res.status}`,
            });
          } else if (res.body.length < 500) {
            results.push({
              id: "cross.privacy-policy-content",
              agent: "cross-platform",
              severity: "WARN",
              title: "Privacy policy content",
              message:
                "Privacy policy page seems too short (less than 500 characters)",
            });
          } else {
            const hasKeyTerms = /data|collect|privacy|information/i.test(
              res.body,
            );
            if (!hasKeyTerms) {
              results.push({
                id: "cross.privacy-policy-content",
                agent: "cross-platform",
                severity: "WARN",
                title: "Privacy policy content",
                message:
                  "Privacy policy may not contain required disclosures (missing key terms: data, collect, privacy, information)",
              });
            } else {
              results.push({
                id: "cross.privacy-policy-content",
                agent: "cross-platform",
                severity: "PASS",
                title: "Privacy policy content",
                message: "Privacy policy contains expected disclosure terms",
              });
            }
          }
        } catch {
          results.push({
            id: "cross.privacy-policy-content",
            agent: "cross-platform",
            severity: "WARN",
            title: "Privacy policy content",
            message: `Failed to fetch privacy policy URL: ${config.privacyPolicyUrl}`,
          });
        }
      }
    }

    // ── cross.placeholder-content ─────────────────────────────────────────
    {
      const configFiles = [
        "twa-manifest.json",
        "capacitor.config.ts",
        "capacitor.config.json",
        "app.json",
        "pubspec.yaml",
        "public/manifest.json",
      ];

      const placeholderPattern =
        /lorem ipsum|test app|sample app|example app|placeholder text|dummy data/i;
      const filesWithPlaceholders: string[] = [];

      for (const file of configFiles) {
        const content = readTextFile(join(config.projectRoot, file));
        if (content && placeholderPattern.test(content)) {
          filesWithPlaceholders.push(file);
        }
      }

      if (config.storeListingPath) {
        const listingContent = readTextFile(config.storeListingPath);
        if (listingContent && placeholderPattern.test(listingContent)) {
          filesWithPlaceholders.push(config.storeListingPath);
        }
      }

      if (filesWithPlaceholders.length > 0) {
        results.push({
          id: "cross.placeholder-content",
          agent: "cross-platform",
          severity: "FAIL",
          title: "Placeholder content",
          message: `Placeholder content found in: ${filesWithPlaceholders.join(", ")}`,
        });
      } else {
        results.push({
          id: "cross.placeholder-content",
          agent: "cross-platform",
          severity: "PASS",
          title: "Placeholder content",
          message: "No placeholder content detected in config files",
        });
      }
    }

    // ── cross.minimum-functionality ───────────────────────────────────────
    {
      const isWebWrapper =
        config.platform === "twa" || config.platform === "capacitor";

      if (isWebWrapper) {
        results.push({
          id: "cross.minimum-functionality",
          agent: "cross-platform",
          severity: "WARN",
          title: "Minimum functionality",
          message:
            "TWA/Capacitor apps may trigger Apple Guideline 4.2 (Minimum Functionality). Ensure your app provides features beyond what the website offers.",
          docs: "https://developer.apple.com/app-store/review/guidelines/#minimum-functionality",
        });
      } else {
        results.push({
          id: "cross.minimum-functionality",
          agent: "cross-platform",
          severity: "PASS",
          title: "Minimum functionality",
          message: "Not a web-wrapper platform; Guideline 4.2 less likely",
        });
      }
    }

    return results;
  },
};
