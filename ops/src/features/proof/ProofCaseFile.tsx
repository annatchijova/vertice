"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { OpsHeader } from "@/components/OpsHeader";
import { formatAmount, formatBlock, formatDateTimeLong, midHash, shortAddr } from "@/domain/format";
import { ASSURANCE_LADDER, type Check, type CheckId, type CheckStatus, type Claim, type Verdict } from "@/domain/proof/verifier";
import { addressUrl, txUrl } from "@/infrastructure/chain/contracts";
import type { AcquiredEvidence, RegistryReceipt } from "@/infrastructure/chain/proofEvidence";
import { parseClaim, proofHref, type ClaimParams } from "./claim";
import { useProof, type ProofResult } from "./useProof";

const CHECK_NAME: Record<CheckId, string> = {
  CHAIN_ID: "Red",
  TRANSACTION_HASH: "Transacción",
  EXECUTION: "Ejecución",
  RUN_ID: "Lote (runId)",
  INVOICE_REF: "Factura (invoiceRef)",
  ORDER_BINDING: "Vínculo de orden",
  TOKEN: "Token",
  SENDER: "Remitente",
  RECIPIENT: "Destinatario",
  AMOUNT: "Monto",
};

/** Cómo se nombra cada afirmación en el párrafo de resumen. */
const CLAIM_NOUN: Partial<Record<CheckId, string>> = {
  RUN_ID: "lote",
  INVOICE_REF: "factura",
  TOKEN: "token",
  SENDER: "remitente",
  RECIPIENT: "destinatario",
  AMOUNT: "monto",
};

const STAMP: Record<Verdict, { cls: string; label: string }> = {
  VERIFIED: { cls: "vx-stamp--verified", label: "Verified" },
  NOT_VERIFIED: { cls: "vx-stamp--not-verified", label: "Not verified" },
  INSUFFICIENT_EVIDENCE: { cls: "vx-stamp--insufficient", label: "Insufficient evidence" },
};

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

/* ───────────────────────────── piezas ───────────────────────────── */

function CheckIcon({ status }: { status: CheckStatus }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, "aria-hidden": true };
  if (status === "PASS") return <svg {...common} strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>;
  if (status === "FAIL") return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
  return <svg {...common}><path d="M6 12h12" /></svg>;
}

function CheckRow({ check, detail }: { check: Check; detail: string }) {
  const tone = check.status === "PASS" ? "pass" : check.status === "FAIL" ? "fail" : "abstain";
  return (
    <li className={`vx-check vx-check--${tone}`}>
      <span className="vx-check__icon"><CheckIcon status={check.status} /></span>
      <div className="vx-check__body">
        <span className="vx-check__name">{CHECK_NAME[check.id]}</span>
        <span className="vx-check__detail">{detail}</span>
      </div>
      <span className="vx-check__result">{check.status === "PASS" ? "Pass" : check.status === "FAIL" ? "Fail" : "Abstain"}</span>
    </li>
  );
}

function checkDetail(id: CheckId, status: CheckStatus, claim: Claim, a: AcquiredEvidence): string {
  const ev = a.evidence;
  const amount = (v: bigint) => `${formatAmount(v)} ${a.currency}`;
  const pair = (asserted: string, observed: string) =>
    status === "FAIL" ? `afirmado ${asserted} · en la cadena ${observed}` : status === "ABSTAIN" ? `no afirmado · se observó ${observed}` : observed;
  switch (id) {
    case "CHAIN_ID": return `chainId ${ev.chainId}`;
    case "TRANSACTION_HASH": return status === "PASS" ? "hash encontrado" : "el hash no coincide";
    case "EXECUTION": return ev.successful ? "status 1" : "status 0 · la transacción revirtió";
    case "RUN_ID": return pair(claim.runId ? midHash(claim.runId) : "", midHash(ev.paymentExecutedRunId));
    case "INVOICE_REF": return pair(claim.invoiceRef ? midHash(claim.invoiceRef) : "", midHash(ev.paymentExecutedInvoiceRef));
    case "ORDER_BINDING": return status === "PASS" ? "PaymentExecuted = Transfer" : "PaymentExecuted ≠ Transfer";
    case "TOKEN": return pair(claim.token ? shortAddr(claim.token) : "", status === "ABSTAIN" ? a.currency : `${a.currency} ${shortAddr(ev.transferToken)}`);
    case "SENDER": return pair(claim.sender ? midHash(claim.sender) : "", midHash(ev.transferSender));
    case "RECIPIENT": return pair(claim.recipient ? midHash(claim.recipient) : "", midHash(ev.transferRecipient));
    case "AMOUNT": return pair(claim.amount !== undefined ? amount(claim.amount) : "", amount(ev.transferAmount));
  }
}

function summary(verdict: Verdict, checks: Check[]): string {
  const by = (s: CheckStatus) => checks.filter((c) => c.status === s && CLAIM_NOUN[c.id]).map((c) => CLAIM_NOUN[c.id]!);
  if (verdict === "NOT_VERIFIED") {
    const failed = checks.filter((c) => c.status === "FAIL").map((c) => CHECK_NAME[c.id].toLowerCase());
    return `La cadena contradice lo afirmado. No coincide: ${listJoin(failed)}. No uses este comprobante como prueba de pago.`;
  }
  const backed = by("PASS");
  const abstain = by("ABSTAIN");
  return [
    "El pago existe y se ejecutó en Arbitrum One.",
    backed.length ? `La cadena respalda ${listJoin(backed)}.` : "No se afirmó ningún dato del pago: solo se comprobó que existe y que el lote coincide con el Transfer.",
    backed.length && abstain.length ? `No se ${abstain.length === 1 ? "afirmó" : "afirmaron"} ${listJoin(abstain)}.` : "",
  ].filter(Boolean).join(" ");
}

function Dl({ rows }: { rows: [string, React.ReactNode, { mono?: boolean; full?: boolean }?][] }) {
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px 32px" }}>
      {rows.map(([k, v, o]) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, gridColumn: o?.full ? "1 / -1" : undefined }}>
          <dt className="vx-label" style={{ fontSize: 11 }}>{k}</dt>
          <dd className={o?.mono ? "vx-mono" : undefined} style={{ margin: 0, fontSize: o?.full ? 14 : undefined, overflowWrap: "anywhere" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const Rule = () => <hr className="vx-paper__rule" style={{ margin: 0, borderTopStyle: "dashed", borderColor: "var(--line-strong)" }} />;

function Actions({ txHash, onReverify, busy }: { txHash: Hex; onReverify: () => void; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const btn = { borderRadius: "var(--radius-sm)" };
  return (
    <div className="proof-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" className="vx-btn vx-btn--primary vx-btn--sm" style={btn} onClick={onReverify} disabled={busy}>
        {busy ? "Reverificando…" : "Reverificar"}
      </button>
      <button
        type="button"
        className="vx-btn vx-btn--ghost vx-btn--sm"
        style={btn}
        onClick={() => {
          void navigator.clipboard?.writeText(window.location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Link copiado" : "Copiar link a este chequeo"}
      </button>
      <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" style={btn} onClick={() => window.print()}>Imprimir o guardar PDF</button>
      <a href={txUrl(txHash)} target="_blank" rel="noreferrer" className="vx-btn vx-btn--ghost vx-btn--sm" style={btn}>Ver en Arbiscan ↗</a>
    </div>
  );
}

function Ladder() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="vx-label">Escalera de garantía</span>
        <p className="t-small" style={{ margin: 0, color: "var(--ink-700)" }}>
          Qué tan fuerte está autenticada la evidencia. Solo se encienden los peldaños que esta versión puede alcanzar.
        </p>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
        {ASSURANCE_LADDER.map((s) => (
          <li key={s.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 14, paddingBottom: 20 }}>
            <span
              aria-hidden="true"
              style={{
                width: 16, height: 16, marginTop: 2, borderRadius: 3,
                ...(s.reached ? { background: "var(--verified)" } : { border: "1.5px dashed var(--ink-400)" }),
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="vx-mono" style={{ fontSize: 13, color: s.reached ? "var(--verified)" : "var(--ink-500)" }}>{s.id}</span>
              <span className="t-small" style={{ color: s.reached ? "var(--ink-700)" : "var(--ink-500)" }}>
                {s.reached
                  ? "alcanzado por este chequeo"
                  : s.id === "RECENT_BLOCKHASH_PROOF"
                    ? "planificado, no alcanzado · la respuesta del verificador tendría que estar autenticada"
                    : "planificado, no alcanzado"}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="t-small" style={{ margin: 0, color: "var(--ink-700)", borderLeft: "2px solid var(--line-strong)", paddingLeft: 12 }}>
        <span className="vx-mono" style={{ color: "var(--ink-900)" }}>RPC_ATTESTED</span> quiere decir que un RPC público de Arbitrum One
        devolvió estos datos y que son consistentes entre sí. No es una prueba de inclusión: no hay prueba Merkle contra un bloque
        autenticado, así que un RPC que mienta podría engañar a este chequeo.
      </p>
    </>
  );
}

function RegistryBlock({ registry }: { registry: RegistryReceipt | null | "unreadable" }) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="vx-label">Recibo en PaymentReceiptRegistry</span>
      {registry === "unreadable" ? (
        <span className="t-small" style={{ color: "var(--ink-500)" }}>No se pudo leer el registry. Reverificá en unos segundos.</span>
      ) : registry === null ? (
        <span className="t-small" style={{ color: "var(--ink-700)" }}>
          Todavía no hay un recibo publicado para este lote y esta factura. El veredicto de arriba lo calculó tu navegador, no el registry.
        </span>
      ) : (
        <>
          <span className={`vx-badge vx-badge--${registry.verdict === "VERIFIED" ? "verified" : registry.verdict === "NOT_VERIFIED" ? "not-verified" : "insufficient"}`} style={{ alignSelf: "flex-start" }}>
            {STAMP[registry.verdict].label}
          </span>
          <span className="t-small" style={{ color: "var(--ink-700)" }}>
            Publicado el {formatDateTimeLong(registry.recordedAt)} por{" "}
            <a href={addressUrl(registry.publisher)} target="_blank" rel="noreferrer" className="vx-mono">{shortAddr(registry.publisher)}</a>.{" "}
            {registry.checks.filter((c) => c === "PASS").length} PASS · {registry.checks.filter((c) => c === "FAIL").length} FAIL ·{" "}
            {registry.checks.filter((c) => c === "ABSTAIN").length} ABSTAIN.
          </span>
          <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>receiptId {midHash(registry.receiptId)}</span>
        </>
      )}
    </div>
  );
}

function Contracts({ a }: { a?: AcquiredEvidence }) {
  const rows = a
    ? [["PaymentBatch", a.batch], [a.currency, a.token], ["Registry", a.registry]]
    : [];
  if (!rows.length) return null;
  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="vx-label">Contratos</span>
      {rows.map(([k, v]) => (
        <a key={k} href={addressUrl(v)} target="_blank" rel="noreferrer" className="vx-mono" style={{ fontSize: 12, color: "var(--ink-700)" }}>
          {k} {shortAddr(v)}
        </a>
      ))}
    </div>
  );
}

/* ───────────────────────────── estados ───────────────────────────── */

function Verdict({ verdict, sub, children }: { verdict: Verdict; sub?: string; children: React.ReactNode }) {
  const s = STAMP[verdict];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 32 }}>
      <span key={verdict + (sub ?? "")} className={`vx-stamp ${s.cls}`} style={{ fontSize: verdict === "INSUFFICIENT_EVIDENCE" ? 26 : 40, padding: "18px 28px 14px" }}>
        {s.label}
        {sub && <span className="vx-stamp__sub" style={{ fontSize: 11 }}>{sub}</span>}
      </span>
      <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Evaluated({ r, claim, txHash }: { r: Extract<ProofResult, { kind: "evaluated" }>; claim: Claim; txHash: Hex }) {
  const { evaluation, acquired: a } = r;
  const ev = a.evidence;
  const checks = evaluation.checks;
  const fails = checks.filter((c) => c.status === "FAIL").length;
  const isSelected = a.batchPayments.length > 1;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span className="vx-label">Case file · comprobante de pago</span>
        <Dl
          rows={[
            ["Transacción", txHash, { mono: true, full: true }],
            ["Red", <>Arbitrum One <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>({ev.chainId.toString()})</span></>],
            ["Bloque", formatBlock(ev.blockNumber), { mono: true }],
            ["Ejecutada", formatDateTimeLong(a.timestamp), { mono: true }],
          ]}
        />
      </div>

      <Rule />

      <Verdict verdict={evaluation.verdict} sub={checks.length ? `${checks.length} checks · ${fails} FAIL` : undefined}>
        {ev.successful && (
          <span className="vx-amount">
            <span className="vx-amount__value">{formatAmount(ev.transferAmount)}</span>
            <span className="vx-amount__unit">{a.currency}</span>
          </span>
        )}
        <p className="t-body" style={{ margin: 0, color: "var(--ink-700)" }}>
          {evaluation.verdict === "INSUFFICIENT_EVIDENCE"
            ? `La transacción todavía no llegó a ${ev.requiredConfirmations} confirmación. Reverificá en unos segundos.`
            : summary(evaluation.verdict, checks)}
        </p>
        <span className="t-small" style={{ color: "var(--ink-500)" }}>
          Nivel de evidencia: <span className="vx-mono" style={{ color: "var(--ink-900)" }}>RPC_ATTESTED</span> (leído del RPC, sin autenticación independiente)
        </span>
      </Verdict>

      {checks.length > 0 && (
        <ul className="vx-checks" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 8 }}>
          {checks.map((c) => <CheckRow key={c.id} check={c} detail={checkDetail(c.id, c.status, claim, a)} />)}
        </ul>
      )}

      {ev.successful && (
        <>
          <Rule />
          <Dl
            rows={[
              ["Remitente", <a href={addressUrl(ev.transferSender)} target="_blank" rel="noreferrer">{midHash(ev.transferSender)}</a>, { mono: true }],
              ["Destinatario", <a href={addressUrl(ev.transferRecipient)} target="_blank" rel="noreferrer">{midHash(ev.transferRecipient)}</a>, { mono: true }],
              ["Monto", `${formatAmount(ev.transferAmount)} ${a.currency}`, { mono: true }],
              ["Lote (runId)", ev.paymentExecutedRunId, { mono: true, full: true }],
              ["Factura (invoiceRef)", ev.paymentExecutedInvoiceRef, { mono: true, full: true }],
            ]}
          />
          {isSelected && (
            <p className="t-small" style={{ margin: 0, color: "var(--ink-500)" }}>
              Esta transacción paga {a.batchPayments.length} facturas del mismo lote. Este expediente es el de la factura de arriba.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Insufficient({ r, txHash, params }: { r: Extract<ProofResult, { kind: "insufficient" }>; txHash: Hex; params: ClaimParams }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span className="vx-label">Case file · comprobante de pago</span>
        <Dl rows={[["Transacción", txHash, { mono: true, full: true }], ["Red", "Arbitrum One (42161)"]]} />
      </div>
      <Rule />
      <Verdict verdict="INSUFFICIENT_EVIDENCE" sub="0 checks evaluados">
        <p className="t-body" style={{ margin: 0, color: "var(--ink-700)" }}>{r.reason}</p>
        <span className="t-small" style={{ color: "var(--ink-500)" }}>
          Sin evidencia legible no se compara nada. No quiere decir que el pago sea falso: quiere decir que esta lectura no lo puede respaldar. Consultado el {formatDateTimeLong(r.observedAt)}.
        </span>
      </Verdict>
      {r.payments && (
        <ul className="vx-checks">
          {r.payments.map((p) => (
            <li key={p.invoiceRef} className="vx-check vx-check--abstain">
              <span className="vx-check__icon"><CheckIcon status="ABSTAIN" /></span>
              <div className="vx-check__body">
                <span className="vx-check__name">{formatAmount(p.amount)} a {shortAddr(p.recipient)}</span>
                <span className="vx-check__detail">invoiceRef {midHash(p.invoiceRef)}</span>
              </div>
              <Link className="vx-btn vx-btn--ghost vx-btn--sm" href={proofHref(txHash, { ...params, invoiceRef: p.invoiceRef })}>Verificar esta</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ───────────────────────────── página ───────────────────────────── */

export function ProofCaseFile({ txHash, params }: { txHash: Hex; params: ClaimParams }) {
  const { claim, errors: claimErrors } = useMemo(() => parseClaim(txHash, params), [txHash, params]);
  const q = useProof(txHash, claim);
  const r = q.data;
  const busy = q.isFetching;

  return (
    <div className="vx-root vx-desk proof-desk" data-theme="dark" style={{ minHeight: "100vh", padding: "0 0 96px" }}>
      <OpsHeader product="PROOF" right={<Link href="/proof" className="vx-btn vx-btn--ghost vx-btn--sm">Verificar otro pago</Link>} />

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 32px 0", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }} className="proof-layout">
        <article
          className="vx-paper"
          data-theme="light"
          aria-busy={busy}
          style={{ flex: "999 1 620px", minWidth: 0, maxWidth: 840, margin: 0, display: "flex", flexDirection: "column", gap: 28 }}
        >
          {!r ? (
            <>
              <span className="vx-label">Case file · comprobante de pago</span>
              <Dl rows={[["Transacción", txHash, { mono: true, full: true }]]} />
              <Rule />
              <p className="t-body" style={{ margin: 0, color: "var(--ink-700)" }}>Leyendo la transacción y su receipt en Arbitrum One…</p>
            </>
          ) : r.kind === "evaluated" ? (
            <Evaluated r={r} claim={claim} txHash={txHash} />
          ) : (
            <Insufficient r={r} txHash={txHash} params={params} />
          )}

          {claimErrors.length > 0 && (
            <p className="t-small" style={{ margin: 0, color: "var(--insufficient)" }}>
              Ignoré lo que vino mal formado en el link ({claimErrors.join(", ")}): esos campos no se afirmaron.
            </p>
          )}

          <Rule />
          <Actions txHash={txHash} onReverify={() => void q.refetch()} busy={busy} />
        </article>

        <aside style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
          <Ladder />
          {r?.kind === "evaluated" && r.acquired.evidence.successful && <RegistryBlock registry={r.registry} />}
          <Contracts a={r?.kind === "evaluated" ? r.acquired : undefined} />
          {r?.kind === "evaluated" && (
            <span className="t-small" style={{ color: "var(--ink-500)" }}>
              Leído del RPC el {formatDateTimeLong(r.acquired.observedAt)} · {formatBlock(r.acquired.evidence.observedConfirmations)} confirmaciones.
            </span>
          )}
        </aside>
      </div>
    </div>
  );
}
