import { useEffect, useState, useCallback } from 'react';
import type { MarketInfo } from '../types/market.js';
import { CATEGORY_LABELS } from '../types/market.js';
import { MarketCard } from '../components/MarketCard.js';
import { CreateMarketPanel } from '../components/CreateMarketPanel.js';
import { useMarket } from '../hooks/useMarket.js';
import { useWallet } from '../hooks/useWallet.js';

type FilterCategory = 'all' | '0' | '1' | '2' | '3';
type SortKey = 'volume' | 'newest' | 'endTime';

export function Home(): React.ReactElement {
    const { marketCount, chainTime, fetchMarketInfo, createMarket, loading, error: marketError } = useMarket();
    const { isConnected } = useWallet();
    const [markets, setMarkets] = useState<MarketInfo[]>([]);
    const [filter, setFilter] = useState<FilterCategory>('all');
    const [sort, setSort] = useState<SortKey>('volume');
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    const loadMarkets = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        const results: MarketInfo[] = [];

        for (let i = 0n; i < marketCount; i++) {
            const info = await fetchMarketInfo(i);
            if (info) results.push(info);
        }

        setMarkets(results);
        setIsLoading(false);
    }, [marketCount, fetchMarketInfo]);

    useEffect(() => {
        void loadMarkets();
    }, [loadMarkets]);

    const searchLower = search.toLowerCase();
    const filteredMarkets = markets
        .filter((m) => filter === 'all' || m.category.toString() === filter)
        .filter((m) =>
            search === '' ||
            m.description.toLowerCase().includes(searchLower) ||
            `market #${m.marketId.toString()}`.includes(searchLower),
        )
        .sort((a, b) => {
            if (sort === 'volume') return Number(b.totalVolume - a.totalVolume);
            if (sort === 'endTime') return Number(a.endTime - b.endTime);
            return Number(b.marketId - a.marketId);
        });

    const totalVolume = markets.reduce((acc, m) => acc + m.totalVolume, 0n);

    return (
        <main className="page home-page">
            {/* Hero */}
            <section className="hero">
                <div className="hero__badge">Powered by Bitcoin L1 · OPNet</div>
                <h1 className="hero__title">
                    Predict the Future,<br />
                    <span className="hero__accent">Earn Bitcoin</span>
                </h1>
                <p className="hero__subtitle">
                    The first trustless prediction market on Bitcoin L1.
                    Trade YES/NO shares with real BTC — no custodians.
                </p>
            </section>

            {/* Stats bar */}
            <section className="stats-bar">
                <div className="stat-item">
                    <span className="stat-item__value">{marketCount.toString()}</span>
                    <span className="stat-item__label">Markets</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value">
                        {totalVolume >= 100_000_000n
                            ? `${(Number(totalVolume) / 1e8).toFixed(2)} BTC`
                            : `${Number(totalVolume).toLocaleString()} sats`}
                    </span>
                    <span className="stat-item__label">Total Volume</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value">Bitcoin L1</span>
                    <span className="stat-item__label">Powered By</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value">Trustless</span>
                    <span className="stat-item__label">Settlement</span>
                </div>
            </section>

            {/* Admin: create market */}
            {isConnected && (
                <CreateMarketPanel
                    createMarket={createMarket}
                    loading={loading}
                    hookError={marketError}
                    onCreated={loadMarkets}
                    chainTime={chainTime}
                />
            )}

            {/* Search + Filter + Sort */}
            <div className="market-controls">
                <div className="search-wrap">
                    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        className="search-input"
                        type="text"
                        placeholder="Search markets..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); }}
                    />
                    {search && (
                        <button className="search-clear" onClick={() => { setSearch(''); }}>×</button>
                    )}
                </div>

                <div className="controls-row">
                    <div className="filter-tabs">
                        <button
                            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                            onClick={() => { setFilter('all'); }}
                        >
                            All
                        </button>
                        {(['0', '1', '2', '3'] as const).map((cat) => (
                            <button
                                key={cat}
                                className={`filter-tab ${filter === cat ? 'active' : ''}`}
                                onClick={() => { setFilter(cat); }}
                            >
                                {CATEGORY_LABELS[Number(cat) as 0 | 1 | 2 | 3]}
                            </button>
                        ))}
                    </div>

                    <select
                        className="sort-select"
                        value={sort}
                        onChange={(e) => { setSort(e.target.value as SortKey); }}
                    >
                        <option value="volume">Most Volume</option>
                        <option value="newest">Newest</option>
                        <option value="endTime">Ending Soon</option>
                    </select>
                </div>
            </div>

            {/* Markets grid */}
            {isLoading ? (
                <div className="loading-state">
                    <div className="loading-spinner" />
                    Loading markets...
                </div>
            ) : filteredMarkets.length === 0 ? (
                <div className="empty-state">
                    <p>{search ? `No markets match "${search}"` : 'No markets found.'}</p>
                </div>
            ) : (
                <>
                    <p className="results-count">
                        {filteredMarkets.length} {filteredMarkets.length === 1 ? 'market' : 'markets'}
                        {search && ` matching "${search}"`}
                    </p>
                    <div className="markets-grid">
                        {filteredMarkets.map((market) => (
                            <MarketCard
                                key={market.marketId.toString()}
                                market={market}
                            />
                        ))}
                    </div>
                </>
            )}
        </main>
    );
}
