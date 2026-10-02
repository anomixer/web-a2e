#!/bin/bash
# Build the ApplEm desktop app for macOS, signed with Developer ID, notarised
# and stapled: an .app and a .dmg that open on any Mac without a Gatekeeper
# warning.
#
# Prerequisites (one-time):
#   1. A "Developer ID Application" certificate in the login keychain
#      (Xcode > Settings > Accounts > Manage Certificates > + > Developer ID Application).
#   2. A notarytool credential profile. The credentials are the Apple ID's,
#      not an app's, so any existing profile works; NOTARY_PROFILE names it.
#      To make one for ApplEm:
#        xcrun notarytool store-credentials "applem-notary" \
#          --apple-id "michael_daley@icloud.com" --team-id PJNBHRUE79
#
# Usage:
#   scripts/build-desktop-mac.sh                 # sign, notarise, staple
#   NOTARIZE=0 scripts/build-desktop-mac.sh      # sign only (quick local check)
#   NOTARY_PROFILE=other scripts/build-desktop-mac.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NOTARIZE="${NOTARIZE:-1}"
NOTARY_PROFILE="${NOTARY_PROFILE:-applem-notary}"
# Fall back to a profile another app already stored for the same Apple ID.
if [ "$NOTARIZE" = "1" ] && ! xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
  for candidate in markwell-notary limelight-notary windowsizer-notary; do
    if xcrun notarytool history --keychain-profile "$candidate" >/dev/null 2>&1; then
      echo "> No '$NOTARY_PROFILE' profile; using '$candidate' (same Apple ID)"
      NOTARY_PROFILE="$candidate"
      break
    fi
  done
fi

# The Developer ID identity, found rather than written down, so the repository
# names no certificate. APPLE_SIGNING_IDENTITY overrides it.
IDENTITY="${APPLE_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning \
  | grep "Developer ID Application" | head -1 | sed -E 's/.*"(.*)"/\1/')}"
if [ -z "$IDENTITY" ]; then
  echo "x No 'Developer ID Application' certificate in the keychain." >&2
  exit 1
fi
echo "> Signing identity: $IDENTITY"

# One version for the app: the one the release process bumps.
VERSION="$(sed -nE 's/.*VERSION = "([^"]+)".*/\1/p' src/js/config/version.js)"
if [ -z "$VERSION" ]; then
  echo "x No VERSION in src/js/config/version.js" >&2
  exit 1
fi
echo "> Version: $VERSION"

# Tauri signs the app and the .dmg itself, hardened runtime and secure
# timestamp included, when it is given an identity.
echo "> Building..."
APPLE_SIGNING_IDENTITY="$IDENTITY" npm run tauri:build -- \
  --bundles app,dmg \
  --config "{\"version\":\"$VERSION\"}"

BUNDLE="src-tauri/target/release/bundle"
APP="$BUNDLE/macos/ApplEm.app"
DMG="$(ls -t "$BUNDLE"/dmg/ApplEm_"$VERSION"_*.dmg | head -1)"

echo "> Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP"
codesign --display --verbose=2 "$APP" 2>&1 | grep -E "Authority=Developer|TeamIdentifier|Runtime" || true

if [ "$NOTARIZE" != "1" ]; then
  echo "> Signed, not notarised (NOTARIZE=0):"
  echo "  $APP"
  echo "  $DMG"
  exit 0
fi

# The .dmg is what is distributed and it carries the signed app, so it is what
# goes to Apple; the ticket then covers the app inside it as well.
echo "> Notarising $DMG with profile '$NOTARY_PROFILE'..."
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait

echo "> Stapling..."
xcrun stapler staple "$DMG"
xcrun stapler staple "$APP"
xcrun stapler validate "$DMG"
xcrun stapler validate "$APP"

echo "> Gatekeeper:"
spctl --assess --type execute --verbose "$APP"
spctl --assess --type open --context context:primary-signature --verbose "$DMG"

echo "> Done:"
echo "  $APP"
echo "  $DMG"
