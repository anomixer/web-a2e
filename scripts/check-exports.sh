#!/usr/bin/env bash
#
# check-exports.sh - Verify the WASM export list matches the bindings
#
# EXPORTED_FUNCTIONS in CMakeLists.txt is hand-maintained. Nothing has ever
# checked it against the functions actually defined in src/bindings, so the two
# can drift silently in both directions:
#
#   - a function defined with EMSCRIPTEN_KEEPALIVE but missing from the list is
#     dead-stripped by the linker, and the JS call fails at runtime;
#   - a name in the list with no matching definition is a stale entry that
#     survives long after the function it referred to was renamed or removed.
#
# Both are caught here. Exits non-zero on any mismatch.
#
# Written by
#  Mike Daley <michael_daley@icloud.com>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINDINGS="$ROOT/src/bindings/wasm_interface.cpp"
CMAKE="$ROOT/CMakeLists.txt"

[ -f "$BINDINGS" ] || { echo "check-exports: missing $BINDINGS" >&2; exit 2; }
[ -f "$CMAKE" ]    || { echo "check-exports: missing $CMAKE" >&2; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Defined: the line after each EMSCRIPTEN_KEEPALIVE is the function signature.
# Take the identifier immediately before the opening parenthesis.
grep -A1 '^EMSCRIPTEN_KEEPALIVE$' "$BINDINGS" \
  | grep -v '^EMSCRIPTEN_KEEPALIVE$' \
  | grep -v '^--$' \
  | sed -n 's/.*[^A-Za-z0-9_]\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*(.*/\1/p' \
  | sort -u > "$tmp/defined"

# Exported: quoted "_name" entries inside the EXPORTED_FUNCTIONS block. The
# leading underscore is Emscripten's C symbol prefix, not part of the name.
sed -n '/EXPORTED_FUNCTIONS/,/EXPORTED_RUNTIME_METHODS\|^[[:space:]]*-s /p' "$CMAKE" \
  | grep -o '\\"_[A-Za-z0-9_]*\\"' \
  | tr -d '\\"' \
  | sed 's/^_//' \
  | sort -u > "$tmp/exported"

# Emscripten provides these itself; they are legitimately in the list without a
# definition in our bindings.
cat > "$tmp/builtin" <<'EOF'
free
malloc
EOF

comm -23 "$tmp/defined" "$tmp/exported" > "$tmp/missing"
comm -13 "$tmp/defined" "$(sort -u "$tmp/builtin" > "$tmp/builtin.s"; echo "$tmp/exported")" \
  | comm -23 - "$tmp/builtin.s" > "$tmp/stale"

status=0

if [ -s "$tmp/missing" ]; then
  echo "check-exports: defined with EMSCRIPTEN_KEEPALIVE but NOT in EXPORTED_FUNCTIONS:" >&2
  sed 's/^/  - /' "$tmp/missing" >&2
  echo "  → these will be dead-stripped by the linker and fail at runtime." >&2
  status=1
fi

if [ -s "$tmp/stale" ]; then
  echo "check-exports: listed in EXPORTED_FUNCTIONS but NOT defined in bindings:" >&2
  sed 's/^/  - /' "$tmp/stale" >&2
  echo "  → stale entries; remove them from CMakeLists.txt." >&2
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "check-exports: OK ($(wc -l < "$tmp/defined" | tr -d ' ') functions in sync)"
fi

exit "$status"
