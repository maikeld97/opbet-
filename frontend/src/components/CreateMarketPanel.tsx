import { useState } from 'react';
import { CATEGORY_LABELS } from '../types/market.js';
import type { UseMarketReturn } from '../hooks/useMarket.js';
import { PolymarketImporter } from './PolymarketImporter.js';
import type { ImportedMarket } from './PolymarketImporter.js';

interface CreateMarketPanelProps {
    readonly createMarket: UseMarketReturn['createMarket'];
    readonly loading: boolean;
    readonly hookError: string | null;
    readonly onCreated: () => void;
    readonly chainTime?: number | null;
}

const CATEGORIES = [0, 1, 2, 3] as const;

async function hashPoolAddress(address: string): Promise<bigint> {
    const encoded = new TextEncoder().encode(address);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return BigInt('0x' + hex);
}

function minDatetimeLocal(): string {
    return new Date(Date.now() + 60_000).toISOString().slice(0, 16);
}

export function CreateMarketPanel({
    createMarket,
    loading,
    hookError,
    onCreated,
}: CreateMarketPanelProps): React.ReactElement {
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<0 | 1 | 2 | 3>(0);
    const [endDatetime, setEndDatetime] = useState('');
    const [poolAddress, setPoolAddress] = useState('');
    const [txId, setTxId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [initialYesPct, setInitialYesPct] = useState(50);
    const [polyRef, setPolyRef] = useState<{ yes: number; no: number } | null>(null);

    // ── Bulk queue ─────────────────────────────────────────────────────────────
    const [queue, setQueue] = useState<ImportedMarket[]>([]);
    const [queueIndex, setQueueIndex] = useState(0);
    const [queueRunning, setQueueRunning] = useState(false);
    const [queueResults, setQueueResults] = useState<Array<{ desc: string; ok: boolean; msg: string }>>([]);

    const fillFromMarket = (market: ImportedMarket): void => {
        setDescription(market.description);
        setCategory(market.category);
        setEndDatetime(market.endDatetime);
        setTxId(null);
        setError(null);
        if (market.polyYesPrice !== null && market.polyNoPrice !== null) {
            const yesPct = Math.max(1, Math.min(99, Math.round(market.polyYesPrice * 100)));
            setInitialYesPct(yesPct);
            setPolyRef({ yes: market.polyYesPrice, no: market.polyNoPrice });
        } else {
            setPolyRef(null);
        }
    };

    // Single import from Polymarket (existing flow)
    const handleImport = (market: ImportedMarket): void => {
        fillFromMarket(market);
        setOpen(true);
    };

    // Bulk queue from Polymarket (new flow)
    const handleBulkQueue = (markets: ImportedMarket[]): void => {
        setQueue(markets);
        setQueueIndex(0);
        setQueueResults([]);
        setQueueRunning(false);
        setOpen(true);
        // Pre-fill form with first market
        if (markets[0]) fillFromMarket(markets[0]);
    };

    const doCreate = async (): Promise<string | null> => {
        if (!description.trim() || !endDatetime || !poolAddress.trim()) return null;
        const endTimestamp = Math.floor(new Date(endDatetime).getTime() / 1000);
        if (endTimestamp <= Math.floor(Date.now() / 1000)) return null;
        const trimmedPool = poolAddress.trim();
        const poolAddrHash = await hashPoolAddress(trimmedPool);
        const initialYesBps = BigInt(Math.round(initialYesPct * 100));
        return createMarket(
            description.trim(),
            category,
            BigInt(endTimestamp),
            trimmedPool,
            poolAddrHash,
            initialYesBps,
        );
    };

    const handleCreate = async (): Promise<void> => {
        if (!description.trim() || !endDatetime || !poolAddress.trim()) {
            setError('All fields are required');
            return;
        }
        const endTimestamp = Math.floor(new Date(endDatetime).getTime() / 1000);
        if (endTimestamp <= Math.floor(Date.now() / 1000)) {
            setError('End time must be in the future');
            return;
        }
        setError(null);
        setTxId(null);
        try {
            const tx = await doCreate();
            if (tx) {
                setTxId(tx);
                setDescription('');
                setEndDatetime('');
                setInitialYesPct(50);
                setPolyRef(null);
                onCreated();

                // If queue: advance to next
                if (queue.length > 0 && queueIndex < queue.length - 1) {
                    const next = queueIndex + 1;
                    setQueueResults((prev) => [...prev, { desc: description.trim(), ok: true, msg: tx.slice(0, 12) + '...' }]);
                    setQueueIndex(next);
                    fillFromMarket(queue[next]!);
                } else if (queue.length > 0) {
                    setQueueResults((prev) => [...prev, { desc: description.trim(), ok: true, msg: tx.slice(0, 12) + '...' }]);
                    setQueue([]);
                    setQueueIndex(0);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Create failed';
            setError(msg);
            // In queue mode: record failure and automatically advance to next market
            if (queue.length > 0) {
                setQueueResults((prev) => [...prev, { desc: description.trim(), ok: false, msg: 'Error – skipped' }]);
                if (queueIndex < queue.length - 1) {
                    const next = queueIndex + 1;
                    setQueueIndex(next);
                    fillFromMarket(queue[next]!);
                } else {
                    setQueue([]);
                    setQueueIndex(0);
                }
            }
        }
    };

    const skipQueueItem = (): void => {
        if (queueIndex < queue.length - 1) {
            setQueueResults((prev) => [...prev, { desc: description.trim(), ok: false, msg: 'Skipped' }]);
            const next = queueIndex + 1;
            setQueueIndex(next);
            fillFromMarket(queue[next]!);
        } else {
            setQueue([]);
            setQueueIndex(0);
        }
        setError(null);
        setTxId(null);
    };

    if (!open) {
        return (
            <div className="create-market-cta">
                <PolymarketImporter onImport={handleImport} onBulkQueue={handleBulkQueue} />
                <button className="btn btn-primary" onClick={() => { setOpen(true); }}>
                    + Create Market
                </button>
            </div>
        );
    }

    const noPrice = 100 - initialYesPct;
    const inQueue = queue.length > 0;

    return (
        <div className="create-market-panel">
            <div className="create-market-panel__header">
                <h3 className="create-market-panel__title">
                    {inQueue
                        ? `Create Market ${queueIndex + 1} of ${queue.length}`
                        : 'Create New Market'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!inQueue && <PolymarketImporter onImport={handleImport} onBulkQueue={handleBulkQueue} />}
                    <button className="btn-close" onClick={() => { setOpen(false); setQueue([]); setQueueIndex(0); }}>✕</button>
                </div>
            </div>

            {/* Queue progress bar */}
            {inQueue && (
                <div className="queue-progress">
                    <div className="queue-progress__bar">
                        <div
                            className="queue-progress__fill"
                            style={{ width: `${((queueIndex) / queue.length) * 100}%` }}
                        />
                    </div>
                    <div className="queue-progress__label">
                        <span>{queueIndex} done · {queue.length - queueIndex} remaining</span>
                        <button className="btn btn-ghost btn-sm" onClick={skipQueueItem}>
                            Skip this →
                        </button>
                    </div>
                    {/* Completed results */}
                    {queueResults.length > 0 && (
                        <div className="queue-results">
                            {queueResults.slice(-3).map((r, i) => (
                                <div key={i} className={`queue-result ${r.ok ? 'queue-result--ok' : 'queue-result--skip'}`}>
                                    {r.ok ? '✓' : '–'} {r.desc.slice(0, 50)}{r.desc.length > 50 ? '...' : ''}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="form-group">
                <label className="form-label">Question</label>
                <input
                    className="form-input"
                    type="text"
                    placeholder="Will Bitcoin reach $200k by end of 2025?"
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); }}
                />
            </div>

            <div className="form-group">
                <label className="form-label">Category</label>
                <select
                    className="sort-select"
                    value={category}
                    onChange={(e) => { setCategory(Number(e.target.value) as 0 | 1 | 2 | 3); }}
                >
                    {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Market ends at</label>
                <input
                    className="form-input"
                    type="datetime-local"
                    min={minDatetimeLocal()}
                    value={endDatetime}
                    onChange={(e) => { setEndDatetime(e.target.value); }}
                />
            </div>

            {/* ── Starting odds ───────────────────────────────────────────── */}
            <div className="form-group">
                <div className="price-label-row">
                    <label className="form-label">Starting odds</label>
                    {polyRef !== null && (
                        <button
                            className="poly-ref-btn"
                            onClick={() => { setInitialYesPct(Math.max(1, Math.min(99, Math.round(polyRef.yes * 100)))); }}
                        >
                            Polymarket: YES {Math.round(polyRef.yes * 100)}¢ / NO {Math.round(polyRef.no * 100)}¢
                            <span className="poly-ref-btn__arrow"> → use this</span>
                        </button>
                    )}
                </div>
                <div className="price-slider-wrap">
                    <div className="price-slider-labels">
                        <span className="price-slider-label--yes">YES <strong>{initialYesPct}¢</strong></span>
                        <span className="price-slider-label--no">NO <strong>{noPrice}¢</strong></span>
                    </div>
                    <div className="price-slider-bar">
                        <div className="price-slider-fill-yes" style={{ width: `${initialYesPct}%` }} />
                        <div className="price-slider-fill-no" style={{ width: `${noPrice}%` }} />
                    </div>
                    <input
                        type="range"
                        className="price-slider"
                        min={1} max={99}
                        value={initialYesPct}
                        onChange={(e) => { setInitialYesPct(Number(e.target.value)); }}
                    />
                    <div className="price-slider-ticks">
                        {[10, 25, 50, 75, 90].map((v) => (
                            <button
                                key={v}
                                className={`price-tick ${initialYesPct === v ? 'active' : ''}`}
                                onClick={() => { setInitialYesPct(v); }}
                            >
                                {v}%
                            </button>
                        ))}
                    </div>
                </div>
                <span className="form-hint">AMM starts at YES {initialYesPct}% · adjusts automatically with trades</span>
            </div>

            <div className="form-group">
                <label className="form-label">Pool BTC Address</label>
                <input
                    className="form-input"
                    type="text"
                    placeholder="tb1p... (your Signet address)"
                    value={poolAddress}
                    onChange={(e) => { setPoolAddress(e.target.value); }}
                />
                <span className="form-hint">BTC sent when buying shares goes to this address.</span>
            </div>

            {(error ?? hookError) && <p className="trade-error">{error ?? hookError}</p>}
            {txId && <p className="trade-success">Created! TX: {txId.slice(0, 20)}...</p>}

            <div className="create-market-panel__actions">
                <button
                    className="btn btn-primary"
                    onClick={handleCreate}
                    disabled={loading || !endDatetime || queueRunning}
                >
                    {loading ? 'Creating...' : inQueue ? `Create & next →` : 'Create Market'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setOpen(false); setQueue([]); setQueueIndex(0); }} disabled={loading}>
                    {inQueue ? 'Stop queue' : 'Cancel'}
                </button>
            </div>
        </div>
    );
}
