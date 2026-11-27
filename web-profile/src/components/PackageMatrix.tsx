import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatBytes,
  platformLabel,
  type PlatformId,
  type ReleaseArtifact,
  type ReleaseManifest,
} from "@/lib/release";
import { cn } from "@/lib/utils";

export type TabValue = "all" | PlatformId;

const PLATFORM_TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
  { value: "macos", label: "macOS" },
  { value: "android", label: "Android" },
];

export interface PackageMatrixProps {
  manifest: ReleaseManifest;
  selectedTab: TabValue;
  onSelectTab: (value: TabValue) => void;
  copiedKey: string | null;
  onCopy: (value: string, key: string, description: string) => void;
}

export function PackageMatrix({
  manifest,
  selectedTab,
  onSelectTab,
  copiedKey,
  onCopy,
}: PackageMatrixProps) {
  const countsByPlatform = useMemo(() => {
    const counts: Record<TabValue, number> = {
      all: 0,
      windows: 0,
      linux: 0,
      macos: 0,
      android: 0,
    };
    for (const item of manifest.artifacts) {
      counts.all += 1;
      counts[item.platform] += 1;
    }
    return counts;
  }, [manifest.artifacts]);

  const filteredArtifacts = useMemo(() => {
    if (selectedTab === "all") return manifest.artifacts;
    return manifest.artifacts.filter((item) => item.platform === selectedTab);
  }, [manifest.artifacts, selectedTab]);

  return (
    <Tabs value={selectedTab} onValueChange={(value) => onSelectTab(value as TabValue)}>
      <TabsList aria-label="Filter installers by operating system">
        {PLATFORM_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            <span>{tab.label}</span>
            <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
              ({countsByPlatform[tab.value]})
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={selectedTab}>
        {filteredArtifacts.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]">
            No packages were published for this platform in{" "}
            <span className="font-mono text-[var(--text)]">{manifest.release_id}</span>.
          </div>
        ) : (
          <>
            {/* Desktop ledger table (lg+) */}
            <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-semibold text-[var(--text-muted)]">
                    <th scope="col" className="px-4 py-3.5">
                      Platform
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      File
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Arch
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Format
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right">
                      Size
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      SHA-256
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right">
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
                        onCopy(
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

            {/* Tablet 2-column grid (sm to lg) and Mobile 1-column stack (< sm) */}
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:hidden">
              {filteredArtifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact.file_name}
                  artifact={artifact}
                  copied={copiedKey === artifact.file_name}
                  onCopy={() =>
                    onCopy(
                      artifact.sha256,
                      artifact.file_name,
                      `SHA-256 for ${artifact.file_name}`,
                    )
                  }
                />
              ))}
            </ul>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default PackageMatrix;

interface ArtifactRowProps {
  artifact: ReleaseArtifact;
  copied: boolean;
  onCopy: () => void;
}

function ArtifactTableRow({ artifact, copied, onCopy }: ArtifactRowProps) {
  return (
    <tr className="transition-colors duration-150 hover:bg-[var(--surface-subtle)]/55">
      <td className="px-4 py-3.5 font-semibold text-[var(--text)]">
        {platformLabel(artifact.platform)}
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-[var(--text)]">{artifact.file_name}</td>
      <td className="px-4 py-3.5 font-mono text-xs text-[var(--text-muted)]">{artifact.arch}</td>
      <td className="px-4 py-3.5 font-mono text-xs uppercase text-[var(--text-muted)]">
        .{artifact.format}
      </td>
      <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-[var(--text-muted)]">
        {formatBytes(artifact.size)}
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-[var(--text-muted)]">
        {artifact.sha256.slice(0, 12)}...
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="inline-flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              copied &&
                "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] hover:bg-[var(--accent-subtle)]",
            )}
            onClick={onCopy}
            aria-label={`Copy SHA-256 checksum for ${artifact.file_name}`}
          >
            {copied ? "Copied" : "Copy SHA-256"}
          </Button>
          <a href={artifact.url} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            Download
          </a>
        </div>
      </td>
    </tr>
  );
}

function ArtifactCard({ artifact, copied, onCopy }: ArtifactRowProps) {
  return (
    <li className="flex flex-col justify-between space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text)]">
              {platformLabel(artifact.platform)}
            </div>
            <div className="mt-0.5 font-mono text-xs break-all text-[var(--text-muted)]">
              {artifact.file_name}
            </div>
          </div>
          <Badge className="uppercase">.{artifact.format}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-2.5 border-t border-[var(--border)] pt-3 text-xs">
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
            <dt className="text-[var(--text-muted)]">SHA-256 digest</dt>
            <dd className="font-mono text-[var(--text)]">
              {artifact.sha256.slice(0, 16)}...{artifact.sha256.slice(-8)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <a href={artifact.url} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
          Download
        </a>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            copied &&
              "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] hover:bg-[var(--accent-subtle)]",
          )}
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy SHA-256"}
        </Button>
      </div>
    </li>
  );
}
