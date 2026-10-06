import { describe, expect, test } from 'bun:test'
import { base58Encode, base64Decode } from '../lib/codec'
import { evalCounterparties, evalKey, evalSpend, evaluateAll } from '../lib/controls'
import { buildSolanaEvidence, decodePolicy, decodeSpendEvents } from '../lib/solana'
import type { Evidence } from '../lib/types'
import { AGENT, AUTHORITY, policyB64, spendLine, STRANGER, VENDOR } from './fixture'

const NOW = 1_791_263_323n
const DAY = NOW / 86_400n

describe('codec', () => {
	test('base58 known vectors', () => {
		expect(base58Encode(new Uint8Array(32))).toBe('11111111111111111111111111111111')
		expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112')
		expect(base58Encode(new TextEncoder().encode('hello world'))).toBe('StV1DL6CwTryKyV')
	})
	test('base64 round trip vs btoa', () => {
		const b = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 7])
		expect([...base64Decode(btoa(String.fromCharCode(...b)))]).toEqual([...b])
	})
})

describe('solana decoders', () => {
	test('AgentPolicy', () => {
		const s = decodePolicy(policyB64(5n, 3n, DAY, [VENDOR]))
		expect(s.signer).toBe(base58Encode(AGENT))
		expect(s.authority).toBe(base58Encode(AUTHORITY))
		expect(s.onchainCap).toBe('5')
		expect(s.spentToday).toBe('3')
		expect(s.dayIndex).toBe(DAY.toString())
		expect(s.frozen).toBe(false)
	})
	test('rejects non-policy account', () => {
		expect(() => decodePolicy(btoa('nope-nope-nope'))).toThrow()
	})
	test('SpendEvent lines, ignores others', () => {
		const p = decodeSpendEvents('sig', [
			'Program log: Instruction: Spend',
			spendLine(STRANGER, 7n, 7n, 10n, false, NOW),
			'Program data: AAAAAAAAAAA=',
		])
		expect(p).toEqual([{ to: base58Encode(STRANGER), amount: '7', ref: 'sig' }])
	})
})

const policy = {
	approvedDailyCap: '1000',
	allowlist: [base58Encode(VENDOR)],
	registeredSigner: base58Encode(AGENT),
	registeredAuthority: base58Encode(AUTHORITY),
}

const ev = (over: Partial<Evidence['snapshot']> = {}, payments: Evidence['payments'] = []): Evidence => ({
	source: 't',
	at: 'x',
	payments,
	snapshot: {
		authority: base58Encode(AUTHORITY),
		signer: base58Encode(AGENT),
		onchainCap: '1000',
		spentToday: '400',
		dayIndex: DAY.toString(),
		frozen: false,
		...over,
	},
})

describe('controls', () => {
	test('SPEND passes under cap, fails over cap', () => {
		expect(evalSpend(ev(), policy, NOW).pass).toBe(true)
		expect(evalSpend(ev({ spentToday: '1001' }), policy, NOW).pass).toBe(false)
	})
	test('SPEND ignores stale day', () => {
		expect(evalSpend(ev({ spentToday: '5000', dayIndex: (DAY - 1n).toString() }), policy, NOW).pass).toBe(true)
	})
	test('SPEND fails on cap drift', () => {
		const o = evalSpend(ev({ onchainCap: '2000', spentToday: '0' }), policy, NOW)
		expect(o.pass).toBe(false)
		expect(JSON.parse(o.evidence).capDrift).toBe(true)
	})
	test('CPTY flags off-allowlist payee', () => {
		expect(evalCounterparties(ev({}, [{ to: base58Encode(VENDOR), amount: '1', ref: 'a' }]), policy).pass).toBe(true)
		const o = evalCounterparties(ev({}, [{ to: base58Encode(STRANGER), amount: '1', ref: 'b' }]), policy)
		expect(o.pass).toBe(false)
		expect(JSON.parse(o.evidence).offAllowlist[0].ref).toBe('b')
	})
	test('CPTY EVM addresses compare case-insensitively', () => {
		const p = { ...policy, allowlist: ['0xAbC0000000000000000000000000000000000001'] }
		expect(evalCounterparties(ev({}, [{ to: '0xabc0000000000000000000000000000000000001', amount: '1', ref: 'a' }]), p).pass).toBe(true)
	})
	test('KEY fails on signer or authority change', () => {
		expect(evalKey(ev(), policy).pass).toBe(true)
		expect(evalKey(ev({ signer: base58Encode(STRANGER) }), policy).pass).toBe(false)
		expect(evalKey(ev({ authority: base58Encode(STRANGER) }), policy).pass).toBe(false)
	})
	test('end to end fixture: CPTY fails only', () => {
		const e = buildSolanaEvidence(policyB64(1000n, 400n, DAY, [VENDOR]), [
			{ signature: 's2', logMessages: [spendLine(STRANGER, 100n, 400n, 1000n, false, NOW)] },
			{ signature: 's1', logMessages: [spendLine(VENDOR, 300n, 300n, 1000n, true, NOW)] },
		])
		const r = Object.fromEntries(evaluateAll(e, policy, NOW).map((o) => [o.controlId, o.pass]))
		expect(r).toEqual({ 'ATT-SPEND-01': true, 'ATT-CPTY-02': false, 'ATT-KEY-03': true })
		expect(e.at).toBe('s2')
	})
})
