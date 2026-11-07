import type { CSSProperties, ReactNode } from "react";
import type { Invoice } from "@/domain/invoice";
import type { Check, Path } from "@/domain/preflight";
import { formatAmount, shortAddr } from "@/domain/format";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";

/* ───────────── Aside: la factura ───────────── */

const dt: CSSProperties = { color: "var(--ink-500)" };
const ddMono: CSSProperties = { margin: 0, fontSize: 13 };

export function InvoiceCard({ invoice, amountLabel, payToFailed }: { invoice: Invoice; amountLabel: string; payToFailed?: boolean }) {
  const s = invoice.supplier;
  return (
    <div className="vx-card" style={{ gap: 14 }}>
      <span className="vx-label">La factura</span>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px" }}>
        <dt className="t-small" style={dt}>Proveedor</dt>
        <dd className="t-small" style={{ margin: 0 }}>{s.name}</dd>
        <dt className="t-small" style={dt}>País</dt>
        <dd className="t-small" style={{ margin: 0 }}>{s.country} · {s.city}</dd>
        <dt className="t-small" style={dt}>Moneda de origen</dt>
        <dd className="vx-mono" style={ddMono}>{invoice.originCurrency} · referencia</dd>
        <dt className="t-small" style={dt}>{s.taxIdLabel}</dt>
        <dd className="vx-mono" style={ddMono}>{s.taxId}</dd>
        <dt className="t-small" style={dt}>Número</dt>
        <dd className="vx-mono" style={ddMono}>{invoice.number}</dd>
        <dt className="t-small" style={dt}>Pagar a</dt>
        <dd className="vx-mono" style={{ ...ddMono, color: payToFailed ? "var(--failed)" : undefined }} title={invoice.payTo}>
          {shortAddr(invoice.payTo.toLowerCase())}
        </dd>
      </dl>
      <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="vx-label">{amountLabel}</span>
        <Amount value={invoice.amount} unit={invoice.currency} />
      </div>
    </div>
  );
}

export function Amount({ value, unit }: { value: string | bigint; unit: string }) {
  return (
    <span className="vx-amount">
      <span className="vx-amount__value">{formatAmount(value)}</span>
      <span className="vx-amount__unit">{unit}</span>
    </span>
  );
}

/* ───────────── Aside: lo que chequeé ───────────── */

const ICON_PATH: Record<Check["status"], string> = {
  pass: "M5 12l5 5 9-10",
  fail: "M6 6l12 12M18 6L6 18",
  abstain: "M5 12h14",
  alert: "M12 7v6M12 17h.01",
};

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="vx-checks">
      {checks.map((c) => {
        const alert = c.status === "alert";
        return (
          <li
            key={c.key}
            className={alert ? "vx-check" : `vx-check vx-check--${c.status}`}
            style={alert ? ({ "--tone": "var(--insufficient)", borderColor: "var(--insufficient)" } as CSSProperties) : undefined}
          >
            <span className="vx-check__icon" style={alert ? { background: "var(--insufficient-bg)" } : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON_PATH[c.status]} />
              </svg>
            </span>
            <div className="vx-check__body">
              <span className="vx-check__name">{c.name}</span>
              <span className="vx-check__detail">{c.detail}</span>
            </div>
            <span className="vx-check__result">{c.result}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────── Article: piezas ───────────── */

export function ArticleHeader({ label, badges, title, lead }: { label: string; badges: ReactNode; title: ReactNode; lead: ReactNode }) {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="vx-label">{label}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{badges}</div>
      </div>
      <h1 className="t-h1" style={{ margin: 0, textWrap: "balance" }}>{title}</h1>
      <p className="t-body-lg" style={{ margin: 0, color: "var(--ink-700)" }}>{lead}</p>
    </header>
  );
}

export function Section({ title, children, gap = 12 }: { title: string; children: ReactNode; gap?: number }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap }}>
      <h2 className="t-h3" style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="t-small" style={{ margin: 0, color: "var(--ink-700)" }}>{children}</p>;
}

export const Mono = ({ children }: { children: ReactNode }) => <span className="vx-mono">{children}</span>;

export function Footer({ children, row }: { children: ReactNode; row?: boolean }) {
  return (
    <footer
      style={
        row
          ? { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 24, background: "var(--canvas)", borderRadius: "var(--radius-md)" }
          : { display: "flex", flexDirection: "column", gap: 16, padding: 24, background: "var(--canvas)", borderRadius: "var(--radius-md)" }
      }
    >
      {children}
    </footer>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
}

/** Lista de definiciones del bloque "El pago". */
export function PaymentDl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", padding: "18px 20px", background: "var(--canvas)", borderRadius: "var(--radius-sm)" }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt className="vx-label">{k}</dt>
          <dd className="vx-mono" style={{ margin: 0, fontSize: 13, overflowWrap: "anywhere" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────── Por qué camino ───────────── */

export type ExceptionTone = "failed" | "insufficient";

/**
 * Los tres caminos del preflight. El activo va con borde lleno; los otros, punteados y apagados.
 * Textos base atados a la política (500,00) y al tope leído on-chain.
 */
export function PathBoxes({
  active,
  currency,
  cap,
  autoText,
  firmaText,
  exception,
}: {
  active: Path;
  currency: string;
  cap: bigint;
  autoText?: ReactNode;
  firmaText?: ReactNode;
  exception?: { label: string; text: ReactNode; tone: ExceptionTone };
}) {
  const thr = formatAmount(AUTO_EXECUTION_THRESHOLD);
  const boxes: { path: Path; label: string; text: ReactNode; tone?: ExceptionTone }[] = [
    { path: "auto", label: "Auto · por política", text: autoText ?? `≤ ${thr} ${currency} y sin excepciones.` },
    {
      path: "firma",
      label: "Requiere tu firma",
      text: firmaText ?? `Entre ${thr} y el tope de ${formatAmount(cap)} del contrato. Firmás vos con PAGAR.`,
    },
    {
      path: "excepcion",
      label: exception?.label ?? "Excepción",
      text: exception?.text ?? "Bloqueada o a tu decisión. Una excepción nunca se paga sola.",
      tone: exception?.tone ?? "failed",
    },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      {boxes.map((b) => {
        const on = b.path === active;
        const color = b.path === "excepcion" ? `var(--${b.tone})` : "var(--ink-900)";
        return (
          <div
            key={b.path}
            style={{
              padding: "16px 18px",
              border: on ? `1.5px solid ${color}` : "1px dashed var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              color: on ? undefined : "var(--ink-500)",
            }}
          >
            <span className="vx-label" style={on ? { color } : undefined}>{on ? `${b.label} · este` : b.label}</span>
            <span className="t-small">{b.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Comparación de meses ───────────── */

export function MonthsGrid({ months }: { months: { month: string; amount: string; current?: boolean }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      {months.map((m) => (
        <div key={m.month} style={{ background: m.current ? "var(--canvas)" : "var(--surface)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="vx-label" style={m.current ? { color: "var(--ink-900)" } : undefined}>{m.month}</span>
          <span className="vx-mono" style={m.current ? { fontWeight: 500 } : undefined}>{formatAmount(m.amount)}</span>
        </div>
      ))}
    </div>
  );
}

/** "2026-11-05" → "Noviembre" */
export function monthName(iso: string): string {
  const m = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** "2026-11-05" → "05/11" */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/* ───────────── Dirección carácter por carácter ───────────── */

/** Pinta una dirección como "0x 5d1a 7e2c …", resaltando los índices que difieren de `other`. */
export function AddressDiff({ address, other, tone }: { address: string; other: string; tone: "verified" | "failed" }) {
  const a = address.toLowerCase();
  const b = other.toLowerCase();
  const parts: ReactNode[] = [<span key="0x">0x</span>];
  for (let i = 2; i < a.length; i++) {
    if ((i - 2) % 4 === 0) parts.push(" ");
    parts.push(
      a[i] !== b[i] ? (
        <span key={i} style={{ padding: "1px 3px", borderRadius: 3, background: `var(--${tone}-bg)`, color: `var(--${tone})`, fontWeight: 500 }}>{a[i]}</span>
      ) : (
        a[i]
      ),
    );
  }
  return <span className="vx-mono" style={{ fontSize: 16, letterSpacing: "0.04em", whiteSpace: "pre" }}>{parts}</span>;
}
