param(
    [string]$RendezvousServer = $env:CUSTOM_RENDEZVOUS_SERVER,
    [string]$RsPubKey = $env:CUSTOM_RS_PUB_KEY,
    [string]$ApiServer = $env:CUSTOM_API_SERVER,
    [string]$UpdateUrl = $env:CUSTOM_UPDATE_URL,
    [string]$AppName = $env:CUSTOM_APP_NAME,
    [switch]$SkipVcpkg,
    [switch]$SkipRust,
    [switch]$KeepFlutter344Patch
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$preferredVcpkgRoot = $env:VCPKG_ROOT
if (-not $preferredVcpkgRoot) {
    $preferredVcpkgRoot = [Environment]::GetEnvironmentVariable("VCPKG_ROOT", "User")
}
if (-not $preferredVcpkgRoot -or $preferredVcpkgRoot -like "*Microsoft Visual Studio*") {
    $preferredVcpkgRoot = "C:\dev\vcpkg"
}

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsInstall) {
        $vsDevCmd = Join-Path $vsInstall "Common7\Tools\VsDevCmd.bat"
        if (Test-Path $vsDevCmd) {
            $envLines = cmd /c "`"$vsDevCmd`" -arch=amd64 -host_arch=amd64 -no_logo >nul && set"
            foreach ($line in $envLines) {
                if ($line -match '^([^=]+)=(.*)$') {
                    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
                }
            }
        }
    }
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
$env:VCPKG_DEFAULT_HOST_TRIPLET = "x64-windows-static"

if (-not $env:LIBCLANG_PATH -and (Test-Path "C:\Program Files\LLVM\bin\libclang.dll")) {
    $env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
}
if (-not $env:LIBCLANG_PATH -or -not (Test-Path (Join-Path $env:LIBCLANG_PATH "libclang.dll"))) {
    Write-Error "LIBCLANG_PATH (LLVM libclang.dll) not found."
    exit 1
}

if (-not $env:ANDROID_NDK_HOME) {
    $env:ANDROID_NDK_HOME = [Environment]::GetEnvironmentVariable("ANDROID_NDK_HOME", "User")
}
if (-not $env:ANDROID_NDK_HOME -or -not (Test-Path $env:ANDROID_NDK_HOME)) {
    $env:ANDROID_NDK_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk\ndk\28.2.13676358"
}
if (-not (Test-Path $env:ANDROID_NDK_HOME)) {
    Write-Error "ANDROID_NDK_HOME not found at $($env:ANDROID_NDK_HOME)."
    exit 1
}
$env:ANDROID_NDK_ROOT = $env:ANDROID_NDK_HOME

if ((-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) -and (Test-Path "C:\dev\tools\jdk-21\bin\java.exe")) {
    $env:JAVA_HOME = "C:\dev\tools\jdk-21"
}
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    $env:Path = "$($env:JAVA_HOME)\bin;$env:Path"
}

if (Test-Path "C:\dev\tools\nasm\nasm.exe") {
    $env:Path = "C:\dev\tools\nasm;$env:Path"
}

if ($RendezvousServer) { $env:CUSTOM_RENDEZVOUS_SERVER = $RendezvousServer }
if ($RsPubKey) { $env:CUSTOM_RS_PUB_KEY = $RsPubKey }
if ($ApiServer) { $env:CUSTOM_API_SERVER = $ApiServer }
if ($UpdateUrl) { $env:CUSTOM_UPDATE_URL = $UpdateUrl }
if ($AppName) { $env:CUSTOM_APP_NAME = $AppName }

Push-Location $RepoRoot
try {
    if (-not $SkipVcpkg) {
        $ndkClang = Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin\clang.exe"
        if (-not (Test-Path $ndkClang)) {
            Write-Error "NDK clang.exe not found at $ndkClang."
            exit 1
        }
        $ndkClangCmake = $ndkClang.Replace('\', '/')
        $localTripletsDir = Join-Path $env:VCPKG_ROOT "local-triplets"
        New-Item -ItemType Directory -Force -Path $localTripletsDir | Out-Null
        $arm64TripletContent = @"
set(VCPKG_TARGET_ARCHITECTURE arm64)
set(VCPKG_CRT_LINKAGE dynamic)
set(VCPKG_LIBRARY_LINKAGE static)
set(VCPKG_CMAKE_SYSTEM_NAME Android)
set(VCPKG_CMAKE_SYSTEM_VERSION 21)
set(VCPKG_MAKE_BUILD_TRIPLET "--host=aarch64-linux-android")
set(VCPKG_CMAKE_CONFIGURE_OPTIONS
    -DANDROID_ABI=arm64-v8a
    "-DCMAKE_ASM_COMPILER=$ndkClangCmake"
)
"@
        Set-Content -Path (Join-Path $localTripletsDir "arm64-android.cmake") -Value $arm64TripletContent -Encoding ASCII

        Write-Host "[1/4] Installing vcpkg dependencies (arm64-android, host=x64-windows-static)..."
        & $vcpkgExe install --triplet arm64-android --host-triplet x64-windows-static --overlay-triplets="$localTripletsDir" --x-install-root="$env:VCPKG_ROOT\installed"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if (-not $SkipRust) {
        $opensslPrefix = "C:\dev\tools\openssl-arm64-android"
        $libCrypto = Join-Path $opensslPrefix "lib\libcrypto.a"
        $libSsl = Join-Path $opensslPrefix "lib\libssl.a"
        $sslHeader = Join-Path $opensslPrefix "include\openssl\ssl.h"
        if (-not ((Test-Path $libCrypto) -and (Test-Path $libSsl) -and (Test-Path $sslHeader))) {
            Write-Host "Pre-building static OpenSSL for aarch64-linux-android at $opensslPrefix..."
            $opensslSrcDir = Get-ChildItem (Join-Path $env:USERPROFILE ".cargo\registry\src\*\openssl-src-*\openssl") -Directory -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if (-not $opensslSrcDir) {
                Write-Error "Could not locate openssl-src OpenSSL sources in Cargo registry cache."
                exit 1
            }
            $msys2UsrBin = Get-ChildItem (Join-Path $env:VCPKG_ROOT "downloads\tools\msys2\*\usr\bin") -Directory -ErrorAction SilentlyContinue |
                Where-Object {
                    (Test-Path (Join-Path $_.FullName "bash.exe")) -and
                    (Test-Path (Join-Path $_.FullName "perl.exe")) -and
                    (Test-Path (Join-Path $_.FullName "make.exe"))
                } |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if (-not $msys2UsrBin) {
                Write-Error "Could not locate MSYS2 bash/perl/make under $($env:VCPKG_ROOT)\downloads\tools\msys2."
                exit 1
            }
            $ndkLlvmBinDir = Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin"
            $ndkClangExe = (Join-Path $ndkLlvmBinDir "clang.exe").Replace('\', '/')
            $ndkArExe = (Join-Path $ndkLlvmBinDir "llvm-ar.exe").Replace('\', '/')
            $ndkRanlibExe = (Join-Path $ndkLlvmBinDir "llvm-ranlib.exe").Replace('\', '/')
            foreach ($tool in @($ndkClangExe, $ndkArExe, $ndkRanlibExe)) {
                if (-not (Test-Path $tool)) {
                    Write-Error "Required NDK LLVM tool missing: $tool"
                    exit 1
                }
            }

            $opensslBuildDir = "C:\dev\tools\openssl-arm64-android-build"
            if (Test-Path $opensslBuildDir) {
                Remove-Item -Recurse -Force $opensslBuildDir
            }
            New-Item -ItemType Directory -Force -Path $opensslPrefix | Out-Null
            Copy-Item -Recurse -Force $opensslSrcDir $opensslBuildDir

            $opensslBuildUnix = $opensslBuildDir.Replace('\', '/')
            $opensslPrefixUnix = $opensslPrefix.Replace('\', '/')
            $msys2Unix = $msys2UsrBin.Replace('\', '/')
            $shScript = @"
set -euo pipefail
export PATH="${msys2Unix}:/usr/bin:`$PATH"
unset CROSS_COMPILE
export CC="$ndkClangExe"
export AR="$ndkArExe"
export RANLIB="$ndkRanlibExe"
cd "$opensslBuildUnix"
perl ./Configure \
  --prefix="$opensslPrefixUnix" \
  --openssldir=/usr/local/ssl \
  no-shared no-module no-tests no-comp no-zlib no-zlib-dynamic \
  --libdir=lib no-ssl3 no-md2 no-rc5 no-weak-ssl-ciphers \
  no-camellia no-idea no-seed no-stdio no-afalgeng \
  linux-aarch64 -O2 -DANDROID -ffunction-sections -fdata-sections -fPIC \
  --target=aarch64-linux-android21
make -j8 build_libs
make install_dev
"@
            $shFile = Join-Path $opensslBuildDir "build_openssl_android.sh"
            [System.IO.File]::WriteAllText($shFile, $shScript.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
            $msys2Bash = Join-Path $msys2UsrBin "bash.exe"
            & $msys2Bash --noprofile --norc ($shFile.Replace('\', '/'))
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Static OpenSSL pre-build failed with exit code $LASTEXITCODE."
                exit $LASTEXITCODE
            }
            if (-not ((Test-Path $libCrypto) -and (Test-Path $libSsl) -and (Test-Path $sslHeader)) -or ((Get-Item $libCrypto).Length -le 0) -or ((Get-Item $libSsl).Length -le 0)) {
                Write-Error "Static OpenSSL artifacts missing or empty under $opensslPrefix."
                exit 1
            }
            Remove-Item -Recurse -Force $opensslBuildDir -ErrorAction SilentlyContinue
        }

        $env:AARCH64_LINUX_ANDROID_OPENSSL_NO_VENDOR = "1"
        $env:AARCH64_LINUX_ANDROID_OPENSSL_STATIC = "1"
        $env:AARCH64_LINUX_ANDROID_OPENSSL_DIR = $opensslPrefix
        $env:AARCH64_LINUX_ANDROID_OPENSSL_LIB_DIR = Join-Path $opensslPrefix "lib"
        $env:AARCH64_LINUX_ANDROID_OPENSSL_INCLUDE_DIR = Join-Path $opensslPrefix "include"

        $sodiumPrefix = "C:\dev\tools\libsodium-arm64-android"
        $sodiumLibDir = Join-Path $sodiumPrefix "lib"
        $sodiumLibA = Join-Path $sodiumLibDir "libsodium.a"
        $sodiumAliasA = Join-Path $sodiumLibDir "liblibsodium.a"
        if (-not ((Test-Path $sodiumLibA) -and (Test-Path $sodiumAliasA))) {
            Write-Host "Pre-building static libsodium 1.0.18 for aarch64-linux-android at $sodiumPrefix..."
            $sodiumSrcDir = Get-ChildItem (Join-Path $env:USERPROFILE ".cargo\registry\src\*\libsodium-sys-*\libsodium") -Directory -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if (-not $sodiumSrcDir) {
                Write-Error "Could not locate libsodium-sys libsodium sources in Cargo registry cache."
                exit 1
            }
            $msys2UsrBin = Get-ChildItem (Join-Path $env:VCPKG_ROOT "downloads\tools\msys2\*\usr\bin") -Directory -ErrorAction SilentlyContinue |
                Where-Object {
                    (Test-Path (Join-Path $_.FullName "bash.exe")) -and
                    (Test-Path (Join-Path $_.FullName "make.exe"))
                } |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if (-not $msys2UsrBin) {
                Write-Error "Could not locate MSYS2 bash/make under $($env:VCPKG_ROOT)\downloads\tools\msys2."
                exit 1
            }
            $ndkLlvmBinDir = Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin"
            $ndkClangExe = (Join-Path $ndkLlvmBinDir "clang.exe").Replace('\', '/')
            $ndkArExe = (Join-Path $ndkLlvmBinDir "llvm-ar.exe").Replace('\', '/')
            $ndkRanlibExe = (Join-Path $ndkLlvmBinDir "llvm-ranlib.exe").Replace('\', '/')
            $ndkStripExe = (Join-Path $ndkLlvmBinDir "llvm-strip.exe").Replace('\', '/')
            $ndkNmExe = (Join-Path $ndkLlvmBinDir "llvm-nm.exe").Replace('\', '/')
            foreach ($tool in @($ndkClangExe, $ndkArExe, $ndkRanlibExe, $ndkStripExe, $ndkNmExe)) {
                if (-not (Test-Path $tool)) {
                    Write-Error "Required NDK LLVM tool missing: $tool"
                    exit 1
                }
            }

            $sodiumBuildDir = "C:\dev\tools\libsodium-arm64-android-build"
            if (Test-Path $sodiumBuildDir) {
                Remove-Item -Recurse -Force $sodiumBuildDir
            }
            New-Item -ItemType Directory -Force -Path $sodiumPrefix | Out-Null
            Copy-Item -Recurse -Force $sodiumSrcDir $sodiumBuildDir

            $sodiumBuildUnix = $sodiumBuildDir.Replace('\', '/')
            $sodiumPrefixUnix = $sodiumPrefix.Replace('\', '/')
            $msys2Unix = $msys2UsrBin.Replace('\', '/')
            $sodiumShScript = @"
set -euo pipefail
export PATH="${msys2Unix}:/usr/bin:`$PATH"
export CC="${ndkClangExe} --target=aarch64-linux-android21"
export AR="${ndkArExe}"
export RANLIB="${ndkRanlibExe}"
export STRIP="${ndkStripExe}"
export NM="${ndkNmExe}"
export CFLAGS="-O2 -fPIC"
cd "${sodiumBuildUnix}"
sh ./configure \
  --prefix="${sodiumPrefixUnix}" \
  --libdir="${sodiumPrefixUnix}/lib" \
  --host=aarch64-linux-android \
  --enable-shared=no \
  --enable-static=yes \
  --disable-pie
make -j8
make install
"@
            $sodiumShFile = Join-Path $sodiumBuildDir "build_libsodium_android.sh"
            [System.IO.File]::WriteAllText($sodiumShFile, $sodiumShScript.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
            $msys2Bash = Join-Path $msys2UsrBin "bash.exe"
            & $msys2Bash --noprofile --norc ($sodiumShFile.Replace('\', '/'))
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Static libsodium pre-build failed with exit code $LASTEXITCODE."
                exit $LASTEXITCODE
            }
            if (-not (Test-Path $sodiumLibA) -or ((Get-Item $sodiumLibA).Length -le 0)) {
                Write-Error "Static libsodium.a missing or empty at $sodiumLibA."
                exit 1
            }
            Copy-Item -Force $sodiumLibA $sodiumAliasA
            if (-not (Test-Path $sodiumAliasA) -or ((Get-Item $sodiumAliasA).Length -le 0)) {
                Write-Error "Static liblibsodium.a alias missing or empty at $sodiumAliasA."
                exit 1
            }
            Remove-Item -Recurse -Force $sodiumBuildDir -ErrorAction SilentlyContinue
        }
        $sodiumHostLib = Join-Path $sodiumLibDir "libsodium.lib"
        if (-not (Test-Path $sodiumHostLib) -or ((Get-Item $sodiumHostLib).Length -le 0)) {
            $hostSodiumSrc = Get-Item (Join-Path $env:USERPROFILE ".cargo\registry\src\*\libsodium-sys-*\msvc\x64\Release\v142\libsodium.lib") -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $hostSodiumSrc) {
                Write-Error "Prebuilt host MSVC libsodium.lib not found under $($env:USERPROFILE)\.cargo\registry\src."
                exit 1
            }
            Copy-Item -Force $hostSodiumSrc.FullName $sodiumHostLib
            if (-not (Test-Path $sodiumHostLib) -or ((Get-Item $sodiumHostLib).Length -le 0)) {
                Write-Error "Host libsodium.lib copy failed or empty at $sodiumHostLib."
                exit 1
            }
        }
        $env:SODIUM_LIB_DIR = $sodiumLibDir
        $env:CFLAGS_aarch64_linux_android = "--target=aarch64-linux-android21 -D__ANDROID_API__=21"
        $env:CXXFLAGS_aarch64_linux_android = "--target=aarch64-linux-android21 -D__ANDROID_API__=21"

        $ndkSysroot = (Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\sysroot").Replace('\', '/')
        $ndkClangResInc = Get-ChildItem (Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\lib\clang\*\include") -Directory -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1 -ExpandProperty FullName
        if (-not $ndkClangResInc -or -not (Test-Path $ndkSysroot)) {
            Write-Error "Missing NDK sysroot ($ndkSysroot) or clang resource include dir for bindgen."
            exit 1
        }
        $ndkClangResInc = $ndkClangResInc.Replace('\', '/')
        $env:BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android = "--target=aarch64-linux-android21 --sysroot=$ndkSysroot -isystem $ndkClangResInc -isystem $ndkSysroot/usr/include -isystem $ndkSysroot/usr/include/aarch64-linux-android"

        $hwcodecLocal = "C:\dev\tools\hwcodec-local"
        $hwcodecBuildRs = Join-Path $hwcodecLocal "build.rs"
        if (-not (Test-Path $hwcodecBuildRs) -or ((Get-Content $hwcodecBuildRs -Raw) -match '(?m)^    #\[cfg\(windows\)\]')) {
            $hwcodecSrcBuildRs = Get-ChildItem (Join-Path $env:USERPROFILE ".cargo\git\checkouts\hwcodec-*\*\build.rs") -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
            if (-not $hwcodecSrcBuildRs) {
                Write-Error "Could not locate hwcodec git checkout in Cargo cache."
                exit 1
            }
            $hwcodecSrcDir = Split-Path $hwcodecSrcBuildRs -Parent
            if (Test-Path $hwcodecLocal) {
                Remove-Item -Recurse -Force $hwcodecLocal
            }
            Copy-Item -Recurse -Force $hwcodecSrcDir $hwcodecLocal
            $rsContent = Get-Content $hwcodecBuildRs -Raw
            $rsUpdated = [regex]::Replace($rsContent, '(?m)^    #\[cfg\(windows\)\]', '    if target_os == "windows"')
            if ($rsUpdated -eq $rsContent) {
                Write-Error "Failed to patch hwcodec build_common host #[cfg(windows)] guards in $hwcodecBuildRs."
                exit 1
            }
            [System.IO.File]::WriteAllText($hwcodecBuildRs, $rsUpdated, (New-Object System.Text.UTF8Encoding($false)))
        }

        $hwcodecPatchCfg = "C:\dev\tools\hwcodec-local-patch.toml"
        $patchToml = "[patch.`"https://github.com/rustdesk-org/hwcodec`"]`nhwcodec = { path = `"C:/dev/tools/hwcodec-local`" }`n"
        [System.IO.File]::WriteAllText($hwcodecPatchCfg, $patchToml, (New-Object System.Text.UTF8Encoding($false)))

        $cargoLockWasClean = [string]::IsNullOrWhiteSpace((git status --porcelain Cargo.lock | Out-String))
        Write-Host "[2/4] Building Android liblibrustdesk.so (aarch64-linux-android, Rust 1.75.0 MSVC host)..."
        try {
            cargo +1.75.0-x86_64-pc-windows-msvc ndk --platform 21 --target aarch64-linux-android build --config ($hwcodecPatchCfg.Replace('\', '/')) --release --features flutter,hwcodec
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } finally {
            if ($cargoLockWasClean) {
                git checkout -- Cargo.lock
            }
        }
    }

    Write-Host "[3/4] Staging native .so libraries into flutter/android/app/src/main/jniLibs/arm64-v8a..."
    $rustSo = Join-Path $RepoRoot "target\aarch64-linux-android\release\liblibrustdesk.so"
    $cppSo = Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\sysroot\usr\lib\aarch64-linux-android\libc++_shared.so"
    if (-not (Test-Path $rustSo)) {
        Write-Error "Missing $rustSo after cargo ndk build."
        exit 1
    }
    if (-not (Test-Path $cppSo)) {
        Write-Error "Missing $cppSo under ANDROID_NDK_HOME."
        exit 1
    }

    $jniDir = Join-Path $RepoRoot "flutter\android\app\src\main\jniLibs\arm64-v8a"
    New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
    Copy-Item -Force $rustSo (Join-Path $jniDir "librustdesk.so")
    Copy-Item -Force $cppSo (Join-Path $jniDir "libc++_shared.so")
    Get-Item (Join-Path $jniDir "librustdesk.so"), (Join-Path $jniDir "libc++_shared.so") | Select-Object Name, Length | Format-Table -AutoSize

    $bridgeBackup = "C:\dev\tools\eldesk-bridge-3.44"
    $androidFlutterBin = "C:\dev\tools\flutter-3.24.5\flutter\bin"
    if (Test-Path (Join-Path $androidFlutterBin "flutter.bat")) {
        $env:Path = "$androidFlutterBin;$env:Path"
    }
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

    $patchedSigningHere = $false
    $keyProps = Join-Path $RepoRoot "flutter\android\key.properties"
    $buildGradle = Join-Path $RepoRoot "flutter\android\app\build.gradle"
    if (-not (Test-Path $keyProps)) {
        $gradleContent = Get-Content $buildGradle -Raw
        if ($gradleContent -match 'signingConfig signingConfigs\.release') {
            $gradleUpdated = $gradleContent.Replace('signingConfig signingConfigs.release', 'signingConfig signingConfigs.debug')
            [System.IO.File]::WriteAllText($buildGradle, $gradleUpdated, (New-Object System.Text.UTF8Encoding($false)))
            $patchedSigningHere = $true
            Write-Host "Using temporary debug signingConfig because flutter/android/key.properties is absent."
        }
    }

    $gradlePropsWasClean = [string]::IsNullOrWhiteSpace((git status --porcelain flutter/android/gradle.properties | Out-String))
    Write-Host "[4/4] Building Flutter Android arm64-v8a release APK..."
    try {
        foreach ($staleDir in @(
            (Join-Path $RepoRoot "flutter\.dart_tool\flutter_build"),
            (Join-Path $RepoRoot "flutter\build\app\intermediates\flutter"),
            (Join-Path $RepoRoot "flutter\build\app\intermediates\assets"),
            (Join-Path $RepoRoot "flutter\build\app\intermediates\compressed_assets"),
            (Join-Path $RepoRoot "flutter\build\app\outputs\apk"),
            (Join-Path $RepoRoot "flutter\build\app\outputs\flutter-apk"),
            (Join-Path $RepoRoot "flutter\android\build")
        )) {
            if (Test-Path $staleDir) {
                Remove-Item -Recurse -Force $staleDir
            }
        }
        Push-Location (Join-Path $RepoRoot "flutter")
        try {
            flutter pub get
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            $apkArgs = @("build", "apk", "--release", "--target-platform", "android-arm64", "--split-per-abi")
            if ($needs344Patch) {
                $apkArgs += "--android-skip-build-dependency-validation"
            }
            & flutter @apkArgs
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } finally {
            Pop-Location
        }
    } finally {
        $restoreFiles = @()
        if ($appliedPatchHere -and -not $KeepFlutter344Patch) {
            $restoreFiles += @("flutter/lib/common.dart", "flutter/pubspec.yaml", "flutter/lib/common/widgets/dialog.dart")
        }
        if ($patchedSigningHere) {
            $restoreFiles += @("flutter/android/app/build.gradle")
        }
        if ($gradlePropsWasClean) {
            $restoreFiles += @("flutter/android/gradle.properties")
        }
        if ($restoreFiles.Count -gt 0) {
            git checkout -- @restoreFiles
        }
    }

    $apkPath = Join-Path $RepoRoot "flutter\build\app\outputs\flutter-apk\app-arm64-v8a-release.apk"
    if (-not (Test-Path $apkPath)) {
        Write-Error "Missing $apkPath after Flutter Android build."
        exit 1
    }
    $apkInfo = Get-Item $apkPath
    Write-Host "EL-Desk Android APK ready: $($apkInfo.FullName) ($($apkInfo.Length) bytes)"
} finally {
    Pop-Location
}
