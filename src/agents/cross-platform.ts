import type {
  CheckResult,
  ValidationAgent,
  NormalizedAppConfig,
  RunOptions,
} from "../types.js";

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

    return results;
  },
};
