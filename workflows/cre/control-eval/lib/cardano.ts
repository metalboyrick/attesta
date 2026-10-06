import type { Evidence, Payment } from './types'

// Koios shapes, trimmed to the fields we use (keeps the consensus observation small and deterministic).
export type KoiosOut = { payment_addr: { bech32: string; cred: string }; value: string }
export type KoiosTx = { tx_hash: string; tx_timestamp: number; inputs: KoiosOut[]; outputs: KoiosOut[] }

export type CardanoRaw = {
	/** address_txs rows returned; equal to the query limit means the day may be cut off. */
	txCount: number
	limit: number
	txs: KoiosTx[]
}

/**
 * Spend = outputs of a tx that has an input from the agent, paid to anyone but the agent.
 * Change is matched on payment credential, so change to the same key with another stake part still counts as change.
 * Only lovelace is summed for the cap; native tokens are not priced here.
 */
export const buildCardanoEvidence = (address: string, dayStart: bigint, raw: CardanoRaw): Evidence => {
	if (raw.txCount >= raw.limit) throw new Error(`more than ${raw.limit - 1} txs today, spend total would be incomplete`)
	const creds = new Set<string>()
	for (const tx of raw.txs) for (const i of tx.inputs) if (i.payment_addr.bech32 === address) creds.add(i.payment_addr.cred)

	const payments: Payment[] = []
	let spent = 0n
	for (const tx of raw.txs) {
		if (BigInt(tx.tx_timestamp) < dayStart) continue
		if (!tx.inputs.some((i) => creds.has(i.payment_addr.cred))) continue
		for (const o of tx.outputs) {
			if (o.payment_addr.bech32 === address || creds.has(o.payment_addr.cred)) continue
			payments.push({ to: o.payment_addr.bech32, amount: o.value, ref: tx.tx_hash })
			spent += BigInt(o.value)
		}
	}
	return {
		source: `cardano:${address}`,
		snapshot: {
			// Plain key address: no separate authority or on-chain cap to compare. ATT-KEY-03 is not run for it.
			authority: '',
			signer: address,
			onchainCap: '0',
			spentToday: spent.toString(),
			dayIndex: (dayStart / 86_400n).toString(),
			frozen: false,
		},
		payments,
		at: `day ${dayStart / 86_400n}, ${raw.txs.length} txs`,
	}
}
