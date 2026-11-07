import type { Metadata } from "next";
import { ProofIntake } from "@/features/proof/ProofIntake";

export const metadata: Metadata = {
  title: "Vértice PROOF",
  description: "Verificá un pago de VÉRTICE contra Arbitrum One.",
};

export default function ProofPage() {
  return <ProofIntake />;
}
