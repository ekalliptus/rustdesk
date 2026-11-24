import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_API_HEALTH_URL, DEFAULT_LATEST_JSON_URL } from "@/lib/release";

type ProbeState = "checking" | "online" | "unreachable";

interface ProbeResult {
  state: ProbeState;
  latencyMs: number | null;
  detail: string;
}

export interface ServiceStatusProps {
  apiHealthUrl?: string;
  manifestUrl?: string;
}

const PROBE_TIMEOUT_MS = 6000;

async function probeEndpoint(url: string, label: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    if (!response.ok) {
      return {
        state: "unreachable",
        latencyMs,
        detail: `${label} returned HTTP ${response.status}`,
      };
    }
    return {
      state: "online",
      latencyMs,
      detail: `Online (${latencyMs} ms)`,
    };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    return {
      state: "unreachable",
      latencyMs: null,
      detail: timedOut ? "Timed out" : "Unreachable from browser",
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function StatusMark({ state }: { state: ProbeState }) {
  if (state === "online") {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[var(--accent)]"
      />
    );
  }
  if (state === "unreachable") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        width="12"
        height="12"
        className="h-3 w-3 shrink-0 text-[var(--danger)]"
      >
        <path
          d="M2.2 2.2 L9.8 9.8 M9.8 2.2 L2.2 9.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--border-strong)]"
    />
  );
}

export function ServiceStatus({
  apiHealthUrl = DEFAULT_API_HEALTH_URL,
  manifestUrl = DEFAULT_LATEST_JSON_URL,
}: ServiceStatusProps) {
  const [apiProbe, setApiProbe] = useState<ProbeResult>({
    state: "checking",
    latencyMs: null,
    detail: "Checking...",
  });
  const [cdnProbe, setCdnProbe] = useState<ProbeResult>({
    state: "checking",
    latencyMs: null,
    detail: "Checking...",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runChecks = useCallback(async () => {
    setIsRefreshing(true);
    setApiProbe({ state: "checking", latencyMs: null, detail: "Checking..." });
    setCdnProbe({ state: "checking", latencyMs: null, detail: "Checking..." });

    const [apiRes, cdnRes] = await Promise.all([
      probeEndpoint(apiHealthUrl, "API"),
      probeEndpoint(manifestUrl, "CDN"),
    ]);

    setApiProbe(apiRes);
    setCdnProbe(cdnRes);
    setIsRefreshing(false);
  }, [apiHealthUrl, manifestUrl]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  return (
    <div
      className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Service reachability</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Checks in-memory API health (zero NeonDB wake) and R2 manifest CDN.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void runChecks()}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Checking..." : "Refresh status"}
        </Button>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-[4px] bg-[var(--surface-subtle)] px-3 py-2.5">
          <dt className="font-mono text-xs text-[var(--text-muted)]">api.desk.ekalliptus.com</dt>
          <dd className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text)] tabular-nums">
            <StatusMark state={apiProbe.state} />
            <span>{apiProbe.detail}</span>
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[4px] bg-[var(--surface-subtle)] px-3 py-2.5">
          <dt className="font-mono text-xs text-[var(--text-muted)]">dl.desk.ekalliptus.com</dt>
          <dd className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text)] tabular-nums">
            <StatusMark state={cdnProbe.state} />
            <span>{cdnProbe.detail}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
