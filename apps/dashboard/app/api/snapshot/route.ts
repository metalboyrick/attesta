import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSnapshot(), { headers: { "cache-control": "no-store" } });
}
