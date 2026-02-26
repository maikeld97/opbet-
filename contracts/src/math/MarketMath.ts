import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';

// Fee: 30 basis points (0.3%) — kept in pool as LP earnings
const FEE_NUMERATOR: u256 = u256.fromU64(9970);
const FEE_DENOMINATOR: u256 = u256.fromU64(10000);
const SCALE: u256 = u256.fromU64(1_000_000); // 6-decimal probability representation

/**
 * Constant product AMM: amountOut = (amountIn * 9970 * reserveOut) / (reserveIn * 10000 + amountIn * 9970)
 * Fee stays in pool — same as Uniswap V2.
 *
 * @param amountIn   - tokens being sold into pool (satoshis or share units)
 * @param reserveIn  - current pool reserve of the token being sold
 * @param reserveOut - current pool reserve of the token being bought
 * @returns tokens received
 */
export function getAmountOut(amountIn: u256, reserveIn: u256, reserveOut: u256): u256 {
    if (amountIn.isZero()) return u256.Zero;
    if (reserveIn.isZero() || reserveOut.isZero()) return u256.Zero;

    const amountInWithFee: u256 = SafeMath.mul(amountIn, FEE_NUMERATOR);
    const numerator: u256 = SafeMath.mul(amountInWithFee, reserveOut);
    const denominator: u256 = SafeMath.add(
        SafeMath.mul(reserveIn, FEE_DENOMINATOR),
        amountInWithFee,
    );

    return SafeMath.div(numerator, denominator);
}

/**
 * Current AMM price of the "in" asset relative to "out" asset.
 * Returns probability scaled by 1_000_000 (i.e. 500_000 = 50%).
 *
 * price = reserveOut / (reserveIn + reserveOut) * SCALE
 *
 * For YES probability: getPrice(yesBtcPool, noBtcPool)
 *   → higher noBtcPool means market leans YES
 */
export function getPrice(reserveIn: u256, reserveOut: u256): u256 {
    const total: u256 = SafeMath.add(reserveIn, reserveOut);
    if (total.isZero()) return u256.fromU64(500_000); // 50% default

    return SafeMath.div(SafeMath.mul(reserveOut, SCALE), total);
}

/**
 * Payout per winning share after market resolution.
 * totalPot = yesBtcPool + noBtcPool (all BTC goes to winners).
 * winnerShares = shares held by user (already verified ≤ total outstanding).
 * totalOutstanding = INITIAL_SHARES - sharesRemainingInPool
 *
 * payout = (winnerShares * totalPot) / totalOutstanding
 */
export function getWinningPayout(
    winnerShares: u256,
    totalPot: u256,
    totalOutstanding: u256,
): u256 {
    if (totalOutstanding.isZero()) return u256.Zero;
    return SafeMath.div(SafeMath.mul(winnerShares, totalPot), totalOutstanding);
}
