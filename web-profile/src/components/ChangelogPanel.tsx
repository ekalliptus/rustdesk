import { Fragment, useMemo, type ReactNode } from "react";
import { parseChangelogBlocks } from "@/lib/release";

function redactPrivateHosts(text: string): string {
  return text
    .replace(/`?relay\.desk\.ekalliptus\.com`?/gi, "the private relay")
    .replace(/`?api\.desk\.ekalliptus\.com`?/gi, "the private API")
    .replace(/`?dl\.desk\.ekalliptus\.com`?/gi, "the release CDN")
    .replace(/`?[a-z0-9.-]*ekalliptus\.com`?/gi, "private infrastructure");
}

function renderInlineCode(text: string): ReactNode {
  const cleanText = redactPrivateHosts(text);
  const parts = cleanText.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="rounded-md bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--text)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

export interface ChangelogPanelProps {
  releaseId: string;
  changelog: string;
}

export function ChangelogPanel({ releaseId, changelog }: ChangelogPanelProps) {
  const blocks = useMemo(() => {
    if (!changelog) return [];
    return parseChangelogBlocks(changelog);
  }, [changelog]);

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No changelog notes were included with {releaseId}.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed text-[var(--text)]">
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          return block.level === 2 ? (
            <h3
              key={idx}
              className="border-b border-[var(--border)] pb-2.5 pt-2 first:pt-0 font-mono text-sm font-semibold tracking-tight text-[var(--text)]"
            >
              {redactPrivateHosts(block.text)}
            </h3>
          ) : (
            <h4 key={idx} className="pt-1 text-sm font-semibold text-[var(--text)]">
              {redactPrivateHosts(block.text)}
            </h4>
          );
        }
        if (block.type === "list") {
          return (
            <ul
              key={idx}
              className="list-disc space-y-2 pl-5 text-[var(--text-muted)] marker:text-[var(--accent)]"
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlineCode(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-[var(--text-muted)]">
            {renderInlineCode(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export default ChangelogPanel;
