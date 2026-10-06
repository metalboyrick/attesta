import {
	bigintToProtoBigInt,
	bytesToBase64,
	bytesToHex,
	consensusIdenticalAggregation,
	cre,
	encodeCallMsg,
	hexToBase64,
	LAST_FINALIZED_BLOCK_NUMBER,
	LATEST_BLOCK_NUMBER,
	protoBigIntToBigint,
	type HTTPSendRequester,
	type Runtime,
} from '@chainlink/cre-sdk'
import { type Address, decodeEventLog, decodeFunctionResult, encodeFunctionData, type Hex, parseAbi, toEventSelector, zeroAddress } from 'viem'
import { buildCardanoEvidence, type CardanoRaw, type KoiosTx } from './cardano'
import { buildSolanaEvidence, type SolanaTx } from './solana'
import type { Evidence } from './types'

// ─── EVM (Sepolia AgentWallet) ──────────────────────────────

const WALLET_ABI = parseAbi([
	'function state() view returns (address owner_, address signer_, uint256 cap_, uint256 spent_, uint64 day_, bool frozen_)',
	'event Payment(address indexed signer, address indexed to, uint256 amount, uint256 spentToday, uint256 dailyCap, bool allowlisted, uint64 ts)',
])
const PAYMENT_TOPIC = toEventSelector(
	'Payment(address,address,uint256,uint256,uint256,bool,uint64)',
)

/** The CRE log query is capped at 100 blocks, so CPTY-02 looks at the last 100 blocks per run (cron every 5 min = ~25 blocks, so windows overlap). */
export const LOG_WINDOW_BLOCKS = 100n

export const collectEvm = (
	runtime: Runtime<unknown>,
	evm: InstanceType<typeof cre.capabilities.EVMClient>,
	wallet: Address,
	blockTag: 'latest' | 'finalized',
): Evidence => {
	if (/^0x0{40}$/i.test(wallet)) throw new Error('AgentWallet not deployed (wallet is the zero address)')
	const tag = blockTag === 'finalized' ? LAST_FINALIZED_BLOCK_NUMBER : LATEST_BLOCK_NUMBER
	const header = evm.headerByNumber(runtime, { blockNumber: tag }).result()
	if (!header.header?.blockNumber) throw new Error('EVM header missing block number')
	const head = protoBigIntToBigint(header.header.blockNumber)

	const stateRaw = evm
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: wallet, data: encodeFunctionData({ abi: WALLET_ABI, functionName: 'state' }) }),
			blockNumber: bigintToProtoBigInt(head),
		})
		.result()
	const [owner, signer, cap, spent, day, frozen] = decodeFunctionResult({
		abi: WALLET_ABI,
		functionName: 'state',
		data: bytesToHex(stateRaw.data),
	})

	const from = head >= LOG_WINDOW_BLOCKS - 1n ? head - (LOG_WINDOW_BLOCKS - 1n) : 0n
	const logs = evm
		.filterLogs(runtime, {
			filterQuery: {
				addresses: [hexToBase64(wallet)],
				topics: [{ topic: [hexToBase64(PAYMENT_TOPIC)] }],
				fromBlock: bigintToProtoBigInt(from),
				toBlock: bigintToProtoBigInt(head),
			},
		})
		.result().logs

	const payments = logs.map((l) => {
		const ev = decodeEventLog({
			abi: WALLET_ABI,
			eventName: 'Payment',
			topics: l.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
			data: bytesToHex(l.data),
		})
		return { to: ev.args.to, amount: ev.args.amount.toString(), ref: bytesToHex(l.txHash) }
	})

	return {
		source: `evm:${wallet}`,
		snapshot: {
			authority: owner,
			signer,
			onchainCap: cap.toString(),
			spentToday: spent.toString(),
			dayIndex: day.toString(),
			frozen,
		},
		payments,
		at: `block ${from}-${head}`,
	}
}

// ─── Solana (attesta_guard policy PDA, devnet) ──────────────

export type SolanaSource = {
	rpcUrl: string
	policyPda: string
	commitment: 'confirmed' | 'finalized'
	maxTxs: number
	/** Optional header name for keyed RPCs (NOWNodes uses "api-key"). Value comes from the SOLANA_RPC_API_KEY secret. */
	apiKeyHeader?: string
}

const rpc = (send: HTTPSendRequester, src: SolanaSource, apiKey: string, method: string, params: unknown[]) => {
	const headers: Record<string, string> = { 'content-type': 'application/json' }
	if (src.apiKeyHeader && apiKey) headers[src.apiKeyHeader] = apiKey
	const res = send
		.sendRequest({
			url: src.rpcUrl,
			method: 'POST',
			headers,
			body: bytesToBase64(new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))),
		})
		.result()
	if (res.statusCode !== 200) throw new Error(`solana ${method}: HTTP ${res.statusCode}`)
	const body = JSON.parse(new TextDecoder().decode(res.body))
	if (body.error) throw new Error(`solana ${method}: ${JSON.stringify(body.error)}`)
	return body.result
}

// No slot here: nodes see different slots, and identical-consensus would never agree on it.
export type SolanaRaw = { policyB64: string; txs: SolanaTx[] }

const fetchSolanaRaw = (send: HTTPSendRequester, src: SolanaSource, apiKey: string): SolanaRaw => {
	const acct = rpc(send, src, apiKey, 'getAccountInfo', [src.policyPda, { encoding: 'base64', commitment: src.commitment }])
	if (!acct?.value) throw new Error(`policy account ${src.policyPda} not found`)
	const sigs: { signature: string; err: unknown }[] = rpc(send, src, apiKey, 'getSignaturesForAddress', [
		src.policyPda,
		{ limit: src.maxTxs, commitment: src.commitment },
	])
	const txs: SolanaTx[] = []
	for (const s of sigs) {
		if (s.err) continue
		const tx = rpc(send, src, apiKey, 'getTransaction', [
			s.signature,
			{ encoding: 'json', commitment: src.commitment, maxSupportedTransactionVersion: 0 },
		])
		if (tx?.meta?.err) continue
		// Only event lines: keeps the consensus observation small.
		const logs: string[] = (tx?.meta?.logMessages ?? []).filter((l: string) => l.startsWith('Program data: '))
		txs.push({ signature: s.signature, logMessages: logs })
	}
	return { policyB64: acct.value.data[0], txs }
}

export const collectSolana = (runtime: Runtime<unknown>, src: SolanaSource, apiKey: string, nowSec: bigint): Evidence => {
	const http = new cre.capabilities.HTTPClient()
	// Every node fetches; nodes must agree on the exact raw data before we decode it.
	const raw = http
		.sendRequest(runtime, (send: HTTPSendRequester) => fetchSolanaRaw(send, src, apiKey), consensusIdenticalAggregation<SolanaRaw>())()
		.result()
	return buildSolanaEvidence(raw.policyB64, raw.txs, nowSec)
}

export const fixtureSolana = (f: SolanaRaw, nowSec: bigint): Evidence => ({
	...buildSolanaEvidence(f.policyB64, f.txs, nowSec),
	source: 'solana-fixture',
})

// ─── Cardano (Koios, preprod) ───────────────────────────────

export type CardanoSource = { koiosUrl: string; address: string; limit: number }

/** CRE consensus observations are capped at 25 KB; stay clear of it. */
const MAX_OBSERVATION_BYTES = 20_000

const koios = (send: HTTPSendRequester, base: string, path: string, body: unknown) => {
	const res = send
		.sendRequest({
			url: `${base}${path}`,
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: bytesToBase64(new TextEncoder().encode(JSON.stringify(body))),
		})
		.result()
	if (res.statusCode !== 200) throw new Error(`koios ${path}: HTTP ${res.statusCode}`)
	return JSON.parse(new TextDecoder().decode(res.body))
}

const fetchCardanoRaw = (send: HTTPSendRequester, src: CardanoSource, dayStart: string): CardanoRaw => {
	const rows: { tx_hash: string }[] = koios(
		send,
		src.koiosUrl,
		`/address_txs?block_time=gte.${dayStart}&order=block_time.desc&limit=${src.limit}`,
		{ _addresses: [src.address] },
	)
	if (rows.length === 0) return { txCount: 0, limit: src.limit, txs: [] }
	const infos: KoiosTx[] = koios(send, src.koiosUrl, '/tx_info', {
		_tx_hashes: rows.map((r) => r.tx_hash),
		_inputs: true,
	})
	const trim = (o: KoiosTx['outputs'][number]) => ({
		payment_addr: { bech32: o.payment_addr.bech32, cred: o.payment_addr.cred },
		value: o.value,
	})
	// One input per payment credential is enough to tell "the agent paid"; wallets with many UTxOs would bloat it.
	const dedupe = (ins: KoiosTx['inputs']) => ins.filter((x, i) => ins.findIndex((y) => y.payment_addr.cred === x.payment_addr.cred) === i)
	const txs = infos
		.map((t) => ({ tx_hash: t.tx_hash, tx_timestamp: t.tx_timestamp, inputs: dedupe(t.inputs).map(trim), outputs: t.outputs.map(trim) }))
		.sort((a, b) => (a.tx_hash < b.tx_hash ? -1 : 1))
	const raw = { txCount: rows.length, limit: src.limit, txs }
	if (JSON.stringify(raw).length > MAX_OBSERVATION_BYTES) throw new Error('koios observation over size budget')
	return raw
}

/** 2 HTTP calls (1 when no txs today). */
export const collectCardano = (runtime: Runtime<unknown>, src: CardanoSource, dayStart: bigint): Evidence => {
	const http = new cre.capabilities.HTTPClient()
	const raw = http
		.sendRequest(runtime, (send: HTTPSendRequester) => fetchCardanoRaw(send, src, dayStart.toString()), consensusIdenticalAggregation<CardanoRaw>())()
		.result()
	return buildCardanoEvidence(src.address, dayStart, raw)
}

export const fixtureCardano = (address: string, dayStart: bigint, f: CardanoRaw): Evidence => ({
	...buildCardanoEvidence(address, dayStart, f),
	source: `cardano-fixture:${address}`,
})
