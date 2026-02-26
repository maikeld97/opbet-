import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

export interface WalletState {
    readonly isConnected: boolean;
    readonly address: string | null;
    /** The actual Bitcoin P2TR address string (used for UTXO lookup / refundTo) */
    readonly walletAddress: string | null;
    /** 32-byte hashed ML-DSA public key (used for Address.fromString) */
    readonly hashedMLDSAKey: string | null;
    /** Raw Bitcoin public key */
    readonly publicKey: string | null;
    readonly network: typeof networks.opnetTestnet;
}

export interface WalletActions {
    readonly connect: () => Promise<void>;
    readonly disconnect: () => void;
    /** Resolved OPNet Address object (requires both keys) */
    readonly getAddress: () => Address | null;
}

export type UseWalletReturn = WalletState & WalletActions;

/**
 * OP_WALLET connection hook.
 * Uses @btc-vision/walletconnect — the only supported wallet for OPNet.
 * Frontend NEVER holds private keys; signing is handled by OP_WALLET.
 */
export function useWallet(): UseWalletReturn {
    const {
        connectToWallet,
        disconnect: disconnectWallet,
        hashedMLDSAKey,
        publicKey,
        walletAddress,
    } = useWalletConnect();

    const isConnected = hashedMLDSAKey !== null && publicKey !== null;
    const network = networks.opnetTestnet;

    const connect = async (): Promise<void> => {
        await connectToWallet(SupportedWallets.OP_WALLET);
    };

    const disconnect = (): void => {
        disconnectWallet();
    };

    const getAddress = (): Address | null => {
        if (!hashedMLDSAKey || !publicKey) return null;
        return Address.fromString(hashedMLDSAKey, publicKey);
    };

    return {
        isConnected,
        address: publicKey,
        walletAddress: walletAddress ?? null,
        hashedMLDSAKey,
        publicKey,
        network,
        connect,
        disconnect,
        getAddress,
    };
}
