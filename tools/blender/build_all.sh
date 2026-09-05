#!/usr/bin/env bash
# Rebuild every Blender-authored prop into src/assets/models/.
set -euo pipefail
cd "$(dirname "$0")/../.."
for script in tools/blender/make_*.py; do
  echo "== $script"
  blender --background --python "$script" | grep -E "exported|Error|error" || true
done
