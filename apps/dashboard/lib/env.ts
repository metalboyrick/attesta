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
