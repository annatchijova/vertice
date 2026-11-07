import type { Metadata } from "next";
import { ProofCaseFile } from "@/features/proof/ProofCaseFile";
import { CLAIM_KEYS, isTxHash, type ClaimParams } from "@/features/proof/claim";
import { ProofIntake } from "@/features/proof/ProofIntake";

type Props = {
  params: Promise<{ txHash: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { txHash } = await params;
  return { title: `Vértice PROOF — ${txHash.slice(0, 10)}…` };
}

export default async function ProofTxPage({ params, searchParams }: Props) {
  const txHash = (await params).txHash.toLowerCase();
  if (!isTxHash(txHash)) return <ProofIntake />;
  const sp = await searchParams;
  const claimParams: ClaimParams = {};
  for (const k of CLAIM_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v) claimParams[k] = v;
  }
  return <ProofCaseFile txHash={txHash} params={claimParams} />;
}
