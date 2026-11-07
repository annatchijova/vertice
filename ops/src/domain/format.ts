import { formatUnits, parseUnits } from "viem";

const nf = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1250.5 | "1250.50" | 1250500000000000000000n → "1.250,50" */
export function formatAmount(value: number | string | bigint, decimals = 18): string {
  const n = typeof value === "bigint" ? Number(formatUnits(value, decimals)) : Number(value);
  return nf.format(n);
}

export const toUnits = (amount: string, decimals = 18) => parseUnits(amount, decimals);

/** 0x981dce900787aed11e8e4489860907d2892f70ed → "0x981d…70ed" */
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** tx hash → "0x704fb8b5…cabfc" */
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-5)}`;

/** unix seconds → "07/11 12:20:44" (hora ART) */
export function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")} ${p("hour")}:${p("minute")}:${p("second")}`;
}

/** 522117760n → "522.117.760" */
export const formatBlock = (b: bigint | number) => new Intl.NumberFormat("es-AR").format(b);

/** unix seconds → "07/11/2026 12:20:44 ART" */
export function formatDateTimeLong(ts: number): string {
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ts * 1000));
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}:${p("second")} ART`;
}

/** 0xcb7429a0bd…5cd6 → "0xcb7429a0…df53c5cd6" (como en el expediente de PROOF) */
export const midHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-9)}`.toLowerCase();
