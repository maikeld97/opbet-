/** Format satoshis to BTC string (e.g. 150_000_000n → "1.50000000 BTC") */
export function satsToBtc(sats: bigint): string {
    const btc = sats / 100_000_000n;
    const remainder = sats % 100_000_000n;
    return `${btc}.${remainder.toString().padStart(8, '0')} BTC`;
}

/** Format satoshis to short display (e.g. 1_500_000n → "15,000 sats") */
export function satsToShort(sats: bigint): string {
    if (sats >= 100_000_000n) return satsToBtc(sats);
    return `${Number(sats).toLocaleString()} sats`;
}

/** Convert scaled probability (× 1_000_000) to percent string */
export function priceToPercent(price: bigint): string {
    const whole = price / 10_000n;
    const frac = (price % 10_000n) / 1000n;
    return `${whole}.${frac}%`;
}

/** Convert a Unix timestamp (seconds) to a human-readable time remaining string */
export function timeRemaining(endTimeSecs: bigint): string {
    const nowSecs = Math.floor(Date.now() / 1000);
    const secsLeft = Number(endTimeSecs) - nowSecs;
    if (secsLeft <= 0) return 'Ended';
    if (secsLeft < 3600) return `~${Math.floor(secsLeft / 60)}m`;
    if (secsLeft < 86400) return `~${Math.floor(secsLeft / 3600)}h`;
    return `~${Math.floor(secsLeft / 86400)}d`;
}

/** Format a Unix timestamp (seconds) to a locale date/time string */
export function formatEndTime(endTimeSecs: bigint): string {
    return new Date(Number(endTimeSecs) * 1000).toLocaleString();
}

/** Truncate a Bitcoin address for display */
export function truncateAddress(address: string, chars = 6): string {
    if (address.length <= chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Format share count */
export function formatShares(shares: bigint): string {
    return Number(shares).toLocaleString();
}
