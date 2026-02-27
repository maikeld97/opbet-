import { useState, useEffect } from 'react';
import type { MarketInfo, QuoteResult } from '../types/market.js';
import { priceToPercent, priceToCents, satsToDisplay } from '../types/market.js';
import { useMarket } from '../hooks/useMarket.js';
import { useWallet } from '../hooks/useWallet.js';
import { formatShares } from '../utils/format.js';

type TradeTab = 'buy' | 'sell';
type Outcome = 'yes' | 'no';

interface ShareTraderProps {
    readonly market: MarketInfo;
    readonly userYesShares: bigint;
    readonly userNoShares: bigint;
    readonly poolAddress: string | null;
    readonly onTradeComplete: () => void;
}

export function ShareTrader({
    market,
    userYesShares,
    userNoShares,
    poolAddress,
    onTradeComplete,
}: ShareTraderProps): React.ReactElement {
    const { isConnected } = useWallet();
    const { buyShares, sellShares, quoteShares, loading, error } = useMarket();

    const [tab, setTab] = useState<TradeTab>('buy');
    const [outcome, setOutcome] = useState<Outcome>('yes');
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    // Refresh quote on input change
    useEffect(() => {
        setQuote(null);
        setTxId(null);

        const sats = parseSats(amount);
        if (sats === null || sats <= 0n) return;

        if (tab === 'buy') {
            const timer = setTimeout(() => {
                void quoteShares(market.marketId, outcome === 'yes', sats).then((q) => {
                    if (q) setQuote(q);
                });
            }, 400);
            return () => {
                clearTimeout(timer);
            };
        }

        return undefined;
    }, [amount, tab, outcome, market.marketId, quoteShares]);

    const parseSats = (input: string): bigint | null => {
        const trimmed = input.trim();
        if (trimmed === '') return null;
        try {
            // Allow BTC input (e.g. "0.001") or sats (e.g. "100000")
            if (trimmed.includes('.')) {
                const btc = parseFloat(trimmed);
                if (isNaN(btc) || btc < 0) return null;
                return BigInt(Math.round(btc * 100_000_000));
            }
            return BigInt(trimmed);
        } catch {
            return null;
        }
    };

    const handleTrade = async (): Promise<void> => {
        setTxId(null);
        const sats = parseSats(amount);

        if (tab === 'buy') {
            if (sats === null || sats <= 0n) return;
            if (!poolAddress) {
                // Should not happen in practice — pool address is stored when market is created
                return;
            }
            const txid = await buyShares(market.marketId, outcome === 'yes', sats, poolAddress);
            if (txid) {
                setTxId(txid);
                setAmount('');
                onTradeComplete();
            }
        } else {
            // Sell: amount is shares, not sats
            let shares: bigint;
            try {
                shares = BigInt(amount.trim());
            } catch {
                return;
            }
            const txid = await sellShares(market.marketId, outcome === 'yes', shares);
            if (txid) {
                setTxId(txid);
                setAmount('');
                onTradeComplete();
            }
        }
    };

    const maxShares = outcome === 'yes' ? userYesShares : userNoShares;
    const isResolved = market.outcome !== 0;

    if (isResolved) {
        return (
            <div className="share-trader share-trader--resolved">
                <p>Market resolved — trading closed.</p>
            </div>
        );
    }

    return (
        <div className="share-trader">
            {/* Tab: Buy / Sell */}
            <div className="trader-tabs">
                <button
                    className={`trader-tab ${tab === 'buy' ? 'active' : ''}`}
                    onClick={() => {
                        setTab('buy');
                        setAmount('');
                        setQuote(null);
                    }}
                >
                    Buy
                </button>
                <button
                    className={`trader-tab ${tab === 'sell' ? 'active' : ''}`}
                    onClick={() => {
                        setTab('sell');
                        setAmount('');
                        setQuote(null);
                    }}
                >
                    Sell
                </button>
            </div>

            {/* Outcome selector */}
            <div className="outcome-selector">
                <button
                    className={`outcome-btn outcome-btn--yes ${outcome === 'yes' ? 'active' : ''}`}
                    onClick={() => {
                        setOutcome('yes');
                    }}
                >
                    <span>YES</span>
                    <span className="outcome-btn__price">{priceToCents(market.yesPrice)}</span>
                </button>
                <button
                    className={`outcome-btn outcome-btn--no ${outcome === 'no' ? 'active' : ''}`}
                    onClick={() => {
                        setOutcome('no');
                    }}
                >
                    <span>NO</span>
                    <span className="outcome-btn__price">{priceToCents(market.noPrice)}</span>
                </button>
            </div>

            {/* Amount input */}
            <div className="amount-input-group">
                <label className="input-label">
                    {tab === 'buy' ? 'Amount (BTC or sats)' : 'Shares to sell'}
                </label>
                <input
                    type="text"
                    className="amount-input"
                    placeholder={tab === 'buy' ? '0.001 or 100000' : 'e.g. 5000'}
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                    }}
                />
                {tab === 'sell' && maxShares > 0n && (
                    <button
                        className="max-btn"
                        onClick={() => {
                            setAmount(maxShares.toString());
                        }}
                    >
                        MAX ({formatShares(maxShares)})
                    </button>
                )}
            </div>

            {/* Quote preview */}
            {tab === 'buy' && quote && (() => {
                const sats = parseSats(amount);
                // Avg buy price per share = sats_paid / shares_received × 100 → cents
                const avgPriceCents =
                    sats !== null && quote.sharesOut > 0n
                        ? ((Number(sats) / Number(quote.sharesOut)) * 100).toFixed(2) + '¢'
                        : null;

                // Potential payout approximation: btcIn / currentPrice
                // currentPrice is scaled × 1_000_000 (e.g. 650_000 = 65%)
                const currentPrice = outcome === 'yes' ? market.yesPrice : market.noPrice;
                let potentialPayout: bigint | null = null;
                let potentialProfit: bigint | null = null;
                let profitPct: string | null = null;
                if (sats !== null && sats > 0n && currentPrice > 0n) {
                    // potentialPayout = sats * 1_000_000 / currentPrice
                    potentialPayout = (sats * 1_000_000n) / currentPrice;
                    potentialProfit = potentialPayout - sats;
                    const pct = (Number(potentialProfit) / Number(sats)) * 100;
                    profitPct = pct.toFixed(1);
                }

                return (
                    <div className="quote-preview">
                        <div className="quote-row">
                            <span>Avg. price (incl. fee)</span>
                            <span className={outcome === 'yes' ? 'yes-value' : 'no-value'}>
                                {avgPriceCents ?? '—'}
                            </span>
                        </div>
                        <div className="quote-row">
                            <span>Shares received</span>
                            <span>{formatShares(quote.sharesOut)}</span>
                        </div>
                        <div className="quote-row">
                            <span>New market price</span>
                            <span>{priceToPercent(quote.newPrice)}</span>
                        </div>
                        {potentialPayout !== null && potentialProfit !== null && (
                            <>
                                <div className="quote-row quote-row--divider" />
                                <div className="quote-row">
                                    <span>Potential payout if wins</span>
                                    <span className={outcome === 'yes' ? 'yes-value' : 'no-value'}>
                                        ~{satsToDisplay(potentialPayout)}
                                    </span>
                                </div>
                                <div className="quote-row">
                                    <span>Potential profit</span>
                                    <span className={outcome === 'yes' ? 'yes-value' : 'no-value'}>
                                        +{satsToDisplay(potentialProfit)} (+{profitPct}%)
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                );
            })()}

            {/* Pool address warning */}
            {tab === 'buy' && !poolAddress && (
                <p className="trade-error">
                    Pool address not found. Make sure you created this market on this device.
                </p>
            )}

            {/* Error */}
            {error && <p className="trade-error">{error}</p>}

            {/* Success */}
            {txId && (
                <p className="trade-success">
                    Transaction sent:{' '}
                    <span className="tx-hash">{txId.slice(0, 16)}...</span>
                </p>
            )}

            {/* Action button */}
            <button
                className={`btn btn-trade ${outcome === 'yes' ? 'btn-yes' : 'btn-no'}`}
                onClick={handleTrade}
                disabled={loading || !isConnected || !amount || (tab === 'buy' && !poolAddress)}
            >
                {loading
                    ? 'Processing...'
                    : !isConnected
                      ? 'Connect wallet to trade'
                      : `${tab === 'buy' ? 'Buy' : 'Sell'} ${outcome.toUpperCase()}`}
            </button>
        </div>
    );
}
