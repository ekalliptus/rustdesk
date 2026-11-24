export const DEFAULT_LATEST_JSON_URL = "https://dl.desk.ekalliptus.com/latest.json";
export const DEFAULT_API_HEALTH_URL = "https://api.desk.ekalliptus.com/healthz";
export const DEFAULT_DOWNLOADS_PAGE_URL = "https://desk.ekalliptus.com/#downloads";

export const TRUSTED_HOSTS = new Set<string>([
  "dl.desk.ekalliptus.com",
  "desk.ekalliptus.com",
]);

export type PlatformId = "windows" | "linux" | "macos" | "android";

export interface ReleaseArtifact {
  platform: PlatformId;
  arch: string;
  format: string;
  file_name: string;
  url: string;
  size: number;
  sha256: string;
}

export interface ReleaseManifest {
  version: string;
  release_id: string;
  published_at: string;
  url: string;
  changelog: string;
  artifacts: ReleaseArtifact[];
}

export interface DetectedPlatform {
  platform: PlatformId | "unknown";
  arch: string;
  label: string;
}

export type ChangelogBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

const PLATFORM_IDS = new Set<string>(["windows", "linux", "macos", "android"]);
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;
const SHA256_RE = /^[a-fA-F0-9]{64}$/;

export function normalizeArch(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === "aarch64") return "arm64";
  if (lower === "amd64" || lower === "x64") return "x86_64";
  return lower;
}

export function platformLabel(platform: PlatformId): string {
  switch (platform) {
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "macos":
      return "macOS";
    case "android":
      return "Android";
  }
}

export function detectClientPlatform(
  userAgent: string,
  platformHint = "",
  uaDataArch = "",
): DetectedPlatform {
  const ua = userAgent.toLowerCase();
  const hint = platformHint.toLowerCase();
  const chArch = uaDataArch.toLowerCase();

  if (!ua && !hint) {
    return { platform: "unknown", arch: "", label: "Platform not detected" };
  }

  if (ua.includes("android")) {
    let arch = "arm64-v8a";
    if (ua.includes("armeabi") || ua.includes("armv7")) {
      arch = "armeabi-v7a";
    } else if (ua.includes("x86_64") || ua.includes("x64") || chArch === "x86") {
      arch = chArch === "arm" ? "arm64-v8a" : "x86_64";
    }
    return { platform: "android", arch, label: `Android (${arch})` };
  }

  if (/iphone|ipad|ipod/.test(ua) || /iphone|ipad|ipod/.test(hint)) {
    return { platform: "unknown", arch: "", label: "Choose a supported desktop or Android installer" };
  }

  if (ua.includes("windows") || hint.includes("win")) {
    const isArm =
      chArch === "arm" ||
      ua.includes("arm64") ||
      ua.includes("aarch64") ||
      ua.includes("woa64");
    const arch = isArm ? "arm64" : "x86_64";
    return { platform: "windows", arch, label: `Windows (${arch})` };
  }

  if (ua.includes("mac os") || ua.includes("macintosh") || hint.includes("mac")) {
    const isArm =
      chArch === "arm" ||
      ua.includes("arm64") ||
      ua.includes("aarch64") ||
      hint.includes("arm");
    const arch = isArm ? "arm64" : "x86_64";
    return { platform: "macos", arch, label: isArm ? "macOS (Apple Silicon)" : "macOS" };
  }

  if (ua.includes("linux") || ua.includes("x11") || hint.includes("linux")) {
    const isArm =
      chArch === "arm" ||
      ua.includes("aarch64") ||
      ua.includes("arm64") ||
      hint.includes("aarch64");
    const arch = isArm ? "arm64" : "x86_64";
    return { platform: "linux", arch, label: `Linux (${arch})` };
  }

  return { platform: "unknown", arch: "", label: "Platform not detected" };
}

function formatRank(platform: PlatformId, format: string): number {
  const f = format.toLowerCase();
  if (platform === "windows") {
    if (f === "exe") return 30;
    if (f === "msi") return 20;
  } else if (platform === "linux") {
    if (f === "deb") return 30;
    if (f === "appimage") return 25;
    if (f === "rpm") return 20;
  } else if (platform === "macos") {
    if (f === "dmg") return 30;
  } else if (platform === "android") {
    if (f === "apk") return 30;
  }
  return 10;
}

export function selectPrimaryArtifact(
  artifacts: ReleaseArtifact[],
  detected: DetectedPlatform,
): ReleaseArtifact | null {
  if (detected.platform === "unknown") {
    return null;
  }
  const candidates = artifacts.filter((item) => item.platform === detected.platform);
  if (candidates.length === 0) {
    return null;
  }

  const targetArch = normalizeArch(detected.arch);
  const scored = candidates.map((item) => {
    const itemArch = normalizeArch(item.arch);
    let score = formatRank(item.platform, item.format);
    if (targetArch && itemArch === targetArch) {
      score += 100;
    } else if (itemArch === "universal") {
      score += 40;
    }
    return { item, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.file_name.localeCompare(b.item.file_name);
  });
  return scored[0]?.item ?? null;
}

export function isTrustedReleaseUrl(rawUrl: string, allowLocalhost = false): boolean {
  const candidate = rawUrl.trim();
  if (!candidate || candidate.includes("\\") || /[\s\u0000-\u001f]/.test(candidate)) {
    return false;
  }
  const withoutScheme = candidate.replace(/^https?:\/\//i, "");
  const rawPath = withoutScheme.split(/[?#]/)[0] ?? "";
  const rawSegments = rawPath.split("/").slice(1).map((seg) => seg.toLowerCase());
  if (rawSegments.includes("..") || rawSegments.includes("%2e%2e")) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port) {
    return false;
  }
  const pathSegments = parsed.pathname.split("/").map((seg) => seg.toLowerCase());
  if (pathSegments.includes("..") || pathSegments.includes("%2e%2e")) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "https:") {
    return TRUSTED_HOSTS.has(host);
  }
  if (allowLocalhost && parsed.protocol === "http:") {
    return host === "127.0.0.1" || host === "localhost";
  }
  return false;
}

function validateSemver3Part(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Release manifest missing version string.");
  }
  const stripped = raw.trim().replace(/^v/, "");
  const parts = stripped.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p) || Number(p) > 65535)) {
    throw new Error(`Invalid release version "${raw}".`);
  }
  if (parts.every((p) => Number(p) === 0)) {
    throw new Error(`Release version must be positive "${raw}".`);
  }
  return stripped;
}

export function parseReleaseManifest(raw: unknown, allowLocalhost = false): ReleaseManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Release manifest must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  const version = validateSemver3Part(obj.version);
  const releaseId =
    typeof obj.release_id === "string" && obj.release_id.trim()
      ? obj.release_id.trim()
      : `v${version}`;
  const publishedAt =
    typeof obj.published_at === "string" ? obj.published_at.trim() : "";
  const pageUrl =
    typeof obj.url === "string" && isTrustedReleaseUrl(obj.url, allowLocalhost)
      ? obj.url.trim()
      : DEFAULT_DOWNLOADS_PAGE_URL;
  const changelog = typeof obj.changelog === "string" ? obj.changelog.trim() : "";

  if (!Array.isArray(obj.artifacts)) {
    throw new Error("Release manifest missing artifacts list.");
  }

  const artifacts: ReleaseArtifact[] = [];
  for (const entry of obj.artifacts) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const platform = typeof item.platform === "string" ? item.platform.trim().toLowerCase() : "";
    const arch = typeof item.arch === "string" ? item.arch.trim() : "";
    const format = typeof item.format === "string" ? item.format.trim() : "";
    const fileName = typeof item.file_name === "string" ? item.file_name.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const size = typeof item.size === "number" ? item.size : Number.NaN;
    const sha256 = typeof item.sha256 === "string" ? item.sha256.trim().toLowerCase() : "";

    if (
      !PLATFORM_IDS.has(platform) ||
      !arch ||
      !format ||
      !fileName ||
      !SAFE_FILENAME_RE.test(fileName) ||
      !isTrustedReleaseUrl(url, allowLocalhost) ||
      !Number.isFinite(size) ||
      size < 0 ||
      !SHA256_RE.test(sha256)
    ) {
      continue;
    }

    artifacts.push({
      platform: platform as PlatformId,
      arch,
      format,
      file_name: fileName,
      url,
      size: Math.floor(size),
      sha256,
    });
  }

  return {
    version,
    release_id: releaseId,
    published_at: publishedAt,
    url: pageUrl,
    changelog,
    artifacts,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  return `${mib.toFixed(1)} MiB`;
}

export function formatPublishDate(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return "Date unavailable";
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return trimmed;
  return new Date(ts).toISOString().slice(0, 10) + " UTC";
}

export function verificationCommand(artifact: ReleaseArtifact): string {
  const safeName = SAFE_FILENAME_RE.test(artifact.file_name)
    ? artifact.file_name
    : "installer";
  if (artifact.platform === "windows") {
    return `certutil -hashfile ${safeName} SHA256`;
  }
  if (artifact.platform === "macos") {
    return `shasum -a 256 ${safeName}`;
  }
  return `sha256sum ${safeName}`;
}

export function parseChangelogBlocks(raw: string): ChangelogBlock[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: ChangelogBlock[] = [];
  let currentList: string[] = [];
  let currentPara: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push({ type: "list", items: currentList });
      currentList = [];
    }
  };
  const flushPara = () => {
    if (currentPara.length > 0) {
      blocks.push({ type: "paragraph", text: currentPara.join(" ") });
      currentPara = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      flushPara();
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      flushPara();
      blocks.push({ type: "heading", level: 3, text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      flushList();
      flushPara();
      const text = line.replace(/^#+\s*/, "").trim();
      if (text) blocks.push({ type: "heading", level: 2, text });
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushPara();
      const item = line.slice(2).trim();
      if (item) currentList.push(item);
      continue;
    }
    flushList();
    currentPara.push(line);
  }

  flushList();
  flushPara();
  return blocks;
}
