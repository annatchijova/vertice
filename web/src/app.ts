import { PAYMENT_BATCH_ADDRESS, PAYMENT_RECEIPT_REGISTRY_ADDRESS, EXPLORER_ADDRESS_URL } from "./chain.js";
import { createClaimForm } from "./claimForm.js";
import { createSheet } from "./sheet.js";
import { el } from "./ui.js";
import { buildClaim, checkPayment, type ClaimInput } from "./verify.js";

const REPO_URL = "https://github.com/annatchijova/vertice";

export function mountApp(main: HTMLElement): void {
  const form = createClaimForm(run);
  const sheet = createSheet();
  sheet.element.hidden = true;

  let currentRun = 0;

  async function run(input: ClaimInput): Promise<void> {
    const claim = buildClaim(input);
    const runId = ++currentRun;
    form.setBusy(true);
    sheet.element.hidden = false;
    sheet.update({ status: "checking" });
    sheet.element.scrollIntoView?.({ behavior: "smooth", block: "start" });

    const result = await checkPayment(claim);
    if (runId !== currentRun) return;
    sheet.update(result);
    form.setBusy(false);
  }

  const outcome = (verdict: string, label: string, text: string) =>
    el("li", {}, el("p", { class: "stamp small", "data-verdict": verdict }, label), el("p", { class: "outcome-text" }, text));
  const outcomes = el(
    "section",
    { class: "outcomes", "aria-labelledby": "outcomes-heading" },
    el("h2", { id: "outcomes-heading", class: "eyebrow" }, "Tres respuestas posibles"),
    el(
      "ul",
      {},
      outcome("VERIFIED", "Verificado", "Todo lo que afirmaste coincide con la evidencia."),
      outcome("NOT_VERIFIED", "No verificado", "Al menos un hecho afirmado contradice la evidencia."),
      outcome("INSUFFICIENT_EVIDENCE", "Evidencia insuficiente", "Falta evidencia, o no está suficientemente confirmada, para dar un veredicto."),
    ),
    el("p", { class: "hint" }, "Un hecho que no afirmás se muestra como ABSTAIN: no se chequeó, no es una aprobación. Un hecho on-chain no es prueba de propiedad de wallet, acuerdo legal ni entrega."),
  );

  const masthead = el(
    "header",
    { class: "masthead" },
    el("p", { class: "brand" }, el("img", { src: "/favicon.svg", alt: "", width: "28", height: "28" }), el("span", {}, "VÉRTICE PROOF")),
  );

  const hero = el(
    "section",
    { class: "hero", "aria-labelledby": "hero-heading" },
    el(
      "div",
      { class: "hero-main" },
      el("h1", { id: "hero-heading" }, "¿Se pagó de verdad?"),
      el("p", { class: "lede" }, "Pegá un hash de transacción y lo que el proveedor afirma haber cobrado. VÉRTICE PROOF muestra qué hechos respalda la cadena, cuáles contradice, y qué no pudo establecer."),
      form.element,
      el("p", { class: "fine" }, "Solo lectura: sin wallet, sin firma. El hash que ingreses se envía al RPC público de Arbitrum One (arb1.arbitrum.io/rpc)."),
    ),
    outcomes,
  );

  const contracts = el(
    "section",
    { class: "paper evidence", "aria-labelledby": "contracts-heading" },
    el("h2", { id: "contracts-heading", class: "eyebrow" }, "Contratos en Arbitrum One"),
    el(
      "dl",
      { class: "case-meta" },
      el("div", {}, el("dt", {}, "PaymentBatch"), el("dd", { class: "mono" }, el("a", { href: `${EXPLORER_ADDRESS_URL}${PAYMENT_BATCH_ADDRESS}`, target: "_blank", rel: "noopener noreferrer" }, PAYMENT_BATCH_ADDRESS))),
      el("div", {}, el("dt", {}, "PaymentReceiptRegistry"), el("dd", { class: "mono" }, el("a", { href: `${EXPLORER_ADDRESS_URL}${PAYMENT_RECEIPT_REGISTRY_ADDRESS}`, target: "_blank", rel: "noopener noreferrer" }, PAYMENT_RECEIPT_REGISTRY_ADDRESS))),
    ),
  );

  const footer = el("footer", { class: "colophon" }, el("p", {}, "VÉRTICE · Apache-2.0 · ", el("a", { href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, "Código y notas de diseño")));

  main.replaceChildren(masthead, hero, el("div", { class: "stage" }, el("div", { class: "stage-main" }, sheet.element, contracts)), footer);
}
