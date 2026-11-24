param(
    [ValidateSet("flutter", "rust", "all")]
    [string]$Mode = "flutter",
    [switch]$Release,
    [string]$RendezvousServer = $env:CUSTOM_RENDEZVOUS_SERVER,
    [string]$RsPubKey = $env:CUSTOM_RS_PUB_KEY,
    [string]$ApiServer = $env:CUSTOM_API_SERVER,
    [string]$UpdateUrl = $env:CUSTOM_UPDATE_URL,
    [string]$AppName = $env:CUSTOM_APP_NAME
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ($RendezvousServer) { $env:CUSTOM_RENDEZVOUS_SERVER = $RendezvousServer }
if ($RsPubKey) { $env:CUSTOM_RS_PUB_KEY = $RsPubKey }
if ($ApiServer) { $env:CUSTOM_API_SERVER = $ApiServer }
if ($UpdateUrl) { $env:CUSTOM_UPDATE_URL = $UpdateUrl }
if ($AppName) { $env:CUSTOM_APP_NAME = $AppName }

if (-not $env:RUSTC_WRAPPER -and (Get-Command sccache -ErrorAction SilentlyContinue)) {
    $env:RUSTC_WRAPPER = "sccache"
}

if ($Mode -eq "rust" -or $Mode -eq "all") {
    $jniLibsDir = Join-Path $RepoRoot "flutter\android\app\src\main\jniLibs"
    $ndkArgs = @(
        "ndk",
        "-t", "arm64-v8a",
        "--platform", "21",
        "-o", $jniLibsDir,
        "build",
        "--features", "flutter,mediacodec"
    )
    if ($Release) {
        $ndkArgs += "--release"
    }
    Push-Location $RepoRoot
    try {
        & cargo @ndkArgs
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}

if ($Mode -eq "flutter" -or $Mode -eq "all") {
    $flutterArgs = @("run", "--target-platform", "android-arm64")
    if ($Release) {
        $flutterArgs += "--release"
    }
    Push-Location (Join-Path $RepoRoot "flutter")
    try {
        & flutter @flutterArgs
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    } finally {
        Pop-Location
    }
}
