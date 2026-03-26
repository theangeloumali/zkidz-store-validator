# store-validator

Pre-submission validation for App Store and Play Store. Catches common rejection issues before you submit.

Supports **TWA**, **Capacitor**, **Expo**, **Flutter**, and **React Native** projects.

## Why

App store rejections cost days. Missing usage descriptions, wrong SDK targets, exposed API keys, mismatched bundle IDs -- these are all preventable. `store-validator` runs 40+ checks against your project and flags problems before they reach review.

## Quick Start

```bash
npx store-validator
```

That's it. The tool auto-detects your framework and runs all applicable checks.

## Install

```bash
npm install -g store-validator
```

Requires Node.js 18+.

## Usage

```bash
store-validator [options]
```

| Option              | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `--platform <type>` | Force platform detection (`twa`, `capacitor`, `expo`, `flutter`) |
| `--offline`         | Skip network checks (policy URLs, AASA validation)               |
| `--verbose`         | Show detailed output for all checks, including passes            |
| `--json`            | Output results as JSON (for CI/CD pipelines)                     |
| `--cwd <path>`      | Set working directory (default: current directory)               |
| `-h, --help`        | Show help                                                        |
| `-v, --version`     | Show version                                                     |

### Examples

```bash
# Validate an Expo project in another directory
store-validator --cwd ~/projects/my-app

# CI pipeline usage
store-validator --json --offline > validation-report.json

# Force Flutter detection
store-validator --platform flutter

# See all check results including passes
store-validator --verbose
```

## What It Checks

### Android Compliance (17 checks)

- Package ID presence and format
- Target SDK version (must be >= 34 for Play Store)
- Minimum SDK version (warns if < 21)
- App name validation (placeholders, length limits)
- Version code presence
- Release signing configuration
- Digital Asset Links format
- Permission declaration matching against source code usage
- AD_ID permission usage evidence
- Foreground service types (required for targetSdk 34+)
- Exported components (`android:exported` attribute)
- Internet permission for web-wrapper apps
- Backup rules (`dataExtractionRules` / `fullBackupContent`)
- AAB format recommendation
- Large screen support

### iOS Compliance (19 checks)

- Bundle ID presence and format
- Display name validation
- Encryption declaration (`ITSAppUsesNonExemptEncryption`)
- Usage descriptions (camera, microphone, location, FaceID, photos)
- Required usage descriptions based on source code detection
- Unused capabilities detection
- Launch storyboard configuration
- Apple App Site Association (AASA) validation
- Background modes evidence
- Privacy manifest (`PrivacyInfo.xcprivacy`)
- App Tracking Transparency validation
- App Transport Security exceptions
- Minimum deployment target (warns if < iOS 16)
- Required device capabilities
- Info.plist required keys
- Push notification entitlements
- URL scheme conflict detection
- Orientation support

### Security (4 checks)

- API keys and secrets in config files (Google, OpenAI, Stripe, AWS, Supabase)
- Environment files in public directories
- HTTPS-only URL enforcement
- Keystore files in project root

### Store Listing (4 checks)

- App name length (<= 30 characters)
- App name placeholder detection
- Required icon sizes (192x192, 512x512)
- Placeholder content in configs

### Cross-Platform (3 checks)

- Package/Bundle ID consistency between Android and iOS
- App name match across platforms
- Deep link consistency

### Policy Reachability (2 checks)

- Apple App Store Review Guidelines URL
- Google Play Developer Content Policy URL

## Output

### Console (default)

```
══════════════════════════════════════════════════════
  store-validator v1.0.2
  Detected: Expo
══════════════════════════════════════════════════════

  Android Compliance
  [PASS] Package ID format
  [PASS] Target SDK version
  [WARN] Minimum SDK is 21 — consider raising to 24
  [FAIL] Missing release signing configuration

  Summary
  ┌──────┬───────┐
  │ PASS │    35 │
  │ WARN │     5 │
  │ FAIL │     2 │
  │ SKIP │     0 │
  └──────┴───────┘
```

### JSON (`--json`)

```json
{
  "platforms": ["expo"],
  "checks": [
    {
      "id": "android.target-sdk",
      "agent": "android-compliance",
      "severity": "PASS",
      "title": "Target SDK version",
      "message": "Target SDK is 34"
    }
  ],
  "summary": {
    "total": 42,
    "pass": 35,
    "warn": 5,
    "fail": 2,
    "skip": 0
  }
}
```

## CI/CD Integration

`store-validator` exits with code **0** when all checks pass or warn, and code **1** when any check fails. Use this in your pipeline:

```yaml
# GitHub Actions
- name: Validate store compliance
  run: npx store-validator --offline --json
```

```yaml
# GitLab CI
validate:
  script:
    - npx store-validator --offline
```

## Supported Frameworks

| Framework        | Detection                           | Config Files Read                              |
| ---------------- | ----------------------------------- | ---------------------------------------------- |
| TWA (Bubblewrap) | `twa-manifest.json`                 | `twa-manifest.json`                            |
| Capacitor        | `capacitor.config.ts` or `.json`    | `capacitor.config.ts`, `capacitor.config.json` |
| Expo             | `app.json` with `"expo"` key        | `app.json`, `eas.json`                         |
| Flutter          | `pubspec.yaml` with `flutter:` key  | `pubspec.yaml`, `build.gradle`                 |
| React Native     | `android/app/build.gradle` + `ios/` | `build.gradle`, `Info.plist`                   |

## Project Structure

```
src/
├── cli.ts              # CLI entry point and argument parsing
├── detect.ts           # Framework auto-detection
├── types.ts            # TypeScript interfaces
├── utils.ts            # File I/O, parsing, source grep helpers
├── reporter.ts         # Console and JSON output formatting
├── adapters/           # Framework-specific config readers
│   ├── twa.ts
│   ├── capacitor.ts
│   ├── expo.ts
│   └── flutter.ts
└── agents/             # Validation check agents
    ├── android-compliance.ts
    ├── ios-compliance.ts
    ├── security.ts
    ├── store-listing.ts
    ├── cross-platform.ts
    └── policy-download.ts
```

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build for distribution
npm run build

# Format code
npm run format
```

## License

MIT

---

Built by [ZKidz Dev](https://github.com/theangeloumali/zkidz-store-validator)
