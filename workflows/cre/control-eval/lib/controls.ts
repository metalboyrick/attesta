import type { Evidence } from './types'

export const SECONDS_PER_DAY = 86_400n

export type AgentPolicyOfRecord = {
	/** Cap the agent was approved for, in wei or lamports. The on-chain cap must not exceed it. */
	approvedDailyCap: string
	allowlist: string[]
	registeredSigner: string
	registeredAuthority: string
}

export type ControlOutcome = {
	controlId: string
	pass: boolean
	/** Canonical JSON that gets keccak-hashed into evidenceHash. */
	evidence: string
}

const json = (o: unknown) => JSON.stringify(o)

// EVM addresses compare case-insensitively; Solana base58 keys are case-sensitive.
const sameKey = (a: string, b: string) => (a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b)

/** ATT-SPEND-01: spend in the current UTC day is at or under the approved cap, and nobody raised the on-chain cap above it. */
export const evalSpend = (ev: Evidence, p: AgentPolicyOfRecord, nowSec: bigint): ControlOutcome => {
	const today = nowSec / SECONDS_PER_DAY
	// A snapshot from an earlier day means nothing has been spent today yet.
	const spent = BigInt(ev.snapshot.dayIndex) === today ? BigInt(ev.snapshot.spentToday) : 0n
	const approved = BigInt(p.approvedDailyCap)
	const capDrift = BigInt(ev.snapshot.onchainCap) > approved
	const pass = spent <= approved && !capDrift
	return {
		controlId: 'ATT-SPEND-01',
		pass,
		evidence: json({
			control: 'ATT-SPEND-01',
			source: ev.source,
			at: ev.at,
			day: today.toString(),
			spentToday: spent.toString(),
			approvedDailyCap: p.approvedDailyCap,
			onchainCap: ev.snapshot.onchainCap,
			capDrift,
		}),
	}
}

/** ATT-CPTY-02: every payment in the observed window went to an allowlisted counterparty. */
export const evalCounterparties = (ev: Evidence, p: AgentPolicyOfRecord): ControlOutcome => {
	const offList = ev.payments.filter((x) => !p.allowlist.some((a) => sameKey(a, x.to)))
	return {
		controlId: 'ATT-CPTY-02',
		pass: offList.length === 0,
		evidence: json({
			control: 'ATT-CPTY-02',
			source: ev.source,
			at: ev.at,
			paymentsSeen: ev.payments.length,
			offAllowlist: offList,
			refs: ev.payments.map((x) => x.ref),
		}),
	}
}

/** ATT-KEY-03: the agent still signs with its registered key and the authority has not changed. */
export const evalKey = (ev: Evidence, p: AgentPolicyOfRecord): ControlOutcome => {
	const signerOk = sameKey(ev.snapshot.signer, p.registeredSigner)
	const authorityOk = sameKey(ev.snapshot.authority, p.registeredAuthority)
	return {
		controlId: 'ATT-KEY-03',
		pass: signerOk && authorityOk,
		evidence: json({
			control: 'ATT-KEY-03',
			source: ev.source,
			at: ev.at,
			signer: ev.snapshot.signer,
			registeredSigner: p.registeredSigner,
			authority: ev.snapshot.authority,
			registeredAuthority: p.registeredAuthority,
		}),
	}
}

export const evaluateAll = (ev: Evidence, p: AgentPolicyOfRecord, nowSec: bigint): ControlOutcome[] => [
	evalSpend(ev, p, nowSec),
	evalCounterparties(ev, p),
	evalKey(ev, p),
]
