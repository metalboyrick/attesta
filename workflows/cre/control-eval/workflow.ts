import {
	bytesToHex,
	cre,
	getNetwork,
	prepareReportRequest,
	TxStatus,
	type Runtime,
} from '@chainlink/cre-sdk'
import { type Address, encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, toHex } from 'viem'
import { z } from 'zod'

// ─── Config Schema ──────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),
	chainSelectorName: z.string(),
	registryAddress: z.string(),
	gasLimit: z.string(),
	agentId: z.string(),
	control: z.object({
		id: z.string(),
		// Hardcoded evidence for the first end-to-end run. Later this comes from an HTTP fetch.
		observedDailySpendUsd: z.number(),
		dailySpendCapUsd: z.number(),
	}),
})
type Config = z.infer<typeof configSchema>

// String ids are hashed so the contract only deals in bytes32.
const id32 = (s: string) => keccak256(stringToHex(s))

// ─── Control evaluation ─────────────────────────────────────
// ATT-SPEND-01: the agent's spend over the last 24h stays at or under its cap.
const evaluateSpendCap = (c: Config['control']) => {
	const evidence = JSON.stringify({
		control: c.id,
		observedDailySpendUsd: c.observedDailySpendUsd,
		dailySpendCapUsd: c.dailySpendCapUsd,
	})
	return {
		pass: c.observedDailySpendUsd <= c.dailySpendCapUsd,
		evidence,
		evidenceHash: keccak256(stringToHex(evidence)),
	}
}

// ─── Cron Callback ──────────────────────────────────────────
export const onCronTrigger = (runtime: Runtime<Config>): string => {
	const config = runtime.config

	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: config.chainSelectorName,
		isTestnet: true,
	})
	if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

	const result = evaluateSpendCap(config.control)
	const ts = BigInt(Math.floor(runtime.now().getTime() / 1000))
	const controlId = id32(config.control.id)
	const agentId = id32(config.agentId)

	runtime.log(`control=${config.control.id} agent=${config.agentId} pass=${result.pass} evidence=${result.evidence}`)

	const report = encodeAbiParameters(
		parseAbiParameters('bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts'),
		[controlId, agentId, result.pass, result.evidenceHash, ts],
	)

	const signed = runtime.report(prepareReportRequest(report)).result()

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const write = evmClient
		.writeReport(runtime, {
			receiver: config.registryAddress as Address,
			report: signed,
			gasConfig: { gasLimit: config.gasLimit },
		})
		.result()

	if (write.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`writeReport failed: ${write.errorMessage || write.txStatus}`)
	}
	if (write.receiverContractExecutionStatus !== undefined && write.receiverContractExecutionStatus !== 0) {
		throw new Error(`AttestationRegistry.onReport reverted: status ${write.receiverContractExecutionStatus}`)
	}

	const txHash = bytesToHex(write.txHash || new Uint8Array(32))
	runtime.log(`ControlResult written. controlId=${controlId} agentId=${agentId} ts=${toHex(ts)} tx=${txHash}`)
	return txHash
}

// ─── Workflow Init ──────────────────────────────────────────
export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()
	return [cre.handler(cronTrigger.trigger({ schedule: config.schedule }), onCronTrigger)]
}
