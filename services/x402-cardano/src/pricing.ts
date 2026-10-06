/**
 * Price of one attestation. PRICE_ASSET picks the asset:
 * - "lovelace" (default): PRICE_LOVELACE, 1 tADA.
 * - "usdm": PRICE_USDM atomic units (6 decimals), default 1 tUSDM, of the
 *   preprod token USDM_UNIT. The default unit is the Moneta-registered tUSDM
 *   that Masumi's TOKEN2049 guide uses. @x402/cardano's own USDM_PREPROD_ASSET
 *   is a different preprod policy (e675b46e...).
 */
export const TUSDM_MASUMI_UNIT =
  "16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde.0014df10745553444d";

const asset = process.env.PRICE_ASSET ?? "lovelace";

export const price =
  asset === "usdm"
    ? { amount: process.env.PRICE_USDM ?? "1000000", asset: process.env.USDM_UNIT ?? TUSDM_MASUMI_UNIT }
    : { amount: process.env.PRICE_LOVELACE ?? "1000000", asset: "lovelace" };

export const priceLabel =
  asset === "usdm"
    ? `${Number(price.amount) / 1_000_000} tUSDM (${price.asset})`
    : `${Number(price.amount) / 1_000_000} tADA`;
