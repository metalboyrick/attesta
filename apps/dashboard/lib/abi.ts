import { parseAbi, parseAbiItem } from "viem";

/** contracts/evm/src/AttestationRegistry.sol, the parts the dashboard reads. Shared by server and browser. */
export const controlResultEvent = parseAbiItem(
  "event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts)",
);

export const registryAbi = parseAbi([
  "function isCompliant(bytes32 agentId) view returns (bool)",
  "function getControls(bytes32 agentId) view returns (bytes32[])",
  "function getResult(bytes32 agentId, bytes32 controlId) view returns ((bool pass, bytes32 evidenceHash, uint64 ts))",
]);
