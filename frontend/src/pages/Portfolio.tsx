import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MarketInfo, UserPosition } from '../types/market.js';
import { OUTCOME_LABELS, priceToPercent, satsToDisplay } from '../types/market.js';
import { useMarket } from '../hooks/useMarket.js';
import { useWallet } from '../hooks/useWallet.js';
import { useBtcPrice, satsToUsd } from '../hooks/useBtcPrice.js';

// BTC value of shares at current AMM price (approximation: shares * pool / sharesInPool)
function sharesBtcValue(shares: bigint, btcPool: bigint, sharesInPool: bigint): bigint {
    if (sharesInPool === 0n || shares === 0n) return 0n;
    return (shares * btcPool) / sharesInPool;
}

interface PortfolioItem {
    readonly market: MarketInfo;
    readonly position: UserPosition;
    readonly yesCostBasis: bigint;
    readonly noCostBasis: bigint;
    readonly yesBtcValue: bigint;
    readonly noBtcValue: bigint;
}

function PnlBadge({ value, cost }: { value: bigint; cost: bigint }): React.ReactElement | null {
    if (cost === 0n) return null;
    const pnl = value - cost;
    const pct = Number((pnl * 10000n) / cost) / 100;
    const isPos = pnl >= 0n;
    return (
        <span className={`pnl-badge ${isPos ? 'pnl-badge--pos' : 'pnl-badge--neg'}`}>
            {isPos ? '+' : ''}{pct.toFixed(1)}%
        </span>
    );
}

export function Portfolio(): React.ReactElement {
    const navigate = useNavigate();
    const { isConnected } = useWallet();
    const { marketCount, fetchMarketInfo, fetchUserPosition } = useMarket();
    const btcPrice = useBtcPrice();

    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [totalValue, setTotalValue] = useState(0n);
    const [totalCost, setTotalCost] = useState(0n);
    const [totalPendingClaims, setTotalPendingClaims] = useState(0n);

    const loadPortfolio = useCallback(async (): Promise<void> => {
        if (!isConnected) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const results: PortfolioItem[] = [];
        let value = 0n;
        let cost = 0n;
        let claims = 0n;

        for (let i = 0n; i < marketCount; i++) {
            const [market, position] = await Promise.all([
                fetchMarketInfo(i),
                fetchUserPosition(i),
            ]);

            if (!market || !position) continue;

            const hasActivity =
                position.yesShares > 0n ||
                position.noShares > 0n ||
                position.pendingClaim > 0n ||
                position.hasClaimed;

            if (!hasActivity) continue;

            const yesCostBasis = BigInt(localStorage.getItem(`opbet_cost_${i.toString()}_yes`) ?? '0');
            const noCostBasis = BigInt(localStorage.getItem(`opbet_cost_${i.toString()}_no`) ?? '0');

            const yesBtcValue = sharesBtcValue(
                position.yesShares,
                market.yesBtcPool,
                market.yesSharesInPool,
            );
            const noBtcValue = sharesBtcValue(
                position.noShares,
                market.noBtcPool,
                market.noSharesInPool,
            );

            results.push({ market, position, yesCostBasis, noCostBasis, yesBtcValue, noBtcValue });

            value += yesBtcValue + noBtcValue;
            cost += yesCostBasis + noCostBasis;
            claims += position.pendingClaim;
        }

        setItems(results);
        setTotalValue(value);
        setTotalCost(cost);
        setTotalPendingClaims(claims);
        setIsLoading(false);
    }, [isConnected, marketCount, fetchMarketInfo, fetchUserPosition]);

    useEffect(() => {
        void loadPortfolio();
    }, [loadPortfolio]);

    if (!isConnected) {
        return (
            <main className="page portfolio-page">
                <div className="empty-state">
                    <h2>Connect your wallet to view your portfolio</h2>
                </div>
            </main>
        );
    }

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0n ? Number((totalPnl * 10000n) / totalCost) / 100 : 0;

    return (
        <main className="page portfolio-page">
            <h1 className="page-title">Your Portfolio</h1>

            {/* Summary */}
            {(totalCost > 0n || totalPendingClaims > 0n) && (
                <div className="portfolio-summary">
                    <div className="summary-grid">
                        {totalCost > 0n && (
                            <>
                                <div className="stat-box">
                                    <span className="stat-box__label">Positions Value</span>
                                    <span className="stat-box__value">{satsToDisplay(totalValue)}</span>
                                    {btcPrice && (
                                        <span className="stat-box__usd">{satsToUsd(totalValue, btcPrice)}</span>
                                    )}
                                </div>
                                <div className="stat-box">
                                    <span className="stat-box__label">Total Invested</span>
                                    <span className="stat-box__value">{satsToDisplay(totalCost)}</span>
                                    {btcPrice && (
                                        <span className="stat-box__usd">{satsToUsd(totalCost, btcPrice)}</span>
                                    )}
                                </div>
                                <div className="stat-box">
                                    <span className="stat-box__label">Unrealized P&amp;L</span>
                                    <span className={`stat-box__value ${totalPnl >= 0n ? 'value--pos' : 'value--neg'}`}>
                                        {totalPnl >= 0n ? '+' : '-'}{satsToDisplay(totalPnl < 0n ? -totalPnl : totalPnl)}
                                    </span>
                                    <span className={`stat-box__pct ${totalPnl >= 0n ? 'value--pos' : 'value--neg'}`}>
                                        {totalPnl >= 0n ? '+' : ''}{totalPnlPct.toFixed(1)}%
                                    </span>
                                </div>
                            </>
                        )}
                        {totalPendingClaims > 0n && (
                            <div className="stat-box stat-box--claim">
                                <span className="stat-box__label">Pending Claims</span>
                                <span className="stat-box__value">{satsToDisplay(totalPendingClaims)}</span>
                                {btcPrice && (
                                    <span className="stat-box__usd">{satsToUsd(totalPendingClaims, btcPrice)}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="loading-state">
                    <div className="loading-spinner" />
                    Loading portfolio...
                </div>
            ) : items.length === 0 ? (
                <div className="empty-state">
                    <p>No positions yet. Start trading on the markets page.</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => { navigate('/'); }}
                    >
                        Browse Markets
                    </button>
                </div>
            ) : (
                <div className="portfolio-list">
                    {items.map(({ market, position, yesCostBasis, noCostBasis, yesBtcValue, noBtcValue }) => (
                        <div
                            key={market.marketId.toString()}
                            className="portfolio-item"
                            onClick={() => { navigate(`/market/${market.marketId.toString()}`); }}
                        >
                            <div className="portfolio-item__header">
                                <h3 className="portfolio-item__title">
                                    {market.description || `Market #${market.marketId.toString()}`}
                                </h3>
                                <span className={`outcome-badge outcome-badge--${market.outcome.toString()}`}>
                                    {OUTCOME_LABELS[market.outcome]}
                                </span>
                            </div>

                            <div className="portfolio-item__prices">
                                <span>YES {priceToPercent(market.yesPrice)}</span>
                                <span>NO {priceToPercent(market.noPrice)}</span>
                            </div>

                            {/* YES position */}
                            {position.yesShares > 0n && (
                                <div className="position-detail position-detail--yes">
                                    <div className="position-detail__left">
                                        <span className="position-detail__label">YES</span>
                                        <span className="position-detail__value yes-value">
                                            {satsToDisplay(yesBtcValue)}
                                        </span>
                                        {btcPrice && (
                                            <span className="position-detail__usd">
                                                {satsToUsd(yesBtcValue, btcPrice)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="position-detail__right">
                                        {yesCostBasis > 0n && (
                                            <>
                                                <span className="position-detail__cost">
                                                    Cost: {satsToDisplay(yesCostBasis)}
                                                </span>
                                                <PnlBadge value={yesBtcValue} cost={yesCostBasis} />
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* NO position */}
                            {position.noShares > 0n && (
                                <div className="position-detail position-detail--no">
                                    <div className="position-detail__left">
                                        <span className="position-detail__label">NO</span>
                                        <span className="position-detail__value no-value">
                                            {satsToDisplay(noBtcValue)}
                                        </span>
                                        {btcPrice && (
                                            <span className="position-detail__usd">
                                                {satsToUsd(noBtcValue, btcPrice)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="position-detail__right">
                                        {noCostBasis > 0n && (
                                            <>
                                                <span className="position-detail__cost">
                                                    Cost: {satsToDisplay(noCostBasis)}
                                                </span>
                                                <PnlBadge value={noBtcValue} cost={noCostBasis} />
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Pending claim / claimed */}
                            {position.pendingClaim > 0n && (
                                <div className="position-chip position-chip--claim">
                                    Claim: {satsToDisplay(position.pendingClaim)}
                                    {btcPrice && ` · ${satsToUsd(position.pendingClaim, btcPrice)}`}
                                </div>
                            )}
                            {position.hasClaimed && (
                                <div className="position-chip position-chip--done">Claimed</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
