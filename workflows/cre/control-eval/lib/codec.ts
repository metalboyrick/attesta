// Small byte codecs. The CRE WASM runtime has no Buffer/atob, so these are hand-rolled.

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const base58Encode = (bytes: Uint8Array): string => {
	let n = 0n
	for (const b of bytes) n = (n << 8n) | BigInt(b)
	let out = ''
	while (n > 0n) {
		out = B58[Number(n % 58n)] + out
		n /= 58n
	}
	for (const b of bytes) {
		if (b !== 0) break
		out = '1' + out
	}
	return out
}

export const base64Decode = (s: string): Uint8Array => {
	const clean = s.replace(/[^A-Za-z0-9+/]/g, '')
	const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
	let buf = 0
	let bits = 0
	let i = 0
	for (const ch of clean) {
		buf = (buf << 6) | B64.indexOf(ch)
		bits += 6
		if (bits >= 8) {
			bits -= 8
			out[i++] = (buf >> bits) & 0xff
		}
	}
	return out.subarray(0, i)
}

/// Little-endian Borsh reader for the Anchor account/event layouts we need.
export class BorshReader {
	private o = 0
	constructor(private readonly b: Uint8Array) {}
	skip(n: number) {
		this.o += n
	}
	bytes(n: number): Uint8Array {
		if (this.o + n > this.b.length) throw new Error('borsh: out of range')
		const v = this.b.subarray(this.o, this.o + n)
		this.o += n
		return v
	}
	pubkey(): string {
		return base58Encode(this.bytes(32))
	}
	u64(): bigint {
		const v = this.bytes(8)
		let n = 0n
		for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(v[i])
		return n
	}
	i64(): bigint {
		const n = this.u64()
		return n >= 1n << 63n ? n - (1n << 64n) : n
	}
	u32(): number {
		const v = this.bytes(4)
		return (v[0] | (v[1] << 8) | (v[2] << 16) | (v[3] << 24)) >>> 0
	}
	bool(): boolean {
		return this.bytes(1)[0] !== 0
	}
}

export const startsWith = (b: Uint8Array, prefix: readonly number[]) =>
	b.length >= prefix.length && prefix.every((x, i) => b[i] === x)
