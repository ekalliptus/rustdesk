import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServiceStatus } from "@/components/ServiceStatus";
import {
  DEFAULT_API_HEALTH_URL,
  DEFAULT_LATEST_JSON_URL,
  detectClientPlatform,
  formatBytes,
  formatPublishDate,
  parseChangelogBlocks,
  parseReleaseManifest,
  platformLabel,
  selectPrimaryArtifact,
  verificationCommand,
  type DetectedPlatform,
  type PlatformId,
  type ReleaseArtifact,
  type ReleaseManifest,
} from "@/lib/release";
import { cn } from "@/lib/utils";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; manifest: ReleaseManifest };

type TabValue = "all" | PlatformId;

interface NavigatorUAData {
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
}

export interface DownloadPortalProps {
  manifestUrl?: string;
  apiHealthUrl?: string;
  children?: ReactNode;
}

const PLATFORM_TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
  { value: "macos", label: "macOS" },
  { value: "android", label: "Android" },
];

export function DownloadPortal({
  manifestUrl = DEFAULT_LATEST_JSON_URL,
  apiHealthUrl = DEFAULT_API_HEALTH_URL,
  children,
}: DownloadPortalProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [detected, setDetected] = useState<DetectedPlatform>({
    platform: "unknown",
    arch: "",
    label: "Detecting device...",
  });
  const [selectedTab, setSelectedTab] = useState<TabValue>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyStatusText, setCopyStatusText] = useState("");
  const copyTimerRef = useRef<number | null>(null);

  const loadManifest = useCallback(async () => {
    setLoadState({ status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(manifestUrl, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while fetching ${manifestUrl}`);
      }
      const payload: unknown = await response.json();
      const parsed = parseReleaseManifest(
        payload,
        window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost",
      );
      setLoadState({ status: "ready", manifest: parsed });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      const detail = timedOut
        ? "Request timed out while loading latest.json."
        : err instanceof Error
          ? err.message
          : "Unknown error while loading latest.json.";
      setLoadState({ status: "error", message: detail });
    } finally {
      window.clearTimeout(timer);
    }
  }, [manifestUrl]);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    let active = true;
    const ua = navigator.userAgent || "";
    const platformHint = navigator.platform || "";
    const initial = detectClientPlatform(ua, platformHint);
    setDetected(initial);

    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
    if (uaData?.getHighEntropyValues) {
      uaData
        .getHighEntropyValues(["architecture"])
        .then((values) => {
          if (!active) return;
          setDetected(detectClientPlatform(ua, platformHint, values.architecture || ""));
        })
        .catch(() => {
          // Keep standard UA detection when high-entropy hints are blocked.
        });
    }

    return () => {
      active = false;
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const copyValue = useCallback(async (value: string, key: string, description: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement("textarea");
        el.value = value;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        if (!ok) {
          throw new Error("Clipboard copy rejected");
        }
      }
      setCopiedKey(key);
      setCopyStatusText(`${description} copied to clipboard.`);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey(null);
      }, 2400);
    } catch {
      setCopyStatusText("Clipboard access unavailable. Expand checksum details to copy manually.");
    }
  }, []);

  const primaryArtifact = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return selectPrimaryArtifact(loadState.manifest.artifacts, detected);
  }, [loadState, detected]);

  const countsByPlatform = useMemo(() => {
    const counts: Record<TabValue, number> = {
      all: 0,
      windows: 0,
      linux: 0,
      macos: 0,
      android: 0,
    };
    if (loadState.status !== "ready") return counts;
    for (const item of loadState.manifest.artifacts) {
      counts.all += 1;
      counts[item.platform] += 1;
    }
    return counts;
  }, [loadState]);

  const filteredArtifacts = useMemo(() => {
    if (loadState.status !== "ready") return [];
    if (selectedTab === "all") return loadState.manifest.artifacts;
    return loadState.manifest.artifacts.filter((item) => item.platform === selectedTab);
  }, [loadState, selectedTab]);

  const changelogBlocks = useMemo(() => {
    if (loadState.status !== "ready" || !loadState.manifest.changelog) return [];
    return parseChangelogBlocks(loadState.manifest.changelog);
  }, [loadState]);

  return (
    <div>
      <div className="sr-only" aria-live="polite" role="status">
        {copyStatusText}
      </div>

      {/* Band 1: Asymmetric Hero + Recommended Installer Workbench */}
      <section
        id="downloads"
        aria-labelledby="downloads-heading"
        className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16"
      >
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          <div className="space-y-6 lg:col-span-7">
            {children}
            <ServiceStatus apiHealthUrl={apiHealthUrl} manifestUrl={manifestUrl} />
          </div>

          <div className="lg:col-span-5">
            <div className="min-h-[280px] rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              {loadState.status === "loading" && (
                <div role="status" className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Release manifest
                    </span>
                    <Badge>{detected.label}</Badge>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    Loading release metadata from dl.desk.ekalliptus.com...
                  </p>
                  <div className="space-y-3 pt-2" aria-hidden="true">
                    <div className="h-6 w-2/3 rounded-[4px] bg-[var(--surface-subtle)] motion-safe:animate-pulse" />
                    <div className="h-4 w-full rounded-[4px] bg-[var(--surface-subtle)] motion-safe:animate-pulse" />
                    <div className="h-11 w-full rounded-[6px] bg-[var(--surface-subtle)] motion-safe:animate-pulse" />
                    <div className="h-11 w-full rounded-[6px] bg-[var(--surface-subtle)] motion-safe:animate-pulse" />
                  </div>
                </div>
              )}

              {loadState.status === "error" && (
                <div
                  role="alert"
                  className="space-y-4 rounded-[6px] border border-[var(--danger)] bg-[var(--danger-subtle)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-[var(--danger)]">
                      Release manifest unavailable
                    </h2>
                    <Badge variant="danger">Error</Badge>
                  </div>
                  <p className="text-sm text-[var(--text)]">{loadState.message}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Verify that at least one version tag has published to R2 and that bucket CORS
                    allows GET requests from desk.ekalliptus.com.
                  </p>
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Button variant="outline" onClick={() => void loadManifest()}>
                      Retry fetch
                    </Button>
                    <a
                      href={manifestUrl}
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "ghost" }))}
                    >
                      Inspect latest.json
                    </a>
                  </div>
                </div>
              )}

              {loadState.status === "ready" && loadState.manifest.artifacts.length === 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-[var(--text)]">
                      {loadState.manifest.release_id}
                    </span>
                    <Badge>Empty release</Badge>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    Manifest loaded, but no verified installers are listed for this release yet.
                  </p>
                  <Button variant="outline" onClick={() => void loadManifest()}>
                    Check again
                  </Button>
                </div>
              )}

              {loadState.status === "ready" && loadState.manifest.artifacts.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div className="space-y-0.5">
                      <div className="font-mono text-sm font-semibold text-[var(--text)]">
                        {loadState.manifest.release_id}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Published {formatPublishDate(loadState.manifest.published_at)}
                      </div>
                    </div>
                    <Badge variant="accent">{detected.label}</Badge>
                  </div>

                  {primaryArtifact ? (
                    <>
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          {platformLabel(primaryArtifact.platform)} installer
                        </h2>
                        <p className="font-mono text-xs break-all text-[var(--text-muted)]">
                          {primaryArtifact.file_name} ({primaryArtifact.arch},{" "}
                          {formatBytes(primaryArtifact.size)})
                        </p>
                      </div>

                      <div className="grid gap-2.5">
                        <a
                          href={primaryArtifact.url}
                          className={cn(buttonVariants({ variant: "primary" }), "w-full")}
                        >
                          Download {platformLabel(primaryArtifact.platform)} installer (.
                          {primaryArtifact.format})
                        </a>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() =>
                            void copyValue(
                              primaryArtifact.sha256,
                              `primary-${primaryArtifact.file_name}`,
                              `SHA-256 for ${primaryArtifact.file_name}`,
                            )
                          }
                        >
                          {copiedKey === `primary-${primaryArtifact.file_name}`
                            ? "SHA-256 copied"
                            : "Copy SHA-256 checksum"}
                        </Button>
                      </div>

                      <details className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                        <summary className="flex min-h-11 items-center justify-between text-xs font-semibold text-[var(--text)]">
                          <span>Verify checksum locally</span>
                          <span className="font-mono text-[var(--text-muted)]">SHA-256</span>
                        </summary>
                        <div className="mt-2 space-y-3 border-t border-[var(--border)] pt-3">
                          <div>
                            <div className="text-xs font-medium text-[var(--text-muted)]">
                              Expected digest
                            </div>
                            <code className="mt-1 block break-all font-mono text-xs text-[var(--text)] select-all">
                              {primaryArtifact.sha256}
                            </code>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-[var(--text-muted)]">
                              Verification command
                            </div>
                            <code className="mt-1 block break-all rounded-[4px] bg-[var(--surface)] px-2.5 py-2 font-mono text-xs text-[var(--text)] border border-[var(--border)] select-all">
                              {verificationCommand(primaryArtifact)}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2"
                              onClick={() =>
                                void copyValue(
                                  verificationCommand(primaryArtifact),
                                  `cmd-${primaryArtifact.file_name}`,
                                  "Verification command",
                                )
                              }
                            >
                              {copiedKey === `cmd-${primaryArtifact.file_name}`
                                ? "Command copied"
                                : "Copy verify command"}
                            </Button>
                          </div>
                        </div>
                      </details>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold text-[var(--text)]">
                        Choose a client package
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        No automatic installer matches this browser environment. Select a Windows,
                        Linux, macOS, or Android package from the index below.
                      </p>
                      <a
                        href="#all-platforms"
                        className={cn(buttonVariants({ variant: "primary" }), "w-full")}
                      >
                        Browse all installers
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Band 2: Full-width All Platforms Index */}
      <section
        id="all-platforms"
        aria-labelledby="all-platforms-heading"
        className="border-t border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="all-platforms-heading"
                className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl"
              >
                All installers and checksums
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Packages served from Cloudflare R2 at dl.desk.ekalliptus.com.
              </p>
            </div>
            {loadState.status === "ready" && (
              <a
                href={manifestUrl}
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] underline underline-offset-4 hover:text-[var(--accent-hover)]"
              >
                View raw latest.json
              </a>
            )}
          </div>

          <div className="mt-6">
            {loadState.status === "loading" && (
              <div
                role="status"
                className="min-h-[220px] rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-6 text-sm text-[var(--text-muted)]"
              >
                Loading platform matrix...
              </div>
            )}

            {loadState.status === "error" && (
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-6 text-sm text-[var(--text-muted)]">
                Platform packages appear here once{" "}
                <code className="font-mono text-xs text-[var(--text)]">{manifestUrl}</code>{" "}
                returns a valid release manifest.
              </div>
            )}

            {loadState.status === "ready" && (
              <Tabs
                value={selectedTab}
                onValueChange={(value) => setSelectedTab(value as TabValue)}
              >
                <TabsList aria-label="Filter installers by operating system">
                  {PLATFORM_TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label} ({countsByPlatform[tab.value]})
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value={selectedTab}>
                  {filteredArtifacts.length === 0 ? (
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-subtle)] p-6 text-sm text-[var(--text-muted)]">
                      No packages were published for this platform in{" "}
                      <span className="font-mono text-[var(--text)]">
                        {loadState.manifest.release_id}
                      </span>
                      .
                    </div>
                  ) : (
                    <>
                      {/* Desktop specification table */}
                      <div className="hidden overflow-x-auto rounded-[6px] border border-[var(--border)] md:block">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-semibold text-[var(--text-muted)]">
                              <th scope="col" className="px-4 py-3">
                                Platform
                              </th>
                              <th scope="col" className="px-4 py-3">
                                File
                              </th>
                              <th scope="col" className="px-4 py-3">
                                Arch
                              </th>
                              <th scope="col" className="px-4 py-3">
                                Format
                              </th>
                              <th scope="col" className="px-4 py-3 text-right">
                                Size
                              </th>
                              <th scope="col" className="px-4 py-3">
                                SHA-256
                              </th>
                              <th scope="col" className="px-4 py-3 text-right">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                            {filteredArtifacts.map((artifact) => (
                              <ArtifactTableRow
                                key={artifact.file_name}
                                artifact={artifact}
                                copied={copiedKey === artifact.file_name}
                                onCopy={() =>
                                  void copyValue(
                                    artifact.sha256,
                                    artifact.file_name,
                                    `SHA-256 for ${artifact.file_name}`,
                                  )
                                }
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile stacked rows */}
                      <ul className="space-y-3 md:hidden">
                        {filteredArtifacts.map((artifact) => (
                          <li
                            key={artifact.file_name}
                            className="rounded-[6px] border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-[var(--text)]">
                                  {platformLabel(artifact.platform)}
                                </div>
                                <div className="mt-0.5 font-mono text-xs break-all text-[var(--text-muted)]">
                                  {artifact.file_name}
                                </div>
                              </div>
                              <Badge>{artifact.format}</Badge>
                            </div>

                            <dl className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <dt className="text-[var(--text-muted)]">Architecture</dt>
                                <dd className="font-mono text-[var(--text)]">{artifact.arch}</dd>
                              </div>
                              <div>
                                <dt className="text-[var(--text-muted)]">Size</dt>
                                <dd className="font-mono tabular-nums text-[var(--text)]">
                                  {formatBytes(artifact.size)}
                                </dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-[var(--text-muted)]">SHA-256 prefix</dt>
                                <dd className="font-mono text-[var(--text)]">
                                  {artifact.sha256.slice(0, 16)}...{artifact.sha256.slice(-8)}
                                </dd>
                              </div>
                            </dl>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <a
                                href={artifact.url}
                                className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
                              >
                                Download
                              </a>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void copyValue(
                                    artifact.sha256,
                                    artifact.file_name,
                                    `SHA-256 for ${artifact.file_name}`,
                                  )
                                }
                              >
                                {copiedKey === artifact.file_name ? "Copied" : "Copy SHA-256"}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </section>

      {/* Band 3: Editorial Changelog Viewer */}
      <section
        id="changelog"
        aria-labelledby="changelog-heading"
        className="border-t border-[var(--border)] bg-[var(--bg)]"
      >
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-4">
              <h2
                id="changelog-heading"
                className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl"
              >
                Release changelog
              </h2>
              {loadState.status === "ready" ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Showing notes for{" "}
                  <span className="font-mono font-semibold text-[var(--text)]">
                    {loadState.manifest.release_id}
                  </span>{" "}
                  ({formatPublishDate(loadState.manifest.published_at)}).
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Published notes fetched live from latest.json.
                </p>
              )}
            </div>

            <div className="lg:col-span-8">
              <div className="min-h-[120px] rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
                {loadState.status === "loading" && (
                  <p className="text-sm text-[var(--text-muted)]">Loading changelog notes...</p>
                )}

                {loadState.status === "error" && (
                  <p className="text-sm text-[var(--text-muted)]">
                    Changelog notes are unavailable while the release manifest cannot be reached.
                  </p>
                )}

                {loadState.status === "ready" && changelogBlocks.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">
                    No changelog notes were included with {loadState.manifest.release_id}.
                  </p>
                )}

                {loadState.status === "ready" && changelogBlocks.length > 0 && (
                  <div className="space-y-3 text-sm leading-relaxed text-[var(--text)]">
                    {changelogBlocks.map((block, idx) => {
                      if (block.type === "heading") {
                        return block.level === 2 ? (
                          <h3
                            key={idx}
                            className="pt-2 first:pt-0 text-base font-semibold text-[var(--text)]"
                          >
                            {block.text}
                          </h3>
                        ) : (
                          <h4
                            key={idx}
                            className="pt-1 text-sm font-semibold text-[var(--text)]"
                          >
                            {block.text}
                          </h4>
                        );
                      }
                      if (block.type === "list") {
                        return (
                          <ul
                            key={idx}
                            className="list-disc space-y-1.5 pl-5 text-[var(--text-muted)]"
                          >
                            {block.items.map((item, itemIdx) => (
                              <li key={itemIdx}>{item}</li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p key={idx} className="text-[var(--text-muted)]">
                          {block.text}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface ArtifactTableRowProps {
  artifact: ReleaseArtifact;
  copied: boolean;
  onCopy: () => void;
}

function ArtifactTableRow({ artifact, copied, onCopy }: ArtifactTableRowProps) {
  return (
    <tr className="hover:bg-[var(--surface-subtle)]/60">
      <td className="px-4 py-3 font-medium text-[var(--text)]">
        {platformLabel(artifact.platform)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text)]">{artifact.file_name}</td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{artifact.arch}</td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{artifact.format}</td>
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--text-muted)]">
        {formatBytes(artifact.size)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
        {artifact.sha256.slice(0, 12)}...
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            aria-label={`Copy SHA-256 checksum for ${artifact.file_name}`}
          >
            {copied ? "Copied" : "Copy SHA-256"}
          </Button>
          <a
            href={artifact.url}
            className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
          >
            Download
          </a>
        </div>
      </td>
    </tr>
  );
}
