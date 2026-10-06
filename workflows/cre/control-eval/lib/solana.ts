import { base64Decode, BorshReader, startsWith } from './codec'
import type { Evidence, Payment, Snapshot } from './types'

// Anchor discriminators, checked against programs/solana/target/idl/attesta_guard.json.
export const AGENT_POLICY_DISC = [148, 193, 218, 129, 21, 96, 195, 77] as const
export const SPEND_EVENT_DISC = [53, 88, 173, 183, 74, 205, 27, 182] as const
export const FROZEN_CHANGED_DISC = [223, 64, 57, 47, 168, 188, 36, 90] as const

/** AgentPolicy: agent, authority, daily_cap u64, spent_today u64, day_index i64, frozen bool, allowlist vec<pubkey>, bump, vault_bump */
export const decodePolicy = (dataB64: string): Snapshot => {
	const raw = base64Decode(dataB64)
	if (!startsWith(raw, AGENT_POLICY_DISC)) throw new Error('not an AgentPolicy account')
	const r = new BorshReader(raw)
	r.skip(8)
	const signer = r.pubkey()
	const authority = r.pubkey()
	const onchainCap = r.u64()
	const spentToday = r.u64()
	const dayIndex = r.i64()
	const frozen = r.bool()
	const n = r.u32()
	const allowlist: string[] = []
	for (let i = 0; i < n; i++) allowlist.push(r.pubkey())
	return {
		authority,
		signer,
		onchainCap: onchainCap.toString(),
		spentToday: spentToday.toString(),
		dayIndex: dayIndex.toString(),
		frozen,
		allowlist,
	}
}

/** Pulls SpendEvents out of a tx's "Program data:" log lines. */
export const decodeSpendEvents = (signature: string, logMessages: string[]): Payment[] => {
	const out: Payment[] = []
	for (const line of logMessages) {
		if (!line.startsWith('Program data: ')) continue
		const raw = base64Decode(line.slice('Program data: '.length))
		if (!startsWith(raw, SPEND_EVENT_DISC)) continue
		const r = new BorshReader(raw)
		r.skip(8)
		r.pubkey() // agent
		const to = r.pubkey()
		const amount = r.u64()
		r.u64() // spent_today
		r.u64() // daily_cap
		const allowlisted = r.bool()
		const ts = r.i64()
		out.push({ to, amount: amount.toString(), ref: signature, flaggedOffList: !allowlisted, ts: ts.toString() })
	}
	return out
}

export type SolanaTx = { signature: string; logMessages: string[] }

/** Unix times of FrozenChanged(frozen = false) events in a tx's logs. */
export const decodeUnfreezes = (logMessages: string[]): bigint[] => {
	const out: bigint[] = []
	for (const line of logMessages) {
		if (!line.startsWith('Program data: ')) continue
		const raw = base64Decode(line.slice('Program data: '.length))
		if (!startsWith(raw, FROZEN_CHANGED_DISC)) continue
		const r = new BorshReader(raw)
		r.skip(8 + 32 + 32) // disc, agent, authority
		const frozen = r.bool()
		r.u32() // reason_code
		const ts = r.i64()
		if (!frozen) out.push(ts)
	}
	return out
}

/**
 * Payments count from the later of: start of the current UTC day, or the latest unfreeze.
 * After a human reviews a FAIL and unfreezes the agent, the spend that caused it must not fail the next run again.
 */
export const buildSolanaEvidence = (policyB64: string, txs: SolanaTx[], nowSec: bigint): Evidence => {
	const dayStart = (nowSec / 86_400n) * 86_400n
	const unfreezes = txs.flatMap((t) => decodeUnfreezes(t.logMessages))
	const lastUnfreeze = unfreezes.length > 0 ? unfreezes.reduce((a, b) => (b > a ? b : a)) : -1n
	const all = txs.flatMap((t) => decodeSpendEvents(t.signature, t.logMessages))
	const payments = all.filter((p) => {
		const ts = BigInt(p.ts ?? '0')
		return ts >= dayStart && ts > lastUnfreeze
	})
	return {
		source: 'solana',
		snapshot: decodePolicy(policyB64),
		payments,
		// Newest signature first (getSignaturesForAddress order) marks the observation point.
		at: txs[0]?.signature ?? 'no-txs',
		windowStart: (lastUnfreeze > dayStart ? lastUnfreeze : dayStart).toString(),
	}
}
