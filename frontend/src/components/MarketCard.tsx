import { useNavigate } from 'react-router-dom';
import type { MarketInfo } from '../types/market.js';
import { CATEGORY_LABELS, OUTCOME_LABELS, priceToCents, satsToDisplay } from '../types/market.js';
import { PriceBar } from './PriceBar.js';
import { timeRemaining } from '../utils/format.js';

interface MarketCardProps {
    readonly market: MarketInfo;
}

export function MarketCard({ market }: MarketCardProps): React.ReactElement {
    const navigate = useNavigate();
    const isOpen = market.outcome === 0;

    const handleClick = (): void => {
        navigate(`/market/${market.marketId.toString()}`);
    };

    return (
        <div className={`market-card ${!isOpen ? 'market-card--resolved' : ''}`} onClick={handleClick}>
            <div className="market-card__header">
                <span className={`category-badge category-badge--${market.category.toString()}`}>
                    {CATEGORY_LABELS[market.category]}
                </span>
                {isOpen ? (
                    <span className="time-remaining">{timeRemaining(market.endTime)}</span>
                ) : (
                    <span className={`outcome-badge outcome-badge--${market.outcome.toString()}`}>
                        {OUTCOME_LABELS[market.outcome]}
                    </span>
                )}
            </div>

            <h3 className="market-card__title">
                {market.description || `Market #${market.marketId.toString()}`}
            </h3>

            <PriceBar yesPrice={market.yesPrice} noPrice={market.noPrice} />

            <div className="market-card__footer">
                <div className="market-stat">
                    <span className="stat-label">Volume</span>
                    <span className="stat-value">{satsToDisplay(market.totalVolume)}</span>
                </div>
                <div className="market-stat">
                    <span className="stat-label">Buy YES</span>
                    <span className="stat-value yes-value">{priceToCents(market.yesPrice)}</span>
                </div>
                <div className="market-stat">
                    <span className="stat-label">Buy NO</span>
                    <span className="stat-value no-value">{priceToCents(market.noPrice)}</span>
                </div>
            </div>
        </div>
    );
}
