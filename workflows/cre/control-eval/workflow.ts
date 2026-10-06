import { bytesToHex, cre, getNetwork, prepareReportRequest, TxStatus, type Runtime } from '@chainlink/cre-sdk'
import { type Address, encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from 'viem'
import { z } from 'zod'
import { collectEvm, collectSolana, fixtureSolana } from './lib/collectors'
import { type ControlOutcome, evaluateAll } from './lib/controls'
import type { Evidence } from './lib/types'

// ─── Config Schema ──────────────────────────────────────────
const policySchema = z.object({
	approvedDailyCap: z.string(),
	allowlist: z.array(z.string()),
	registeredSigner: z.string(),
	registeredAuthority: z.string(),
})

const evmAgentSchema = z.object({
	agentId: z.string(),
	kind: z.literal('evm'),
	wallet: z.string(),
	policy: policySchema,
})

const solanaAgentSchema = z.object({
	agentId: z.string(),
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

export const configSchema = z.object({
	schedule: z.string(),
	chainSelectorName: z.string(),
	registryAddress: z.string(),
	gasLimit: z.string(),
	evmLogBlockTag: z.enum(['latest', 'finalized']),
	agents: z.array(z.discriminatedUnion('kind', [evmAgentSchema, solanaAgentSchema])),
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

	const written: string[] = []
	const failures: string[] = []

	for (const agent of config.agents) {
		let evidence: Evidence
		if (agent.kind === 'evm') {
			evidence = collectEvm(runtime, evm, agent.wallet as Address, config.evmLogBlockTag)
		} else if (agent.solana.mode === 'fixture') {
			if (!agent.solana.fixture) throw new Error(`${agent.agentId}: fixture mode without fixture`)
			evidence = fixtureSolana(agent.solana.fixture)
		} else {
			const apiKey = agent.solana.apiKeyHeader
				? runtime.getSecret({ id: 'SOLANA_RPC_API_KEY' }).result().value
				: ''
			evidence = collectSolana(runtime, agent.solana, apiKey)
		}
		runtime.log(`${agent.agentId}: ${evidence.source} payments=${evidence.payments.length} at=${evidence.at}`)

		for (const o of evaluateAll(evidence, agent.policy, nowSec)) {
			const tx = writeResult(runtime, evm, config, agent.agentId, o, nowSec)
			if (tx.ok) written.push(`${agent.agentId}/${o.controlId}=${o.pass ? 'PASS' : 'FAIL'} ${tx.hash}`)
			else failures.push(`${agent.agentId}/${o.controlId}: ${tx.error}`)
		}
	}

	written.forEach((w) => runtime.log(`written ${w}`))
	if (failures.length > 0) throw new Error(`write failures: ${failures.join('; ')}`)
	return written.join('\n')
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
