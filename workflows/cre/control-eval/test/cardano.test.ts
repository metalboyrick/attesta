import { describe, expect, test } from 'bun:test'
import { buildCardanoEvidence, type KoiosTx } from '../lib/cardano'
import { evaluateAll } from '../lib/controls'

const AGENT = 'addr_test1agent_base'
const AGENT_OTHER_STAKE = 'addr_test1agent_otherstake'
const SELLER = 'addr_test1seller'
const STRANGER = 'addr_test1stranger'
const out = (bech32: string, cred: string, value: string) => ({ payment_addr: { bech32, cred }, value })
const DAY_START = 1_791_244_800n // 2026-10-06 00:00 UTC

const tx = (hash: string, ts: number, outputs: KoiosTx['outputs'], from = AGENT): KoiosTx => ({
	tx_hash: hash,
	tx_timestamp: ts,
	inputs: [out(from, from === AGENT ? 'credA' : 'credX', '100000000')],
	outputs,
})

const policy = { approvedDailyCap: '50000000', allowlist: [SELLER], registeredSigner: AGENT, registeredAuthority: '' }

describe('cardano evidence', () => {
	test('change (same address or same payment cred) is not spend', () => {
		const ev = buildCardanoEvidence(AGENT, DAY_START, {
			txCount: 1,
			limit: 20,
			txs: [tx('t1', 1_791_250_000, [out(SELLER, 'credS', '2000000'), out(AGENT, 'credA', '97000000'), out(AGENT_OTHER_STAKE, 'credA', '800000')])],
		})
		expect(ev.payments).toEqual([{ to: SELLER, amount: '2000000', ref: 't1' }])
		expect(ev.snapshot.spentToday).toBe('2000000')
	})
	test('incoming txs and txs before today are ignored', () => {
		const ev = buildCardanoEvidence(AGENT, DAY_START, {
			txCount: 2,
			limit: 20,
			txs: [
				tx('in', 1_791_250_000, [out(AGENT, 'credA', '5000000')], STRANGER),
				tx('old', 1_791_000_000, [out(STRANGER, 'credX', '9000000')]),
			],
		})
		// 'old' has no agent input cred registered from an in-window agent tx, and is before dayStart anyway
		expect(ev.payments).toEqual([])
	})
	test('truncated history is refused (skip, not pass)', () => {
		expect(() => buildCardanoEvidence(AGENT, DAY_START, { txCount: 20, limit: 20, txs: [] })).toThrow()
	})
	test('controls: stranger payee fails CPTY, spend over cap fails SPEND', () => {
		const ev = buildCardanoEvidence(AGENT, DAY_START, {
			txCount: 2,
			limit: 20,
			txs: [
				tx('a', 1_791_250_000, [out(SELLER, 'credS', '2000000'), out(AGENT, 'credA', '1')]),
				tx('b', 1_791_250_100, [out(STRANGER, 'credX', '60000000'), out(AGENT, 'credA', '1')]),
			],
		})
		const r = Object.fromEntries(evaluateAll(ev, policy, DAY_START + 3600n).map((o) => [o.controlId, o.pass]))
		expect(r['ATT-SPEND-01']).toBe(false)
		expect(r['ATT-CPTY-02']).toBe(false)
	})
	test('empty wallet: both pass with zero payments', () => {
		const ev = buildCardanoEvidence(AGENT, DAY_START, { txCount: 0, limit: 20, txs: [] })
		const r = evaluateAll(ev, policy, DAY_START + 10n)
		expect(r[0].pass && r[1].pass).toBe(true)
	})
	test('limit 10 (9 txs x 4 outputs) observation stays under the 20 KB budget', () => {
		const txs = Array.from({ length: 9 }, (_, i) =>
			tx('f'.repeat(64), 1_791_250_000 + i, Array.from({ length: 4 }, () => out('addr_test1' + 'q'.repeat(98), 'c'.repeat(56), '1234567890'))),
		)
		const size = JSON.stringify({ txCount: 9, limit: 10, txs }).length
		expect(size).toBeLessThan(20_000)
	})
})
