import { el } from "./ui.js";
import { buildClaim, InvalidClaimError, type ClaimInput } from "./verify.js";

type FieldName = keyof ClaimInput;

type FieldSpec = {
  name: FieldName;
  label: string;
  hint: string;
  required: boolean;
};

const FIELDS: readonly FieldSpec[] = [
  {
    name: "transactionHash",
    label: "Hash de la transacción",
    hint: "0x seguido de 64 caracteres hexadecimales, como lo muestra el proveedor o el explorador.",
    required: true,
  },
  {
    name: "recipient",
    label: "Destinatario (opcional)",
    hint: "Dejalo vacío si no lo sabés. Un campo vacío no se verifica.",
    required: false,
  },
  {
    name: "amountBaseUnits",
    label: "Monto en unidades base (opcional)",
    hint: "Número entero, solo dígitos. ARGt tiene 18 decimales (1 ARGt = 1000000000000000000). Vacío no se verifica.",
    required: false,
  },
  {
    name: "token",
    label: "Dirección del token (opcional)",
    hint: "Dirección del contrato ARGt. Vacío no se verifica.",
    required: false,
  },
  {
    name: "sender",
    label: "Pagador (opcional)",
    hint: "La wallet que ejecutó el pago. Vacío no se verifica.",
    required: false,
  },
  {
    name: "runId",
    label: "Run ID (opcional)",
    hint: "Identificador del lote, si lo tenés de un comprobante. Vacío no se verifica.",
    required: false,
  },
  {
    name: "invoiceRef",
    label: "Referencia de factura (opcional)",
    hint: "Referencia de la factura, si la tenés de un comprobante. Vacío no se verifica.",
    required: false,
  },
];

const EMPTY: ClaimInput = { transactionHash: "", runId: "", invoiceRef: "", token: "", sender: "", recipient: "", amountBaseUnits: "" };

export function validateField(spec: FieldSpec, value: string): string | null {
  if (value.trim() === "") return spec.required ? "Ingresá el hash de la transacción." : null;
  try {
    buildClaim(spec.name === "transactionHash" ? { ...EMPTY, transactionHash: value } : { ...EMPTY, transactionHash: `0x${"0".repeat(64)}`, [spec.name]: value });
    return null;
  } catch (error) {
    if (error instanceof InvalidClaimError) return error.message;
    throw error;
  }
}

export type ClaimForm = {
  element: HTMLFormElement;
  setBusy(busy: boolean): void;
  values(): ClaimInput;
};

export function createClaimForm(onSubmit: (input: ClaimInput) => void): ClaimForm {
  const inputs = new Map<FieldName, HTMLInputElement>();
  const errors = new Map<FieldName, HTMLElement>();

  const showError = (spec: FieldSpec, message: string | null) => {
    const input = inputs.get(spec.name)!;
    const slot = errors.get(spec.name)!;
    slot.textContent = message ?? "";
    if (message === null) input.removeAttribute("aria-invalid");
    else input.setAttribute("aria-invalid", "true");
  };

  const rows = FIELDS.map((spec) => {
    const id = `field-${spec.name}`;
    const input = el("input", {
      id,
      name: spec.name,
      type: "text",
      class: "mono",
      autocomplete: "off",
      spellcheck: "false",
      "aria-describedby": `${id}-hint ${id}-error`,
      "aria-required": spec.required ? "true" : false,
    });
    const error = el("p", { id: `${id}-error`, class: "field-error" });
    inputs.set(spec.name, input);
    errors.set(spec.name, error);
    input.addEventListener("blur", () => showError(spec, validateField(spec, input.value)));
    return el("div", { class: "field" }, el("label", { for: id }, spec.label), el("p", { id: `${id}-hint`, class: "hint" }, spec.hint), input, error);
  });

  const button = el("button", { type: "submit" }, "Verificar pago");
  const summary = el("p", { class: "form-summary", role: "alert" });
  const [hashRow, ...optionalRows] = rows;
  const details = el("details", { class: "claim-details" }, el("summary", {}, "Agregar lo que afirma el proveedor (opcional)"), ...optionalRows);
  const form = el("form", { novalidate: true, "aria-label": "Claim de pago" }, el("div", { class: "intake" }, hashRow!, button), details, summary);

  const values = (): ClaimInput => ({
    transactionHash: inputs.get("transactionHash")!.value,
    runId: inputs.get("runId")!.value,
    invoiceRef: inputs.get("invoiceRef")!.value,
    token: inputs.get("token")!.value,
    sender: inputs.get("sender")!.value,
    recipient: inputs.get("recipient")!.value,
    amountBaseUnits: inputs.get("amountBaseUnits")!.value,
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (button.getAttribute("aria-disabled") === "true") return;
    let firstInvalid: HTMLInputElement | null = null;
    const invalidLabels: string[] = [];
    for (const spec of FIELDS) {
      const input = inputs.get(spec.name)!;
      const message = validateField(spec, input.value);
      showError(spec, message);
      if (message !== null) {
        invalidLabels.push(spec.label.replace(/ \(opcional\)$/, ""));
        if (firstInvalid === null) firstInvalid = input;
      }
    }
    summary.textContent = invalidLabels.length === 0 ? "" : `No se verificó nada. Corregí: ${invalidLabels.join(", ")}.`;
    if (firstInvalid !== null) {
      if (details.contains(firstInvalid)) details.open = true;
      firstInvalid.focus();
      return;
    }
    onSubmit(values());
  });

  return {
    element: form,
    setBusy(busy: boolean) {
      if (busy) button.setAttribute("aria-disabled", "true");
      else button.removeAttribute("aria-disabled");
      button.textContent = busy ? "Verificando…" : "Verificar pago";
    },
    values,
  };
}
