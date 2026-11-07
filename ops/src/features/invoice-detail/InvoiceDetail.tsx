"use client";

import { getInvoice, TOTAL_CASES } from "@/data/invoices";
import { formatBlock } from "@/domain/format";
import { preflight } from "@/domain/preflight";
import { useChainSnapshot } from "@/infrastructure/chain/useChainSnapshot";
import { CheckList, InvoiceCard } from "./ui";
import { NARRATIVES, type NarrativeProps } from "./narratives";

/**
 * Detalle de una factura: aside (la factura + lo que chequeé) leído del preflight en vivo,
 * y un artículo con la narrativa escrita a mano para cada caso.
 */
export function InvoiceDetail({ id }: { id: string }) {
  const invoice = getInvoice(id);
  const { snapshot, isLive, refetch } = useChainSnapshot();
  if (!invoice) return null;

  const pf = preflight(invoice, snapshot);
  const st = snapshot.currencies[invoice.currency];
  const Narrative = NARRATIVES[invoice.id];
  const props: NarrativeProps = {
    pf,
    st,
    label: `Caso ${invoice.caseNumber} de ${TOTAL_CASES} · ${invoice.supplier.country}`,
    refetch: () => void refetch(),
  };

  const amountLabel = pf.executed ? "Se pagó en" : pf.path === "excepcion" ? "Se pagaría en" : "Se paga en";

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 32px 96px", display: "flex", flexWrap: "wrap", gap: 48, alignItems: "flex-start" }}>
      <aside style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
        <InvoiceCard invoice={invoice} amountLabel={amountLabel} payToFailed={Boolean(pf.typo)} />
        <span className="vx-label">Lo que chequeé</span>
        <CheckList checks={pf.checks} />
        <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
          {isLive ? `Leído en vivo · bloque ${formatBlock(snapshot.blockNumber)}` : `Snapshot del bloque ${formatBlock(snapshot.blockNumber)} · RPC no disponible`}
        </span>
      </aside>

      <article
        style={{
          flex: "999 1 560px", minWidth: 0, maxWidth: 760, background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: "var(--radius-md)", padding: "clamp(28px, 5vw, 64px)", display: "flex", flexDirection: "column", gap: 36,
        }}
      >
        {Narrative ? <Narrative {...props} /> : null}
      </article>
    </div>
  );
}
