import { useNavigate } from 'react-router-dom';
import type { MarketInfo } from '../types/market.js';
import { CATEGORY_LABELS, priceToCents } from '../types/market.js';
import { timeRemaining } from '../utils/format.js';

interface EventGroupCardProps {
    readonly eventTitle: string;
    readonly markets: MarketInfo[];
}

export function EventGroupCard({ eventTitle, markets }: EventGroupCardProps): React.ReactElement {
    const navigate = useNavigate();
    const first = markets[0]!;
    const totalVol = markets.reduce((acc, m) => acc + m.totalVolume, 0n);

    function fmtVol(sats: bigint): string {
        if (sats >= 100_000_000n) return `${(Number(sats) / 1e8).toFixed(2)} BTC`;
        if (sats >= 1_000n) return `${(Number(sats) / 1000).toFixed(0)}k sats`;
        return `${sats.toString()} sats`;
    }

    // Sort outcomes by YES price descending (highest probability first)
    const sorted = [...markets].sort((a, b) => Number(b.yesPrice - a.yesPrice));

    const eventSlug = first.eventSlug;

    return (
        <div className="event-group-card">
            <div
                className="event-group-card__header"
                style={{ cursor: eventSlug ? 'pointer' : 'default' }}
                onClick={() => { if (eventSlug) navigate(`/event/${eventSlug}`); }}
            >
                <div className="event-group-card__meta">
                    <span className={`category-badge category-badge--${first.category.toString()}`}>
                        {CATEGORY_LABELS[first.category]}
                    </span>
                    <span className="time-remaining">{timeRemaining(first.endTime)}</span>
                </div>
                <h3 className="event-group-card__title">
                    {eventTitle}
                    {eventSlug && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                            → View all
                        </span>
                    )}
                </h3>
                <div className="event-group-card__vol">
                    {markets.length} outcomes · {fmtVol(totalVol)} vol
                </div>
            </div>

            <div className="event-group-card__outcomes">
                {sorted.slice(0, 6).map((m) => {
                    const label = m.outcomeLabel ?? m.description;
                    const yesPct = Math.round(Number(m.yesPrice) / 10_000);
                    const isOpen = m.outcome === 0;
                    return (
                        <div
                            key={m.marketId.toString()}
                            className="event-outcome-row"
                            onClick={() => { navigate(eventSlug ? `/event/${eventSlug}` : `/market/${m.marketId.toString()}`); }}
                        >
                            <span className="event-outcome-row__label">{label}</span>
                            <span className="event-outcome-row__pct">{yesPct}%</span>
                            <div className="event-outcome-row__actions">
                                <button
                                    className="btn-outcome btn-outcome--yes"
                                    disabled={!isOpen}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(eventSlug ? `/event/${eventSlug}` : `/market/${m.marketId.toString()}`);
                                    }}
                                >
                                    Yes {priceToCents(m.yesPrice)}
                                </button>
                                <button
                                    className="btn-outcome btn-outcome--no"
                                    disabled={!isOpen}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(eventSlug ? `/event/${eventSlug}` : `/market/${m.marketId.toString()}`);
                                    }}
                                >
                                    No {priceToCents(m.noPrice)}
                                </button>
                            </div>
                        </div>
                    );
                })}
                {sorted.length > 6 && (
                    <div
                        className="event-group-card__more"
                        style={{ cursor: eventSlug ? 'pointer' : 'default' }}
                        onClick={() => { if (eventSlug) navigate(`/event/${eventSlug}`); }}
                    >
                        +{sorted.length - 6} more outcomes →
                    </div>
                )}
            </div>
        </div>
    );
}
