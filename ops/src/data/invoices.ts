import { keccak256, stringToHex } from "viem";
import type { Invoice } from "@/domain/invoice";

/**
 * Lote del 07/11. Montos ajustados a los topes reales del contrato (1.000 por pago / 2.000 por lote).
 * Andina FC-…1042 es la transacción REAL de ARGt; FC-…1043 es la que se firma EN VIVO con PAGAR.
 * Solo 0x981d…70ed está aprobado on-chain (en ARGt y BRAt): el resto de las direcciones son de demo
 * y el preflight lo muestra tal cual, leyendo la allowlist en vivo.
 */
const ref = (n: string) => keccak256(stringToHex(n));

const ANDINA = {
  name: "Distribuidora Andina S.R.L.",
  country: "Bolivia",
  city: "Santa Cruz",
  taxIdLabel: "NIT",
  taxId: "1023456027",
  registeredAddress: "0x981dce900787aed11e8e4489860907d2892f70ed",
} as const;

export const INVOICES: Invoice[] = [
  {
    id: "andina-1042",
    caseNumber: 1,
    supplier: ANDINA,
    number: "FC-A-0001-00001042",
    originCurrency: "BOB",
    currency: "ARGt",
    amount: "500.00",
    payTo: "0x981dce900787aed11e8e4489860907d2892f70ed",
    issuedAt: "2026-11-03",
    concept: "Reposición mensual de insumos",
    history: [
      { month: "Agosto", amount: "490.00" },
      { month: "Septiembre", amount: "495.00" },
      { month: "Octubre", amount: "500.00" },
    ],
    invoiceRef: "0x99c5fad1f0657ed78631a52dbb63d20e4344e99aa4a17545075add66b6ed52b4",
    executed: {
      txHash: "0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc",
      blockNumber: 522117760n,
      timestamp: 1794064844,
      signer: "0xa6b2df351332db16c43630e8290fd893e9c71513",
      runId: "0xcb7429a0bd1c93f0077be87ec03347c0dc647ed59a372b2f731f4fadf53c5cd6",
      invoiceRef: "0x99c5fad1f0657ed78631a52dbb63d20e4344e99aa4a17545075add66b6ed52b4",
      gasUsed: 119053n,
    },
  },
  {
    id: "andina-1043",
    caseNumber: 2,
    supplier: ANDINA,
    number: "FC-A-0001-00001043",
    originCurrency: "BOB",
    currency: "ARGt",
    amount: "800.00",
    payTo: "0x981dce900787aed11e8e4489860907d2892f70ed",
    issuedAt: "2026-11-05",
    concept: "Envases y etiquetas · pedido trimestral",
    history: [
      { month: "Mayo", amount: "780.00" },
      { month: "Agosto", amount: "790.00" },
      { month: "Octubre", amount: "795.00" },
    ],
    invoiceRef: ref("FC-A-0001-00001043"),
  },
  {
    id: "paulista-482115",
    caseNumber: 3,
    supplier: {
      name: "Têxtil Paulista Ltda.",
      country: "Brasil",
      city: "São Paulo",
      taxIdLabel: "CNPJ",
      taxId: "12.345.678/0001-90",
      registeredAddress: "0x4b2E4f3dF77CA89a37D919139BA44De29cEaC3d1",
    },
    number: "NF-e 000.482.115",
    originCurrency: "BRL",
    currency: "BRAt",
    amount: "950.00",
    payTo: "0x4b2E4f3dF77CA89a37D919139BA44De29cEaC3d1",
    issuedAt: "2026-11-04",
    concept: "Pedido mensual de telas",
    history: [
      { month: "Agosto", amount: "930.00" },
      { month: "Septiembre", amount: "940.00" },
      { month: "Octubre", amount: "945.00" },
    ],
    invoiceRef: ref("NF-e 000.482.115"),
  },
  {
    id: "caribe-00915",
    caseNumber: 4,
    supplier: {
      name: "Logística Caribe S.A.S.",
      country: "Colombia",
      city: "Barranquilla",
      taxIdLabel: "NIT",
      taxId: "900.123.456-7",
      registeredAddress: "0x5d1A7E2C9b04f6a3D8E1C7b5a9F2e4d6C3B18f8b",
    },
    number: "FE-LC-2026-00915",
    originCurrency: "COP",
    currency: "ARGt",
    amount: "780.00",
    // un carácter distinto (8 → 3) respecto de la dirección registrada
    payTo: "0x5D1a7e2c9B04f6a3D8E1C7b5A9F2E4d6C3b18f3B",
    issuedAt: "2026-11-05",
    concept: "Flete marítimo Barranquilla → Buenos Aires",
    history: [
      { month: "Agosto", amount: "770.00" },
      { month: "Septiembre", amount: "775.00" },
      { month: "Octubre", amount: "780.00" },
    ],
    invoiceRef: ref("FE-LC-2026-00915"),
  },
  {
    id: "bajio-3318",
    caseNumber: 5,
    supplier: {
      name: "Empaques del Bajío S.A. de C.V.",
      country: "México",
      city: "León",
      taxIdLabel: "RFC",
      taxId: "EBA010203AB1",
      registeredAddress: "0x7f3c4C171e2A5E55DC44F4f2Ecf58F76383Fa19e",
    },
    number: "CFDI A-3318",
    originCurrency: "MXN",
    currency: "ARGt",
    amount: "1250.00",
    payTo: "0x7f3c4C171e2A5E55DC44F4f2Ecf58F76383Fa19e",
    issuedAt: "2026-11-02",
    concept: "2.000 cajas corrugadas",
    history: [
      { month: "Agosto", amount: "880.00" },
      { month: "Septiembre", amount: "910.00" },
      { month: "Octubre", amount: "910.00" },
    ],
    invoiceRef: ref("CFDI A-3318"),
  },
];

export const TOTAL_CASES = INVOICES.length;
export const getInvoice = (id: string) => INVOICES.find((i) => i.id === id);
