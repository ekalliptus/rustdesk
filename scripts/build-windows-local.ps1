param(
    [string]$RendezvousServer = $env:CUSTOM_RENDEZVOUS_SERVER,
    [string]$RsPubKey = $env:CUSTOM_RS_PUB_KEY,
    [string]$ApiServer = $env:CUSTOM_API_SERVER,
    [string]$UpdateUrl = $env:CUSTOM_UPDATE_URL,
    [string]$AppName = $env:CUSTOM_APP_NAME,
    [switch]$SkipVcpkg,
    [switch]$KeepFlutter344Patch
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Test-SymlinkSupported {
    $probe = Join-Path $env:TEMP "eldesk_symlink_$(Get-Random)"
    New-Item -ItemType Directory -Path $probe | Out-Null
    $linkPath = Join-Path $probe "link"
    try {
        cmd /c "mklink /D `"$linkPath`" `"$probe`"" >$null 2>&1
        return ($LASTEXITCODE -eq 0)
    } finally {
        if (Test-Path $linkPath) {
            cmd /c "rmdir `"$linkPath`"" >$null 2>&1
        }
        Remove-Item -Recurse -Force $probe -ErrorAction SilentlyContinue
    }
}

if (-not (Test-SymlinkSupported)) {
    Write-Error "Symlinks are blocked. Run scripts\setup-windows-admin.ps1 as Administrator first to enable Windows Developer Mode."
    exit 1
}

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
    Write-Error "vswhere.exe not found. Run scripts\setup-windows-admin.ps1 as Administrator to install VS 2022 Build Tools."
    exit 1
}
$vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsInstall) {
    Write-Error "Visual Studio C++ x64 Build Tools not found. Run scripts\setup-windows-admin.ps1 as Administrator."
    exit 1
}
$vsDevCmd = Join-Path $vsInstall "Common7\Tools\VsDevCmd.bat"
if (-not (Test-Path $vsDevCmd)) {
    Write-Error "VsDevCmd.bat not found under $vsInstall"
    exit 1
}

$preferredVcpkgRoot = $env:VCPKG_ROOT
if (-not $preferredVcpkgRoot) {
    $preferredVcpkgRoot = [Environment]::GetEnvironmentVariable("VCPKG_ROOT", "User")
}
if (-not $preferredVcpkgRoot -or $preferredVcpkgRoot -like "*Microsoft Visual Studio*") {
    $preferredVcpkgRoot = "C:\dev\vcpkg"
}

$envLines = cmd /c "`"$vsDevCmd`" -arch=amd64 -host_arch=amd64 -no_logo >nul && set"
foreach ($line in $envLines) {
    if ($line -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
}

if (-not $env:LIBCLANG_PATH -and (Test-Path "C:\Program Files\LLVM\bin\libclang.dll")) {
    $env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
}
if (-not $env:LIBCLANG_PATH -or -not (Test-Path (Join-Path $env:LIBCLANG_PATH "libclang.dll"))) {
    Write-Error "LIBCLANG_PATH (LLVM libclang.dll) not found. Run scripts\setup-windows-admin.ps1 as Administrator."
    exit 1
}

$env:VCPKG_ROOT = $preferredVcpkgRoot
$vcpkgExe = Join-Path $env:VCPKG_ROOT "vcpkg.exe"
if (-not (Test-Path $vcpkgExe)) {
    Write-Error "vcpkg.exe not found at $vcpkgExe."
    exit 1
}
$env:Path = "$($env:VCPKG_ROOT);$env:Path"
if (-not $env:VCPKG_DEFAULT_BINARY_CACHE) {
    $env:VCPKG_DEFAULT_BINARY_CACHE = "C:\dev\vcpkg-cache"
}
New-Item -ItemType Directory -Force -Path $env:VCPKG_DEFAULT_BINARY_CACHE | Out-Null

if (Test-Path "C:\dev\tools\nasm\nasm.exe") {
    $env:Path = "C:\dev\tools\nasm;$env:Path"
}

if ($RendezvousServer) { $env:CUSTOM_RENDEZVOUS_SERVER = $RendezvousServer }
if ($RsPubKey) { $env:CUSTOM_RS_PUB_KEY = $RsPubKey }
if ($ApiServer) { $env:CUSTOM_API_SERVER = $ApiServer }
if ($UpdateUrl) { $env:CUSTOM_UPDATE_URL = $UpdateUrl }
if ($AppName) { $env:CUSTOM_APP_NAME = $AppName }

$env:VCPKG_DEFAULT_HOST_TRIPLET = "x64-windows-static"

Push-Location $RepoRoot
try {
    if (-not $SkipVcpkg) {
        Write-Host "[1/4] Installing vcpkg dependencies (x64-windows-static)..."
        & $vcpkgExe install --triplet x64-windows-static --x-install-root="$env:VCPKG_ROOT\installed"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    Write-Host "[2/4] Building dylib_virtual_display (Rust 1.75.0 MSVC)..."
    Push-Location (Join-Path $RepoRoot "libs\virtual_display\dylib")
    try {
        cargo +1.75.0-x86_64-pc-windows-msvc build --locked --release
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }

    Write-Host "[3/4] Building librustdesk.dll (Rust 1.75.0 MSVC, features=flutter,hwcodec,vram)..."
    cargo +1.75.0-x86_64-pc-windows-msvc build --locked --release --lib --features flutter,hwcodec,vram
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $rustDll = Join-Path $RepoRoot "target\release\librustdesk.dll"
    $vddDll = Join-Path $RepoRoot "target\release\deps\dylib_virtual_display.dll"
    if (-not (Test-Path $rustDll)) {
        Write-Error "Missing $rustDll after Cargo build."
        exit 1
    }

    $bridgeBackup = "C:\dev\tools\eldesk-bridge-3.44"
    $flutterVerRaw = (flutter --version | Select-Object -First 1)
    $needs344Patch = $false
    if ($flutterVerRaw -match 'Flutter\s+(\d+)\.(\d+)') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 27)) {
            $needs344Patch = $true
        }
    }

    $appliedPatchHere = $false
    if ($needs344Patch) {
        if (Test-Path $bridgeBackup) {
            Copy-Item -Force -Recurse "$bridgeBackup\*" $RepoRoot
        }
        $gitBash = @("C:\Program Files\Git\bin\bash.exe", "C:\dev\tools\git\bin\bash.exe") |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
        if (-not $gitBash) { $gitBash = "bash.exe" }
        $commonDart = Get-Content (Join-Path $RepoRoot "flutter\lib\common.dart") -Raw
        if ($commonDart -match 'DialogTheme\(') {
            $env:CHERE_INVOKING = "1"
            & $gitBash -lc "./.github/patches/apply_flutter_3.44_source_patches.sh"
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            $appliedPatchHere = $true
        }
    }

    Write-Host "[4/4] Building Flutter Windows release..."
    try {
        Push-Location (Join-Path $RepoRoot "flutter")
        try {
            flutter pub get
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            flutter build windows --release
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } finally {
            Pop-Location
        }
    } finally {
        if ($appliedPatchHere -and -not $KeepFlutter344Patch) {
            git checkout -- flutter/lib/common.dart flutter/pubspec.yaml flutter/lib/common/widgets/dialog.dart
        }
    }

    $releaseDir = Join-Path $RepoRoot "flutter\build\windows\x64\runner\Release"
    Copy-Item -Force $rustDll $releaseDir
    if (Test-Path $vddDll) {
        Copy-Item -Force $vddDll $releaseDir
    }
    $exePath = Join-Path $releaseDir "rustdesk.exe"
    Write-Host "EL-Desk Windows build ready: $exePath"
} finally {
    Pop-Location
}
