import type { PlatformAdapter, PlatformType } from "../types.js";
import { twaAdapter } from "./twa.js";
import { capacitorAdapter } from "./capacitor.js";
import { expoAdapter } from "./expo.js";
import { flutterAdapter } from "./flutter.js";

const adapters: PlatformAdapter[] = [
  twaAdapter,
  capacitorAdapter,
  expoAdapter,
  flutterAdapter,
];

const adapterMap = new Map<PlatformType, PlatformAdapter>(
  adapters.map((a) => [a.platform, a]),
);

/**
 * Get a specific adapter by platform type.
 * Throws if the platform is not yet supported.
 */
export function getAdapter(platform: PlatformType): PlatformAdapter {
  const adapter = adapterMap.get(platform);
  if (!adapter) {
    throw new Error(
      `No adapter for platform "${platform}". Supported: ${adapters.map((a) => a.platform).join(", ")}`,
    );
  }
  return adapter;
}

/**
 * Get all registered adapters.
 * Useful for auto-detection: iterate and call detect() on each.
 */
export function getAllAdapters(): PlatformAdapter[] {
  return [...adapters];
}
