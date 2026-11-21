// Demo accounts and subscriptions. Every name and id in electron/demo/ is fictional.
export const SUB_PROD = "00000000-0000-4000-8000-000000000001";
export const SUB_DEV = "00000000-0000-4000-8000-000000000002";
export const SUB_SIDE = "00000000-0000-4000-8000-000000000003";

export const account = async () => ({ demo: true, user: "demo@example.com", tenantId: "00000000-0000-0000-0000-000000000000", defaultSubscription: "Acme Development" });
export const subscriptions = async () => [
  { id: SUB_DEV, name: "Acme Development", tenantId: "00000000-0000-4000-8000-0000000000aa", user: "you@acme.example", isDefault: true },
  { id: SUB_PROD, name: "Acme Production", tenantId: "00000000-0000-4000-8000-0000000000aa", user: "you@acme.example", isDefault: false },
  { id: SUB_SIDE, name: "Side project", tenantId: "00000000-0000-4000-8000-0000000000bb", user: "you@example.com", isDefault: false },
];
export const addAccount = async () => true;
export const cancelAddAccount = async () => true;

// Small seeded random generator, so demo data is stable between refreshes.
export function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
export const wait = (ms) => new Promise((res) => setTimeout(res, ms));
