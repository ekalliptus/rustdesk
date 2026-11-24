$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run this script from an Administrator PowerShell window."
    exit 1
}

function Get-VsCppInstallPath {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) {
        return $null
    }
    $path = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($path)) {
        return $null
    }
    return $path.Trim()
}

$curlExe = Join-Path $env:SystemRoot "System32\curl.exe"
if (-not (Test-Path $curlExe)) {
    $curlExe = "curl.exe"
}

Write-Host "[1/4] Enabling Windows Developer Mode (required for Flutter symlinks)..."
$unlockKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
if (-not (Test-Path $unlockKey)) {
    New-Item -Path $unlockKey -Force | Out-Null
}
New-ItemProperty -Path $unlockKey -Name "AllowDevelopmentWithoutDevLicense" -PropertyType DWord -Value 1 -Force | Out-Null
New-ItemProperty -Path $unlockKey -Name "AllowAllTrustedApps" -PropertyType DWord -Value 1 -Force | Out-Null
$devMode = (Get-ItemProperty -Path $unlockKey -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense

Write-Host "[2/4] Installing Visual Studio 2022 Build Tools (Desktop C++ workload)..."
$vsInstallPath = Get-VsCppInstallPath
if ($vsInstallPath) {
    Write-Host "Visual Studio C++ x64 Build Tools already installed at: $vsInstallPath"
} else {
    $vsInstaller = Join-Path $env:TEMP "vs_buildtools.exe"
    Write-Host "Downloading Visual Studio 2022 Build Tools bootstrapper..."
    & $curlExe -fLsS --retry 3 --connect-timeout 20 -o $vsInstaller "https://aka.ms/vs/17/release/vs_buildtools.exe"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $vsInstaller)) {
        Write-Error "Failed to download VS 2022 Build Tools installer."
        exit 1
    }
    Write-Host "Running unattended VS 2022 Build Tools installation (~2-3 GB download; progress window will show automatically, no clicks needed)..."
    $vsArgs = "--passive --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.ATL --includeRecommended"
    $vsProc = Start-Process -FilePath $vsInstaller -ArgumentList $vsArgs -Wait -PassThru
    if ($vsProc.ExitCode -eq 3010 -or $vsProc.ExitCode -eq 1641) {
        Write-Warning "VS 2022 Build Tools exited with code $($vsProc.ExitCode) (reboot recommended)."
    } elseif ($vsProc.ExitCode -ne 0) {
        Write-Error "VS 2022 Build Tools installer failed with exit code $($vsProc.ExitCode)."
        exit $vsProc.ExitCode
    }
    $vsInstallPath = Get-VsCppInstallPath
    if (-not $vsInstallPath) {
        Write-Error "Visual Studio C++ x64 Build Tools still not detected after installation."
        exit 1
    }
    Remove-Item $vsInstaller -Force -ErrorAction SilentlyContinue
}

Write-Host "[3/4] Installing LLVM 15.0.6 (libclang for bindgen)..."
$llvmBin = "C:\Program Files\LLVM\bin"
$llvmDll = Join-Path $llvmBin "libclang.dll"
if (Test-Path $llvmDll) {
    Write-Host "LLVM libclang.dll already installed at: $llvmDll"
} else {
    $llvmInstaller = Join-Path $env:TEMP "LLVM-15.0.6-win64.exe"
    Write-Host "Downloading LLVM 15.0.6 installer (~160 MB)..."
    & $curlExe -fLsS --retry 3 --connect-timeout 20 -o $llvmInstaller "https://github.com/llvm/llvm-project/releases/download/llvmorg-15.0.6/LLVM-15.0.6-win64.exe"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $llvmInstaller)) {
        Write-Error "Failed to download LLVM 15.0.6 installer."
        exit 1
    }
    Write-Host "Running silent LLVM 15.0.6 installation..."
    $llvmProc = Start-Process -FilePath $llvmInstaller -ArgumentList "/S" -Wait -PassThru
    if ($llvmProc.ExitCode -ne 0) {
        Write-Error "LLVM 15.0.6 installer failed with exit code $($llvmProc.ExitCode)."
        exit $llvmProc.ExitCode
    }
    if (-not (Test-Path $llvmDll)) {
        Write-Error "libclang.dll not found at $llvmDll after installation."
        exit 1
    }
    Remove-Item $llvmInstaller -Force -ErrorAction SilentlyContinue
}

Write-Host "[4/4] Setting Machine environment variables (LIBCLANG_PATH, VCPKG_DEFAULT_BINARY_CACHE)..."
[Environment]::SetEnvironmentVariable("LIBCLANG_PATH", $llvmBin, "Machine")

$vcpkgCache = "C:\dev\vcpkg-cache"
New-Item -ItemType Directory -Force -Path $vcpkgCache | Out-Null
$icaclsExe = Join-Path $env:SystemRoot "System32\icacls.exe"
if (Test-Path $icaclsExe) {
    & $icaclsExe $vcpkgCache /grant "*S-1-5-32-545:(OI)(CI)M" /T | Out-Null
}
[Environment]::SetEnvironmentVariable("VCPKG_DEFAULT_BINARY_CACHE", $vcpkgCache, "Machine")

Write-Host ""
Write-Host "=== Verification Summary ==="
Write-Host "DeveloperMode=$devMode"
Write-Host "VSBuildTools=$vsInstallPath"
Write-Host "LibClang=$llvmDll"
Write-Host "LIBCLANG_PATH=$llvmBin (Machine)"
Write-Host "VCPKG_DEFAULT_BINARY_CACHE=$vcpkgCache (Machine)"
Write-Host ""
Write-Host "Setup complete. Close this Admin window and return to the chat."
