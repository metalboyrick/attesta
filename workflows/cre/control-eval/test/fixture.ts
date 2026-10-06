// Builds a Solana fixture in the exact RPC shapes (base64 AgentPolicy account + "Program data:" log lines)
// so fixture mode runs the same decoders as live mode. Run: bun test/fixture.ts > /tmp/out.json
import { base58Encode } from '../lib/codec'
import { AGENT_POLICY_DISC, SPEND_EVENT_DISC } from '../lib/solana'

export const key = (seed: number) => {
	const b = new Uint8Array(32)
	b.fill(seed)
	return b
}

const u64 = (n: bigint) => {
	const b = new Uint8Array(8)
	for (let i = 0; i < 8; i++) b[i] = Number((n >> BigInt(8 * i)) & 0xffn)
	return b
}
const cat = (...parts: (Uint8Array | number[] | readonly number[])[]) => {
	const out: number[] = []
	for (const p of parts) out.push(...p)
	return new Uint8Array(out)
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

export const AGENT = key(1)
export const AUTHORITY = key(2)
export const VENDOR = key(3)
export const STRANGER = key(4)

export const policyB64 = (cap: bigint, spent: bigint, day: bigint, allowlist: Uint8Array[]) =>
	b64(
		cat(
			AGENT_POLICY_DISC,
			AGENT,
			AUTHORITY,
			u64(cap),
			u64(spent),
			u64(day),
			[0],
			[allowlist.length, 0, 0, 0],
			...allowlist,
			[255, 254],
		),
	)

export const spendLine = (to: Uint8Array, amount: bigint, spent: bigint, cap: bigint, allowlisted: boolean, ts: bigint) =>
	`Program data: ${b64(cat(SPEND_EVENT_DISC, AGENT, to, u64(amount), u64(spent), u64(cap), [allowlisted ? 1 : 0], u64(ts)))}`

if (import.meta.main) {
	const now = BigInt(Math.floor(Date.now() / 1000))
	const day = now / 86400n
	const cap = 1_000_000_000n
	console.log(
		JSON.stringify(
			{
				policyB64: policyB64(cap, 400_000_000n, day, [VENDOR]),
				txs: [
					{ signature: 'fixtureSig2', logMessages: [spendLine(STRANGER, 100_000_000n, 400_000_000n, cap, false, now)] },
					{ signature: 'fixtureSig1', logMessages: [spendLine(VENDOR, 300_000_000n, 300_000_000n, cap, true, now - 60n)] },
				],
				keys: {
					agent: base58Encode(AGENT),
					authority: base58Encode(AUTHORITY),
					vendor: base58Encode(VENDOR),
					stranger: base58Encode(STRANGER),
				},
			},
			null,
			2,
		),
	)
}
