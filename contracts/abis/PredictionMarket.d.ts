import { Address, AddressMap } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type MarketCreatedEvent = {
    readonly marketId: bigint;
    readonly endTime: bigint;
    readonly category: number;
    readonly poolAddrHash: bigint;
};
export type MarketDescriptionEvent = {
    readonly marketId: bigint;
    readonly description: string;
};
export type SharesBoughtEvent = {
    readonly marketId: bigint;
    readonly buyer: Address;
    readonly isYes: boolean;
    readonly sharesOut: bigint;
    readonly btcIn: bigint;
};
export type ProtocolFeeCollectedEvent = {
    readonly marketId: bigint;
    readonly fee: bigint;
};
export type SharesSoldEvent = {
    readonly marketId: bigint;
    readonly seller: Address;
    readonly isYes: boolean;
    readonly sharesIn: bigint;
    readonly btcOut: bigint;
};
export type MarketResolvedEvent = {
    readonly marketId: bigint;
    readonly outcome: number;
};
export type WinningsClaimedEvent = {
    readonly marketId: bigint;
    readonly claimant: Address;
    readonly amount: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createMarket function call.
 */
export type CreateMarket = CallResult<
    {
        marketId: bigint;
    },
    OPNetEvent<MarketCreatedEvent | MarketDescriptionEvent>[]
>;

/**
 * @description Represents the result of the buyShares function call.
 */
export type BuyShares = CallResult<
    {
        sharesReceived: bigint;
    },
    OPNetEvent<SharesBoughtEvent | ProtocolFeeCollectedEvent>[]
>;

/**
 * @description Represents the result of the sellShares function call.
 */
export type SellShares = CallResult<
    {
        btcOut: bigint;
    },
    OPNetEvent<SharesSoldEvent>[]
>;

/**
 * @description Represents the result of the resolveMarket function call.
 */
export type ResolveMarket = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<MarketResolvedEvent>[]
>;

/**
 * @description Represents the result of the claimWinnings function call.
 */
export type ClaimWinnings = CallResult<
    {
        btcOwed: bigint;
    },
    OPNetEvent<WinningsClaimedEvent>[]
>;

/**
 * @description Represents the result of the getMarketInfo function call.
 */
export type GetMarketInfo = CallResult<
    {
        yesBtcPool: bigint;
        noBtcPool: bigint;
        yesSharesInPool: bigint;
        noSharesInPool: bigint;
        outcome: bigint;
        endTime: bigint;
        category: bigint;
        totalVolume: bigint;
        yesPrice: bigint;
        noPrice: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getUserPosition function call.
 */
export type GetUserPosition = CallResult<
    {
        yesShares: bigint;
        noShares: bigint;
        pendingClaim: bigint;
        hasClaimed: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMarketCount function call.
 */
export type GetMarketCount = CallResult<
    {
        marketCount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getProtocolFees function call.
 */
export type GetProtocolFees = CallResult<
    {
        totalFees: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the quoteShares function call.
 */
export type QuoteShares = CallResult<
    {
        sharesOut: bigint;
        newPrice: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IPredictionMarket
// ------------------------------------------------------------------
export interface IPredictionMarket extends IOP_NETContract {
    createMarket(
        description: string,
        category: number,
        endTime: bigint,
        poolAddrHash: bigint,
        initialYesBps: bigint,
    ): Promise<CreateMarket>;
    buyShares(marketId: bigint, isYes: boolean): Promise<BuyShares>;
    sellShares(marketId: bigint, isYes: boolean, sharesIn: bigint): Promise<SellShares>;
    resolveMarket(marketId: bigint, outcome: number): Promise<ResolveMarket>;
    claimWinnings(marketId: bigint): Promise<ClaimWinnings>;
    getMarketInfo(marketId: bigint): Promise<GetMarketInfo>;
    getUserPosition(marketId: bigint, user: Address): Promise<GetUserPosition>;
    getMarketCount(): Promise<GetMarketCount>;
    getProtocolFees(): Promise<GetProtocolFees>;
    quoteShares(marketId: bigint, isYes: boolean, btcIn: bigint): Promise<QuoteShares>;
}
