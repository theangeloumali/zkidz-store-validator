/** Severity level for each validation check */
export type Severity = "PASS" | "WARN" | "FAIL" | "SKIP";

/** Individual check result produced by an agent */
export interface CheckResult {
  /** Unique identifier, e.g. "android.target-sdk" */
  id: string;
  /** Agent that produced this result */
  agent: string;
  /** Severity level */
  severity: Severity;
  /** Short title, e.g. "Target SDK version" */
  title: string;
  /** Human-readable detail message */
  message: string;
  /** Link to relevant store documentation */
  docs?: string;
}

/** Supported platform types */
export type PlatformType =
  | "twa"
  | "capacitor"
  | "expo"
  | "flutter"
  | "react-native";

/** Android-specific normalized config */
export interface AndroidConfig {
  packageId: string;
  appName: string;
  versionCode: number;
  versionName: string;
  minSdkVersion: number;
  targetSdkVersion: number;
  permissions: string[];
  signingConfigured: boolean;
  assetLinksPath?: string;
  assetLinksFingerprints?: string[];
  manifestFingerprints?: string[];
}

/** iOS-specific normalized config */
export interface IosConfig {
  bundleId: string;
  appName: string;
  version: string;
  buildNumber: string;
  infoPlistPath?: string;
  usageDescriptions: Record<string, string>;
  capabilities: string[];
  encryptionDeclared: boolean;
  aasaPath?: string;
  entitlementsPath?: string;
}

/** Icon entry */
export interface IconEntry {
  size: string;
  path: string;
  exists: boolean;
}

/** Deep link configuration */
export interface DeepLinkConfig {
  platform: string;
  routes: string[];
}

/**
 * Normalized app configuration — the universal interface
 * that all adapters produce and all agents consume.
 */
export interface NormalizedAppConfig {
  platform: PlatformType;
  android?: AndroidConfig;
  ios?: IosConfig;
  appName: string;
  icons: IconEntry[];
  privacyPolicyUrl?: string;
  deepLinks: DeepLinkConfig[];
  storeListingPath?: string;
  sourceCodeDirs: string[];
  /** Absolute path to the project root */
  projectRoot: string;
}

/** Options passed to agents at runtime */
export interface RunOptions {
  offline: boolean;
  verbose: boolean;
  cwd: string;
}

/** Interface that all validation agents implement */
export interface ValidationAgent {
  name: string;
  run(
    config: NormalizedAppConfig,
    options: RunOptions,
  ): Promise<CheckResult[]>;
}

/** Interface that all platform adapters implement */
export interface PlatformAdapter {
  platform: PlatformType;
  detect(cwd: string): boolean;
  normalize(cwd: string): NormalizedAppConfig;
}

/** CLI arguments parsed from process.argv */
export interface CliArgs {
  platform?: PlatformType;
  offline: boolean;
  verbose: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
  cwd: string;
}

/** Summary of all check results */
export interface ResultSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
}
