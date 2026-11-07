import type { Address, Hex } from "viem";

/** Twin stablecoins con PaymentBatch desplegado. Siempre "ARGt", nunca "ARSt". */
export type Currency = "ARGt" | "BRAt";

export type Supplier = {
  name: string;
  country: string;
  city: string;
  /** "NIT", "CNPJ", "RFC"… */
  taxIdLabel: string;
  taxId: string;
  /** Dirección de cobro que el proveedor usó en pagos previos (registro del comercio, off-chain). */
  registeredAddress: Address;
};

export type MonthAmount = { month: string; amount: string };

/** Pago real ya ejecutado en Arbitrum One. */
export type ExecutedPayment = {
  txHash: Hex;
  blockNumber: bigint;
  /** unix seconds */
  timestamp: number;
  signer: Address;
  runId: Hex;
  invoiceRef: Hex;
  gasUsed: bigint;
};

export type Invoice = {
  /** slug para la URL: /ops/facturas/[id] */
  id: string;
  /** "Caso N de 5" en los detalles */
  caseNumber: number;
  supplier: Supplier;
  number: string;
  /** Moneda de la factura original, solo referencia (BOB, BRL, COP, MXN). */
  originCurrency: string;
  /** Moneda en la que se ejecuta el pago on-chain. */
  currency: Currency;
  /** Monto decimal en la moneda de pago, ej. "800.00" */
  amount: string;
  /** Dirección de pago que figura en ESTA factura. */
  payTo: Address;
  issuedAt: string; // ISO date
  concept: string;
  /** Últimos 3 meses pagados a este proveedor por el mismo concepto, en la moneda de pago. */
  history: MonthAmount[];
  /** invoiceRef bytes32 usado on-chain. */
  invoiceRef: Hex;
  executed?: ExecutedPayment;
};
