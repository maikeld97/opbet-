import { useState, useCallback, useRef } from 'react';

interface LiveSet {
    descriptions: Set<string>;
    slugs: Set<string>;
}

function buildLiveSet(): LiveSet {
    const descriptions = new Set<string>();
    const slugs = new Set<string>();
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith('opbet_desc_')) {
            const val = localStorage.getItem(key);
            if (val) descriptions.add(val.toLowerCase().trim());
        }
        if (key.startsWith('opbet_event_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const ev = JSON.parse(raw) as { eventSlug?: string };
                    if (ev.eventSlug) slugs.add(ev.eventSlug);
                } catch { /* ignore */ }
            }
        }
    }
    return { descriptions, slugs };
}

// A flattened binary market ready to display
interface PolyMarket {
    readonly question: string;
    readonly eventVolume: number;    // aggregate event volume (for display + filter)
    readonly endDate: string;
    readonly tags: string[];
    readonly slug: string;
    readonly yesPrice: number | null;
    readonly noPrice: number | null;
    readonly eventTitle: string;
    readonly eventSlug: string;
    readonly outcomeLabel: string | null; // e.g. "Gavin Newsom"
}

export interface ImportedMarket {
    readonly description: string;
    readonly category: 0 | 1 | 2 | 3;
    readonly endDatetime: string;
    readonly polyYesPrice: number | null;
    readonly polyNoPrice: number | null;
    readonly eventTitle?: string;
    readonly eventSlug?: string;
    readonly outcomeLabel?: string;
}

interface PolymarketImporterProps {
    readonly onImport: (market: ImportedMarket) => void;
    readonly onBulkQueue?: (markets: ImportedMarket[]) => void;
}

const MIN_EVENT_VOLUME_USD = 1_000_000;
const PAGE_SIZE = 100;
const MAX_MARKETS_PER_EVENT = 5; // cap multi-outcome events

function detectCategory(tags: string[]): 0 | 1 | 2 | 3 {
    const joined = tags.join(' ').toLowerCase();
    if (/crypto|bitcoin|btc|eth|ethereum|solana|defi|nft|token/.test(joined)) return 0;
    if (/sport|nfl|nba|mlb|nhl|soccer|football|baseball|tennis|golf|ufc|mma/.test(joined)) return 1;
    if (/politic|election|president|senate|congress|vote|democrat|republican|government/.test(joined)) return 2;
    return 3;
}

function fmtVol(vol: number): string {
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
    return `$${(vol / 1_000).toFixed(0)}K`;
}

function isoToLocal(iso: string): string {
    try {
        return new Date(iso).toISOString().slice(0, 16);
    } catch {
        return '';
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePrices(raw: any): [number | null, number | null] {
    try {
        if (!raw) return [null, null];
        const arr: string[] = typeof raw === 'string' ? (JSON.parse(raw) as string[]) : (raw as string[]);
        if (!Array.isArray(arr) || arr.length < 2) return [null, null];
        const yes = parseFloat(arr[0] ?? '');
        const no = parseFloat(arr[1] ?? '');
        if (isNaN(yes) || isNaN(no)) return [null, null];
        return [yes, no];
    } catch {
        return [null, null];
    }
}

function toImported(m: PolyMarket): ImportedMarket {
    const endDatetime = isoToLocal(m.endDate);
    const endTs = new Date(endDatetime).getTime();
    const resolvedEnd = endTs > Date.now()
        ? endDatetime
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    return {
        description: m.question,
        category: detectCategory(m.tags),
        endDatetime: resolvedEnd,
        polyYesPrice: m.yesPrice,
        polyNoPrice: m.noPrice,
        ...(m.eventTitle ? { eventTitle: m.eventTitle } : {}),
        ...(m.eventSlug ? { eventSlug: m.eventSlug } : {}),
        ...(m.outcomeLabel ? { outcomeLabel: m.outcomeLabel } : {}),
    };
}

const CAT_LABELS = ['Crypto', 'Sports', 'Politics', 'Other'] as const;
const CAT_COLORS = ['#0088ff', '#ffaa00', '#aa55ff', '#7878a0'] as const;

function MiniPriceBar({ yes, no }: { yes: number; no: number }): React.ReactElement {
    const yesPct = Math.round(yes * 100);
    const noPct = Math.round(no * 100);
    return (
        <div className="poly-price-bar">
            <span className="poly-price-bar__yes">{yesPct}¢</span>
            <div className="poly-price-bar__track">
                <div className="poly-price-bar__fill-yes" style={{ width: `${yesPct}%` }} />
            </div>
            <span className="poly-price-bar__no">{noPct}¢</span>
        </div>
    );
}

export function PolymarketImporter({ onImport, onBulkQueue }: PolymarketImporterProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [markets, setMarkets] = useState<PolyMarket[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [imported, setImported] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const liveSetRef = useRef<LiveSet>({ descriptions: new Set(), slugs: new Set() });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchViaProxy = useCallback(async (apiUrl: string): Promise<any[]> => {
        // Replace the base URL with our own proxy path (works in dev via Vite proxy, in prod via Netlify _redirects)
        const proxied = apiUrl.replace('https://gamma-api.polymarket.com', '/polymarket-api');
        const res = await fetch(proxied, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json() as unknown[];
    }, []);

    // Fetch events (with proper aggregate volume) and flatten into binary markets
    const fetchMarkets = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        setLoadingStatus('Fetching page 1...');
        const all: PolyMarket[] = [];

        try {
            let offset = 0;
            let page = 1;
            let keepGoing = true;

            while (keepGoing) {
                const apiUrl =
                    `https://gamma-api.polymarket.com/events` +
                    `?closed=false&active=true&limit=${PAGE_SIZE}&offset=${offset}&order=volume&ascending=false`;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data: any[] = await fetchViaProxy(apiUrl);

                if (!Array.isArray(data) || data.length === 0) break;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const event of data) {
                    const eventVol = parseFloat(event.volume ?? '0');
                    if (eventVol < MIN_EVENT_VOLUME_USD) {
                        keepGoing = false;
                        break;
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawTags: any[] = Array.isArray(event.tags) ? (event.tags as any[]) : [];
                    const tags: string[] = rawTags.map((t) =>
                        typeof t === 'string' ? t : ((t as { slug?: string; label?: string }).slug ?? (t as { slug?: string; label?: string }).label ?? ''),
                    );

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const eventMarkets: any[] = Array.isArray(event.markets) ? (event.markets as any[]) : [];

                    // Sort individual markets by their own volume desc, cap at MAX_MARKETS_PER_EVENT
                    const sorted = eventMarkets
                        .filter((m) => m.question && m.endDate && m.active !== false && m.closed !== true)
                        .sort((a, b) => parseFloat(b.volume ?? '0') - parseFloat(a.volume ?? '0'))
                        .slice(0, MAX_MARKETS_PER_EVENT);

                    for (const m of sorted) {
                        const [yesPrice, noPrice] = parsePrices(m.outcomePrices);
                        all.push({
                            question: m.question as string,
                            eventVolume: eventVol,
                            endDate: (m.endDate ?? event.endDate) as string,
                            tags,
                            slug: (m.slug ?? m.conditionId ?? String(m.question)) as string,
                            yesPrice,
                            noPrice,
                            eventTitle: event.title as string,
                            eventSlug: event.slug as string,
                            outcomeLabel: (m.groupItemTitle ?? null) as string | null,
                        });
                    }
                }

                const lastVol = parseFloat(data[data.length - 1]?.volume ?? '0');
                if (data.length < PAGE_SIZE || lastVol < MIN_EVENT_VOLUME_USD) {
                    keepGoing = false;
                } else {
                    offset += PAGE_SIZE;
                    page++;
                    setLoadingStatus(`Fetching page ${page}... (${all.length} markets so far)`);
                }
            }

            setMarkets(all);
            setLoadingStatus('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch Polymarket data');
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
    }, [fetchViaProxy]);

    const handleOpen = (): void => {
        liveSetRef.current = buildLiveSet();
        setOpen(true);
        if (markets.length === 0) void fetchMarkets();
    };

    const handleSingleImport = (m: PolyMarket): void => {
        onImport(toImported(m));
        setImported((prev) => new Set([...prev, m.slug]));
    };

    const toggleSelect = (slug: string): void => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });
    };

    const selectAll = (): void => {
        const { descriptions, slugs } = liveSetRef.current;
        const selectable = markets
            .filter((m) => {
                if (new Date(m.endDate) <= new Date()) return false;
                if (descriptions.has(m.question.toLowerCase().trim())) return false;
                if (slugs.has(m.eventSlug)) return false;
                return true;
            })
            .map((m) => m.slug);
        setSelected(new Set(selectable));
    };

    const clearSelection = (): void => setSelected(new Set());

    const handleBulkQueue = (): void => {
        if (!onBulkQueue) return;
        const queued = markets
            .filter((m) => selected.has(m.slug))
            .map(toImported);
        onBulkQueue(queued);
        setImported((prev) => new Set([...prev, ...selected]));
        setSelected(new Set());
    };

    if (!open) {
        return (
            <button className="btn btn-polymarket" onClick={handleOpen}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Import from Polymarket
            </button>
        );
    }

    return (
        <div className="poly-importer">
            <div className="poly-importer__header">
                <div>
                    <h3 className="poly-importer__title">Polymarket — Live Markets</h3>
                    <p className="poly-importer__sub">
                        {markets.length > 0 ? `${markets.length} markets with >$1M event volume` : 'Markets with >$1M volume — live prices'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={fetchMarkets} disabled={loading}>
                        {loading ? '...' : '↻ Refresh'}
                    </button>
                    <button className="btn-close" onClick={() => { setOpen(false); }}>✕</button>
                </div>
            </div>

            {/* Bulk actions bar */}
            {onBulkQueue && markets.length > 0 && (
                <div className="poly-bulk-bar">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select all</button>
                        {selected.size > 0 && (
                            <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
                        )}
                        {selected.size > 0 && (
                            <span className="poly-selected-count">{selected.size} selected</span>
                        )}
                    </div>
                    {selected.size > 0 && (
                        <button className="btn btn-primary btn-sm" onClick={handleBulkQueue}>
                            Queue {selected.size} markets →
                        </button>
                    )}
                </div>
            )}

            {error && <p className="trade-error">{error}</p>}

            {loading ? (
                <div className="poly-loading">
                    <div className="loading-spinner" />
                    {loadingStatus || 'Fetching from Polymarket...'}
                </div>
            ) : markets.length === 0 ? (
                <p className="poly-empty">No markets found with &gt;$1M volume.</p>
            ) : (
                <div className="poly-list">
                    {markets.map((m) => {
                        const cat = detectCategory(m.tags);
                        const isImported = imported.has(m.slug);
                        const isSelected = selected.has(m.slug);
                        const endDate = new Date(m.endDate);
                        const isExpired = endDate <= new Date();
                        const hasPrices = m.yesPrice !== null && m.noPrice !== null;
                        const { descriptions, slugs } = liveSetRef.current;
                        const isAlreadyLive =
                            descriptions.has(m.question.toLowerCase().trim()) ||
                            slugs.has(m.eventSlug);
                        return (
                            <div
                                key={m.slug}
                                className={`poly-item ${isImported ? 'poly-item--imported' : ''} ${isSelected ? 'poly-item--selected' : ''} ${isAlreadyLive ? 'poly-item--live' : ''}`}
                            >
                                {onBulkQueue && (
                                    <input
                                        type="checkbox"
                                        className="poly-checkbox"
                                        checked={isSelected}
                                        disabled={isExpired || isAlreadyLive}
                                        onChange={() => { toggleSelect(m.slug); }}
                                    />
                                )}
                                <div className="poly-item__main">
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span className="poly-item__cat" style={{ color: CAT_COLORS[cat] }}>
                                            {CAT_LABELS[cat]}
                                        </span>
                                        {isAlreadyLive && (
                                            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
                                                ✓ LIVE
                                            </span>
                                        )}
                                    </div>
                                    <p className="poly-item__question">{m.question}</p>
                                    <div className="poly-item__meta">
                                        <span className="poly-item__vol">{fmtVol(m.eventVolume)}</span>
                                        <span className="poly-item__date">
                                            {isExpired ? '⚠ Expired' : `Ends ${endDate.toLocaleDateString()}`}
                                        </span>
                                    </div>
                                    {hasPrices && (
                                        <MiniPriceBar yes={m.yesPrice!} no={m.noPrice!} />
                                    )}
                                </div>
                                <button
                                    className={`btn btn-sm ${isImported || isAlreadyLive ? 'btn-ghost' : 'btn-primary'}`}
                                    onClick={() => { if (!isAlreadyLive) handleSingleImport(m); }}
                                    disabled={isExpired || isAlreadyLive}
                                    title={isAlreadyLive ? 'Already live on OPBET' : isExpired ? 'End date is in the past' : 'Copy to Create Market form'}
                                >
                                    {isAlreadyLive ? '✓ Live' : isImported ? '✓' : 'Copy'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
