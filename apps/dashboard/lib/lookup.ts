import "server-only";
import { isAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { controlResultEvent, registryAbi } from "./abi";
import { registryAddress } from "./env";
import { errText, sepoliaClient } from "./live";
import { safetyScore, type SafetyScore } from "./score";
import type { ControlDef, ControlResult } from "./types";

export type Lookup = {
  key: Hex;
  compliant: boolean;
  latest: Record<string, ControlResult>;
  safety: SafetyScore;
  /** set when tx hashes could not be read from logs; results still come from contract state */
  txNote?: string;
};

/** Reads any agent's latest results straight from the registry. Read-only. */
export async function lookupAgent(key: Hex, controls: ControlDef[], slug = "lookup"): Promise<Lookup> {
  const address = registryAddress();
  if (!address || !isAddress(address)) throw new Error("No registry is configured, so lookup is off in fixture mode.");
  const client = sepoliaClient();
  const reg = { address: address as Address, abi: registryAbi } as const;
  const [compliant, ids] = await Promise.all([
    client.readContract({ ...reg, functionName: "isCompliant", args: [key] }),
    client.readContract({ ...reg, functionName: "getControls", args: [key] }),
  ]);
  const rows = await Promise.all(ids.map(id => client.readContract({ ...reg, functionName: "getResult", args: [key, id] })));

  // Tx hashes come from logs filtered by this agent's indexed id; state alone does not carry them.
  const txByResult = new Map<string, Hex>();
  let txNote: string | undefined;
  try {
    const from = process.env.REGISTRY_DEPLOY_BLOCK ? BigInt(process.env.REGISTRY_DEPLOY_BLOCK) : undefined;
    if (from === undefined) throw new Error("REGISTRY_DEPLOY_BLOCK is not set");
    const logs = await client.getLogs({ address: reg.address, event: controlResultEvent, args: { agentId: key }, fromBlock: from, toBlock: "latest" });
    for (const l of logs) if (l.transactionHash) txByResult.set(`${l.args.controlId}:${l.args.ts}`, l.transactionHash);
  } catch (e) {
    txNote = `Tx links unavailable: ${errText(e)}`;
  }

  // The workflow writes keccak256(label) as the control id; map known ones back.
  const label = new Map<Hex, string>(controls.map(c => [keccak256(stringToHex(c.id)), c.id]));
  const latest: Record<string, ControlResult> = {};
  ids.forEach((id, i) => {
    const controlId = label.get(id) ?? id;
    latest[controlId] = {
      controlId,
      agentSlug: slug,
      pass: rows[i].pass,
      evidenceHash: rows[i].evidenceHash,
      ts: Number(rows[i].ts),
      txHash: txByResult.get(`${id}:${rows[i].ts}`) ?? "",
      chain: "sepolia",
    };
  });
  return { key, compliant, latest, safety: safetyScore(latest), txNote };
}
