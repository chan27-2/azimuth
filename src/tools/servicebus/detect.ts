// Detection pipeline: trust metadata, unwrap envelopes, sniff content, fall back to hex.
// Each pass either unwraps a layer and loops, or settles on a final format.

export type Format = "json" | "xml" | "csv" | "text" | "binary" | "empty";

export type Layer =
  | { kind: "gzip"; from: number; to: number }
  | { kind: "base64"; from: number; to: number }
  | { kind: "bom" }
  | { kind: "json-string" }
  | { kind: "cloudevent"; envelope: Record<string, unknown> }
  | { kind: "masstransit"; envelope: Record<string, unknown> };

export type Detection = {
  format: Format;
  layers: Layer[];
  bytes: Uint8Array; // innermost payload bytes
  text?: string;
  json?: unknown;
  xml?: Document;
  csv?: { delimiter: string; rows: string[][] };
  binaryHint?: string;
  declared: string | null;
  mismatch: boolean;
  summary: string;
};

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const enc = new TextEncoder();

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
const B64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

function looksBase64(s: string) {
  const t = s.replace(/\s+/g, "");
  return t.length >= 16 && t.length % 4 === 0 && B64.test(t) && !/^[0-9]+$/.test(t) && !/^[a-z]+$/i.test(t);
}

function printableRatio(s: string) {
  if (!s.length) return 1;
  let p = 0;
  for (let i = 0; i < Math.min(s.length, 2000); i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) p++;
  }
  return p / Math.min(s.length, 2000);
}

function binaryHint(b: Uint8Array): string {
  const head = Array.from(b.slice(0, 4));
  if (head[0] === 0x4f && head[1] === 0x62 && head[2] === 0x6a && head[3] === 0x01) return "Avro container";
  if (head[0] === 0x50 && head[1] === 0x4b) return "ZIP archive";
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "PDF";
  if (head[0] === 0x89 && head[1] === 0x50) return "PNG image";
  if (head[0] >= 0x80 && head[0] <= 0x8f) return "MessagePack map?";
  if ((head[0] & 0x07) <= 5 && head[0] >> 3 >= 1 && head[0] >> 3 <= 15) return "Protobuf? (needs schema)";
  return "Unknown binary";
}

function tryCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return null;
  for (const d of [",", "\t", ";", "|"]) {
    const n = lines[0].split(d).length;
    if (n < 2) continue;
    const consistent = lines.slice(0, 20).every((l) => l.split(d).length === n);
    if (consistent) return { delimiter: d, rows: lines.map((l) => parseCsvLine(l, d)) };
  }
  return null;
}

function parseCsvLine(line: string, d: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const declaredFormat = (ct: string | null): Format | null => {
  if (!ct) return null;
  const c = ct.toLowerCase();
  if (c.includes("json")) return "json";
  if (c.includes("xml")) return "xml";
  if (c.includes("csv")) return "csv";
  if (c.startsWith("text/")) return "text";
  if (c.includes("octet") || c.includes("avro") || c.includes("protobuf")) return "binary";
  return null;
};

export async function detect(input: Uint8Array, contentType: string | null): Promise<Detection> {
  const layers: Layer[] = [];
  let bytes = input;
  const finish = (d: Omit<Detection, "layers" | "bytes" | "declared" | "mismatch" | "summary">): Detection => {
    const want = declaredFormat(contentType);
    const ce = layers.find((l) => l.kind === "cloudevent") as Extract<Layer, { kind: "cloudevent" }> | undefined;
    return {
      ...d,
      layers,
      bytes,
      declared: contentType,
      mismatch: !!want && want !== d.format && !(want === "json" && ce),
      summary: summarize(d, ce),
    };
  };

  for (let depth = 0; depth < 6; depth++) {
    if (!bytes.length) return finish({ format: "empty" });

    if (isGzip(bytes)) {
      const out = await gunzip(bytes);
      if (out) { layers.push({ kind: "gzip", from: bytes.length, to: out.length }); bytes = out; continue; }
    }

    let text: string;
    try { text = utf8.decode(bytes); } catch { return finish({ format: "binary", binaryHint: binaryHint(bytes) }); }
    if (printableRatio(text) < 0.9) return finish({ format: "binary", binaryHint: binaryHint(bytes) });

    if (text.charCodeAt(0) === 0xfeff) { layers.push({ kind: "bom" }); text = text.slice(1); bytes = enc.encode(text); }
    const t = text.trim();

    if (looksBase64(t)) {
      try {
        const dec = b64ToBytes(t.replace(/\s+/g, ""));
        let ok = isGzip(dec);
        if (!ok) { try { ok = printableRatio(utf8.decode(dec)) > 0.95; } catch { ok = false; } }
        if (ok) { layers.push({ kind: "base64", from: bytes.length, to: dec.length }); bytes = dec; continue; }
      } catch { /* not base64 */ }
    }

    if (t[0] === "{" || t[0] === "[" || t[0] === '"') {
      let parsed: unknown;
      try { parsed = JSON.parse(t); } catch { parsed = undefined; }
      if (parsed !== undefined) {
        if (typeof parsed === "string") {
          layers.push({ kind: "json-string" });
          bytes = enc.encode(parsed);
          continue;
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const o = parsed as Record<string, unknown>;
          if (typeof o.specversion === "string" && ("type" in o || "source" in o)) {
            const { data, data_base64, ...envelope } = o;
            layers.push({ kind: "cloudevent", envelope });
            if (typeof data_base64 === "string") { bytes = b64ToBytes(data_base64); continue; }
            if (typeof data === "string") { bytes = enc.encode(data); continue; }
            bytes = enc.encode(JSON.stringify(data ?? null));
            return finish({ format: "json", json: data ?? null, text: JSON.stringify(data, null, 2) });
          }
          if (Array.isArray(o.messageType) && "message" in o) {
            const { message, ...envelope } = o;
            layers.push({ kind: "masstransit", envelope });
            bytes = enc.encode(JSON.stringify(message));
            return finish({ format: "json", json: message, text: JSON.stringify(message, null, 2) });
          }
        }
        return finish({ format: "json", json: parsed, text: JSON.stringify(parsed, null, 2) });
      }
    }

    if (t[0] === "<") {
      const doc = new DOMParser().parseFromString(t, "application/xml");
      if (!doc.querySelector("parsererror")) return finish({ format: "xml", xml: doc, text: t });
    }

    const csv = tryCsv(t);
    if (csv && csv.rows[0].length >= 2) return finish({ format: "csv", csv, text });

    return finish({ format: "text", text });
  }
  return finish({ format: "binary", binaryHint: "Too many nested layers" });
}

function summarize(d: Partial<Detection>, ce?: Extract<Layer, { kind: "cloudevent" }>) {
  if (ce) return String(ce.envelope.type ?? "CloudEvent");
  switch (d.format) {
    case "json": {
      const j = d.json;
      if (Array.isArray(j)) return `Array(${j.length})`;
      if (j && typeof j === "object") return `{ ${Object.keys(j).slice(0, 4).join(", ")}${Object.keys(j).length > 4 ? ", …" : ""} }`;
      return String(j);
    }
    case "xml": return `<${d.xml?.documentElement.nodeName}>`;
    case "csv": return `${d.csv!.rows.length} rows × ${d.csv!.rows[0].length} cols`;
    case "text": return d.text!.slice(0, 80).replace(/\s+/g, " ");
    case "binary": return d.binaryHint ?? "binary";
    default: return "empty body";
  }
}

export function layerLabel(l: Layer): string {
  switch (l.kind) {
    case "gzip": return `gzip ${fmtBytes(l.from)} → ${fmtBytes(l.to)}`;
    case "base64": return "base64";
    case "bom": return "UTF-8 BOM";
    case "json-string": return "JSON string";
    case "cloudevent": return `CloudEvent ${l.envelope.specversion}`;
    case "masstransit": return "MassTransit";
  }
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
