import { useState } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { PREDICTION_MARKET_ABI } from '../abi/PredictionMarket.js';
import { useWallet } from '../hooks/useWallet.js';

interface ResolvePanelProps {
    readonly marketId: bigint;
    readonly onResolved: () => void;
}

const CONTRACT_ADDRESS = import.meta.env['VITE_CONTRACT_ADDRESS'] as string;
const RPC_URL = 'https://testnet.opnet.org';
const NETWORK = networks.opnetTestnet;

export function ResolvePanel({ marketId, onResolved }: ResolvePanelProps): React.ReactElement {
    const { isConnected, getAddress, walletAddress, network } = useWallet();
    const [outcome, setOutcome] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const handleResolve = async (): Promise<void> => {
        if (!isConnected) return;
        const senderAddress = getAddress();
        if (!senderAddress || !walletAddress) return;

        setLoading(true);
        setError(null);

        try {
            const provider = new JSONRpcProvider({
                url: RPC_URL,
                network: NETWORK,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contract: any = getContract(
                CONTRACT_ADDRESS,
                PREDICTION_MARKET_ABI as unknown as [],
                provider,
                NETWORK,
                senderAddress,
            );

            const simulation = await contract.resolveMarket(marketId, outcome);
            if (simulation.revert) {
                throw new Error(`Simulation reverted: ${simulation.revert}`);
            }

            const receipt = await simulation.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n,
                network,
            });

            setTxId(receipt.transactionId as string);
            onResolved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Resolve failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="resolve-panel">
            <h3 className="resolve-panel__title">Admin: Resolve Market</h3>

            <div className="outcome-selector">
                <button
                    className={`outcome-btn outcome-btn--yes ${outcome === 1 ? 'active' : ''}`}
                    onClick={() => {
                        setOutcome(1);
                    }}
                >
                    YES wins
                </button>
                <button
                    className={`outcome-btn outcome-btn--no ${outcome === 2 ? 'active' : ''}`}
                    onClick={() => {
                        setOutcome(2);
                    }}
                >
                    NO wins
                </button>
            </div>

            {error && <p className="trade-error">{error}</p>}
            {txId && <p className="trade-success">Resolved! TX: {txId.slice(0, 16)}...</p>}

            <button
                className="btn btn-primary"
                onClick={handleResolve}
                disabled={loading || !isConnected}
            >
                {loading ? 'Resolving...' : 'Resolve Market'}
            </button>
        </div>
    );
}
