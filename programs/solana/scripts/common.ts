// Shared setup for the devnet scripts. Keys come from ~/.attesta-secrets
// (override with ATTESTA_SECRETS):
//   solana-deployer.json   fee payer, tops up the vault
//   solana-authority.json  compliance authority (relayer), signs set_frozen
//   solana-agent.json      the fixed demo agent "attesta-demo-agent-2"
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as anchor from "@anchor-lang/core";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { AttestaGuard } from "../idl/attesta_guard.types.ts";

const idl = JSON.parse(readFileSync(new URL("../idl/attesta_guard.json", import.meta.url), "utf8"));

export const AGENT_ID = "attesta-demo-agent-2";
export const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const SECRETS = process.env.ATTESTA_SECRETS ?? join(homedir(), ".attesta-secrets");

/** Recipient presets for live demo beats. Only `allowlisted` is on the policy allowlist. */
export const PAYEES: Record<string, PublicKey> = {
  allowlisted: new PublicKey("3yLbm2Dp7LjH8DW29SdtCMugzrmYxpMwRussm9xATWw6"),
  unknown: new PublicKey("Eg2z7iSrpawo9shZDW9sKN2QZ7qA4zp48q6yoR2drMp"),
};

export const DAILY_CAP = 0.05 * LAMPORTS_PER_SOL;
/** Vault is topped up to this before demo spends. */
const VAULT_TARGET = 0.03 * LAMPORTS_PER_SOL;

export const explorer = (sig: string) =>
  RPC.includes("devnet")
    ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    : `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`;

export function loadKeypair(name: string): Keypair {
  const raw = JSON.parse(readFileSync(join(SECRETS, name), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/** Script args without pnpm's literal "--". */
export const args = () => process.argv.slice(2).filter(a => a !== "--");

export function setup() {
  const connection = new Connection(RPC, "confirmed");
  const payer = loadKeypair("solana-deployer.json");
  const authority = loadKeypair("solana-authority.json");
  const agent = loadKeypair("solana-agent.json");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new anchor.Program<AttestaGuard>(idl, provider);
  const pda = (seed: string) =>
    PublicKey.findProgramAddressSync([Buffer.from(seed), agent.publicKey.toBuffer()], program.programId)[0];
  const policy = pda("policy");
  const vault = pda("vault");

  /** Register the fixed agent once; afterwards make sure cap and allowlist match the presets. */
  async function ensureRegistered(): Promise<Record<string, string>> {
    const sigs: Record<string, string> = {};
    const existing = await program.account.agentPolicy.fetchNullable(policy);
    if (!existing) {
      sigs.register = await program.methods
        .registerAgent(authority.publicKey, new BN(DAILY_CAP), [PAYEES.allowlisted])
        .accounts({ payer: payer.publicKey, agent: agent.publicKey })
        .signers([agent])
        .rpc();
    } else if (
      existing.dailyCap.toNumber() !== DAILY_CAP ||
      existing.allowlist.length !== 1 ||
      !existing.allowlist[0].equals(PAYEES.allowlisted)
    ) {
      sigs.updatePolicy = await program.methods
        .updatePolicy(new BN(DAILY_CAP), [PAYEES.allowlisted])
        .accountsPartial({ authority: authority.publicKey, policy })
        .signers([authority])
        .rpc();
    }
    const bal = await connection.getBalance(vault);
    if (bal < VAULT_TARGET) {
      sigs.fundVault = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: vault, lamports: VAULT_TARGET - bal }),
        ),
        [payer],
      );
    }
    return sigs;
  }

  async function setFrozen(frozen: boolean, reasonCode = 0): Promise<string> {
    return program.methods
      .setFrozen(frozen, reasonCode)
      .accountsPartial({ authority: authority.publicKey, policy })
      .signers([authority])
      .rpc();
  }

  /**
   * Sends spend with skipPreflight so a rejected spend still lands on-chain and
   * has a signature to show. Returns the sig and the program error, if any.
   */
  async function spend(recipient: PublicKey, lamports: number): Promise<{ sig: string; error: string | null }> {
    const tx = await program.methods
      .spend(new BN(lamports))
      .accountsPartial({ agent: agent.publicKey, policy, vault, recipient })
      .transaction();
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer, agent);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
    const res = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!res?.meta?.err) return { sig, error: null };
    const line = res.meta.logMessages?.find(l => l.includes("Error Code:"));
    return { sig, error: line?.match(/Error Code: (\w+)/)?.[1] ?? JSON.stringify(res.meta.err) };
  }

  return { connection, payer, authority, agent, program, policy, vault, ensureRegistered, setFrozen, spend };
}

export function resolveRecipient(arg: string | undefined): PublicKey {
  if (!arg) return PAYEES.allowlisted;
  return PAYEES[arg] ?? new PublicKey(arg);
}

export function fail(e: unknown): never {
  console.error(e);
  process.exit(1);
}
