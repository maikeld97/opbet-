export type MarketOutcome = 0 | 1 | 2; // 0=open, 1=YES, 2=NO
export type MarketCategory = 0 | 1 | 2 | 3; // 0=Crypto, 1=Sports, 2=Politics, 3=Other

export interface MarketInfo {
    readonly marketId: bigint;
    readonly description: string;
    readonly yesBtcPool: bigint;
    readonly noBtcPool: bigint;
    readonly yesSharesInPool: bigint;
    readonly noSharesInPool: bigint;
    readonly outcome: MarketOutcome;
    /** Unix timestamp (seconds) when trading closes */
    readonly endTime: bigint;
    readonly category: MarketCategory;
    readonly totalVolume: bigint;
    /** YES probability × 1_000_000 (e.g. 650_000 = 65%) */
    readonly yesPrice: bigint;
    /** NO probability × 1_000_000 */
    readonly noPrice: bigint;
}

export interface UserPosition {
    readonly marketId: bigint;
    readonly yesShares: bigint;
    readonly noShares: bigint;
    readonly pendingClaim: bigint;
    readonly hasClaimed: boolean;
}

export interface QuoteResult {
    readonly sharesOut: bigint;
    readonly newPrice: bigint;
}

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
    0: 'Crypto',
    1: 'Sports',
    2: 'Politics',
    3: 'Other',
};

export const OUTCOME_LABELS: Record<MarketOutcome, string> = {
    0: 'Open',
    1: 'YES',
    2: 'NO',
};

/** 1_000_000 = 100% scaled probability */
export const PRICE_SCALE = 1_000_000n;

/** Convert scaled price to percentage string, e.g. 650_000n → "65.0%" */
export function priceToPercent(price: bigint): string {
    const whole = price / 10_000n;
    const frac = (price % 10_000n) / 1000n;
    return `${whole}.${frac}%`;
}

/**
 * Buy price shown to user in cents (¢). Spread is embedded in the price,
 * so YES + NO > 100¢ (similar to how Polymarket displays prices).
 */
export function priceToCents(price: bigint): string {
    // price is scaled × 1_000_000 (e.g. 500_000 = 50%)
    // multiply by 1.01 for fee, then convert to cents (× 100)
    const withFee = (price * 101n) / 100n;
    const cents = Number(withFee) / 10_000;
    return `${cents.toFixed(1)}¢`;
}

/** Convert satoshis to BTC string */
export function satsToBtc(sats: bigint): string {
    const btc = sats / 100_000_000n;
    const remainder = sats % 100_000_000n;
    const fracStr = remainder.toString().padStart(8, '0');
    return `${btc}.${fracStr} BTC`;
}

/** Convert satoshis to a short display string */
export function satsToDisplay(sats: bigint): string {
    if (sats >= 100_000_000n) return satsToBtc(sats);
    if (sats >= 1_000n) return `${(sats / 1_000n).toString()}k sats`;
    return `${sats.toString()} sats`;
}
