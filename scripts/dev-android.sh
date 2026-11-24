#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-flutter}"
RELEASE_FLAG=""
if [[ "${2:-}" == "--release" || "${RELEASE:-0}" == "1" ]]; then
  RELEASE_FLAG="--release"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${RUSTC_WRAPPER:-}" ]] && command -v sccache >/dev/null 2>&1; then
  export RUSTC_WRAPPER="sccache"
fi

build_rust() {
  cd "${REPO_ROOT}"
  cargo ndk \
    -t arm64-v8a \
    --platform 21 \
    -o "${REPO_ROOT}/flutter/android/app/src/main/jniLibs" \
    build \
    --features flutter,mediacodec \
    ${RELEASE_FLAG}
}

run_flutter() {
  cd "${REPO_ROOT}/flutter"
  flutter run --target-platform android-arm64 ${RELEASE_FLAG}
}

case "${MODE}" in
  flutter)
    run_flutter
    ;;
  rust)
    build_rust
    ;;
  all)
    build_rust
    run_flutter
    ;;
  *)
    echo "Usage: $0 [flutter|rust|all] [--release]" >&2
    exit 2
    ;;
esac
