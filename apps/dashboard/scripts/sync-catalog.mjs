// Copies ../../controls/catalog.json into lib/catalog.bundled.json before a build,
// so images built from apps/dashboard alone carry the current catalogue.
// Skips quietly when the repo file is not there (e.g. inside the Docker build).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const src = new URL("../../../controls/catalog.json", import.meta.url);
const dst = new URL("../lib/catalog.bundled.json", import.meta.url);
if (existsSync(src)) {
  const d = JSON.parse(readFileSync(src, "utf8"));
  const keep = ["id", "title", "objective", "test", "evidence", "frequency", "implemented"];
  const controls = d.controls.map(c => ({
    ...Object.fromEntries(keep.map(k => [k, c[k]])),
    soc2: c.soc2_tsc,
    iso42001: c.iso42001_annex_a,
    unverified: c.unverified ?? [],
  }));
  writeFileSync(dst, JSON.stringify({ version: d.version, controls }, null, 2) + "\n");
}
