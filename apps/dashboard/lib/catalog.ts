import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import bundled from "./catalog.bundled.json";
import type { ControlDef, Snapshot } from "./types";

type RawControl = Record<string, unknown>;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

function normalise(raw: RawControl): ControlDef | null {
  if (typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    title: String(raw.title ?? raw.id),
    objective: String(raw.objective ?? ""),
    test: String(raw.test ?? ""),
    evidence: String(raw.evidence ?? ""),
    frequency: String(raw.frequency ?? ""),
    implemented: raw.implemented !== false,
    soc2: asList(raw.soc2_tsc ?? raw.soc2),
    iso42001: asList(raw.iso42001_annex_a ?? raw.iso42001),
    unverified: asList(raw.unverified),
  };
}

const parse = (json: unknown) => {
  const list = Array.isArray(json) ? json : ((json as { controls?: unknown }).controls ?? []);
  return (list as RawControl[]).map(normalise).filter((c): c is ControlDef => c !== null);
};

/**
 * Reads controls/catalog.json from the repo at request time so catalogue edits
 * show up without a rebuild. Falls back to the copy bundled at build time
 * (lib/catalog.bundled.json) when the repo file is not deployed alongside.
 */
export function loadCatalog(): { controls: ControlDef[]; source: Snapshot["catalogSource"]; version: string } {
  const file =
    process.env.CONTROLS_CATALOG_PATH || path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../../controls/catalog.json");
  try {
    const json = JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { version?: string };
    const controls = parse(json);
    if (controls.length) return { controls, source: "catalog.json", version: json.version ?? "" };
  } catch {
    // fall through to the bundled copy
  }
  return { controls: parse(bundled), source: "bundled", version: bundled.version };
}


