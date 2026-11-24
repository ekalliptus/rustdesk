import assert from "node:assert/strict";
import test from "node:test";
import {
  detectClientPlatform,
  formatBytes,
  formatPublishDate,
  isTrustedReleaseUrl,
  parseChangelogBlocks,
  parseReleaseManifest,
  selectPrimaryArtifact,
  verificationCommand,
  type ReleaseArtifact,
} from "./release.ts";

const SAMPLE_ARTIFACTS: ReleaseArtifact[] = [
  {
    platform: "windows",
    arch: "x86_64",
    format: "exe",
    file_name: "el-desk-1.5.3-x86_64.exe",
    url: "https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk-1.5.3-x86_64.exe",
    size: 18_400_000,
    sha256: "a".repeat(64),
  },
  {
    platform: "linux",
    arch: "x86_64",
    format: "AppImage",
    file_name: "el-desk-1.5.3-x86_64.AppImage",
    url: "https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk-1.5.3-x86_64.AppImage",
    size: 25_000_000,
    sha256: "b".repeat(64),
  },
  {
    platform: "linux",
    arch: "x86_64",
    format: "deb",
    file_name: "el-desk-1.5.3-x86_64.deb",
    url: "https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk-1.5.3-x86_64.deb",
    size: 21_000_000,
    sha256: "c".repeat(64),
  },
  {
    platform: "macos",
    arch: "arm64",
    format: "dmg",
    file_name: "el-desk-1.5.3-arm64.dmg",
    url: "https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk-1.5.3-arm64.dmg",
    size: 23_000_000,
    sha256: "d".repeat(64),
  },
  {
    platform: "macos",
    arch: "x86_64",
    format: "dmg",
    file_name: "el-desk-1.5.3-x86_64.dmg",
    url: "https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk-1.5.3-x86_64.dmg",
    size: 24_000_000,
    sha256: "e".repeat(64),
  },
  {
    platform: "android",
    arch: "arm64-v8a",
    format: "apk",
    file_name: "el-desk-1.5.3-arm64-v8a.apk",
    url: "https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk-1.5.3-arm64-v8a.apk",
    size: 32_000_000,
    sha256: "f".repeat(64),
  },
];

test("detectClientPlatform identifies Windows, Linux, macOS, Android, and iOS", () => {
  const win = detectClientPlatform(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Win32",
  );
  assert.deepEqual(win, {
    platform: "windows",
    arch: "x86_64",
    label: "Windows (x86_64)",
  });

  const linux = detectClientPlatform(
    "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/131.0",
    "Linux x86_64",
  );
  assert.deepEqual(linux, {
    platform: "linux",
    arch: "x86_64",
    label: "Linux (x86_64)",
  });

  const macArm = detectClientPlatform(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "MacIntel",
    "arm",
  );
  assert.deepEqual(macArm, {
    platform: "macos",
    arch: "arm64",
    label: "macOS (Apple Silicon)",
  });

  const android = detectClientPlatform(
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36",
    "Linux armv81",
  );
  assert.deepEqual(android, {
    platform: "android",
    arch: "arm64-v8a",
    label: "Android (arm64-v8a)",
  });

  const ios = detectClientPlatform(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    "iPhone",
  );
  assert.equal(ios.platform, "unknown");
});

test("selectPrimaryArtifact picks matching OS, architecture, and preferred format", () => {
  const winHit = selectPrimaryArtifact(SAMPLE_ARTIFACTS, {
    platform: "windows",
    arch: "x86_64",
    label: "Windows (x86_64)",
  });
  assert.equal(winHit?.file_name, "el-desk-1.5.3-x86_64.exe");

  const linuxHit = selectPrimaryArtifact(SAMPLE_ARTIFACTS, {
    platform: "linux",
    arch: "x86_64",
    label: "Linux (x86_64)",
  });
  assert.equal(linuxHit?.file_name, "el-desk-1.5.3-x86_64.deb");

  const macArmHit = selectPrimaryArtifact(SAMPLE_ARTIFACTS, {
    platform: "macos",
    arch: "arm64",
    label: "macOS (Apple Silicon)",
  });
  assert.equal(macArmHit?.file_name, "el-desk-1.5.3-arm64.dmg");

  const androidHit = selectPrimaryArtifact(SAMPLE_ARTIFACTS, {
    platform: "android",
    arch: "arm64-v8a",
    label: "Android (arm64-v8a)",
  });
  assert.equal(androidHit?.file_name, "el-desk-1.5.3-arm64-v8a.apk");

  assert.equal(
    selectPrimaryArtifact(SAMPLE_ARTIFACTS, { platform: "unknown", arch: "", label: "" }),
    null,
  );
});

test("isTrustedReleaseUrl and parseReleaseManifest filter untrusted entries", () => {
  assert.equal(
    isTrustedReleaseUrl("https://dl.desk.ekalliptus.com/releases/v1.5.3/el-desk.exe"),
    true,
  );
  assert.equal(isTrustedReleaseUrl("https://evil.example/el-desk.exe"), false);
  assert.equal(isTrustedReleaseUrl("http://dl.desk.ekalliptus.com/el-desk.exe"), false);
  assert.equal(
    isTrustedReleaseUrl("https://dl.desk.ekalliptus.com/../evil.exe"),
    false,
  );

  const parsed = parseReleaseManifest({
    version: "v1.5.3",
    release_id: "v1.5.3",
    published_at: "2026-11-23T08:00:00Z",
    url: "https://evil.example/phish",
    changelog: "## 1.5.3\n- Fixed private routing.\n\nUpdated manifest checks.",
    artifacts: [
      SAMPLE_ARTIFACTS[0],
      {
        ...SAMPLE_ARTIFACTS[1],
        url: "https://evil.example/malware.AppImage",
      },
      {
        ...SAMPLE_ARTIFACTS[2],
        sha256: "not-a-sha256",
      },
    ],
  });

  assert.equal(parsed.version, "1.5.3");
  assert.equal(parsed.url, "https://desk.ekalliptus.com/#downloads");
  assert.equal(parsed.artifacts.length, 1);
  assert.equal(parsed.artifacts[0]?.file_name, "el-desk-1.5.3-x86_64.exe");
});

test("formatting, verification commands, and safe changelog parsing", () => {
  assert.equal(formatBytes(940), "940 B");
  assert.equal(formatBytes(2048), "2.0 KiB");
  assert.equal(formatBytes(18 * 1024 * 1024), "18.0 MiB");
  assert.equal(formatPublishDate("2026-11-23T08:00:00Z"), "2026-11-23 UTC");

  assert.equal(
    verificationCommand(SAMPLE_ARTIFACTS[0]!),
    "certutil -hashfile el-desk-1.5.3-x86_64.exe SHA256",
  );
  assert.equal(
    verificationCommand(SAMPLE_ARTIFACTS[2]!),
    "sha256sum el-desk-1.5.3-x86_64.deb",
  );
  assert.equal(
    verificationCommand(SAMPLE_ARTIFACTS[3]!),
    "shasum -a 256 el-desk-1.5.3-arm64.dmg",
  );

  assert.deepEqual(
    parseChangelogBlocks("## Notes\n- Item one\n- Item two\n\nSummary line."),
    [
      { type: "heading", level: 2, text: "Notes" },
      { type: "list", items: ["Item one", "Item two"] },
      { type: "paragraph", text: "Summary line." },
    ],
  );
});
