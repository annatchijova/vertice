"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress } from "viem";
import { OpsHeader } from "@/components/OpsHeader";
import { proofHref, isTxHash, type ClaimParams } from "./claim";

const REAL_TX = "0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc";

type Field = { key: keyof ClaimParams; label: string; hint: string; valid: (v: string) => boolean };
const bytes32 = (v: string) => isTxHash(v);
const FIELDS: Field[] = [
  { key: "recipient", label: "Destinatario", hint: "La dirección que dice haber cobrado.", valid: (v) => isAddress(v, { strict: false }) },
  { key: "amount", label: "Monto", hint: "En ARGt o BRAt, ej. 500 o 1250,50.", valid: (v) => /^\d+([.,]\d{1,18})?$/.test(v) },
  { key: "invoiceRef", label: "Factura (invoiceRef)", hint: "0x + 64 hex, del comprobante.", valid: bytes32 },
  { key: "runId", label: "Lote (runId)", hint: "0x + 64 hex, del comprobante.", valid: bytes32 },
  { key: "sender", label: "Remitente", hint: "La wallet que pagó.", valid: (v) => isAddress(v, { strict: false }) },
  { key: "token", label: "Token", hint: "Dirección del contrato del token.", valid: (v) => isAddress(v, { strict: false }) },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)",
  background: "var(--surface)", color: "var(--ink-900)", font: "400 14px/1.4 var(--font-mono)",
};

export function ProofIntake() {
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [claim, setClaim] = useState<ClaimParams>({});
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = hash.trim();
    if (!isTxHash(h)) return setError("El hash es 0x seguido de 64 caracteres hexadecimales.");
    const bad = FIELDS.filter((f) => claim[f.key]?.trim() && !f.valid(claim[f.key]!.trim())).map((f) => f.label);
    if (bad.length) return setError(`Revisá: ${bad.join(", ")}. Si no lo sabés, dejalo vacío.`);
    setError(null);
    const clean = Object.fromEntries(Object.entries(claim).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v)) as ClaimParams;
    router.push(proofHref(h.toLowerCase(), clean));
  };

  return (
    <div className="vx-root vx-desk" data-theme="dark" style={{ minHeight: "100vh", padding: "0 0 96px" }}>
      <OpsHeader product="PROOF" />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 32px 0" }} className="proof-layout">
        <form
          onSubmit={submit}
          noValidate
          className="vx-paper"
          data-theme="light"
          style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="vx-label">Verificar un pago</span>
            <h1 className="vx-serif" style={{ margin: 0, fontSize: 36, lineHeight: 1.15, fontWeight: 400 }}>
              Pegá el hash del pago y lo comprobamos contra Arbitrum One.
            </h1>
            <p className="t-body" style={{ margin: 0, color: "var(--ink-700)" }}>
              Tu navegador lee la transacción y su receipt directo de la cadena y compara lo que afirma el comprobante. Nada pasa por un servidor nuestro.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="tx" className="vx-label" style={{ fontSize: 11 }}>Hash de la transacción</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <input
                id="tx" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false}
                aria-invalid={error ? true : undefined} style={{ ...inputStyle, flex: "1 1 360px", width: "auto" }}
              />
              <button type="submit" className="vx-btn vx-btn--primary">Verificar pago</button>
            </div>
            <button
              type="button" onClick={() => setHash(REAL_TX)} className="t-small"
              style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, color: "var(--ink-500)", textDecoration: "underline", cursor: "pointer" }}
            >
              Usar el pago real de Distribuidora Andina (500,00 ARGt)
            </button>
          </div>

          <details>
            <summary className="t-small" style={{ cursor: "pointer", color: "var(--ink-700)", fontWeight: 500 }}>
              Agregar lo que afirma el comprobante (opcional)
            </summary>
            <p className="t-small" style={{ margin: "8px 0 16px", color: "var(--ink-500)" }}>
              Cada campo que completes se compara con la cadena. Lo que dejes vacío queda ABSTAIN: no se verifica, pero tampoco bloquea el veredicto.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
              {FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <label htmlFor={`c-${f.key}`} className="vx-label" style={{ fontSize: 11 }}>{f.label}</label>
                  <input
                    id={`c-${f.key}`} value={claim[f.key] ?? ""} onChange={(e) => setClaim({ ...claim, [f.key]: e.target.value })}
                    autoComplete="off" spellCheck={false} style={inputStyle}
                  />
                  <span className="t-small" style={{ color: "var(--ink-500)", fontSize: 12 }}>{f.hint}</span>
                </div>
              ))}
            </div>
          </details>

          {error && <p role="alert" className="t-small" style={{ margin: 0, color: "var(--failed)" }}>{error}</p>}

          <hr className="vx-paper__rule" style={{ margin: 0, borderTopStyle: "dashed", borderColor: "var(--line-strong)" }} />
          <p className="t-small" style={{ margin: 0, color: "var(--ink-500)" }}>
            ¿Venís de OPS? Los comprobantes pagados ya traen el link armado. <Link href="/ops">Ir a OPS</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
