/**
 * ABI definition for the PredictionMarket contract.
 * OPNet: type must be lowercase 'function'/'event', data types must be UPPERCASE.
 */

export const PREDICTION_MARKET_ABI = [
    // ── createMarket ─────────────────────────────────────────────────────────
    {
        name: 'createMarket',
        type: 'function',
        inputs: [
            { name: 'description', type: 'STRING' },
            { name: 'category', type: 'UINT8' },
            { name: 'endTime', type: 'UINT256' },
            { name: 'poolAddrHash', type: 'UINT256' },
            { name: 'initialYesBps', type: 'UINT256' },
        ],
        outputs: [{ name: 'marketId', type: 'UINT256' }],
    },

    // ── buyShares ─────────────────────────────────────────────────────────────
    {
        name: 'buyShares',
        type: 'function',
        inputs: [
            { name: 'marketId', type: 'UINT256' },
            { name: 'isYes', type: 'BOOL' },
        ],
        outputs: [{ name: 'sharesReceived', type: 'UINT256' }],
    },

    // ── sellShares ────────────────────────────────────────────────────────────
    {
        name: 'sellShares',
        type: 'function',
        inputs: [
            { name: 'marketId', type: 'UINT256' },
            { name: 'isYes', type: 'BOOL' },
            { name: 'sharesIn', type: 'UINT256' },
        ],
        outputs: [{ name: 'btcOut', type: 'UINT256' }],
    },

    // ── resolveMarket ─────────────────────────────────────────────────────────
    {
        name: 'resolveMarket',
        type: 'function',
        inputs: [
            { name: 'marketId', type: 'UINT256' },
            { name: 'outcome', type: 'UINT8' },
        ],
        outputs: [{ name: 'success', type: 'BOOL' }],
    },

    // ── claimWinnings ─────────────────────────────────────────────────────────
    {
        name: 'claimWinnings',
        type: 'function',
        inputs: [{ name: 'marketId', type: 'UINT256' }],
        outputs: [{ name: 'btcOwed', type: 'UINT256' }],
    },

    // ── getMarketInfo ─────────────────────────────────────────────────────────
    {
        name: 'getMarketInfo',
        type: 'function',
        inputs: [{ name: 'marketId', type: 'UINT256' }],
        outputs: [
            { name: 'yesBtcPool', type: 'UINT256' },
            { name: 'noBtcPool', type: 'UINT256' },
            { name: 'yesSharesInPool', type: 'UINT256' },
            { name: 'noSharesInPool', type: 'UINT256' },
            { name: 'outcome', type: 'UINT256' },
            { name: 'endTime', type: 'UINT256' },
            { name: 'category', type: 'UINT256' },
            { name: 'totalVolume', type: 'UINT256' },
            { name: 'yesPrice', type: 'UINT256' },
            { name: 'noPrice', type: 'UINT256' },
        ],
    },

    // ── getUserPosition ───────────────────────────────────────────────────────
    {
        name: 'getUserPosition',
        type: 'function',
        inputs: [
            { name: 'marketId', type: 'UINT256' },
            { name: 'user', type: 'ADDRESS' },
        ],
        outputs: [
            { name: 'yesShares', type: 'UINT256' },
            { name: 'noShares', type: 'UINT256' },
            { name: 'pendingClaim', type: 'UINT256' },
            { name: 'hasClaimed', type: 'BOOL' },
        ],
    },

    // ── getMarketCount ────────────────────────────────────────────────────────
    {
        name: 'getMarketCount',
        type: 'function',
        inputs: [],
        outputs: [{ name: 'marketCount', type: 'UINT256' }],
    },

    // ── quoteShares ───────────────────────────────────────────────────────────
    {
        name: 'quoteShares',
        type: 'function',
        inputs: [
            { name: 'marketId', type: 'UINT256' },
            { name: 'isYes', type: 'BOOL' },
            { name: 'btcIn', type: 'UINT256' },
        ],
        outputs: [
            { name: 'sharesOut', type: 'UINT256' },
            { name: 'newPrice', type: 'UINT256' },
        ],
    },

    // ── getProtocolFees ───────────────────────────────────────────────────────
    {
        name: 'getProtocolFees',
        type: 'function',
        inputs: [],
        outputs: [{ name: 'totalFees', type: 'UINT256' }],
    },
];

export type PredictionMarketABI = typeof PREDICTION_MARKET_ABI;
