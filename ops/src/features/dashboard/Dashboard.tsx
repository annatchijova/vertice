"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { INVOICES } from "@/data/invoices";
import { preflightAll } from "@/domain/preflight";
import { formatAmount, shortAddr } from "@/domain/format";
import { OpsHeader } from "@/components/OpsHeader";
import { useChainSnapshot } from "@/infrastructure/chain/useChainSnapshot";
import { InvoiceCard } from "./InvoiceCard";
import { InvoiceTable } from "./InvoiceTable";
import { PolicyCard } from "./PolicyCard";
import { TotalsBar } from "./TotalsBar";
import { ToneDot } from "./StatusBadge";
import { matchesFilter, matchesQuery, toRow, type Filter, type Tone, type View } from "./model";

const NAV_LINK: CSSProperties = { textDecoration: "none", paddingBottom: 4 };
const VIEW_BTN = (on: boolean): CSSProperties => ({
  display: "grid", placeItems: "center", width: 40, height: 36, border: 0, borderRadius: 999, cursor: "pointer",
  background: on ? "var(--sunken)" : "transparent", color: on ? "var(--ink-900)" : "var(--ink-500)",
});
const SVG = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "auto", label: "Auto" },
  { key: "firma", label: "Firma" },
  { key: "exc", label: "Excepciones" },
];

const CHIPS: { tone: Tone; label: string }[] = [
  { tone: "auto", label: "Auto-ejecutadas" },
  { tone: "signed", label: "Firmadas por vos" },
  { tone: "pending", label: "Requieren tu firma" },
  { tone: "failed", label: "Bloqueadas" },
  { tone: "insufficient", label: "Para revisar" },
];

export function Dashboard() {
  const { snapshot, isLive, payer, refetch } = useChainSnapshot();
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("grid");
  const [q, setQ] = useState("");

  const capLabel = formatAmount(snapshot.currencies.ARGt.perPaymentCap);
  const rows = useMemo(() => preflightAll(INVOICES, snapshot).map((pf) => toRow(pf, capLabel)), [snapshot, capLabel]);
  const query = q.trim().toLowerCase();
  const items = rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query));
  const count = (f: Filter) => rows.filter((r) => matchesFilter(r, f)).length;
  const countries = [...new Set(INVOICES.map((i) => i.supplier.country))];
  const countryList = countries.length > 1 ? `${countries.slice(0, -1).join(", ")} y ${countries.at(-1)}` : countries[0];

  return (
    <>
      <div style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <OpsHeader
          right={
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
              <nav aria-label="Secciones" style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                <Link href="/ops" className="vx-label" aria-current="page" style={{ ...NAV_LINK, color: "var(--ink-900)", borderBottom: "2px solid var(--ink-900)" }}>Lotes</Link>
                <a href="#politica" className="vx-label" style={NAV_LINK}>Política</a>
                <Link href="/ops/cierre" className="vx-label" style={NAV_LINK}>Cierre</Link>
              </nav>
              <span
                className="vx-mono"
                style={{ fontSize: 12, color: "var(--ink-700)", padding: "8px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", background: "var(--canvas)" }}
              >
                {shortAddr(payer)} · Arbitrum One
              </span>
            </div>
          }
        />
      </div>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 32px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span
            style={{
              alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px",
              borderRadius: "var(--radius-pill)", background: "var(--inverse)", color: "var(--on-inverse)",
              font: "500 11px/1.3 var(--font-sans)", letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--on-inverse)" }} />
            Noviembre 2026 · {INVOICES.length} facturas · {countries.length} países
          </span>
          <h1 className="t-h1" style={{ margin: 0 }}>Facturas del lote</h1>
          <p className="t-body" style={{ margin: 0, maxWidth: 680, color: "var(--ink-500)" }}>
            Proveedores de {countryList}. Cada factura se paga en la stablecoin de su contrato (ARGt o BRAt); la moneda
            original queda como referencia.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
            {CHIPS.map(({ tone, label }) => {
              const n = rows.filter((r) => r.tone === tone).length;
              if (n === 0 && tone === "signed") return null;
              return (
                <span
                  key={tone}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 6px 5px 12px", border: "1px solid var(--line)",
                    borderRadius: "var(--radius-pill)", background: "var(--surface)", font: "500 13px/1 var(--font-sans)",
                  }}
                >
                  <ToneDot tone={tone} />
                  {label}
                  <span className="vx-mono" style={{ fontSize: 11, padding: "3px 7px", borderRadius: "var(--radius-pill)", background: "var(--sunken)", color: "var(--ink-700)" }}>{n}</span>
                </span>
              );
            })}
          </div>
        </section>

        <PolicyCard snapshot={snapshot} isLive={isLive} />

        <section
          aria-label="Buscar y filtrar"
          className="vx-card"
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: "var(--radius-lg)" }}
        >
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
            <svg {...SVG} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-500)" }}>
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <label htmlFor="dc-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
              Buscar proveedor, país o factura
            </label>
            <input
              id="dc-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar proveedor, país o factura"
              style={{
                width: "100%", boxSizing: "border-box", minHeight: 44, padding: "10px 16px 10px 40px", border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius-pill)", background: "var(--surface)", color: "var(--ink-900)", font: "400 14px/1.2 var(--font-sans)",
                outlineColor: "var(--ink-900)",
              }}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span className="vx-label">Filtrar</span>
            <div className="vx-pills" role="group" aria-label="Filtrar por camino">
              {FILTERS.map(({ key, label }) => (
                <button key={key} type="button" className="vx-pill" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} <span className="vx-pill__count">{count(key)}</span>
                </button>
              ))}
            </div>
            <div role="group" aria-label="Vista" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", background: "var(--surface)" }}>
              <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Ver como grilla" style={VIEW_BTN(view === "grid")}>
                <svg {...SVG}>
                  <rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" />
                  <rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} aria-label="Ver como tabla" style={VIEW_BTN(view === "table")}>
                <svg {...SVG}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            </div>
          </div>
        </section>

        {items.length === 0 ? (
          <div className="vx-card" style={{ alignItems: "center", textAlign: "center", padding: "48px 24px", borderRadius: "var(--radius-lg)" }}>
            <p className="t-title" style={{ margin: 0 }}>No hay facturas con ese filtro.</p>
            <button type="button" className="vx-btn vx-btn--primary vx-btn--sm" onClick={() => { setFilter("all"); setQ(""); }}>
              Ver todas
            </button>
          </div>
        ) : view === "grid" ? (
          <div aria-live="polite" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {items.map((r) => <InvoiceCard key={r.invoice.id} row={r} />)}
          </div>
        ) : (
          <InvoiceTable rows={items} />
        )}

        <TotalsBar rows={rows} onPaid={() => void refetch()} />
      </main>
    </>
  );
}
