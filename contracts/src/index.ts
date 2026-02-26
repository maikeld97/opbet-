import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { PredictionMarket } from './PredictionMarket';

// Factory: called on every interaction — MUST return a NEW instance
Blockchain.contract = (): PredictionMarket => {
    return new PredictionMarket();
};

// Required runtime exports
export * from '@btc-vision/btc-runtime/runtime/exports';

// Required abort handler
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
