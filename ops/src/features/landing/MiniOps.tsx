import Link from "next/link";
import { INVOICES } from "@/data/invoices";
import { formatAmount } from "@/domain/format";
import { supplierName } from "@/features/dashboard/model";
import { TurnPrensaButton } from "./figures/TurnPrensaButton";

/** Three cases of the 07/11 batch, one per path: firma, auto, frenada. */
const ROWS = [
  { id: "andina-1043", label: "Para firmar", tone: "sign" },
  { id: "andina-1042", label: "Pagada sola", tone: "ok" },
  { id: "caribe-00915", label: "Frenada · dirección distinta", tone: "stop" },
] as const;

const byId = (id: string) => {
  const inv = INVOICES.find((i) => i.id === id);
  if (!inv) throw new Error(`landing: missing invoice fixture ${id}`);
  return inv;
};

export function MiniOps() {
  const rows = ROWS.map((r) => ({ ...r, invoice: byId(r.id) }));
  const toSign = rows[0].invoice;

  return (
    <div className="lp-mini" role="group" aria-label="Ejemplo del panel OPS">
      <div className="lp-mini__head">
        <span className="lp-tag">Lote del 07/11 · ejemplo</span>
        <Link className="lp-mini__url" href="/ops">/ops</Link>
      </div>
      <ul className="lp-mini__rows">
        {rows.map(({ id, label, tone, invoice }) => (
          <li key={id}>
            <Link className="lp-mini__row" href={`/ops/facturas/${id}`}>
              <span className="lp-mini__who">
                {supplierName(invoice)}
                <small>{invoice.number}</small>
              </span>
              <span className="lp-mini__amt">
                {formatAmount(invoice.amount)} <i>{invoice.currency}</i>
              </span>
              <span className={`lp-mini__st lp-mini__st--${tone}`}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="lp-mini__foot">
        <span className="lp-mini__sum">1 para firmar · 1 pagada · 1 frenada</span>
        <TurnPrensaButton>
          Pagar {formatAmount(toSign.amount)} {toSign.currency}
        </TurnPrensaButton>
      </div>
    </div>
  );
}
