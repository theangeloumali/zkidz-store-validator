import type { ValidationAgent } from "../types.js";
import { androidComplianceAgent } from "./android-compliance.js";
import { iosComplianceAgent } from "./ios-compliance.js";
import { securityAgent } from "./security.js";
import { storeListingAgent } from "./store-listing.js";
import { crossPlatformAgent } from "./cross-platform.js";
import { policyDownloadAgent } from "./policy-download.js";

export const allAgents: ValidationAgent[] = [
  policyDownloadAgent,
  androidComplianceAgent,
  iosComplianceAgent,
  securityAgent,
  storeListingAgent,
  crossPlatformAgent,
];
