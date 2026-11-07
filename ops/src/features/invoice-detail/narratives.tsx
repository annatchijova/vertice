"use client";

import Link from "next/link";
import { useState, type ComponentType } from "react";
import { formatAmount, formatBlock, formatDateTime, shortAddr, shortHash } from "@/domain/format";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";
import { REASON_LABEL, type CurrencyState, type Preflight } from "@/domain/preflight";
import { DEPLOYMENTS, OPERATIVE_WALLET, addressUrl, txUrl } from "@/infrastructure/chain/contracts";
import { invoiceProofHref } from "@/features/proof/claim";
import { PayButton } from "@/features/pay/PayButton";
import {
  Actions, AddressDiff, Amount, ArticleHeader, Footer, Mono, MonthsGrid, Note, PathBoxes, PaymentDl, Section, dayMonth, monthName,
} from "./ui";

export type NarrativeProps = {
  pf: Preflight;
  /** estado on-chain de la moneda de la factura */
  st: CurrencyState;
  /** "Caso N de 5 · País" */
  label: string;
  refetch: () => void;
};

const THR = formatAmount(AUTO_EXECUTION_THRESHOLD);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;

const ExtLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer">{children}</a>
);

/* ─────────────────────────── Caso 1 · Andina 1042 · auto, tx real ─────────────────────────── */

function Andina1042({ pf, st, label }: NarrativeProps) {
  const inv = pf.invoice;
  const ex = inv.executed;
  const txHash = ex?.txHash ?? pf.payment?.txHash;
  const block = ex?.blockNumber ?? pf.payment?.blockNumber;
  return (
    <>
      <ArticleHeader
        label={label}
        badges={
          <>
            <span className="vx-badge" style={{ color: "var(--on-inverse)", background: "var(--inverse)" }}>Auto · por política</span>
            <span className="vx-badge vx-badge--verified">Verified</span>
          </>
        }
        title={`Distribuidora Andina ya cobró. Entraba en tu política de pago automático.`}
        lead={`La factura coincide con lo que le venís pagando: misma dirección, mismo pedido y un monto ${pct(pf.pricePct)} sobre el promedio de los últimos tres meses. No hubo nada que necesitara tu firma.`}
      />

      <Section title="Por qué camino fue">
        <PathBoxes active="auto" currency={inv.currency} cap={st.perPaymentCap} />
        <Note>
          {formatAmount(inv.amount)} {inv.currency} está dentro del umbral de {THR} y no tuvo excepciones, así que fue por el camino
          automático, por política. La ejecutó la wallet operativa <Mono>{shortAddr(OPERATIVE_WALLET)}</Mono>. Antes de mover fondos, el
          contrato volvió a chequear la allowlist y el tope de {formatAmount(st.perPaymentCap)} por pago.
        </Note>
      </Section>

      <Section title="Moneda">
        <Note>
          La factura original está en bolivianos (<Mono>{inv.originCurrency}</Mono>), que quedan como referencia. El pago se ejecutó en{" "}
          <Mono>{inv.currency}</Mono> a través del PaymentBatch de <Mono>{inv.currency}</Mono> en Arbitrum One.
        </Note>
      </Section>

      <Section title="El pago">
        <PaymentDl
          rows={[
            ["Transacción", txHash ? <ExtLink href={txUrl(txHash)}>{shortHash(txHash)}</ExtLink> : "—"],
            ["Bloque", block ? `${formatBlock(block)}${ex ? ` · ${formatDateTime(ex.timestamp)}` : ""}` : "—"],
            ["Red", "Arbitrum One"],
            ["Firmante", ex ? <ExtLink href={addressUrl(ex.signer)}>{shortAddr(ex.signer)} · wallet operativa</ExtLink> : shortAddr(OPERATIVE_WALLET)],
            ["Gas", ex ? `${formatBlock(ex.gasUsed)} gas` : "—"],
          ]}
        />
      </Section>

      <Footer row>
        <span className="t-small">Comprobante listo para el proveedor.</span>
        <Actions>
          {txHash && (
            <Link href={invoiceProofHref(inv, txHash, ex?.runId ?? pf.payment?.runId)} className="vx-btn vx-btn--primary">Abrir en PROOF</Link>
          )}
          <Link href="/ops/cierre" className="vx-btn vx-btn--ghost">Ver en el cierre</Link>
        </Actions>
      </Footer>
    </>
  );
}

/* ─────────────────────────── Caso 2 · Andina 1043 · firma en vivo ─────────────────────────── */

function Andina1043({ pf, st, label, refetch }: NarrativeProps) {
  const inv = pf.invoice;
  const [paidTx, setPaidTx] = useState<`0x${string}` | undefined>();
  const txHash = pf.payment?.txHash ?? paidTx;
  const paid = pf.executed || Boolean(paidTx);
  const blocked = !paid && pf.path === "excepcion";
  const months = [...inv.history, { month: monthName(inv.issuedAt), amount: inv.amount, current: true }];

  return (
    <>
      <ArticleHeader
        label={label}
        badges={
          paid ? (
            <>
              <span className="vx-badge" style={{ color: "var(--on-inverse)", background: "var(--inverse)" }}>Firmada por vos</span>
              <span className="vx-badge vx-badge--verified">Verified</span>
            </>
          ) : blocked ? (
            <span className="vx-badge vx-badge--insufficient">{pf.primaryReason ? REASON_LABEL[pf.primaryReason] : "Excepción"}</span>
          ) : (
            <span className="vx-badge vx-badge--pending">Requiere tu firma</span>
          )
        }
        title={
          paid
            ? "Distribuidora Andina ya cobró la 1043. La firmaste vos."
            : "Distribuidora Andina está bien, pero supera lo que puedo pagar por política."
        }
        lead={
          paid
            ? `Pasó los mismos chequeos que antes de firmar y el contrato volvió a validar allowlist y topes al ejecutar. Quedó registrada on-chain con su número de factura.`
            : `Es el pedido trimestral de envases y etiquetas: misma dirección que la 1042 y un monto ${pct(pf.pricePct)} sobre el promedio. Pasa todos los chequeos. Como ${formatAmount(inv.amount)} supera el umbral de ${THR} ${inv.currency}, se paga cuando firmes.`
        }
      />

      <Section title={paid ? "Por qué camino fue" : "Por qué camino va"}>
        <PathBoxes
          active={blocked ? "excepcion" : "firma"}
          currency={inv.currency}
          cap={st.perPaymentCap}
          exception={blocked ? { label: "Excepción", tone: "insufficient", text: "La wallet conectada no tiene saldo suficiente. Una excepción nunca se paga sola." } : undefined}
        />
      </Section>

      <Section title="Lo que comparé">
        <MonthsGrid months={months} />
        <Note>
          Montos en {inv.currency}. La factura original está en bolivianos (<Mono>{inv.originCurrency}</Mono>), que quedan como referencia;
          el pago se ejecuta en <Mono>{inv.currency}</Mono>.
        </Note>
      </Section>

      {paid ? (
        <>
          <Section title="El pago">
            <PaymentDl
              rows={[
                ["Transacción", txHash ? <ExtLink href={txUrl(txHash)}>{shortHash(txHash)}</ExtLink> : "confirmando…"],
                ["Bloque", pf.payment ? formatBlock(pf.payment.blockNumber) : "confirmando…"],
                ["Red", "Arbitrum One"],
                ["Firmante", "vos, con PAGAR"],
              ]}
            />
          </Section>
          <Footer row>
            <span className="t-small">Comprobante listo para el proveedor.</span>
            <Actions>
              {txHash && (
                <Link href={invoiceProofHref(inv, txHash, pf.payment?.runId)} className="vx-btn vx-btn--primary">Abrir en PROOF</Link>
              )}
              <Link href="/ops/cierre" className="vx-btn vx-btn--ghost">Ver en el cierre</Link>
            </Actions>
          </Footer>
        </>
      ) : (
        <Footer>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="vx-label">Requiere tu firma</span>
              <Amount value={inv.amount} unit={inv.currency} />
            </div>
            <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>approve · payBatch · Arbitrum One</span>
          </div>
          {blocked ? (
            <span className="t-small" style={{ color: "var(--ink-700)" }}>
              La wallet tiene {formatAmount(st.balance)} {inv.currency} y hacen falta {formatAmount(inv.amount)}. Conectá una wallet con
              saldo para firmar.
            </span>
          ) : (
            <PayButton
              invoices={[inv]}
              fullWidth
              onPaid={(h) => {
                setPaidTx(h);
                refetch();
              }}
            />
          )}
        </Footer>
      )}
    </>
  );
}

/* ─────────────────────────── Caso 3 · Paulista · BRAt sin fondos ─────────────────────────── */

function Paulista({ pf, st, label }: NarrativeProps) {
  const inv = pf.invoice;
  const brat = DEPLOYMENTS.BRAt;
  const approved = pf.checks.find((c) => c.key === "allowlist")?.status === "pass";
  const noFunds = st.balance < pf.amountUnits;
  const months = [...inv.history, { month: monthName(inv.issuedAt), amount: inv.amount, current: true }];
  const badge = pf.primaryReason ? REASON_LABEL[pf.primaryReason] : "Requiere tu firma";

  return (
    <>
      <ArticleHeader
        label={label}
        badges={<span className={`vx-badge ${pf.path === "excepcion" ? "vx-badge--insufficient" : "vx-badge--pending"}`}>{badge}</span>}
        title="Têxtil Paulista está en orden, pero todavía no hay BRAt para pagarle."
        lead={`Es el pedido mensual de telas: misma dirección de siempre y un monto ${pct(pf.pricePct)} sobre el promedio. Se paga en BRAt, la stablecoin de reales, no en ARGt. Hoy la wallet tiene ${formatAmount(st.balance)} BRAt, así que queda pendiente hasta que se fondee.`}
      />

      <Section title="Qué falta para pagarla">
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li className="t-small">
            <strong>Fondear la wallet con BRAt.</strong> Saldo leído: <Mono>{formatAmount(st.balance)} BRAt</Mono>; hacen falta{" "}
            <Mono>{formatAmount(inv.amount)} BRAt</Mono>. {noFunds ? "Sin eso, el pago no sale." : "Ya alcanza."}
          </li>
          <li className="t-small">
            <strong>Aprobar a Têxtil Paulista en el contrato BRAt.</strong>{" "}
            {approved ? (
              <>Ya está aprobada: <Mono>{shortAddr(inv.payTo.toLowerCase())}</Mono>.</>
            ) : (
              <>
                La allowlist da Fail: <Mono>{shortAddr(inv.payTo.toLowerCase())}</Mono> no está aprobada en el PaymentBatch de BRAt. Aunque
                hubiera fondos, el contrato la rechazaría con <Mono>RecipientNotApproved</Mono>.
              </>
            )}
          </li>
        </ol>
        <Note>
          El PaymentBatch de BRAt está desplegado en Arbitrum One mainnet y se puede verificar en Arbiscan:{" "}
          <ExtLink href={addressUrl(brat.batch)}><Mono>{shortAddr(brat.batch)}</Mono></ExtLink>. Tiene los mismos topes que el de ARGt (
          {formatAmount(st.perPaymentCap)} por pago, {formatAmount(st.batchCap)} por lote). Lo único que falta es el fondeo.
        </Note>
      </Section>

      <Section title="Por qué camino va">
        <PathBoxes
          active={pf.path}
          currency={inv.currency}
          cap={st.perPaymentCap}
          exception={{
            label: badge,
            tone: "insufficient",
            text: "No entra en el lote. Ni la política ni tu firma pueden pagarla sin saldo BRAt en la wallet.",
          }}
        />
      </Section>

      <Section title="Lo que comparé">
        <MonthsGrid months={months} />
        <Note>
          Montos en BRAt. La factura original está en reales (<Mono>{inv.originCurrency}</Mono>), que quedan como referencia; el pago se
          ejecuta en <Mono>BRAt</Mono> a través de su propio PaymentBatch, separado del de ARGt.
        </Note>
      </Section>

      <Footer>
        <span className="t-small">Fuera del lote hasta que la wallet tenga BRAt. El resto de la factura está lista.</span>
        <Actions>
          <a href={addressUrl(brat.batch)} target="_blank" rel="noreferrer" className="vx-btn vx-btn--primary">Ver el contrato BRAt en Arbiscan</a>
          <Link href="/ops" className="vx-btn vx-btn--ghost">Volver al lote</Link>
        </Actions>
      </Footer>
    </>
  );
}

/* ─────────────────────────── Caso 4 · Caribe · tipeo ─────────────────────────── */

function Caribe({ pf, st, label }: NarrativeProps) {
  const inv = pf.invoice;
  const reg = inv.supplier.registeredAddress;
  const typo = pf.typo;
  return (
    <>
      <ArticleHeader
        label={label}
        badges={<span className="vx-badge vx-badge--not-verified">{REASON_LABEL.TYPO}</span>}
        title="La dirección de pago de Logística Caribe tiene un error de tipeo."
        lead={`El resto de la factura está bien: el monto, el número y el ${inv.supplier.taxIdLabel} coinciden con los meses anteriores. Pero si la pagara así, los ${formatAmount(inv.amount)} ${inv.currency} irían a una dirección que nadie usó nunca.`}
      />

      <Section title="Las dos direcciones, carácter por carácter" gap={16}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--canvas)", overflowX: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="vx-label">Dirección registrada del proveedor · 4 pagos previos</span>
            <AddressDiff address={reg} other={inv.payTo} tone="verified" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="vx-label">La factura del {dayMonth(inv.issuedAt)}</span>
            <AddressDiff address={inv.payTo} other={reg} tone="failed" />
          </div>
        </div>
        <Note>
          {typo ? (
            <>
              Cambia un solo carácter, en la posición {typo.position}: un <Mono>{typo.expected}</Mono> por un <Mono>{typo.got}</Mono>.{" "}
            </>
          ) : null}
          Es el patrón típico de alguien que copió la dirección a mano. También es el patrón de una factura adulterada, y desde acá no puedo
          distinguir uno de otro.
        </Note>
      </Section>

      <Section title="Por qué camino va">
        <PathBoxes
          active="excepcion"
          currency={inv.currency}
          cap={st.perPaymentCap}
          autoText={`${formatAmount(inv.amount)} no entra en el umbral de ${THR}, y una excepción nunca se paga sola.`}
          firmaText={`Por monto iría a tu firma, pero el tipeo la saca del lote.`}
          exception={{
            label: "Excepción · bloqueada",
            tone: "failed",
            text: (
              <>
                No entra en el lote. Ni la política ni tu firma pueden pagarla: el contrato la rechazaría con <Mono>RecipientNotApproved</Mono>.
              </>
            ),
          }}
        />
        <Note>
          No corrijo la dirección por mi cuenta. Lo seguro es pedirle a Logística Caribe una factura corregida y confirmar la dirección por un
          canal distinto del mail. La factura está en pesos colombianos (<Mono>{inv.originCurrency}</Mono>); cuando se pague, será en{" "}
          <Mono>{inv.currency}</Mono>.
        </Note>
      </Section>

      <Footer>
        <span className="t-small">Queda fuera del lote. Pasa al próximo período cuando llegue la factura corregida.</span>
        <Actions>
          <button type="button" className="vx-btn vx-btn--primary">Pedir factura corregida</button>
          <button type="button" className="vx-btn vx-btn--ghost">Confirmar por teléfono</button>
          <button type="button" className="vx-btn vx-btn--ghost" style={{ borderColor: "transparent" }}>Ver los 4 pagos anteriores</button>
        </Actions>
      </Footer>
    </>
  );
}

/* ─────────────────────────── Caso 5 · Bajío · precio + tope ─────────────────────────── */

const ALTERNATIVES = [
  { name: "Cajas Monterrey", country: "México", currency: "MXN", known: "Sí · 6 pagos", quote: "940.00", best: true },
  { name: "Embalagens Sul", country: "Brasil", currency: "BRL", known: undefined, quote: "980.00" },
];

function Bajio({ pf, st, label }: NarrativeProps) {
  const inv = pf.invoice;
  const cap = st.perPaymentCap;
  const overCap = pf.amountUnits > cap;
  const notApproved = pf.reasons.includes("RECIPIENT_NOT_APPROVED");
  const bars = [
    ...inv.history.map((h) => ({ month: h.month, amount: Number(h.amount), current: false })),
    { month: monthName(inv.issuedAt), amount: Number(inv.amount), current: true },
  ];
  const max = Math.max(...bars.map((b) => b.amount));
  const best = ALTERNATIVES[0];
  const saving = Number(inv.amount) - Number(best.quote);
  const int = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);

  return (
    <>
      <ArticleHeader
        label={label}
        badges={<span className="vx-badge vx-badge--insufficient">Revisar · {pct(pf.pricePct)}</span>}
        title={`Empaques del Bajío te cobra ${pf.pricePct}% más por el mismo trabajo. Te sugiero cambiar de proveedor.`}
        lead={
          <>
            {inv.concept} te costaron en promedio {formatAmount(pf.average)} {inv.currency} los últimos tres meses; esta factura pide{" "}
            {formatAmount(inv.amount)}.
            {overCap ? (
              <>
                {" "}Y hay un segundo problema: supera el tope de {formatAmount(cap)} por pago del contrato, así que aunque decidas pagarla, así
                como está no pasa.
              </>
            ) : null}
          </>
        }
      />

      <Section title="Lo que le pagaste a Empaques del Bajío" gap={16}>
        <figure
          role="img"
          aria-label={bars.map((b) => `${b.month} ${int(b.amount)}`).join(", ") + ` ${inv.currency}`}
          style={{ margin: 0, display: "grid", gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 16, alignItems: "end", height: 220, padding: "16px 20px 0", borderBottom: "1px solid var(--line-strong)" }}
        >
          {bars.map((b) => (
            <div key={b.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span className="vx-mono" style={{ fontSize: 12, color: b.current ? "var(--insufficient)" : "var(--ink-700)", fontWeight: b.current ? 500 : undefined }}>{int(b.amount)}</span>
              <div style={{ width: "100%", maxWidth: 72, height: Math.round((b.amount / max) * 160), background: b.current ? "var(--insufficient)" : "var(--sunken)", borderRadius: "4px 4px 0 0" }} />
            </div>
          ))}
        </figure>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 16, padding: "0 20px", marginTop: -8 }}>
          {bars.map((b) => (
            <span key={b.month} className="vx-label" style={{ textAlign: "center", color: b.current ? "var(--ink-900)" : undefined }}>{b.month.slice(0, 3)}</span>
          ))}
        </div>
        <Note>
          Montos en {inv.currency}. La factura original está en pesos mexicanos (<Mono>{inv.originCurrency}</Mono>), que quedan como
          referencia; el pago se ejecuta en <Mono>{inv.currency}</Mono>. La factura no menciona un cambio de cantidad ni de material.
        </Note>
      </Section>

      <Section title="Otros proveedores para el mismo trabajo">
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--canvas)" }}>
                <th scope="col" className="vx-label" style={{ textAlign: "left", padding: "12px 16px", fontWeight: 500 }}>Proveedor</th>
                <th scope="col" className="vx-label" style={{ textAlign: "left", padding: "12px 16px", fontWeight: 500 }}>Origen</th>
                <th scope="col" className="vx-label" style={{ textAlign: "left", padding: "12px 16px", fontWeight: 500 }}>Ya trabajaste con él</th>
                <th scope="col" className="vx-label" style={{ textAlign: "right", padding: "12px 16px", fontWeight: 500 }}>Cotiza en {inv.currency}</th>
              </tr>
            </thead>
            <tbody>
              {ALTERNATIVES.map((a) => (
                <tr key={a.name} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="t-small" style={{ padding: "14px 16px", fontWeight: a.best ? 500 : undefined }}>{a.name}</td>
                  <td className="t-small" style={{ padding: "14px 16px", color: "var(--ink-700)" }}>
                    {a.country} · <span className="vx-mono" style={{ fontSize: 12 }}>{a.currency}</span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {a.known ? <span className="vx-badge vx-badge--verified">{a.known}</span> : <span className="vx-badge vx-badge--pending">No</span>}
                  </td>
                  <td className="vx-mono" style={{ padding: "14px 16px", textAlign: "right", fontWeight: a.best ? 500 : undefined }}>{formatAmount(a.quote)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--line)", color: "var(--ink-500)" }}>
                <td className="t-small" style={{ padding: "14px 16px" }}>Empaques del Bajío · actual</td>
                <td className="t-small" style={{ padding: "14px 16px" }}>
                  {inv.supplier.country} · <span className="vx-mono" style={{ fontSize: 12 }}>{inv.originCurrency}</span>
                </td>
                <td style={{ padding: "14px 16px" }}><span className="vx-badge vx-badge--verified">Sí · {inv.history.length} pagos</span></td>
                <td className="vx-mono" style={{ padding: "14px 16px", textAlign: "right", color: "var(--insufficient)" }}>{formatAmount(inv.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Note>
          Con {best.name}, a quien ya le pagaste antes, ahorrás <Mono>{formatAmount(saving)} {inv.currency}</Mono> este mes, y{" "}
          {formatAmount(best.quote)} entra en el tope del contrato. Antes del primer pago on-chain habría que aprobar su dirección en el
          PaymentBatch.
        </Note>
      </Section>

      <Section title="Por qué camino va">
        <PathBoxes
          active="excepcion"
          currency={inv.currency}
          cap={cap}
          autoText={`No aplica: supera el umbral de ${THR} y tiene una alerta de precio.`}
          firmaText={overCap ? `No aplica: ${formatAmount(inv.amount)} supera el tope de ${formatAmount(cap)} del contrato.` : undefined}
          exception={{
            label: "Excepción · tu decisión",
            tone: "insufficient",
            text: overCap ? (
              <>
                Queda fuera del total a firmar. Aunque decidas pagarla, el contrato la revertiría con <Mono>ExceedsPerPaymentCap</Mono>: hace
                falta una factura de hasta {formatAmount(cap)}.
              </>
            ) : (
              "Queda fuera del total a firmar hasta que decidas."
            ),
          }}
        />
        {notApproved ? (
          <Note>
            Además, <Mono>{shortAddr(inv.payTo.toLowerCase())}</Mono> no está aprobada en el PaymentBatch de {inv.currency}: también la
            rechazaría con <Mono>RecipientNotApproved</Mono>.
          </Note>
        ) : null}
      </Section>

      <Footer>
        <span className="t-small">Fuera del lote hasta que decidas. Así como está, no se puede pagar.</span>
        <Actions>
          <button type="button" className="vx-btn vx-btn--primary">Pedir cotización a {best.name}</button>
          <button type="button" className="vx-btn vx-btn--ghost">Pedir explicación del aumento</button>
        </Actions>
      </Footer>
    </>
  );
}

export const NARRATIVES: Record<string, ComponentType<NarrativeProps>> = {
  "andina-1042": Andina1042,
  "andina-1043": Andina1043,
  "paulista-482115": Paulista,
  "caribe-00915": Caribe,
  "bajio-3318": Bajio,
};
