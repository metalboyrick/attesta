import type { Chain } from "./types";

export const CHAIN_LABEL: Record<Chain, string> = {
  sepolia: "Sepolia",
  "solana-devnet": "Solana devnet",
  "cardano-preprod": "Cardano preprod",
};

export function txUrl(chain: Chain, tx: string): string {
  switch (chain) {
    case "sepolia":
      return `https://sepolia.etherscan.io/tx/${tx}`;
    case "solana-devnet":
      return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
    case "cardano-preprod":
      return `https://preprod.cardanoscan.io/transaction/${tx}`;
  }
}

export function addressUrl(chain: Chain, addr: string): string {
  switch (chain) {
    case "sepolia":
      return `https://sepolia.etherscan.io/address/${addr}`;
    case "solana-devnet":
      return `https://explorer.solana.com/address/${addr}?cluster=devnet`;
    case "cardano-preprod":
      return `https://preprod.cardanoscan.io/address/${addr}`;
  }
}
