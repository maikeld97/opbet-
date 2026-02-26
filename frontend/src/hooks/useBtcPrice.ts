import { useState, useEffect } from 'react';

let _cached: number | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export function useBtcPrice(): number | null {
    const [price, setPrice] = useState<number | null>(_cached);

    useEffect(() => {
        const now = Date.now();
        if (_cached !== null && now - _cacheTime < CACHE_TTL_MS) {
            setPrice(_cached);
            return;
        }

        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            .then((r) => r.json())
            .then((data: { bitcoin?: { usd?: number } }) => {
                const usd = data.bitcoin?.usd;
                if (usd !== undefined) {
                    _cached = usd;
                    _cacheTime = Date.now();
                    setPrice(usd);
                }
            })
            .catch(() => {
                /* non-fatal — price display optional */
            });
    }, []);

    return price;
}

/** Convert satoshis + BTC price to USD string e.g. "$42.30" */
export function satsToUsd(sats: bigint, btcUsdPrice: number): string {
    const btc = Number(sats) / 100_000_000;
    const usd = btc * btcUsdPrice;
    if (usd < 0.01) return '<$0.01';
    return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
