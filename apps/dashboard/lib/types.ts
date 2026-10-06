export type Chain = "sepolia" | "solana-devnet" | "cardano-preprod";
export type AgentStatus = "compliant" | "failing" | "frozen" | "unknown";

export type ControlDef = {
  id: string;
  title: string;
  objective: string;
  test: string;
  evidence: string;
  frequency: string;
  /** false = designed in the catalogue but the CRE workflow does not run it yet */
  implemented: boolean;
  soc2: string[];
  iso42001: string[];
  unverified: string[];
};

export type AgentDef = {
  slug: string;
  name: string;
  /** Label hashed with keccak256 to get the registry bytes32 agentId. */
  registryId: string;
  chain: Chain;
  role: string;
};

export type ControlResult = {
  controlId: string;
  agentSlug: string;
  pass: boolean;
  evidenceHash: string;
  /** unix seconds, as written by the CRE workflow */
  ts: number;
  txHash: string;
  chain: Chain;
};

export type TimelineEvent =
  | { kind: "control"; ts: number; agentSlug: string; chain: Chain; txHash: string; controlId: string; pass: boolean }
  | { kind: "freeze" | "unfreeze"; ts: number; agentSlug: string; chain: Chain; txHash: string; reasonCode: number }
  | { kind: "purchase"; ts: number; agentSlug?: string; chain: Chain; txHash: string; buyer?: string };

export type AgentView = AgentDef & {
  status: AgentStatus;
  frozen: boolean;
  lastRun: number | null;
  /** latest result per control id; missing = never reported */
  latest: Record<string, ControlResult | undefined>;
  failing: string[];
};

export type Snapshot = {
  mode: "fixture" | "live";
  generatedAt: number;
  catalogSource: "catalog.json" | "bundled";
  catalogVersion: string;
  notes: string[];
  errors: string[];
  controls: ControlDef[];
  agents: AgentView[];
  results: ControlResult[];
  events: TimelineEvent[];
};
