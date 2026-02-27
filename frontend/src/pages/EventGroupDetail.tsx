import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MarketInfo, UserPosition } from '../types/market.js';
import { CATEGORY_LABELS, satsToDisplay, priceToPercent } from '../types/market.js';
import { PriceBar } from '../components/PriceBar.js';
import { ShareTrader } from '../components/ShareTrader.js';
import { useMarket } from '../hooks/useMarket.js';
import { useWallet } from '../hooks/useWallet.js';
import { timeRemaining, formatEndTime } from '../utils/format.js';

interface OutcomeWithPosition {
    market: MarketInfo;
    position: UserPosition | null;
    poolAddress: string | null;
}

export function EventGroupDetail(): React.ReactElement {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { isConnected } = useWallet();
    const { marketCount, fetchMarketInfo, fetchUserPosition } = useMarket();
    const [outcomes, setOutcomes] = useState<OutcomeWithPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [eventTitle, setEventTitle] = useState<string>('');

    const load = useCallback(async (): Promise<void> => {
        if (!slug) return;
        setIsLoading(true);

        const results: OutcomeWithPosition[] = [];
        for (let i = 0n; i < marketCount; i++) {
            const info = await fetchMarketInfo(i);
            if (!info || info.eventSlug !== slug) continue;

            const poolAddress = localStorage.getItem(`opbet_pool_${i.toString()}`);
            let position: UserPosition | null = null;
            if (isConnected) {
                position = await fetchUserPosition(i);
            }

            results.push({ market: info, position, poolAddress });
            if (!eventTitle && info.eventTitle) setEventTitle(info.eventTitle);
        }

        // Sort by YES price descending (highest probability first)
        results.sort((a, b) => Number(b.market.yesPrice - a.market.yesPrice));
        setOutcomes(results);
        setIsLoading(false);
    }, [slug, marketCount, fetchMarketInfo, fetchUserPosition, isConnected, eventTitle]);

    useEffect(() => {
        void load();
    }, [load]);

    const reloadOne = useCallback(async (marketId: bigint): Promise<void> => {
        const info = await fetchMarketInfo(marketId);
        if (!info) return;
        const poolAddress = localStorage.getItem(`opbet_pool_${marketId.toString()}`);
        let position: UserPosition | null = null;
        if (isConnected) {
            position = await fetchUserPosition(marketId);
        }
        setOutcomes((prev) =>
            prev.map((o) =>
                o.market.marketId === marketId
                    ? { market: info, position, poolAddress }
                    : o,
            ),
        );
    }, [fetchMarketInfo, fetchUserPosition, isConnected]);

    if (isLoading) {
        return (
            <main className="page">
                <div className="loading-state">
                    <div className="loading-spinner" />
                    Loading event markets...
                </div>
            </main>
        );
    }

    if (outcomes.length === 0) {
        return (
            <main className="page">
                <div className="empty-state">
                    <p>No markets found for this event.</p>
                    <button className="btn btn-ghost" onClick={() => { navigate('/'); }}>← Back to Markets</button>
                </div>
            </main>
        );
    }

    const first = outcomes[0]!.market;
    const totalVol = outcomes.reduce((acc, o) => acc + o.market.totalVolume, 0n);
    const isOpen = first.outcome === 0;

    return (
        <main className="page" style={{ maxWidth: '860px' }}>
            {/* Back link */}
            <button
                className="btn btn-ghost"
                style={{ marginBottom: '24px', fontSize: '13px' }}
                onClick={() => { navigate('/'); }}
            >
                ← Back to Markets
            </button>

            {/* Event header */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
                    <span className={`category-badge category-badge--${first.category.toString()}`}>
                        {CATEGORY_LABELS[first.category]}
                    </span>
                    <span className="time-remaining">
                        {isOpen ? `${timeRemaining(first.endTime)} remaining` : `Closed · ${formatEndTime(first.endTime)}`}
                    </span>
                </div>
                <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
                    {eventTitle || slug}
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    {outcomes.length} outcomes · {satsToDisplay(totalVol)} total volume
                </p>
            </div>

            {/* Outcome cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {outcomes.map(({ market, position, poolAddress }) => (
                    <div
                        key={market.marketId.toString()}
                        style={{
                            background: 'var(--surface-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '16px',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Outcome header */}
                        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <h2
                                style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', cursor: 'pointer' }}
                                onClick={() => { navigate(`/market/${market.marketId.toString()}`); }}
                                title="Open individual market page"
                            >
                                {market.outcomeLabel ?? market.description}
                            </h2>
                            <PriceBar yesPrice={market.yesPrice} noPrice={market.noPrice} />
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '13px', color: 'var(--color-yes)' }}>
                                    YES {priceToPercent(market.yesPrice)}
                                </span>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>·</span>
                                <span style={{ fontSize: '13px', color: 'var(--color-no)' }}>
                                    NO {priceToPercent(market.noPrice)}
                                </span>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    Vol: {satsToDisplay(market.totalVolume)}
                                </span>
                            </div>
                        </div>

                        {/* Trader */}
                        <div style={{ padding: '20px 24px' }}>
                            <ShareTrader
                                market={market}
                                userYesShares={position?.yesShares ?? 0n}
                                userNoShares={position?.noShares ?? 0n}
                                poolAddress={poolAddress}
                                onTradeComplete={() => { void reloadOne(market.marketId); }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
