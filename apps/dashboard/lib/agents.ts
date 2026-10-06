import type { AgentDef } from "./types";

export const AGENTS: AgentDef[] = [
  {
    slug: "evm",
    name: "Treasury agent",
    registryId: process.env.AGENT_EVM_ID ?? "attesta-demo-agent-1",
    chain: "sepolia",
    role: "Pays invoices in USDC on Ethereum",
  },
  {
    slug: "solana",
    name: "Payout agent",
    registryId: process.env.AGENT_SOLANA_ID ?? "attesta-demo-agent-2",
    chain: "solana-devnet",
    role: "Sends SOL payouts through the Attesta guard",
  },
  {
    slug: "cardano",
    name: "Settlement agent",
    registryId: process.env.AGENT_CARDANO_ID ?? "attesta-demo-agent-3",
    chain: "cardano-preprod",
    role: "Settles trades with counterparty agents in ADA",
  },
];

export const agentBySlug = (slug: string) => AGENTS.find(a => a.slug === slug);
