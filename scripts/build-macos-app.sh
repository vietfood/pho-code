#!/usr/bin/env bash
# Build a local, unsigned Pho Code.app without copying user state into it.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: scripts/build-macos-app.sh [--output PATH] [--force]

Builds release `pho` and `pho-native` binaries and assembles an unsigned,
local Pho Code.app. Existing output is preserved unless --force is supplied;
--force moves the old bundle to the macOS Trash before replacing it.
EOF
}

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUTPUT_PATH="$ROOT_DIR/dist/Pho Code.app"
FORCE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)
            [[ $# -ge 2 ]] || { echo "--output requires a path" >&2; exit 2; }
            OUTPUT_PATH=$2
            shift 2
            ;;
        --force)
            FORCE=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ "$OUTPUT_PATH" != /* ]]; then
    OUTPUT_PATH="$ROOT_DIR/$OUTPUT_PATH"
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Pho Code.app packaging is supported only on macOS (Darwin)." >&2
    exit 1
fi

command -v cargo >/dev/null 2>&1 || { echo "cargo is required" >&2; exit 1; }
command -v plutil >/dev/null 2>&1 || { echo "plutil is required on macOS" >&2; exit 1; }

if [[ -e "$OUTPUT_PATH" && "$FORCE" -ne 1 ]]; then
    echo "output already exists: $OUTPUT_PATH" >&2
    echo "choose another --output path or pass --force (the old bundle is moved to Trash)" >&2
    exit 2
fi

VERSION=$(sed -n '/^\[package\]/,/^\[/p' "$ROOT_DIR/Cargo.toml" \
    | sed -n 's/^version = "\([^"]*\)"/\1/p' | head -n 1)
[[ -n "$VERSION" ]] || { echo "could not read package version from Cargo.toml" >&2; exit 1; }

STAGE=$(mktemp -d "${TMPDIR:-/tmp}/pho-code-app.XXXXXX")
cleanup() {
    # Keep failure cleanup recoverable on macOS. Successful assembly moves the
    # staged bundle out of this directory and clears STAGE below.
    if [[ -n "${STAGE:-}" && -d "$STAGE" ]]; then
        /usr/bin/trash "$STAGE" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

echo "Building release binaries (version $VERSION)…"
cargo build --release --bin pho --bin pho-native --manifest-path "$ROOT_DIR/Cargo.toml"

BUNDLE="$STAGE/Pho Code.app"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources/bin"
cp "$ROOT_DIR/target/release/pho-native" "$BUNDLE/Contents/MacOS/Pho Code"
cp "$ROOT_DIR/target/release/pho" "$BUNDLE/Contents/Resources/bin/pho"
chmod 755 "$BUNDLE/Contents/MacOS/Pho Code" "$BUNDLE/Contents/Resources/bin/pho"
cp "$ROOT_DIR/packaging/macos/Info.plist" "$BUNDLE/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$BUNDLE/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$VERSION" "$BUNDLE/Contents/Info.plist"
printf 'APPL????' > "$BUNDLE/Contents/PkgInfo"

plutil -lint "$BUNDLE/Contents/Info.plist" >/dev/null
[[ "$(plutil -extract CFBundleExecutable raw "$BUNDLE/Contents/Info.plist")" == "Pho Code" ]]
[[ "$(plutil -extract CFBundleIdentifier raw "$BUNDLE/Contents/Info.plist")" == "com.pho-code.native" ]]
[[ "$(plutil -extract CFBundleShortVersionString raw "$BUNDLE/Contents/Info.plist")" == "$VERSION" ]]
[[ -x "$BUNDLE/Contents/MacOS/Pho Code" ]]
[[ -x "$BUNDLE/Contents/Resources/bin/pho" ]]

# The bundle contains only executable resources and metadata. Keychain data,
# preferences, journals, artifacts, and workspace files remain user-local.
[[ ! -e "$BUNDLE/Contents/Resources/Application Support" ]]
[[ ! -e "$BUNDLE/Contents/Resources/sessions" ]]
[[ ! -e "$BUNDLE/Contents/Resources/preferences" ]]

if [[ -e "$OUTPUT_PATH" ]]; then
    /usr/bin/trash "$OUTPUT_PATH"
fi
mkdir -p "$(dirname "$OUTPUT_PATH")"
mv "$BUNDLE" "$OUTPUT_PATH"
STAGE=

echo "Created unsigned app: $OUTPUT_PATH"
echo "Native executable: $OUTPUT_PATH/Contents/MacOS/Pho Code"
echo "CLI executable:    $OUTPUT_PATH/Contents/Resources/bin/pho"
echo "Run the native app with: open \"$OUTPUT_PATH\""
