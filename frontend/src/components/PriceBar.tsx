import { priceToPercent } from '../utils/format.js';

interface PriceBarProps {
    readonly yesPrice: bigint;
    readonly noPrice: bigint;
}

/**
 * Visual probability bar showing YES (green) vs NO (red) split.
 */
export function PriceBar({ yesPrice, noPrice }: PriceBarProps): React.ReactElement {
    const total = yesPrice + noPrice;
    const yesPercent = total > 0n ? Number((yesPrice * 100n) / total) : 50;
    const noPercent = 100 - yesPercent;

    return (
        <div className="price-bar-container">
            <div className="price-bar-labels">
                <span className="price-label yes">YES — {priceToPercent(yesPrice)}</span>
                <span className="price-label no">NO — {priceToPercent(noPrice)}</span>
            </div>
            <div className="price-bar">
                <div
                    className="price-bar-yes"
                    style={{ width: `${yesPercent.toString()}%` }}
                />
                <div
                    className="price-bar-no"
                    style={{ width: `${noPercent.toString()}%` }}
                />
            </div>
        </div>
    );
}
