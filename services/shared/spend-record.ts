/**
 * One outgoing payment by a monitored agent, normalized across chains so the
 * CRE workflow and the dashboard read Cardano, EVM and Solana spend the same way.
 *
 * One record per (transaction, recipient, asset). A transaction that pays two
 * recipients, or sends ADA plus a token, yields several records. Payments
 * back to the agent's own address (change) are not spend and are left out.
 */
export type SpendRecord = {
  /** Attesta agent id, the same string the registry hashes with keccak256. */
  agentId: string;
  /** CAIP-2 style chain id: "cardano:preprod", "eip155:11155111", "solana:devnet". */
  chain: string;
  /** Transaction hash as the chain's explorer shows it (hex for Cardano/EVM, base58 for Solana). */
  txHash: string;
  /** Recipient address in the chain's native format. */
  to: string;
  /** Integer amount in the asset's smallest unit, as a decimal string (no floats). */
  amount: string;
  /**
   * What was paid. "lovelace" | "native" (ETH, SOL) | token id:
   * Cardano `${policyId}.${assetNameHex}`, EVM ERC-20 address, Solana SPL mint.
   */
  asset: string;
  /** Block time, unix seconds. */
  ts: number;
};

export const SPEND_RECORD_CHAINS = {
  cardanoPreprod: "cardano:preprod",
  cardanoMainnet: "cardano:mainnet",
  sepolia: "eip155:11155111",
  solanaDevnet: "solana:devnet",
} as const;
