/**
 * Attestation lookup. Stub data for now; will read the Sepolia
 * AttestationRegistry once contracts/evm is deployed.
 */
import { createHash } from "node:crypto";

export type Control = { id: string; pass: boolean; evidenceHash: string; ts: number };
export type Attestation = {
  agentId: string;
  compliant: boolean;
  controls: Control[];
  source: string;
};

const CONTROL_IDS = ["AC-01-key-custody", "AU-02-action-logging", "SP-03-spend-limits"];

export async function attestationFor(agentId: string): Promise<Attestation> {
  const ts = Math.floor(Date.now() / 1000);
  const controls = CONTROL_IDS.map(id => ({
    id,
    pass: true,
    evidenceHash: "0x" + createHash("sha256").update(`${agentId}:${id}`).digest("hex"),
    ts,
  }));
  return {
    agentId,
    compliant: controls.every(c => c.pass),
    controls,
    source: "stub",
  };
}
