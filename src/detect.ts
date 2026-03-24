import * as fs from "node:fs";
import * as path from "node:path";
import type { PlatformType } from "./types.js";

/** Detect which platforms are present in the given directory */
export function detectPlatforms(cwd: string): PlatformType[] {
  const detected: PlatformType[] = [];

  // 1. TWA: twa-manifest.json exists
  if (fs.existsSync(path.join(cwd, "twa-manifest.json"))) {
    detected.push("twa");
  }

  // 2. Capacitor: capacitor.config.ts OR capacitor.config.json exists
  if (
    fs.existsSync(path.join(cwd, "capacitor.config.ts")) ||
    fs.existsSync(path.join(cwd, "capacitor.config.json"))
  ) {
    detected.push("capacitor");
  }

  // 3. Expo: app.json with "expo" key, OR app.config.js/ts exists
  let isExpo = false;
  const appJsonPath = path.join(cwd, "app.json");
  if (fs.existsSync(appJsonPath)) {
    try {
      const content = fs.readFileSync(appJsonPath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && "expo" in parsed) {
        isExpo = true;
      }
    } catch {
      // Invalid JSON — skip Expo detection via app.json
    }
  }
  if (
    !isExpo &&
    (fs.existsSync(path.join(cwd, "app.config.js")) ||
      fs.existsSync(path.join(cwd, "app.config.ts")))
  ) {
    isExpo = true;
  }
  if (isExpo) {
    detected.push("expo");
  }

  // 4. Flutter: pubspec.yaml with "flutter:" line AND (android/ OR ios/ dir exists)
  const pubspecPath = path.join(cwd, "pubspec.yaml");
  if (fs.existsSync(pubspecPath)) {
    try {
      const pubspecContent = fs.readFileSync(pubspecPath, "utf-8");
      const hasFlutterKey = /^flutter:/m.test(pubspecContent);
      const hasAndroidDir = fs.existsSync(path.join(cwd, "android"));
      const hasIosDir = fs.existsSync(path.join(cwd, "ios"));
      if (hasFlutterKey && (hasAndroidDir || hasIosDir)) {
        detected.push("flutter");
      }
    } catch {
      // Unreadable pubspec.yaml — skip Flutter detection
    }
  }

  // 5. React Native (bare): android/app/build.gradle + ios/ dir, NOT already Expo
  if (
    !isExpo &&
    fs.existsSync(path.join(cwd, "android", "app", "build.gradle")) &&
    fs.existsSync(path.join(cwd, "ios"))
  ) {
    detected.push("react-native");
  }

  return detected;
}
