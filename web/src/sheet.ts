import { el, replaceChildren } from "./ui.js";
import { EXPLORER_TX_URL } from "./chain.js";
import type { CheckResult, Verdict } from "./verify.js";

export type Sheet = {
  element: HTMLElement;
  update(result: CheckResult): void;
};

const STAMP: Record<Verdict, string> = {
  VERIFIED: "Verificado",
  NOT_VERIFIED: "No verificado",
  INSUFFICIENT_EVIDENCE: "Evidencia insuficiente",
};

const GLYPH: Record<string, string> = { PASS: "✓", FAIL: "✕", ABSTAIN: "–" };
const NAME: Record<string, string> = {
  chainId: "Red",
  transactionHash: "Transacción",
  execution: "Ejecución",
  runId: "Run ID",
  invoiceRef: "Factura",
  orderBinding: "Vínculo contrato↔transferencia",
  token: "Token",
  sender: "Pagador",
  recipient: "Destinatario",
  amount: "Monto",
};

const utc = (date: Date): string => `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;

export function createSheet(): Sheet {
  const body = el("div", { class: "sheet-body" });
  const element = el("section", { class: "sheet paper", "aria-labelledby": "case-heading" }, el("h2", { id: "case-heading", class: "eyebrow" }, "Expediente"), body);

  return {
    element,
    update(result: CheckResult) {
      const checkedAt = utc(new Date());

      if (result.status !== "result") {
        if (result.status === "checking") {
          replaceChildren(body, el("p", { class: "sentence" }, "Verificando… leyendo la transacción y su recibo desde Arbitrum."));
        } else {
          replaceChildren(
            body,
            el("p", { class: "stamp", "data-verdict": "INSUFFICIENT_EVIDENCE" }, "Evidencia insuficiente"),
            el("p", { class: "sentence" }, result.message),
          );
        }
        return;
      }

      const meta = el(
        "dl",
        { class: "case-meta" },
        el("div", {}, el("dt", {}, "Transacción"), el("dd", { class: "mono" }, el("a", { href: `${EXPLORER_TX_URL}${result.transactionHash}`, target: "_blank", rel: "noopener noreferrer" }, result.transactionHash))),
        el("div", {}, el("dt", {}, "Red"), el("dd", {}, "Arbitrum One (chain 42161)")),
        ...(result.blockNumber !== undefined ? [el("div", {}, el("dt", {}, "Bloque"), el("dd", { class: "mono" }, result.blockNumber.toLocaleString("es-AR")))] : []),
        el("div", {}, el("dt", {}, "Verificado"), el("dd", {}, checkedAt)),
      );

      const stamp = el("p", { class: "stamp stamp-in", "data-verdict": result.verdict }, el("span", { class: "sr-only" }, "Resultado: "), STAMP[result.verdict]);

      const sentence =
        result.verdict === "VERIFIED"
          ? "La transacción existe, se ejecutó con éxito en Arbitrum, y todo lo que se afirmó coincide con la cadena."
          : result.verdict === "NOT_VERIFIED"
            ? "Al menos un hecho afirmado es contradicho por la cadena."
            : "No hay suficiente confirmación en la cadena para dar un veredicto.";

      const checks = el(
        "ul",
        { class: "check-grid", "aria-label": "Chequeos" },
        ...result.checks.map((check) =>
          el(
            "li",
            { "data-status": check.status },
            el("span", { class: "glyph", "aria-hidden": "true" }, GLYPH[check.status] ?? "?"),
            el("span", { class: "check-name" }, NAME[check.name] ?? check.name),
            el("span", { class: "check-status" }, check.status),
          ),
        ),
      );

      replaceChildren(
        body,
        meta,
        el("div", { class: "verdict-block" }, stamp, el("div", { class: "verdict-text" }, el("p", { class: "sentence" }, sentence), el("p", { class: "scope" }, "Nivel de evidencia: ", el("strong", { class: "mono" }, "RPC_ATTESTED"), " (una sola fuente RPC, no probado criptográficamente de forma independiente)"))),
        checks,
        el("p", { class: "print-only scope-note" }, "Generado por VÉRTICE PROOF a partir de evidencia leída vía arb1.arbitrum.io/rpc. Un hecho on-chain no es prueba de propiedad de wallet, acuerdo legal ni entrega de mercadería."),
      );
    },
  };
}
