import type { Metadata } from "next";
import { Landing } from "@/features/landing/Landing";

export const metadata: Metadata = {
  title: "Vértice · pagos a proveedores en ARGt",
  description: "La IA investiga. El código decide. Vos firmás. La cadena deja la prueba.",
};

export default function Home() {
  return <Landing />;
}
