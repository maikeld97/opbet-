import { useState } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import { truncateAddress } from '../utils/format.js';

export function WalletButton(): React.ReactElement {
    const { isConnected, address, connect, disconnect } = useWallet();
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleConnect = async (): Promise<void> => {
        setIsLoading(true);
        try {
            await connect();
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = (): void => {
        if (!address) return;
        void navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => {
            setCopied(false);
        }, 2000);
    };

    if (isConnected && address) {
        return (
            <div className="wallet-connected">
                <span className="wallet-address" onClick={handleCopy} title="Click to copy">
                    {copied ? 'Copied!' : truncateAddress(address)}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={disconnect}>
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={isLoading}
        >
            {isLoading ? 'Connecting...' : 'Connect OP_WALLET'}
        </button>
    );
}
