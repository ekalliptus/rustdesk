#!/usr/bin/env python3
"""Generate deterministic latest.json and SHA256SUMS.txt for EL-Desk releases."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

PLATFORM_ORDER = {
    "windows": 0,
    "linux": 1,
    "macos": 2,
    "android": 3,
}

EXTENSION_MAP = {
    ".exe": ("windows", "exe"),
    ".msi": ("windows", "msi"),
    ".deb": ("linux", "deb"),
    ".appimage": ("linux", "AppImage"),
    ".rpm": ("linux", "rpm"),
    ".dmg": ("macos", "dmg"),
    ".apk": ("android", "apk"),
}

IGNORED_NAMES = {"latest.json", "sha256sums.txt"}


def validate_semver_3part(raw: str) -> str:
    """Validate strict X.Y.Z semver matching Rust private_config.rs."""
    trimmed = raw.strip()
    version = trimmed[1:] if trimmed.startswith("v") else trimmed
    parts = version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid release version (expected X.Y.Z): {raw!r}")
    nums: list[int] = []
    for part in parts:
        if not part or not part.isascii() or not part.isdigit():
            raise ValueError(f"Invalid release version segment in {raw!r}")
        num = int(part, 10)
        if num > 65535:
            raise ValueError(f"Version segment out of u16 range in {raw!r}")
        nums.append(num)
    if nums == [0, 0, 0]:
        raise ValueError(f"Release version must be positive: {raw!r}")
    return version


def validate_https_url(raw: str, label: str) -> str:
    """Ensure URL is strict HTTPS without credentials, port, backslash, or '..'."""
    candidate = raw.strip()
    if not candidate:
        raise ValueError(f"{label} must not be empty")
    if "\\" in candidate or any(ch.isspace() or ord(ch) < 32 for ch in candidate):
        raise ValueError(f"{label} contains unsafe characters: {raw!r}")
    parsed = urlsplit(candidate)
    if parsed.scheme != "https":
        raise ValueError(f"{label} must use https://: {raw!r}")
    if not parsed.netloc or "@" in parsed.netloc or ":" in parsed.netloc:
        raise ValueError(f"{label} must not contain credentials or explicit port: {raw!r}")
    segments = [seg.lower() for seg in parsed.path.split("/")]
    if ".." in segments or "%2e%2e" in segments:
        raise ValueError(f"{label} contains path traversal: {raw!r}")
    return candidate


def detect_platform_and_format(file_name: str) -> tuple[str, str] | None:
    """Return (platform, format) for known installer extensions, else None."""
    lower = file_name.lower()
    for ext, meta in EXTENSION_MAP.items():
        if lower.endswith(ext):
            return meta
    return None


def detect_arch(file_name: str) -> str:
    """Infer architecture identifier from release artifact filename."""
    lower = file_name.lower()
    if "arm64-v8a" in lower:
        return "arm64-v8a"
    if "armeabi-v7a" in lower or "armv7" in lower:
        return "armeabi-v7a"
    if "aarch64" in lower or "arm64" in lower:
        return "arm64"
    if "x86_64" in lower or "amd64" in lower or "x64" in lower:
        return "x86_64"
    if "x86" in lower or "i686" in lower:
        return "x86"
    return "universal"


def sha256_file(path: Path) -> str:
    """Compute lowercase SHA-256 hex digest using buffered reads."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(
    dist_dir: Path,
    version_raw: str,
    release_id: str | None,
    r2_base_url: str,
    web_url: str,
    changelog: str,
    published_at: str | None,
) -> tuple[dict[str, object], list[tuple[str, str]]]:
    """Scan dist_dir and return manifest dictionary plus ordered checksum pairs."""
    if not dist_dir.is_dir():
        raise ValueError(f"Distribution directory does not exist: {dist_dir}")

    version = validate_semver_3part(version_raw)
    resolved_release_id = (release_id or f"v{version}").strip()
    if not resolved_release_id or "/" in resolved_release_id or "\\" in resolved_release_id:
        raise ValueError(f"Invalid release_id: {release_id!r}")

    clean_r2_base = validate_https_url(r2_base_url, "r2-base-url").rstrip("/")
    clean_web_url = validate_https_url(web_url, "web-url")
    resolved_published_at = (
        published_at.strip()
        if published_at and published_at.strip()
        else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    )

    artifacts: list[dict[str, object]] = []
    for entry in sorted(dist_dir.iterdir(), key=lambda p: p.name):
        if not entry.is_file():
            continue
        if entry.name.startswith(".") or entry.name.lower() in IGNORED_NAMES:
            continue
        detected = detect_platform_and_format(entry.name)
        if detected is None:
            continue
        platform, fmt = detected
        arch = detect_arch(entry.name)
        checksum = sha256_file(entry)
        size = entry.stat().st_size
        artifacts.append(
            {
                "platform": platform,
                "arch": arch,
                "format": fmt,
                "file_name": entry.name,
                "url": f"{clean_r2_base}/releases/{resolved_release_id}/{entry.name}",
                "size": size,
                "sha256": checksum,
            }
        )

    if not artifacts:
        raise ValueError(f"No recognized release artifacts found in {dist_dir}")

    artifacts.sort(
        key=lambda item: (
            PLATFORM_ORDER.get(str(item["platform"]), 99),
            str(item["arch"]),
            str(item["format"]),
            str(item["file_name"]),
        )
    )

    manifest: dict[str, object] = {
        "version": version,
        "release_id": resolved_release_id,
        "published_at": resolved_published_at,
        "url": clean_web_url,
        "changelog": changelog.strip(),
        "artifacts": artifacts,
    }
    checksum_rows = [(str(item["sha256"]), str(item["file_name"])) for item in artifacts]
    return manifest, checksum_rows


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate latest.json and SHA256SUMS.txt from EL-Desk release binaries."
    )
    parser.add_argument("--dist-dir", required=True, type=Path, help="Directory with release installers")
    parser.add_argument("--version", required=True, help="Release version (X.Y.Z or vX.Y.Z)")
    parser.add_argument("--release-id", default=None, help="Release identifier (defaults to v<version>)")
    parser.add_argument(
        "--r2-base-url",
        default="https://dl.desk.ekalliptus.com",
        help="Public HTTPS base URL of the Cloudflare R2 bucket",
    )
    parser.add_argument(
        "--web-url",
        default="https://desk.ekalliptus.com/#downloads",
        help="Public HTTPS downloads page URL",
    )
    parser.add_argument("--changelog-file", type=Path, default=None, help="Optional UTF-8 changelog file")
    parser.add_argument("--published-at", default=None, help="ISO-8601 UTC timestamp")
    parser.add_argument("--output-json", type=Path, default=None, help="Output path for latest.json")
    parser.add_argument("--output-sums", type=Path, default=None, help="Output path for SHA256SUMS.txt")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    changelog = ""
    if args.changelog_file is not None and args.changelog_file.is_file():
        changelog = args.changelog_file.read_text(encoding="utf-8")

    try:
        manifest, checksum_rows = build_manifest(
            dist_dir=args.dist_dir,
            version_raw=args.version,
            release_id=args.release_id,
            r2_base_url=args.r2_base_url,
            web_url=args.web_url,
            changelog=changelog,
            published_at=args.published_at,
        )
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    output_json = args.output_json or (args.dist_dir / "latest.json")
    output_sums = args.output_sums or (args.dist_dir / "SHA256SUMS.txt")
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_sums.parent.mkdir(parents=True, exist_ok=True)

    output_json.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    sums_body = "".join(f"{digest}  {name}\n" for digest, name in checksum_rows)
    output_sums.write_text(sums_body, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
