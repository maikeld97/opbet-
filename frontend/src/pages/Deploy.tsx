import { useState } from 'react';
import { TransactionFactory } from '@btc-vision/transaction';
import type { UTXO } from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { useWallet } from '../hooks/useWallet.js';

const RPC_URL = 'https://testnet.opnet.org';
const NETWORK = networks.opnetTestnet;

export function Deploy(): React.ReactElement {
    const { isConnected, walletAddress } = useWallet();
    const [status, setStatus] = useState<string>('');
    const [contractAddress, setContractAddress] = useState<string>('');
    const [deploying, setDeploying] = useState(false);

    const handleDeploy = async (): Promise<void> => {
        if (!walletAddress) {
            setStatus('Connect OP_WALLET first.');
            return;
        }

        setDeploying(true);
        setContractAddress('');
        setStatus('Loading WASM bytecode...');

        try {
            const res = await fetch('/PredictionMarket.wasm');
            if (!res.ok) throw new Error(`Failed to load WASM: ${res.status}`);
            const buffer = await res.arrayBuffer();
            const bytecode = new Uint8Array(buffer);

            setStatus('Fetching UTXOs...');
            const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
            const utxos = await provider.utxoManager.getUTXOs({ address: walletAddress });

            setStatus('Fetching gas parameters...');
            const gasParams = await provider.gasParameters();
            const feeRate = gasParams.bitcoin.recommended.medium;
            const gasSatFee = gasParams.baseGas / gasParams.gasPerSat;

            setStatus('Waiting for OP_WALLET to sign the deployment...');
            const factory = new TransactionFactory();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (factory as any).signDeployment({
                bytecode,
                utxos: utxos as unknown as UTXO[],
                feeRate,
                priorityFee: 0n,
                gasSatFee,
                challenge: {}, // OP_WALLET handles challenge internally
                signer: null,
                mldsaSigner: null,
                network: NETWORK,
            });

            const addr = result.contractAddress;
            setContractAddress(addr);
            setStatus(`Deployed! Update your .env: VITE_CONTRACT_ADDRESS=${addr}`);
        } catch (err) {
            setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setDeploying(false);
        }
    };

    return (
        <div className="page-container">
            <div className="deploy-panel">
                <h2 className="deploy-title">Deploy PredictionMarket Contract</h2>
                <p className="deploy-desc">
                    Deploys the compiled contract to OPNet Testnet via OP_WALLET. Make sure you are
                    connected and have Signet BTC.
                </p>

                {!isConnected && <p className="trade-error">Connect OP_WALLET to deploy.</p>}

                {status && (
                    <p className={contractAddress ? 'trade-success' : 'deploy-status'}>{status}</p>
                )}

                {contractAddress && (
                    <div className="deploy-result">
                        <p className="form-label">Contract Address:</p>
                        <code className="deploy-address">{contractAddress}</code>
                        <p className="form-hint">
                            Copy this address into{' '}
                            <strong>frontend/.env</strong> as{' '}
                            <code>VITE_CONTRACT_ADDRESS={contractAddress}</code>, then restart the
                            dev server.
                        </p>
                    </div>
                )}

                <button
                    className="btn btn-primary"
                    onClick={handleDeploy}
                    disabled={deploying || !isConnected}
                >
                    {deploying ? 'Deploying...' : 'Deploy Contract'}
                </button>
            </div>
        </div>
    );
}
