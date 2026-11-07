import { BackToBatch, OpsHeader } from "@/components/OpsHeader";
import { ClosingView } from "@/features/closing/ClosingView";

export const metadata = { title: "Vértice OPS — Cierre de noviembre" };

export default function CierrePage() {
  return (
    <>
      <OpsHeader right={<BackToBatch />} />
      <ClosingView />
    </>
  );
}
