import { Badge } from "@/components/ui/badge";

const OVERVIEW_PILLARS = [
  {
    index: "01",
    title: "Key-locked private relay",
    description:
      "Every installer pins the private relay at compile time and enforces public key verification (-k _). Remote sessions never fall back to public servers.",
  },
  {
    index: "02",
    title: "Unattended low-power background mode",
    description:
      "Runs quietly as a system service or headless tray agent, pausing idle telemetry polling so host machines stay responsive with minimal background CPU and battery draw.",
  },
  {
    index: "03",
    title: "Synced address book and mobile control",
    description:
      "Sign in once across desktop and Android to manage your personal fleet, organize device tags, inspect audit logs, and control your PC directly from your phone.",
  },
  {
    index: "04",
    title: "Locally verifiable R2 releases",
    description:
      "Every desktop installer and Android APK is published straight to Cloudflare R2 with SHA-256 checksums so you can verify checksums before running.",
  },
];

function FlowArrow() {
  return (
    <div className="flex justify-center py-1 text-[var(--text-muted)]" aria-hidden="true">
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M8 2.5v10" />
        <path d="M4.75 9.25 8 12.5l3.25-3.25" />
      </svg>
    </div>
  );
}

export function OverviewSection() {
  return (
    <section
      id="overview"
      aria-labelledby="overview-heading"
      className="border-t border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
          <div className="space-y-6 lg:col-span-5">
            <div className="space-y-3">
              <div className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-[var(--accent-text)]">
                01 / Overview
              </div>
              <h2
                id="overview-heading"
                className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl"
              >
                Built for private control,{" "}
                <em className="font-serif font-normal italic text-[var(--accent-text)]">
                  not public relays.
                </em>
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                EL-Desk is a private remote desktop suite built for your own Windows, Linux, macOS,
                and Android devices. Get unattended host access, clipboard and file transfer, and
                phone-to-PC remote control on dedicated infrastructure without third-party
                subscriptions or public rendezvous exposure.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                How a session connects
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-[var(--text)]">Client device</span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    Win / Linux / macOS / Android
                  </span>
                </div>

                <FlowArrow />

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text)]">
                      Pinned private relay
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-muted)]">
                      Dedicated hbbs / hbbr host
                    </div>
                  </div>
                  <Badge variant="accent">-k _ encrypted</Badge>
                </div>

                <FlowArrow />

                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-[var(--text)]">Target host</span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    Unattended background service
                  </span>
                </div>
              </div>

              <p className="mt-3.5 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                Account login, address book, and audit logs sync separately via the private Go API.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {OVERVIEW_PILLARS.map((item) => (
                <li key={item.index} className="grid gap-2 py-5 sm:grid-cols-12 sm:gap-4 sm:py-6">
                  <div className="font-mono text-xs font-medium text-[var(--accent-text)] sm:col-span-2 sm:pt-0.5">
                    {item.index}
                  </div>
                  <div className="space-y-1.5 sm:col-span-10">
                    <h3 className="text-base font-semibold tracking-tight text-[var(--text)]">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
