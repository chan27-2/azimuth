import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

export function CsvTable({ rows }: { rows: string[][] }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [head, ...body] = rows;
  const sorted = useMemo(() => {
    if (!sort) return body;
    return [...body].sort((a, b) => {
      const x = a[sort.col] ?? "", y = b[sort.col] ?? "";
      const nx = Number(x), ny = Number(y);
      return (!isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y)) * sort.dir;
    });
  }, [body, sort]);
  return (
    <div className="selectable overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse font-mono text-[12px]">
        <thead className="sticky top-0 bg-bg-2">
          <tr>
            {head.map((h, i) => (
              <th key={i} onClick={() => setSort((s) => (s?.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: 1 }))} className="cursor-pointer whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium text-fg-2 hover:text-fg">
                <span className="inline-flex items-center gap-1">
                  {h}
                  {sort?.col === i && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-white/[0.02]">
              {r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5 text-fg">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
