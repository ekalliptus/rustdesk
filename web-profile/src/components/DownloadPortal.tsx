import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewSection } from "@/components/OverviewSection";
import {
  ChangelogSkeleton,
  PackageMatrixSkeleton,
  WorkbenchSkeleton,
} from "@/components/PortalSkeletons";
import type { TabValue } from "@/components/PackageMatrix";
import {
  DEFAULT_LATEST_JSON_URL,
  detectClientPlatform,
  formatBytes,
  formatPublishDate,
  parseReleaseManifest,
  platformLabel,
  selectPrimaryArtifact,
  verificationCommand,
  type DetectedPlatform,
  type ReleaseManifest,
} from "@/lib/release";
import { cn } from "@/lib/utils";

const LazyPackageMatrix = lazy(() => import("@/components/PackageMatrix"));
const LazyChangelogPanel = lazy(() => import("@/components/ChangelogPanel"));

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; manifest: ReleaseManifest };

interface NavigatorUAData {
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
}

export interface DownloadPortalProps {
  manifestUrl?: string;
  children?: ReactNode;
}

function useInViewOnce(rootMargin = "240px") {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView] as const;
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M8 2.5v8" />
      <path d="M4.75 7.5 8 10.75 11.25 7.5" />
      <path d="M2.5 13.5h11" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M3.2 8.4 6.5 11.7 12.8 4.8" />
    </svg>
  );
}

export function DownloadPortal({
  manifestUrl = DEFAULT_LATEST_JSON_URL,
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

  const [packagesRef, packagesInView] = useInViewOnce("240px");
  const [changelogRef, changelogInView] = useInViewOnce("240px");

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
        ? "Request timed out while loading release metadata."
        : err instanceof Error
          ? err.message
          : "Unknown error while loading release metadata.";
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
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) {
        const el = document.createElement("textarea");
        el.value = value;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        copied = document.execCommand("copy");
        document.body.removeChild(el);
      }
      if (!copied) {
        throw new Error("Clipboard copy rejected");
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

  return (
    <div>
      <div className="sr-only" aria-live="polite" role="status">
        {copyStatusText}
      </div>

      {/* Band 1: Editorial Hero + Primary Installer Workbench */}
      <section
        id="downloads"
        aria-labelledby="downloads-heading"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      >
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-10">
          <div className="space-y-6 lg:col-span-7 studio-reveal">{children}</div>

          <div className="lg:col-span-5 studio-reveal-delay">
            <div
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
              style={{ boxShadow: "var(--workbench-shadow)" }}
            >
              <div
                aria-hidden="true"
                className="h-[3px] w-full bg-gradient-to-r from-[#2453CE] via-[#1B42AF] to-[#147B6D]"
              />

              <div className="min-h-[300px] p-5 sm:p-6">
                {loadState.status === "loading" && (
                  <WorkbenchSkeleton detectedLabel={detected.label} />
                )}

                {loadState.status === "error" && (
                  <div
                    role="alert"
                    className="space-y-4 rounded-xl border border-[var(--danger)] bg-[var(--danger-subtle)] p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-[var(--danger)]">
                        Release manifest unavailable
                      </h2>
                      <Badge variant="danger">Error</Badge>
                    </div>
                    <p className="text-sm text-[var(--text)]">{loadState.message}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Verify that a release has been published and the release catalog is reachable.
                    </p>
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <Button variant="outline" onClick={() => void loadManifest()}>
                        Retry fetch
                      </Button>
                    </div>
                  </div>
                )}

                {loadState.status === "ready" && loadState.manifest.artifacts.length === 0 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3.5">
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
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3.5">
                      <div className="space-y-0.5">
                        <div className="font-mono text-sm font-semibold text-[var(--text)]">
                          {loadState.manifest.release_id}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          Published {formatPublishDate(loadState.manifest.published_at)}
                        </div>
                      </div>
                      <Badge variant="primary">{detected.label}</Badge>
                    </div>

                    {primaryArtifact ? (
                      <>
                        <div className="space-y-1.5">
                          <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">
                            {platformLabel(primaryArtifact.platform)} installer
                          </h2>
                          <p className="font-mono text-xs break-all text-[var(--text-muted)]">
                            {primaryArtifact.file_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                            <span className="rounded-md bg-[var(--surface-subtle)] px-2 py-0.5 text-[var(--text)]">
                              {primaryArtifact.arch}
                            </span>
                            <span className="rounded-md bg-[var(--surface-subtle)] px-2 py-0.5 uppercase text-[var(--text)]">
                              .{primaryArtifact.format}
                            </span>
                            <span className="tabular-nums">{formatBytes(primaryArtifact.size)}</span>
                          </div>
                        </div>

                        <div className="grid gap-2.5">
                          <a
                            href={primaryArtifact.url}
                            className={cn(buttonVariants({ variant: "primary" }), "w-full")}
                          >
                            <DownloadIcon />
                            <span>
                              Download {platformLabel(primaryArtifact.platform)} installer (.
                              {primaryArtifact.format})
                            </span>
                          </a>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full",
                              copiedKey === `primary-${primaryArtifact.file_name}` &&
                                "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] hover:bg-[var(--accent-subtle)]",
                            )}
                            onClick={() =>
                              void copyValue(
                                primaryArtifact.sha256,
                                `primary-${primaryArtifact.file_name}`,
                                `SHA-256 for ${primaryArtifact.file_name}`,
                              )
                            }
                          >
                            {copiedKey === `primary-${primaryArtifact.file_name}` ? (
                              <>
                                <CheckIcon />
                                <span>SHA-256 copied</span>
                              </>
                            ) : (
                              <span>Copy SHA-256 checksum</span>
                            )}
                          </Button>
                        </div>

                        <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
                          <summary className="flex min-h-11 items-center justify-between gap-2 text-xs font-semibold text-[var(--text)]">
                            <span>Verify checksum locally</span>
                            <span className="inline-flex items-center gap-2 font-mono text-[var(--text-muted)]">
                              <span>SHA-256</span>
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-180"
                              >
                                <path d="M4 6l4 4 4-4" />
                              </svg>
                            </span>
                          </summary>
                          <div className="mt-2.5 space-y-3 border-t border-[var(--border)] pt-3">
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
                              <code className="mt-1 block break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)] select-all">
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
                        <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">
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
        </div>
      </section>

      {/* Band 2: Editorial Overview */}
      <OverviewSection />

      {/* Band 3: Full-width Package Ledger */}
      <section
        id="all-platforms"
        ref={packagesRef}
        aria-labelledby="all-platforms-heading"
        className="border-t border-[var(--border)] bg-[var(--bg)]"
      >
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <div className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-[var(--accent-text)]">
                02 / Packages
              </div>
              <h2
                id="all-platforms-heading"
                className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl"
              >
                All installers and checksums
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Verified release artifacts served directly from Cloudflare R2.
              </p>
            </div>
          </div>

          <div className="mt-7">
            {loadState.status === "error" && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]">
                Platform packages appear here once the release catalog is reachable.
              </div>
            )}

            {(loadState.status === "loading" ||
              (loadState.status === "ready" && !packagesInView)) && <PackageMatrixSkeleton />}

            {loadState.status === "ready" && packagesInView && (
              <Suspense fallback={<PackageMatrixSkeleton />}>
                <LazyPackageMatrix
                  manifest={loadState.manifest}
                  selectedTab={selectedTab}
                  onSelectTab={setSelectedTab}
                  copiedKey={copiedKey}
                  onCopy={(val, key, desc) => void copyValue(val, key, desc)}
                />
              </Suspense>
            )}
          </div>
        </div>
      </section>

      {/* Band 4: Asymmetric Editorial Changelog */}
      <section
        id="changelog"
        ref={changelogRef}
        aria-labelledby="changelog-heading"
        className="border-t border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="space-y-3 lg:col-span-4">
              <div className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-[var(--accent-text)]">
                03 / Release notes
              </div>
              <h2
                id="changelog-heading"
                className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl"
              >
                Release changelog
              </h2>
              {loadState.status === "loading" && (
                <div role="status" className="pt-1">
                  <span className="sr-only">Loading release date metadata.</span>
                  <Skeleton className="h-4 w-52" />
                </div>
              )}
              {loadState.status === "error" && (
                <p className="text-sm text-[var(--text-muted)]">
                  Published release notes for the active build.
                </p>
              )}
              {loadState.status === "ready" && (
                <p className="text-sm text-[var(--text-muted)]">
                  Showing notes for{" "}
                  <span className="font-mono font-semibold text-[var(--text)]">
                    {loadState.manifest.release_id}
                  </span>{" "}
                  ({formatPublishDate(loadState.manifest.published_at)}).
                </p>
              )}
            </div>

            <div className="lg:col-span-8">
              <div className="min-h-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6 sm:p-8">
                {loadState.status === "error" && (
                  <p className="text-sm text-[var(--text-muted)]">
                    Changelog notes are unavailable while the release manifest cannot be reached.
                  </p>
                )}

                {(loadState.status === "loading" ||
                  (loadState.status === "ready" && !changelogInView)) && <ChangelogSkeleton />}

                {loadState.status === "ready" && changelogInView && (
                  <Suspense fallback={<ChangelogSkeleton />}>
                    <LazyChangelogPanel
                      releaseId={loadState.manifest.release_id}
                      changelog={loadState.manifest.changelog}
                    />
                  </Suspense>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
