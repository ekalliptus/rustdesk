import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const TAB_PLACEHOLDER_WIDTHS = ["w-28", "w-24", "w-20", "w-24", "w-24"];

export function WorkbenchSkeleton({ detectedLabel }: { detectedLabel: string }) {
  return (
    <div role="status" className="space-y-5">
      <span className="sr-only">Loading recommended installer for {detectedLabel}.</span>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3.5">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3.5 w-36" />
        </div>
        <Badge variant="primary">{detectedLabel}</Badge>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-11" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>
    </div>
  );
}

export function PackageMatrixSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading platform installers and SHA-256 checksums.</span>

      <div
        aria-hidden="true"
        className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
      >
        {TAB_PLACEHOLDER_WIDTHS.map((widthClass, idx) => (
          <div
            key={idx}
            className={
              idx === 0
                ? "inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2"
                : "inline-flex min-h-11 items-center rounded-lg border border-transparent px-3.5 py-2"
            }
          >
            <Skeleton className={`h-4 ${widthClass}`} />
          </div>
        ))}
      </div>

      {/* Desktop ledger table skeleton (lg+) */}
      <div
        aria-hidden="true"
        className="mt-5 hidden overflow-x-auto rounded-xl border border-[var(--border)] lg:block"
      >
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
            {[0, 1].map((rowIdx) => (
              <tr key={rowIdx}>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-4 w-16" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3.5 w-44" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3.5 w-16" />
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3.5 w-10" />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end">
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <Skeleton className="h-3.5 w-24" />
                </td>
                <td className="px-4 py-3.5">
                  <div className="inline-flex w-full items-center justify-end gap-2">
                    <Skeleton className="h-11 w-24 rounded-lg" />
                    <Skeleton className="h-11 w-24 rounded-lg" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tablet 2-column / Mobile 1-column card skeleton */}
      <ul aria-hidden="true" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:hidden">
        {[0, 1].map((cardIdx) => (
          <li
            key={cardIdx}
            className="flex flex-col justify-between space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3.5 w-44" />
                </div>
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>

              <div className="grid grid-cols-2 gap-2.5 border-t border-[var(--border)] pt-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5 w-48" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangelogSkeleton() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading release changelog notes.</span>

      <div className="border-b border-[var(--border)] pb-2.5">
        <Skeleton className="h-5 w-16" />
      </div>

      <ul aria-hidden="true" className="space-y-3.5 pl-1">
        <li className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] opacity-55" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] opacity-55" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] opacity-55" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
          </div>
        </li>
      </ul>
    </div>
  );
}
