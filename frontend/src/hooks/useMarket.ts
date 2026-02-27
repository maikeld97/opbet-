import { useCallback, useEffect, useState } from 'react';
import { getContract, JSONRpcProvider, TransactionOutputFlags } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { PREDICTION_MARKET_ABI } from '../abi/PredictionMarket.js';
import type { MarketInfo, UserPosition, QuoteResult } from '../types/market.js';
import { useWallet } from './useWallet.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = 'https://testnet.opnet.org';
const NETWORK = networks.opnetTestnet;

/** Replace with your deployed contract address after deployment */
const CONTRACT_ADDRESS = import.meta.env['VITE_CONTRACT_ADDRESS'] as string;

// ─── Singleton provider ───────────────────────────────────────────────────────

let _provider: JSONRpcProvider | null = null;

function getProvider(): JSONRpcProvider {
    if (!_provider) {
        _provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    }
    return _provider;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMarketReturn {
    readonly marketCount: bigint;
    readonly chainTime: number | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly fetchMarketInfo: (marketId: bigint) => Promise<MarketInfo | null>;
    readonly fetchUserPosition: (marketId: bigint) => Promise<UserPosition | null>;
    readonly quoteShares: (
        marketId: bigint,
        isYes: boolean,
        btcIn: bigint,
    ) => Promise<QuoteResult | null>;
    readonly createMarket: (
        description: string,
        category: 0 | 1 | 2 | 3,
        endTime: bigint,
        poolAddress: string,
        poolAddrHash: bigint,
        initialYesBps: bigint,
        eventTitle?: string,
        eventSlug?: string,
        outcomeLabel?: string,
    ) => Promise<string | null>;
    readonly buyShares: (
        marketId: bigint,
        isYes: boolean,
        btcAmount: bigint,
        poolAddress: string,
    ) => Promise<string | null>;
    readonly sellShares: (
        marketId: bigint,
        isYes: boolean,
        sharesIn: bigint,
    ) => Promise<string | null>;
    readonly claimWinnings: (marketId: bigint) => Promise<string | null>;
    readonly refreshMarketCount: () => Promise<void>;
}

export function useMarket(): UseMarketReturn {
    const { isConnected, getAddress, walletAddress, network } = useWallet();
    const [marketCount, setMarketCount] = useState<bigint>(0n);
    const [chainTime, setChainTime] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getContractInstance = useCallback((sender?: Address | null): any => {
        const provider = getProvider();
        return getContract(
            CONTRACT_ADDRESS,
            PREDICTION_MARKET_ABI as unknown as [],
            provider,
            NETWORK,
            sender ?? undefined,
        );
    }, []);

    // ── Read: market count ──────────────────────────────────────────────────

    const refreshMarketCount = useCallback(async (): Promise<void> => {
        try {
            const provider = getProvider();

            // Fetch chain time from the latest block's medianTime
            try {
                const blockNumber = await provider.getBlockNumber();
                const block = await provider.getBlock(blockNumber);
                setChainTime(block.medianTime);
            } catch {
                // Non-fatal: chain time is optional (UI falls back to wall-clock)
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contract: any = getContractInstance();
            const result = await contract.getMarketCount();
            // CallResult has no `success` field — decoded data is in `properties`
            if (!result.revert && result.properties) {
                setMarketCount(result.properties['marketCount'] as bigint);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch market count');
        }
    }, [getContractInstance]);

    useEffect(() => {
        void refreshMarketCount();
    }, [refreshMarketCount]);

    // ── Read: market info ───────────────────────────────────────────────────

    const fetchMarketInfo = useCallback(
        async (marketId: bigint): Promise<MarketInfo | null> => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance();
                const result = await contract.getMarketInfo(marketId);
                if (result.revert || !result.properties) return null;

                const r = result.properties as Record<string, unknown>;
                const eventGroupRaw = localStorage.getItem(`opbet_event_${marketId.toString()}`);
                const eventGroup = eventGroupRaw ? JSON.parse(eventGroupRaw) as { eventTitle: string | null; eventSlug: string; outcomeLabel: string | null } : null;
                const catOverride = localStorage.getItem(`opbet_cat_${marketId.toString()}`);
                return {
                    marketId,
                    description: localStorage.getItem(`opbet_desc_${marketId.toString()}`) ?? '',
                    yesSharesInPool: r['yesSharesInPool'] as bigint,
                    noSharesInPool: r['noSharesInPool'] as bigint,
                    outcome: Number(r['outcome']) as 0 | 1 | 2,
                    endTime: r['endTime'] as bigint,
                    category: (catOverride !== null ? Number(catOverride) : Number(r['category'])) as 0 | 1 | 2 | 3,
                    totalVolume: r['totalVolume'] as bigint,
                    yesPrice: r['yesPrice'] as bigint,
                    noPrice: r['noPrice'] as bigint,
                    totalBtc: r['totalBtc'] as bigint,
                    ...(eventGroup?.eventTitle ? { eventTitle: eventGroup.eventTitle } : {}),
                    ...(eventGroup?.eventSlug ? { eventSlug: eventGroup.eventSlug } : {}),
                    ...(eventGroup?.outcomeLabel ? { outcomeLabel: eventGroup.outcomeLabel } : {}),
                };
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch market info');
                return null;
            }
        },
        [getContractInstance],
    );

    // ── Read: user position ─────────────────────────────────────────────────

    const fetchUserPosition = useCallback(
        async (marketId: bigint): Promise<UserPosition | null> => {
            const userAddress = getAddress();
            if (!userAddress) return null;

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance();
                const result = await contract.getUserPosition(marketId, userAddress);
                if (result.revert || !result.properties) return null;

                const r = result.properties as Record<string, unknown>;
                return {
                    marketId,
                    yesShares: r['yesShares'] as bigint,
                    noShares: r['noShares'] as bigint,
                    pendingClaim: r['pendingClaim'] as bigint,
                    hasClaimed: r['hasClaimed'] as boolean,
                };
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch user position');
                return null;
            }
        },
        [getAddress, getContractInstance],
    );

    // ── Read: quote ─────────────────────────────────────────────────────────

    const quoteShares = useCallback(
        async (
            marketId: bigint,
            isYes: boolean,
            btcIn: bigint,
        ): Promise<QuoteResult | null> => {
            try {
                // Pre-apply spread before quoting so the quote matches what user actually receives.
                const btcAfterFee = (btcIn * 9900n) / 10000n;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance();
                const result = await contract.quoteShares(marketId, isYes, btcAfterFee);
                if (result.revert || !result.properties) return null;

                const r = result.properties as Record<string, unknown>;
                return {
                    sharesOut: r['sharesOut'] as bigint,
                    newPrice: r['newPrice'] as bigint,
                };
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to get quote');
                return null;
            }
        },
        [getContractInstance],
    );

    // ── Write: createMarket ─────────────────────────────────────────────────

    const createMarket = useCallback(
        async (
            description: string,
            category: 0 | 1 | 2 | 3,
            endTime: bigint,
            poolAddress: string,
            poolAddrHash: bigint,
            initialYesBps: bigint,
            eventTitle?: string,
            eventSlug?: string,
            outcomeLabel?: string,
        ): Promise<string | null> => {
            if (!isConnected) {
                setError('Wallet not connected');
                return null;
            }

            const senderAddress = getAddress();
            if (!senderAddress || !walletAddress) return null;

            setLoading(true);
            setError(null);

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance(getAddress());

                const simulation = await contract.createMarket(
                    description,
                    category,
                    endTime,
                    poolAddrHash,
                    initialYesBps,
                );

                const receipt = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress,
                    maximumAllowedSatToSpend: 100_000n,
                    network,
                });

                // Poll until marketCount increases (block needs to mine first)
                const prevCount = marketCount;
                for (let attempt = 0; attempt < 20; attempt++) {
                    await new Promise((r) => setTimeout(r, 2000));
                    await refreshMarketCount();
                    // refreshMarketCount updates state async; read directly
                    const contract2: any = getContractInstance();
                    const r2 = await contract2.getMarketCount();
                    const newCount = r2.properties?.['marketCount'] as bigint | undefined;
                    if (newCount !== undefined && newCount > prevCount) break;
                }

                // Store pool address + description locally (not in contract storage)
                localStorage.setItem(`opbet_pool_${prevCount.toString()}`, poolAddress);
                localStorage.setItem(`opbet_desc_${prevCount.toString()}`, description);
                if (eventSlug) {
                    localStorage.setItem(`opbet_event_${prevCount.toString()}`, JSON.stringify({
                        eventTitle: eventTitle ?? null,
                        eventSlug,
                        outcomeLabel: outcomeLabel ?? null,
                    }));
                }

                return receipt.transactionId as string;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Transaction failed');
                return null;
            } finally {
                setLoading(false);
            }
        },
        [isConnected, getAddress, getContractInstance, network, refreshMarketCount],
    );

    // ── Write: buyShares ────────────────────────────────────────────────────

    const buyShares = useCallback(
        async (
            marketId: bigint,
            isYes: boolean,
            btcAmount: bigint,
            poolAddress: string,
        ): Promise<string | null> => {
            if (!isConnected) {
                setError('Wallet not connected');
                return null;
            }

            const senderAddress = getAddress();
            if (!senderAddress || !walletAddress) return null;

            setLoading(true);
            setError(null);

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance(getAddress());

                // Tell the contract about the BTC output BEFORE simulation,
                // so Blockchain.tx.outputs contains it during the simulate call.
                contract.setTransactionDetails({
                    inputs: [],
                    outputs: [
                        {
                            to: poolAddress,
                            value: btcAmount,
                            index: 1, // index 0 is reserved
                            flags: TransactionOutputFlags.hasTo,
                        },
                    ],
                });

                const simulation = await contract.buyShares(marketId, isYes);
                if (simulation.revert) {
                    throw new Error(`Simulation reverted: ${simulation.revert}`);
                }

                // Frontend: signer and mldsaSigner MUST be null — OP_WALLET signs
                const receipt = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress,
                    // cover btcAmount to pool + gas fees
                    maximumAllowedSatToSpend: btcAmount + 100_000n,
                    network,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    extraOutputs: [{ address: poolAddress, value: btcAmount } as any],
                });

                // Track cost basis for P&L display
                const costKey = `opbet_cost_${marketId.toString()}_${isYes ? 'yes' : 'no'}`;
                const prevCost = BigInt(localStorage.getItem(costKey) ?? '0');
                localStorage.setItem(costKey, (prevCost + btcAmount).toString());

                // Poll until on-chain position reflects the purchase (block needs to mine)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const readContract: any = getContractInstance(senderAddress);
                const posKey = isYes ? 'yesShares' : 'noShares';
                for (let attempt = 0; attempt < 20; attempt++) {
                    await new Promise((r) => setTimeout(r, 3000));
                    const posResult = await readContract.getUserPosition(marketId, senderAddress);
                    const shares = posResult.properties?.[posKey] as bigint | undefined;
                    if (shares !== undefined && shares > 0n) break;
                }

                return receipt.transactionId as string;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Transaction failed');
                return null;
            } finally {
                setLoading(false);
            }
        },
        [isConnected, getAddress, getContractInstance, network],
    );

    // ── Write: sellShares ───────────────────────────────────────────────────

    const sellShares = useCallback(
        async (marketId: bigint, isYes: boolean, sharesIn: bigint): Promise<string | null> => {
            if (!isConnected) {
                setError('Wallet not connected');
                return null;
            }

            const senderAddress = getAddress();
            if (!senderAddress || !walletAddress) return null;

            setLoading(true);
            setError(null);

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance(getAddress());

                const simulation = await contract.sellShares(marketId, isYes, sharesIn);

                const receipt = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress,
                    maximumAllowedSatToSpend: 100_000n,
                    network,
                });

                return receipt.transactionId as string;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Transaction failed');
                return null;
            } finally {
                setLoading(false);
            }
        },
        [isConnected, getAddress, getContractInstance, network],
    );

    // ── Write: claimWinnings ────────────────────────────────────────────────

    const claimWinnings = useCallback(
        async (marketId: bigint): Promise<string | null> => {
            if (!isConnected) {
                setError('Wallet not connected');
                return null;
            }

            const senderAddress = getAddress();
            if (!senderAddress || !walletAddress) return null;

            setLoading(true);
            setError(null);

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contract: any = getContractInstance(getAddress());

                const simulation = await contract.claimWinnings(marketId);

                const receipt = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress,
                    maximumAllowedSatToSpend: 100_000n,
                    network,
                });

                return receipt.transactionId as string;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Transaction failed');
                return null;
            } finally {
                setLoading(false);
            }
        },
        [isConnected, getAddress, getContractInstance, network],
    );

    return {
        marketCount,
        chainTime,
        loading,
        error,
        fetchMarketInfo,
        fetchUserPosition,
        quoteShares,
        createMarket,
        buyShares,
        sellShares,
        claimWinnings,
        refreshMarketCount,
    };
}
