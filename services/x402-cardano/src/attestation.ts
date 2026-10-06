/**
 * Attestation lookup. Reads the Sepolia AttestationRegistry
 * (contracts/evm/src/AttestationRegistry.sol) when ATTESTA_REGISTRY_ADDRESS
 * and SEPOLIA_RPC_URL are set; otherwise returns stub data. `source` says
 * which one answered.
 */
import { createHash } from "node:crypto";
import {
  createPublicClient,
  hexToString,
  http,
  isAddress,
  isHex,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";

export type Control = { id: string; pass: boolean; evidenceHash: string; ts: number };
export type Attestation = {
  agentId: string;
  compliant: boolean;
  controls: Control[];
  source: string;
};

const registryAbi = parseAbi([
  "function isCompliant(bytes32 agentId) view returns (bool)",
  "function getControls(bytes32 agentId) view returns (bytes32[])",
  "function getResult(bytes32 agentId, bytes32 controlId) view returns ((bool pass, bytes32 evidenceHash, uint64 ts))",
]);

const registryAddress = process.env.ATTESTA_REGISTRY_ADDRESS;
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const registry =
  registryAddress && rpcUrl && isAddress(registryAddress)
    ? {
        address: registryAddress as Address,
        client: createPublicClient({ chain: sepolia, transport: http(rpcUrl) }),
      }
    : undefined;

/**
 * Maps a URL agentId to the registry's bytes32 key. A raw 0x-prefixed
 * 32-byte hex passes through; otherwise AGENT_ID_ENCODING picks keccak256 of
 * the UTF-8 string (default) or the right-padded UTF-8 bytes ("utf8").
 */
export function agentKey(agentId: string): Hex {
  if (isHex(agentId) && agentId.length === 66) return agentId;
  return process.env.AGENT_ID_ENCODING === "utf8"
    ? stringToHex(agentId, { size: 32 })
    : keccak256(stringToHex(agentId));
}

// The CRE workflow (workflows/cre/control-eval) writes keccak256(label) as
// the controlId, so known labels are matched back by hash.
const knownControls = new Map(
  (process.env.ATTESTA_CONTROL_IDS ?? "ATT-SPEND-01,ATT-CPTY-02,ATT-KEY-03")
    .split(",")
    .map(label => label.trim())
    .filter(Boolean)
    .map(label => [keccak256(stringToHex(label)), label] as const),
);

// Known hashed ids and padded UTF-8 ids read back as text; others stay hex.
function controlLabel(id: Hex): string {
  const known = knownControls.get(id);
  if (known) return known;
  const text = hexToString(id, { size: 32 }).replace(/\0+$/, "");
  return /^[\x20-\x7e]+$/.test(text) ? text : id;
}

async function fromRegistry(agentId: string): Promise<Attestation> {
  const { address, client } = registry!;
  const key = agentKey(agentId);
  const [compliant, controlIds] = await Promise.all([
    client.readContract({ address, abi: registryAbi, functionName: "isCompliant", args: [key] }),
    client.readContract({ address, abi: registryAbi, functionName: "getControls", args: [key] }),
  ]);
  const results = await Promise.all(
    controlIds.map(id =>
      client.readContract({ address, abi: registryAbi, functionName: "getResult", args: [key, id] }),
    ),
  );
  return {
    agentId,
    compliant,
    controls: controlIds.map((id, i) => ({
      id: controlLabel(id),
      pass: results[i].pass,
      evidenceHash: results[i].evidenceHash,
      ts: Number(results[i].ts),
    })),
    source: `sepolia:${address}`,
  };
}

const STUB_CONTROL_IDS = ["AC-01-key-custody", "AU-02-action-logging", "SP-03-spend-limits"];

function fromStub(agentId: string): Attestation {
  const ts = Math.floor(Date.now() / 1000);
  // Agent ids containing "rogue" fail a control, so the demo can show DECLINE.
  const controls = STUB_CONTROL_IDS.map((id, i) => ({
    id,
    pass: !(agentId.includes("rogue") && i === STUB_CONTROL_IDS.length - 1),
    evidenceHash: "0x" + createHash("sha256").update(`${agentId}:${id}`).digest("hex"),
    ts,
  }));
  return { agentId, compliant: controls.every(c => c.pass), controls, source: "stub" };
}

export async function attestationFor(agentId: string): Promise<Attestation> {
  return registry ? fromRegistry(agentId) : fromStub(agentId);
}

export const attestationSource = registry ? `sepolia:${registry.address}` : "stub";
