/**
 * Local end-to-end check: anvil (registry) + solana-test-validator (guard).
 *
 *   ControlResult(pass=false) on EVM -> relayer -> guard frozen -> spend fails AgentFrozen
 *   ControlResult(pass=true)         -> relayer (AUTO_UNFREEZE) -> guard unfrozen -> spend ok
 *   collector returns the successful spends as SpendRecords
 *
 * Needs: anvil on EVM_RPC (default :18545), validator with the guard loaded on
 * SOLANA_RPC (default :18899), `forge build` output in contracts/evm/out.
 */
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import BN from "bn.js";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createWalletClient, createPublicClient, encodeAbiParameters, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { fetchPolicy, guardProgram, loadKeypair, policyPda, vaultPda } from "../src/guard.ts";
import { runRelayer } from "../src/relayer.ts";
import { collectSolanaSpends } from "../src/collect-solana.ts";

const EVM_RPC = process.env.EVM_RPC ?? "http://127.0.0.1:18545";
const SOLANA_RPC = process.env.SOLANA_RPC ?? "http://127.0.0.1:18899";
// anvil default account 0 (public test key)
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const AGENT_ID = "attesta-demo-agent-2";
const CONTROL_ID = keccak256(toHex("ATT-SPEND-02"));

const artifact = JSON.parse(
  readFileSync(new URL("../../../contracts/evm/out/AttestationRegistry.sol/AttestationRegistry.json", import.meta.url), "utf8"),
);

async function main() {
  const account = privateKeyToAccount(ANVIL_KEY);
  const wallet = createWalletClient({ account, chain: foundry, transport: http(EVM_RPC) });
  const evm = createPublicClient({ chain: foundry, transport: http(EVM_RPC) });

  // Registry with anvil account 0 as the "forwarder" so we can call onReport directly.
  const deployHash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [account.address],
  });
  const registry = (await evm.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;
  const fromBlock = await evm.getBlockNumber();

  const report = async (pass: boolean, ts: number) => {
    const payload = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bool" }, { type: "bytes32" }, { type: "uint64" }],
      [CONTROL_ID, keccak256(toHex(AGENT_ID)), pass, keccak256(toHex(`evidence-${ts}`)), BigInt(ts)],
    );
    const hash = await wallet.writeContract({
      address: registry,
      abi: artifact.abi,
      functionName: "onReport",
      args: ["0x", payload],
    });
    await evm.waitForTransactionReceipt({ hash });
    return hash;
  };

  // Solana side: fresh agent, registered and funded.
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const payer = loadKeypair("~/.attesta-secrets/solana-deployer.json");
  const authority = loadKeypair("~/.attesta-secrets/solana-authority.json");
  await connection.confirmTransaction(await connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL));
  const agent = Keypair.generate();
  const recipient = Keypair.generate().publicKey;
  const program = guardProgram(connection, payer);
  await program.methods
    .registerAgent(authority.publicKey, new BN(LAMPORTS_PER_SOL), [])
    .accounts({ payer: payer.publicKey, agent: agent.publicKey })
    .signers([agent])
    .rpc();
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: vaultPda(agent.publicKey), lamports: LAMPORTS_PER_SOL / 10 })),
    [payer],
  );
  const spend = () =>
    program.methods
      .spend(new BN(1_000_000))
      .accountsPartial({ agent: agent.publicKey, policy: policyPda(agent.publicKey), vault: vaultPda(agent.publicKey), recipient })
      .signers([agent])
      .rpc();
  await spend();

  const stateFile = join(tmpdir(), `relayer-e2e-${Date.now()}.json`);
  Object.assign(process.env, {
    SEPOLIA_RPC_URL: EVM_RPC,
    ATTESTA_REGISTRY_ADDRESS: registry,
    SOLANA_RPC_URL: SOLANA_RPC,
    SOLANA_AGENTS: `${AGENT_ID}=${agent.publicKey.toBase58()}`,
    SOLANA_PAYER_KEYPAIR: "~/.attesta-secrets/solana-deployer.json",
    RELAYER_FROM_BLOCK: fromBlock.toString(),
    RELAYER_STATE_FILE: stateFile,
    RELAYER_ONCE: "1",
    AUTO_UNFREEZE: "1",
  });

  // 1. FAIL -> freeze
  await report(false, 1000);
  await runRelayer();
  assert.equal((await fetchPolicy(program, agent.publicKey))!.frozen, true, "expected frozen after FAIL");
  await assert.rejects(spend(), /AgentFrozen/);
  console.log("PASS fail->frozen, spend rejected AgentFrozen");

  // 2. Re-run with no new logs: no duplicate tx (idempotent)
  await runRelayer();
  console.log("PASS rerun idempotent");

  // 3. PASS -> unfreeze
  await report(true, 2000);
  await runRelayer();
  assert.equal((await fetchPolicy(program, agent.publicKey))!.frozen, false, "expected unfrozen after PASS");
  await spend();
  console.log("PASS pass->unfrozen, spend ok");

  // 4. Collector sees the two successful spends only
  const records = await collectSolanaSpends(connection, AGENT_ID, agent.publicKey);
  assert.equal(records.length, 2, `expected 2 SpendRecords, got ${records.length}`);
  assert.ok(records.every(r => r.amount === "1000000" && r.to === recipient.toBase58() && r.chain === "solana:devnet"));
  console.log("PASS collector:", JSON.stringify(records[0]));

  rmSync(stateFile, { force: true });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
