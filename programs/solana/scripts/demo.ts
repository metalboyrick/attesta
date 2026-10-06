// Devnet demo: register -> spend ok -> set_frozen(true) -> spend rejected (AgentFrozen).
//
// Keys are read from ~/.attesta-secrets (override with ATTESTA_SECRETS):
//   solana-deployer.json   fee payer, funds the vault
//   solana-authority.json  compliance authority (relayer)
// A fresh agent keypair is generated per run so the policy PDA is new each time.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const SECRETS = process.env.ATTESTA_SECRETS ?? join(homedir(), ".attesta-secrets");
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function loadKeypair(name: string): Keypair {
  const raw = JSON.parse(readFileSync(join(SECRETS, name), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const payer = loadKeypair("solana-deployer.json");
  const authority = loadKeypair("solana-authority.json");
  const agent = Keypair.generate();
  const recipient = Keypair.generate().publicKey;

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  const program = new anchor.Program<AttestaGuard>(idl, provider);
  const [policy] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), agent.publicKey.toBuffer()],
    program.programId,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agent.publicKey.toBuffer()],
    program.programId,
  );

  console.log("program  ", program.programId.toBase58());
  console.log("agent    ", agent.publicKey.toBase58());
  console.log("authority", authority.publicKey.toBase58());
  console.log("policy   ", policy.toBase58());
  console.log("vault    ", vault.toBase58());

  const sigs: Record<string, string> = {};

  const dailyCap = new BN(0.05 * LAMPORTS_PER_SOL);
  sigs.register = await program.methods
    .registerAgent(authority.publicKey, dailyCap, [recipient])
    .accounts({ payer: payer.publicKey, agent: agent.publicKey })
    .signers([agent])
    .rpc();
  console.log("1. register_agent", explorer(sigs.register));

  sigs.fundVault = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: vault, lamports: 0.03 * LAMPORTS_PER_SOL }),
    ),
    [payer],
  );
  console.log("2. fund vault    ", explorer(sigs.fundVault));

  const spend = (amount: number) =>
    program.methods
      .spend(new BN(amount))
      .accountsPartial({ agent: agent.publicKey, policy, vault, recipient })
      .signers([agent]);

  sigs.spendOk = await spend(0.01 * LAMPORTS_PER_SOL).rpc();
  console.log("3. spend ok      ", explorer(sigs.spendOk));

  // reason_code 1 = demo control id from the off-chain evaluator.
  sigs.freeze = await program.methods
    .setFrozen(true, 1)
    .accountsPartial({ authority: authority.publicKey, policy })
    .signers([authority])
    .rpc();
  console.log("4. set_frozen    ", explorer(sigs.freeze));

  // skipPreflight so the rejected tx lands on-chain and has a signature as evidence.
  const rejectedTx = await spend(0.01 * LAMPORTS_PER_SOL).transaction();
  const latest = await connection.getLatestBlockhash("confirmed");
  rejectedTx.recentBlockhash = latest.blockhash;
  rejectedTx.feePayer = payer.publicKey;
  rejectedTx.sign(payer, agent);
  sigs.spendRejected = await connection.sendRawTransaction(rejectedTx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction({ signature: sigs.spendRejected, ...latest }, "confirmed");
  const status = await connection.getTransaction(sigs.spendRejected, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const err = JSON.stringify(status?.meta?.err);
  const frozenLog = status?.meta?.logMessages?.find((l) => l.includes("AgentFrozen"));
  console.log("5. spend rejected", explorer(sigs.spendRejected));
  console.log("   err:", err, "|", frozenLog ?? "(no AgentFrozen log)");
  if (!err || err === "null" || !frozenLog) throw new Error("expected spend to fail with AgentFrozen");

  const out = {
    cluster: "devnet",
    program: program.programId.toBase58(),
    agent: agent.publicKey.toBase58(),
    authority: authority.publicKey.toBase58(),
    policy: policy.toBase58(),
    vault: vault.toBase58(),
    recipient: recipient.toBase58(),
    signatures: sigs,
    at: new Date().toISOString(),
  };
  mkdirSync(new URL("../deployments", import.meta.url), { recursive: true });
  writeFileSync(new URL("../deployments/demo-devnet.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote deployments/demo-devnet.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
