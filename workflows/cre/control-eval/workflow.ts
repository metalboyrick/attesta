import { bytesToHex, cre, getNetwork, prepareReportRequest, TxStatus, type Runtime } from '@chainlink/cre-sdk'
import { type Address, encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from 'viem'
import { z } from 'zod'
import { collectCardano, collectEvm, collectSolana, fixtureCardano, fixtureSolana } from './lib/collectors'
import { type ControlOutcome, evaluateAll, SECONDS_PER_DAY } from './lib/controls'
import type { Evidence } from './lib/types'

// ─── Config Schema ──────────────────────────────────────────
const policySchema = z.object({
	approvedDailyCap: z.string(),
	allowlist: z.array(z.string()),
	registeredSigner: z.string(),
	registeredAuthority: z.string(),
})

const CONTROL_IDS = ['ATT-SPEND-01', 'ATT-CPTY-02', 'ATT-KEY-03'] as const
// Which controls to run for an agent. Default: all three.
const controlsField = z.array(z.enum(CONTROL_IDS)).optional()

const evmAgentSchema = z.object({
	agentId: z.string(),
	controls: controlsField,
	kind: z.literal('evm'),
	wallet: z.string(),
	policy: policySchema,
})

const solanaAgentSchema = z.object({
	agentId: z.string(),
	controls: controlsField,
	kind: z.literal('solana'),
	solana: z.object({
		mode: z.enum(['rpc', 'fixture']),
		rpcUrl: z.string(),
		policyPda: z.string(),
		commitment: z.enum(['confirmed', 'finalized']),
		maxTxs: z.number().int().min(1).max(10),
		apiKeyHeader: z.string().optional(),
		fixture: z
			.object({
				policyB64: z.string(),
				txs: z.array(z.object({ signature: z.string(), logMessages: z.array(z.string()) })),
			})
			.optional(),
	}),
	policy: policySchema,
})

const cardanoAgentSchema = z.object({
	agentId: z.string(),
	kind: z.literal('cardano'),
	// Plain key address: no authority to check, so ATT-KEY-03 is normally left out here.
	controls: controlsField,
	cardano: z.object({
		mode: z.enum(['rpc', 'fixture']),
		koiosUrl: z.string(),
		address: z.string(),
		// Max 10 keeps the consensus observation under the 25 KB limit (about 1.2 KB per tx).
		limit: z.number().int().min(2).max(10),
		fixture: z
			.object({
				txCount: z.number(),
				limit: z.number(),
				txs: z.array(
					z.object({
						tx_hash: z.string(),
						tx_timestamp: z.number(),
						inputs: z.array(z.object({ payment_addr: z.object({ bech32: z.string(), cred: z.string() }), value: z.string() })),
						outputs: z.array(z.object({ payment_addr: z.object({ bech32: z.string(), cred: z.string() }), value: z.string() })),
					}),
				),
			})
			.optional(),
	}),
	policy: policySchema,
})

export const configSchema = z.object({
	// "local-simulation" collects and evaluates with real reads but never builds a report or writes.
	// Only config.local-simulation.json may set it; production configs must say "production".
	mode: z.enum(['production', 'local-simulation']),
	schedule: z.string(),
	chainSelectorName: z.string(),
	registryAddress: z.string(),
	gasLimit: z.string(),
	evmLogBlockTag: z.enum(['latest', 'finalized']),
	agents: z.array(z.discriminatedUnion('kind', [evmAgentSchema, solanaAgentSchema, cardanoAgentSchema])),
})
type Config = z.infer<typeof configSchema>

// String ids are hashed so the contract only deals in bytes32. Same rule as services/x402-cardano.
const id32 = (s: string) => keccak256(stringToHex(s))

const REPORT_ABI = parseAbiParameters('bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts')

// ─── Cron Callback ──────────────────────────────────────────
export const onCronTrigger = (runtime: Runtime<Config>): string => {
	const config = runtime.config
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)
	const evm = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const nowSec = BigInt(Math.floor(runtime.now().getTime() / 1000))
	const local = config.mode === 'local-simulation'
	if (!local && !/^0x[0-9a-fA-F]{40}$/.test(config.registryAddress)) throw new Error('registryAddress missing or malformed')
	if (!local && /^0x0{40}$/.test(config.registryAddress)) throw new Error('registryAddress is the zero address')

	const written: string[] = []
	const skipped: string[] = []
	const dryRun: string[] = []
	const failures: string[] = []

	for (const agent of config.agents) {
		let evidence: Evidence
		let fixture: boolean
		try {
			;({ evidence, fixture } = collect(runtime, evm, config, agent, nowSec))
		} catch (e) {
			// No evidence is not a FAIL: writing one would freeze an agent for our own outage. Skip and say so.
			skipped.push(`${agent.agentId}: evidence unavailable: ${(e as Error).message}`)
			continue
		}
		runtime.log(`${agent.agentId}: ${evidence.source} payments=${evidence.payments.length} at=${evidence.at}`)

		const wanted: readonly string[] = agent.controls ?? CONTROL_IDS
		const outcomes = evaluateAll(evidence, agent.policy, nowSec).filter((o) => wanted.includes(o.controlId))
		if (fixture) {
			// Fixture results never go on-chain, so no demo tx link can point at made-up data.
			outcomes.forEach((o) => skipped.push(`${agent.agentId}/${o.controlId}=${o.pass ? 'PASS' : 'FAIL'} (fixture, not written)`))
			continue
		}
		if (local) {
			for (const o of outcomes) {
				const evidenceHash = keccak256(stringToHex(o.evidence))
				runtime.log(`evidence ${o.evidence}`.slice(0, 1000))
				dryRun.push(`${agent.agentId}/${o.controlId}=${o.pass ? 'PASS' : 'FAIL'} evidenceHash=${evidenceHash}`)
			}
			continue
		}
		for (const o of outcomes) {
			const tx = writeResult(runtime, evm, config, agent.agentId, o, nowSec)
			if (tx.ok) written.push(`${agent.agentId}/${o.controlId}=${o.pass ? 'PASS' : 'FAIL'} ${tx.hash}`)
			else failures.push(`${agent.agentId}/${o.controlId}: ${tx.error}`)
		}
	}

	skipped.forEach((m) => runtime.log(`skipped ${m}`))
	dryRun.forEach((m) => runtime.log(`wouldWrite ${m}`))
	written.forEach((w) => runtime.log(`written ${w}`))
	if (failures.length > 0) throw new Error(`write failures: ${failures.join('; ')}`)
	return [...written, ...dryRun.map((m) => `wouldWrite ${m}`), ...skipped.map((m) => `skipped ${m}`)].join('\n')
}

const collect = (
	runtime: Runtime<Config>,
	evm: InstanceType<typeof cre.capabilities.EVMClient>,
	config: Config,
	agent: Config['agents'][number],
	nowSec: bigint,
): { evidence: Evidence; fixture: boolean } => {
	switch (agent.kind) {
		case 'evm':
			return { evidence: collectEvm(runtime, evm, agent.wallet as Address, config.evmLogBlockTag), fixture: false }
		case 'solana': {
			if (agent.solana.mode === 'fixture') {
				if (!agent.solana.fixture) throw new Error('fixture mode without fixture')
				return { evidence: fixtureSolana(agent.solana.fixture), fixture: true }
			}
			const apiKey = agent.solana.apiKeyHeader ? runtime.getSecret({ id: 'SOLANA_RPC_API_KEY' }).result().value : ''
			return { evidence: collectSolana(runtime, agent.solana, apiKey), fixture: false }
		}
		case 'cardano': {
			const dayStart = (nowSec / SECONDS_PER_DAY) * SECONDS_PER_DAY
			if (agent.cardano.mode === 'fixture') {
				if (!agent.cardano.fixture) throw new Error('fixture mode without fixture')
				return { evidence: fixtureCardano(agent.cardano.address, dayStart, agent.cardano.fixture), fixture: true }
			}
			return { evidence: collectCardano(runtime, agent.cardano, dayStart), fixture: false }
		}
	}
}

const writeResult = (
	runtime: Runtime<Config>,
	evm: InstanceType<typeof cre.capabilities.EVMClient>,
	config: Config,
	agentId: string,
	o: ControlOutcome,
	ts: bigint,
): { ok: true; hash: string } | { ok: false; error: string } => {
	const evidenceHash = keccak256(stringToHex(o.evidence))
	runtime.log(`${agentId} ${o.controlId} pass=${o.pass} evidenceHash=${evidenceHash}`)
	runtime.log(`evidence ${o.evidence}`.slice(0, 1000))

	const report = encodeAbiParameters(REPORT_ABI, [id32(o.controlId), id32(agentId), o.pass, evidenceHash, ts])
	const signed = runtime.report(prepareReportRequest(report)).result()
	const write = evm
		.writeReport(runtime, {
			receiver: config.registryAddress as Address,
			report: signed,
			gasConfig: { gasLimit: config.gasLimit },
		})
		.result()

	const hash = bytesToHex(write.txHash || new Uint8Array(32))
	if (write.txStatus !== TxStatus.SUCCESS) return { ok: false, error: `tx ${write.errorMessage || write.txStatus}` }
	// The mock forwarder does not revert when onReport reverts, so check the receiver status explicitly.
	if (write.receiverContractExecutionStatus !== undefined && write.receiverContractExecutionStatus !== 0) {
		return { ok: false, error: `onReport reverted (status ${write.receiverContractExecutionStatus}) tx ${hash}` }
	}
	return { ok: true, hash }
}

// ─── Workflow Init ──────────────────────────────────────────
export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()
	return [cre.handler(cronTrigger.trigger({ schedule: config.schedule }), onCronTrigger)]
}
