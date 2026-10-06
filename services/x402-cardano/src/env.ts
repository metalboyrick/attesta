/**
 * Loads config: local .env first, then ~/.attesta-secrets/cardano-preprod.env
 * (mnemonics live only there, never in the repo). Picks the chain provider:
 * Blockfrost when BLOCKFROST_PROJECT_ID is set, otherwise public Koios preprod.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import type { CardanoProviderConfig } from "@x402/cardano";

config();
config({ path: process.env.ATTESTA_CARDANO_SECRETS ?? join(homedir(), ".attesta-secrets", "cardano-preprod.env") });

export const NETWORK = "cardano:preprod" as const;

export function provider(): CardanoProviderConfig {
  const projectId = process.env.BLOCKFROST_PROJECT_ID;
  if (projectId) {
    return {
      blockfrost: {
        baseUrl: process.env.BLOCKFROST_BASE_URL ?? "https://cardano-preprod.blockfrost.io/api/v0",
        projectId,
      },
      requestTimeoutMs: 30_000,
    };
  }
  return {
    koios: { baseUrl: process.env.KOIOS_BASE_URL ?? "https://preprod.koios.rest/api/v1" },
    requestTimeoutMs: 30_000,
  };
}
