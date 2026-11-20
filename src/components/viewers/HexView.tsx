import { useMemo } from "react";

export function HexView({ bytes, limit = 64 * 1024 }: { bytes: Uint8Array; limit?: number }) {
  const rows = useMemo(() => {
    const out: { off: string; hex: string; ascii: string }[] = [];
    const n = Math.min(bytes.length, limit);
    for (let i = 0; i < n; i += 16) {
      const chunk = bytes.slice(i, Math.min(i + 16, n));
      const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, "0"));
      out.push({
        off: i.toString(16).padStart(8, "0"),
        hex: [hex.slice(0, 8).join(" "), hex.slice(8).join(" ")].join("  ").padEnd(49, " "),
        ascii: Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "·")).join(""),
      });
    }
    return out;
  }, [bytes, limit]);
  return (
    <div className="selectable font-mono text-[12px] leading-[20px]">
      {rows.map((r) => (
        <div key={r.off} className="flex gap-4 whitespace-pre rounded-sm px-1 hover:bg-white/[0.03]">
          <span className="text-fg-3">{r.off}</span>
          <span className="text-fg-2">{r.hex}</span>
          <span className="text-tok-str/80">{r.ascii}</span>
        </div>
      ))}
      {bytes.length > limit && <div className="mt-2 text-fg-3">… {bytes.length - limit} more bytes</div>}
    </div>
  );
}
