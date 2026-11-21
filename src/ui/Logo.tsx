// Marks. Azimuth's is a compass bearing: north marked, a needle swung off it, the angle between shaded.
// Each tool has its own glyph in the same style: white shapes with one accent colour.
import type { ReactNode } from "react";
import { cn } from "../lib/util";

export function AzimuthGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 12 L12 5.4 A6.6 6.6 0 0 1 16.67 7.33 Z" fill="#3b82f6" opacity="0.45" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <path d="M19.4 12h-1.8M12 19.4v-1.8M4.6 12h1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
      <path d="M12 4.4v2.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16.67 7.33 13.13 13.13 10.87 10.87Z" fill="#60a5fa" />
      <path d="M9.03 14.97 13.13 13.13 10.87 10.87Z" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    </svg>
  );
}

// Service Bus (Busscope): a horizontal bus with services attached above and below.
export function BusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7 7.5v3M17 7.5v3M12 13.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <rect x="2" y="10.25" width="20" height="3.5" rx="1.75" fill="#3b82f6" />
      <rect x="4" y="2.5" width="6" height="5" rx="1.5" fill="currentColor" />
      <rect x="14" y="2.5" width="6" height="5" rx="1.5" fill="currentColor" />
      <rect x="9" y="16.5" width="6" height="5" rx="1.5" fill="currentColor" />
    </svg>
  );
}

// Functions: a bolt between code brackets.
export function FunctionsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6.5 5 2.5 12l4 7M17.5 5l4 7-4 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <path d="M13.6 3 8 13h4l-1.6 8L16 11h-4l1.6-8Z" fill="#f5a524" />
    </svg>
  );
}

// App Insights: a trace waterfall, spans stepping down and to the right.
export function InsightsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="3.5" width="19" height="3.5" rx="1.75" fill="currentColor" opacity="0.85" />
      <rect x="6" y="10.25" width="11" height="3.5" rx="1.75" fill="#a78bfa" />
      <rect x="9.5" y="17" width="9" height="3.5" rx="1.75" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-[6px] border border-white/15 bg-gradient-to-b from-[#2a2a2a] to-[#111] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.5)]", className)}>
      {children}
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Tile className={className}>
      <AzimuthGlyph className="size-[76%]" />
    </Tile>
  );
}
