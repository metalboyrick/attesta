/**
 * Generates fresh Cardano preprod wallets (buyer + seller) and writes them to
 * ~/.attesta-secrets/cardano-preprod.env (chmod 600). Mnemonics are never
 * printed; only the addresses are. Refuses to overwrite an existing file.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Address, PrivateKey } from "@evolution-sdk/evolution";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";

const dir = join(homedir(), ".attesta-secrets");
const file = join(dir, "cardano-preprod.env");
if (existsSync(file)) {
  console.error(`${file} already exists; refusing to overwrite`);
  process.exit(1);
}

function fresh() {
  const mnemonic = PrivateKey.generateMnemonic();
  const address = Address.toBech32(addressFromSeed(mnemonic, { networkId: 0 }).address);
  return { mnemonic, address };
}

const buyer = fresh();
const seller = fresh();

mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(
  file,
  [
    `MNEMONIC="${buyer.mnemonic}"`,
    `BUYER_ADDRESS=${buyer.address}`,
    `SELLER_MNEMONIC="${seller.mnemonic}"`,
    `SELLER_ADDRESS=${seller.address}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log(`Wrote ${file}`);
console.log(`Buyer  (fund this): ${buyer.address}`);
console.log(`Seller (receives):  ${seller.address}`);
console.log("Faucet: https://docs.cardano.org/cardano-testnets/tools/faucet (network: preprod)");
