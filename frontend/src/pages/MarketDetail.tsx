import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { MarketInfo, UserPosition } from '../types/market.js';
import { CATEGORY_LABELS, OUTCOME_LABELS, satsToDisplay, priceToPercent } from '../types/market.js';
import { PriceBar } from '../components/PriceBar.js';
import { ShareTrader } from '../components/ShareTrader.js';
import { ResolvePanel } from '../components/ResolvePanel.js';
import { useMarket } from '../hooks/useMarket.js';
import { useWallet } from '../hooks/useWallet.js';
import { formatShares, timeRemaining, formatEndTime } from '../utils/format.js';

export function MarketDetail(): React.ReactElement {
    const { id } = useParams<{ id: string }>();
    const marketId = BigInt(id ?? '0');

    const { isConnected } = useWallet();
    const { fetchMarketInfo, fetchUserPosition, claimWinnings, loading } = useMarket();

    const [market, setMarket] = useState<MarketInfo | null>(null);
    const [position, setPosition] = useState<UserPosition | null>(null);
    const [claimTxId, setClaimTxId] = useState<string | null>(null);
    const poolAddress = localStorage.getItem(`opbet_pool_${marketId.toString()}`);

    const load = useCallback(async (): Promise<void> => {
        const info = await fetchMarketInfo(marketId);
        setMarket(info);
        if (isConnected) {
            const pos = await fetchUserPosition(marketId);
            setPosition(pos);
        }
    }, [marketId, fetchMarketInfo, fetchUserPosition, isConnected]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleClaim = async (): Promise<void> => {
        const txid = await claimWinnings(marketId);
        if (txid) {
            setClaimTxId(txid);
            void load();
        }
    };

    if (!market) {
        return <div className="page"><div className="loading-state">Loading market...</div></div>;
    }

    const isOpen = market.outcome === 0;
    const hasWinningShares =
        position &&
        !position.hasClaimed &&
        ((market.outcome === 1 && position.yesShares > 0n) ||
            (market.outcome === 2 && position.noShares > 0n));

    return (
        <main className="page market-detail">
            {/* Header */}
            <div className="market-detail__header">
                <div className="market-detail__meta">
                    <span className={`category-badge category-badge--${market.category.toString()}`}>
                        {CATEGORY_LABELS[market.category]}
                    </span>
                    {isOpen ? (
                        <span className="time-remaining">{timeRemaining(market.endTime)} remaining</span>
                    ) : (
                        <span className={`outcome-badge outcome-badge--${market.outcome.toString()}`}>
                            Resolved: {OUTCOME_LABELS[market.outcome]}
                        </span>
                    )}
                </div>
                <h1 className="market-detail__title">
                    {market.description || `Market #${market.marketId.toString()}`}
                </h1>
            </div>

            {/* Price bar */}
            <div className="market-detail__price">
                <PriceBar yesPrice={market.yesPrice} noPrice={market.noPrice} />
                <div className="price-labels-detailed">
                    <span className="yes-label">YES {priceToPercent(market.yesPrice)}</span>
                    <span className="no-label">NO {priceToPercent(market.noPrice)}</span>
                </div>
            </div>

            {/* Stats */}
            <div className="market-stats-row">
                <div className="stat-box">
                    <span className="stat-box__label">Total Volume</span>
                    <span className="stat-box__value">{satsToDisplay(market.totalVolume)}</span>
                </div>
                <div className="stat-box">
                    <span className="stat-box__label">YES Pool</span>
                    <span className="stat-box__value">{satsToDisplay(market.yesBtcPool)}</span>
                </div>
                <div className="stat-box">
                    <span className="stat-box__label">NO Pool</span>
                    <span className="stat-box__value">{satsToDisplay(market.noBtcPool)}</span>
                </div>
                <div className="stat-box">
                    <span className="stat-box__label">Closes</span>
                    <span className="stat-box__value">{formatEndTime(market.endTime)}</span>
                </div>
            </div>

            <div className="market-detail__body">
                {/* Trading panel */}
                <div className="market-detail__trade">
                    <ShareTrader
                        market={market}
                        userYesShares={position?.yesShares ?? 0n}
                        userNoShares={position?.noShares ?? 0n}
                        poolAddress={poolAddress}
                        onTradeComplete={() => {
                            void load();
                        }}
                    />
                </div>

                {/* User position */}
                {isConnected && position && (
                    <div className="user-position">
                        <h3>Your Position</h3>
                        <div className="position-row">
                            <span>YES Shares</span>
                            <span className="yes-value">{formatShares(position.yesShares)}</span>
                        </div>
                        <div className="position-row">
                            <span>NO Shares</span>
                            <span className="no-value">{formatShares(position.noShares)}</span>
                        </div>
                        {position.pendingClaim > 0n && (
                            <div className="position-row">
                                <span>Pending BTC Claim</span>
                                <span>{satsToDisplay(position.pendingClaim)}</span>
                            </div>
                        )}

                        {hasWinningShares && (
                            <>
                                {claimTxId ? (
                                    <p className="trade-success">Claimed! TX: {claimTxId.slice(0, 16)}...</p>
                                ) : (
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleClaim}
                                        disabled={loading}
                                    >
                                        {loading ? 'Processing...' : 'Claim Winnings'}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Resolve panel — visible to any connected user; contract enforces onlyDeployer */}
            {isConnected && isOpen && (
                <ResolvePanel
                    marketId={marketId}
                    onResolved={() => {
                        void load();
                    }}
                />
            )}
        </main>
    );
}
