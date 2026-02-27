import { useEffect, useState, useCallback } from 'react';
import { useMarket } from '../hooks/useMarket.js';
import { CATEGORY_LABELS } from '../types/market.js';

interface MarketSeedEntry {
    marketId: string;
    description: string;
    category: string;
    eventTitle: string;
    eventSlug: string;
    outcomeLabel: string;
}

export function AdminSeed(): React.ReactElement {
    const { marketCount } = useMarket();
    const [entries, setEntries] = useState<MarketSeedEntry[]>([]);
    const [saved, setSaved] = useState(false);

    // Load current localStorage values for each market
    const buildEntries = useCallback((): void => {
        const count = Number(marketCount);
        const result: MarketSeedEntry[] = [];
        for (let i = 0; i < count; i++) {
            const id = i.toString();
            const eventRaw = localStorage.getItem(`opbet_event_${id}`);
            const event = eventRaw
                ? (JSON.parse(eventRaw) as { eventTitle: string | null; eventSlug: string; outcomeLabel: string | null })
                : null;
            result.push({
                marketId: id,
                description: localStorage.getItem(`opbet_desc_${id}`) ?? '',
                category: localStorage.getItem(`opbet_cat_${id}`) ?? '',
                eventTitle: event?.eventTitle ?? '',
                eventSlug: event?.eventSlug ?? '',
                outcomeLabel: event?.outcomeLabel ?? '',
            });
        }
        setEntries(result);
    }, [marketCount]);

    useEffect(() => {
        buildEntries();
    }, [buildEntries]);

    const updateEntry = (index: number, field: keyof MarketSeedEntry, value: string): void => {
        setEntries((prev) =>
            prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
        );
        setSaved(false);
    };

    const handleSave = (): void => {
        for (const entry of entries) {
            const id = entry.marketId;
            if (entry.description.trim()) {
                localStorage.setItem(`opbet_desc_${id}`, entry.description.trim());
            }
            if (entry.category !== '') {
                localStorage.setItem(`opbet_cat_${id}`, entry.category);
            }
            if (entry.eventSlug.trim()) {
                localStorage.setItem(
                    `opbet_event_${id}`,
                    JSON.stringify({
                        eventTitle: entry.eventTitle.trim() || null,
                        eventSlug: entry.eventSlug.trim(),
                        outcomeLabel: entry.outcomeLabel.trim() || null,
                    }),
                );
            }
        }
        setSaved(true);
        setTimeout(() => { setSaved(false); }, 3000);
    };

    const handleClearAll = (): void => {
        for (const entry of entries) {
            localStorage.removeItem(`opbet_desc_${entry.marketId}`);
            localStorage.removeItem(`opbet_cat_${entry.marketId}`);
            localStorage.removeItem(`opbet_event_${entry.marketId}`);
        }
        buildEntries();
    };

    return (
        <main className="page" style={{ maxWidth: '860px' }}>
            <h2 style={{ marginBottom: '8px' }}>Admin — Seed Market Descriptions</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '14px' }}>
                Descriptions are stored in your browser&apos;s localStorage. Use this page to set them
                on any device where they are missing. Fields left blank are not changed.
            </p>

            {entries.length === 0 ? (
                <div className="loading-state">
                    <div className="loading-spinner" />
                    Loading markets...
                </div>
            ) : (
                <>
                    {entries.map((entry, idx) => (
                        <div
                            key={entry.marketId}
                            style={{
                                background: 'var(--surface-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '16px',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: 'var(--accent-primary)',
                                    marginBottom: '12px',
                                    letterSpacing: '0.08em',
                                }}
                            >
                                MARKET #{entry.marketId}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'end' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Question / Description *</span>
                                        <input
                                            type="text"
                                            value={entry.description}
                                            onChange={(e) => { updateEntry(idx, 'description', e.target.value); }}
                                            placeholder="e.g. Will Trump win the 2024 election?"
                                            style={{
                                                background: 'var(--surface-base)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                width: '100%',
                                            }}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Category</span>
                                        <select
                                            value={entry.category}
                                            onChange={(e) => { updateEntry(idx, 'category', e.target.value); }}
                                            style={{
                                                background: 'var(--surface-base)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                            }}
                                        >
                                            <option value="">— on-chain —</option>
                                            {([0, 1, 2, 3] as const).map((cat) => (
                                                <option key={cat} value={cat.toString()}>{CATEGORY_LABELS[cat]}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Event Title (optional)</span>
                                        <input
                                            type="text"
                                            value={entry.eventTitle}
                                            onChange={(e) => { updateEntry(idx, 'eventTitle', e.target.value); }}
                                            placeholder="e.g. US Presidential Election"
                                            style={{
                                                background: 'var(--surface-base)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                width: '100%',
                                            }}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Event Slug (optional)</span>
                                        <input
                                            type="text"
                                            value={entry.eventSlug}
                                            onChange={(e) => { updateEntry(idx, 'eventSlug', e.target.value); }}
                                            placeholder="e.g. us-presidential-election-2024"
                                            style={{
                                                background: 'var(--surface-base)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                width: '100%',
                                            }}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Outcome Label (optional)</span>
                                        <input
                                            type="text"
                                            value={entry.outcomeLabel}
                                            onChange={(e) => { updateEntry(idx, 'outcomeLabel', e.target.value); }}
                                            placeholder="e.g. Trump"
                                            style={{
                                                background: 'var(--surface-base)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                width: '100%',
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        <button
                            className="btn btn--primary"
                            onClick={handleSave}
                            style={{ flex: 1 }}
                        >
                            {saved ? 'Saved!' : 'Save All Descriptions'}
                        </button>
                        <button
                            className="btn btn--secondary"
                            onClick={handleClearAll}
                            style={{ color: 'var(--color-error)' }}
                        >
                            Clear All
                        </button>
                    </div>

                    {saved && (
                        <p style={{ color: 'var(--accent-primary)', marginTop: '12px', fontSize: '14px', textAlign: 'center' }}>
                            Saved to localStorage. Reload the Markets page to see descriptions.
                        </p>
                    )}
                </>
            )}
        </main>
    );
}
