import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackToBatch, OpsHeader } from "@/components/OpsHeader";
import { INVOICES, getInvoice } from "@/data/invoices";
import { InvoiceDetail } from "@/features/invoice-detail/InvoiceDetail";

type Params = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return INVOICES.map((i) => ({ id: i.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const invoice = getInvoice(id);
  return { title: invoice ? `Vértice OPS — ${invoice.supplier.name} · ${invoice.number}` : "Vértice OPS" };
}

export default async function InvoicePage({ params }: Params) {
  const { id } = await params;
  if (!getInvoice(id)) notFound();
  return (
    <>
      <OpsHeader right={<BackToBatch />} />
      <InvoiceDetail id={id} />
    </>
  );
}
