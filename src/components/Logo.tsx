// Busscope mark: the classic service-bus diagram, a horizontal bus with services attached above and below.
export function Glyph({ className }: { className?: string }) {
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

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center rounded-[6px] border border-white/15 bg-gradient-to-b from-[#2a2a2a] to-[#111] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.5)] ${className ?? ""}`}>
      <Glyph className="size-[76%]" />
    </span>
  );
}
