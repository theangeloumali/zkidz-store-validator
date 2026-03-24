import type {
  CheckResult,
  ValidationAgent,
  NormalizedAppConfig,
  RunOptions,
} from "../types.js";
import { fetchWithTimeout } from "../utils.js";

const APPLE_GUIDELINES_URL =
  "https://developer.apple.com/app-store/review/guidelines/";
const GOOGLE_POLICY_URL =
  "https://play.google.com/about/developer-content-policy/";

export const policyDownloadAgent: ValidationAgent = {
  name: "policy-download",

  async run(
    _config: NormalizedAppConfig,
    options: RunOptions,
  ): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // ── policy.apple-guidelines ────────────────────────────────────────────
    {
      if (options.offline) {
        results.push({
          id: "policy.apple-guidelines",
          agent: "policy-download",
          severity: "SKIP",
          title: "Apple App Store Review Guidelines reachable",
          message: "Skipped reachability check (offline mode).",
          docs: APPLE_GUIDELINES_URL,
        });
      } else {
        const response = await fetchWithTimeout(APPLE_GUIDELINES_URL);
        results.push({
          id: "policy.apple-guidelines",
          agent: "policy-download",
          severity: response.ok ? "PASS" : "WARN",
          title: "Apple App Store Review Guidelines reachable",
          message: response.ok
            ? `Apple guidelines page is reachable (HTTP ${response.status}).`
            : `Could not reach Apple guidelines (HTTP ${response.status}). Check your connection.`,
          docs: APPLE_GUIDELINES_URL,
        });
      }
    }

    // ── policy.google-policy ───────────────────────────────────────────────
    {
      if (options.offline) {
        results.push({
          id: "policy.google-policy",
          agent: "policy-download",
          severity: "SKIP",
          title: "Google Play Developer Content Policy reachable",
          message: "Skipped reachability check (offline mode).",
          docs: GOOGLE_POLICY_URL,
        });
      } else {
        const response = await fetchWithTimeout(GOOGLE_POLICY_URL);
        results.push({
          id: "policy.google-policy",
          agent: "policy-download",
          severity: response.ok ? "PASS" : "WARN",
          title: "Google Play Developer Content Policy reachable",
          message: response.ok
            ? `Google policy page is reachable (HTTP ${response.status}).`
            : `Could not reach Google policy (HTTP ${response.status}). Check your connection.`,
          docs: GOOGLE_POLICY_URL,
        });
      }
    }

    return results;
  },
};
