/**
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, which would freeze
 * the registry address into a prebuilt image. Reading through a computed key
 * keeps it a runtime value. REGISTRY_ADDRESS is accepted as the plain name.
 */
export function registryAddress(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const key = ["NEXT", "PUBLIC", "REGISTRY", "ADDRESS"].join("_");
  return env.REGISTRY_ADDRESS || env[key] || undefined;
}

/** Browser-side "Verify on-chain" config. Off in fixture mode: there is nothing real to check. */
export function verifyConfig(mode: "fixture" | "live"): { registry: string; rpc: string } | null {
  const registry = registryAddress();
  if (mode !== "live" || !registry) return null;
  return { registry, rpc: process.env.PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com" };
}
