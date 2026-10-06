// Normalised evidence shapes. Amounts are decimal strings so they survive consensus serialisation.

export type Snapshot = {
	/** Who can change policy/keys: EVM wallet owner or Solana policy authority. */
	authority: string
	/** Key the agent signs with: EVM agentSigner or Solana policy.agent. */
	signer: string
	onchainCap: string
	spentToday: string
	dayIndex: string
	frozen: boolean
}

export type Payment = {
	to: string
	amount: string
	/** tx hash (EVM) or signature (Solana) */
	ref: string
}

export type Evidence = {
	source: string
	snapshot: Snapshot
	payments: Payment[]
	/** Block number (EVM) or slot (Solana) the snapshot was taken at, for the auditor. */
	at: string
}
