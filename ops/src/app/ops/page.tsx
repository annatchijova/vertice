import type { Metadata } from "next";
import { Dashboard } from "@/features/dashboard/Dashboard";

export const metadata: Metadata = { title: "Lote · Vértice OPS" };

export default function OpsPage() {
  return <Dashboard />;
}
