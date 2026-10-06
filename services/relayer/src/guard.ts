/**
 * Thin client for the attesta_guard Solana program (programs/solana).
 * The IDL is read from programs/solana/idl so a rebuild there flows through.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { AttestaGuard } from "../../../programs/solana/idl/attesta_guard.types.ts";

const idl = JSON.parse(
  readFileSync(new URL("../../../programs/solana/idl/attesta_guard.json", import.meta.url), "utf8"),
) as AttestaGuard;

export const GUARD_PROGRAM_ID = new PublicKey(idl.address);
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path.replace(/^~/, homedir()), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function policyPda(agent: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("policy"), agent.toBuffer()], GUARD_PROGRAM_ID)[0];
}

export function vaultPda(agent: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), agent.toBuffer()], GUARD_PROGRAM_ID)[0];
}

export function guardProgram(connection: Connection, payer: Keypair): anchor.Program<AttestaGuard> {
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  return new anchor.Program<AttestaGuard>(idl, provider);
}

/** Event coder for SpendEvent / FrozenChanged logs. */
export function guardEventParser(): anchor.EventParser {
  return new anchor.EventParser(GUARD_PROGRAM_ID, new anchor.BorshCoder(idl as anchor.Idl));
}

export type PolicyState = { frozen: boolean; authority: PublicKey; dailyCap: bigint; spentToday: bigint };

export async function fetchPolicy(
  program: anchor.Program<AttestaGuard>,
  agent: PublicKey,
): Promise<PolicyState | null> {
  const acc = await program.account.agentPolicy.fetchNullable(policyPda(agent));
  if (!acc) return null;
  return {
    frozen: acc.frozen,
    authority: acc.authority,
    dailyCap: BigInt(acc.dailyCap.toString()),
    spentToday: BigInt(acc.spentToday.toString()),
  };
}

/**
 * set_frozen plus an SPL Memo carrying the source evidence, so the Solana tx
 * links back to the Sepolia ControlResult that caused it.
 */
export async function setFrozen(
  program: anchor.Program<AttestaGuard>,
  authority: Keypair,
  agent: PublicKey,
  frozen: boolean,
  reasonCode: number,
  memo: string,
): Promise<string> {
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, "utf8"),
  });
  return program.methods
    .setFrozen(frozen, reasonCode)
    .accountsPartial({ authority: authority.publicKey, policy: policyPda(agent) })
    .postInstructions([memoIx])
    .signers([authority])
    .rpc();
}

/**
 * ts of the newest FrozenChanged(frozen=false) for this agent, read from the
 * policy PDA's recent transactions (newest first, stops at the first match).
 * null if none is found in the last `limit` transactions.
 */
export async function lastUnfreezeTs(connection: Connection, agent: PublicKey, limit = 100): Promise<bigint | null> {
  const parser = guardEventParser();
  const sigs = await connection.getSignaturesForAddress(policyPda(agent), { limit }, "confirmed");
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx?.meta || tx.meta.err) continue;
    for (const ev of parser.parseLogs(tx.meta.logMessages ?? [])) {
      if (ev.name !== "FrozenChanged" && ev.name !== "frozenChanged") continue;
      const d = ev.data as { agent: PublicKey; frozen: boolean; ts: { toString(): string } };
      if (!d.frozen && d.agent.equals(agent)) return BigInt(d.ts.toString());
    }
  }
  return null;
}
