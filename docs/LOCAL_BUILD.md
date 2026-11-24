# Local Build & Optimization Guide (`EL-Desk`)

This fork keeps laptop builds fast and avoids leaking upstream RustDesk public servers into local or CI builds.

## 1. Compile-Time Environment Variables

All Rust defaults live in [`libs/base/src/private_config.rs`](../libs/base/src/private_config.rs) and fail closed when unconfigured (no fallback to `rs-ny.rustdesk.com`, upstream `RS_PUB_KEY`, or `admin.rustdesk.com`).

| Variable | Default (`EL-Desk`) | Purpose |
| :--- | :--- | :--- |
| `CUSTOM_APP_NAME` | `EL-Desk` | Display application name (`APP_NAME`) |
| `CUSTOM_RENDEZVOUS_SERVER` | `relay.desk.ekalliptus.com` | Default ID/rendezvous server (`hbbs`) |
| `CUSTOM_RELAY_SERVER` | `CUSTOM_RENDEZVOUS_SERVER` | Explicit relay server override (`hbbr`) |
| `CUSTOM_RS_PUB_KEY` | `""` (empty, fail-closed) | Ed25519 public key from `hbbs` (`id_ed25519.pub`) |
| `CUSTOM_API_SERVER` | `https://api.desk.ekalliptus.com` | Go Custom API endpoint |
| `CUSTOM_WEB_URL` | `https://desk.ekalliptus.com` | Web profile / docs base URL |
| `CUSTOM_UPDATE_URL` | `https://dl.desk.ekalliptus.com/latest.json` | Private update check manifest URL |
| `CUSTOM_HIDE_SERVER_SETTINGS` | `true` | Hides ID/Relay UI & locks server/key options |
| `CUSTOM_HIDE_NETWORK_SETTINGS` | `false` | Hides the entire Network settings tab/section |
| `CUSTOM_ENCRYPTED_ONLY` | `true` | Forces `allow-insecure-tls-fallback = "N"` |

Optional Flutter `--dart-define` overrides mirror display/UI links in `flutter/lib/common/eldesk_config.dart` (`ELDESK_APP_NAME`, `ELDESK_WEB_URL`, `ELDESK_WEB_HOST`, `ELDESK_DOWNLOAD_URL`, `ELDESK_PRIVACY_URL`, `ELDESK_HIDE_SERVER_SETTINGS`, `ELDESK_HIDE_NETWORK_SETTINGS`).

## 2. Fast Linkers & `sccache`

The root `Cargo.toml` dev profile compiles workspace dependencies at `opt-level = 2` while keeping crate code at `opt-level = 0` with `debug = "line-tables-only"` and `incremental = true`.

To enable `sccache` plus `lld-link.exe` (Windows MSVC) or `clang` + `mold` (Linux), install the tools and pass `.cargo/config.fast.toml`:

```powershell
cargo build --config .cargo/config.fast.toml
```

Or copy `.cargo/config.fast.toml` into `~/.cargo/config.toml` locally without changing tracked files.

## 3. `vcpkg` Binary Caching (`VCPKG_DEFAULT_BINARY_CACHE`)

Desktop builds require C/C++ codec libraries via `vcpkg`. Configure a persistent binary cache outside the repo so clean target rebuilds do not recompile `libvpx`, `libyuv`, `aom`, or `opus`.

**PowerShell (Windows):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\vcpkg-bincache" | Out-Null
$env:VCPKG_DEFAULT_BINARY_CACHE = "$env:LOCALAPPDATA\vcpkg-bincache"
[Environment]::SetEnvironmentVariable("VCPKG_DEFAULT_BINARY_CACHE", $env:VCPKG_DEFAULT_BINARY_CACHE, "User")
```

**Bash (Linux/macOS):**
```bash
mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}/vcpkg-bincache"
export VCPKG_DEFAULT_BINARY_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/vcpkg-bincache"
```

## 4. Fast Single-ABI Android Iteration

`flutter/android/gradle.properties` caps JVM memory (`-Xmx3G`, `-XX:MaxMetaspaceSize=768M`) and enables Gradle parallel/build caching.

Decouple Rust native compilation from Flutter UI hot-reload:

1. Build `arm64-v8a` native library once (or when Rust changes):
   - Windows: `./scripts/dev-android.ps1 -Mode rust`
   - Linux/macOS: `./scripts/dev-android.sh rust`
2. Run Flutter UI hot-reload loop without rebuilding Rust:
   - Windows: `./scripts/dev-android.ps1 -Mode flutter`
   - Linux/macOS: `./scripts/dev-android.sh flutter`
3. Build + run both (`-Mode all` / `all`), or add `-Release` / `--release` when needed.
