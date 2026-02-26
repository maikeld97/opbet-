import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
    StoredMapU256,
    StoredU256,
} from '@btc-vision/btc-runtime/runtime';
import { sha256, sha256String } from '@btc-vision/btc-runtime/runtime/env/global';
import { getAmountOut, getPrice, getWinningPayout } from './math/MarketMath';

// ─── Storage pointers (module-level — OPNet pattern, same as OP20) ───────────

const marketCountPtr: u16 = Blockchain.nextPointer;

// Per-market data (keyed by marketId: u256)
const yesBtcPoolPtr: u16 = Blockchain.nextPointer;
const noBtcPoolPtr: u16 = Blockchain.nextPointer;
const yesSharesInPoolPtr: u16 = Blockchain.nextPointer;
const noSharesInPoolPtr: u16 = Blockchain.nextPointer;
const outcomePtr: u16 = Blockchain.nextPointer;
const endTimePtr: u16 = Blockchain.nextPointer;
const categoryPtr: u16 = Blockchain.nextPointer;
const poolAddrHashPtr: u16 = Blockchain.nextPointer;
const createdAtPtr: u16 = Blockchain.nextPointer;
const totalVolumePtr: u16 = Blockchain.nextPointer;
const initialSharesPtr: u16 = Blockchain.nextPointer;

// Per-(marketId, address) positions (composite-key via SHA-256)
const userYesSharesPtr: u16 = Blockchain.nextPointer;
const userNoSharesPtr: u16 = Blockchain.nextPointer;
const pendingClaimsPtr: u16 = Blockchain.nextPointer;
const claimedPtr: u16 = Blockchain.nextPointer;

// Protocol fee accumulator (global)
const protocolFeesPtr: u16 = Blockchain.nextPointer;

// ─── Constants ───────────────────────────────────────────────────────────────

const INITIAL_SHARES: u256 = u256.fromU64(100_000_000);
const INITIAL_BTC: u256 = u256.fromU64(100_000_000);

const OUTCOME_OPEN: u256 = u256.Zero;
const OUTCOME_YES: u256 = u256.fromU64(1);

const CATEGORY_OTHER: u8 = 3;

// Protocol fee: 1% (100 basis points out of 10_000)
const PROTOCOL_FEE_BPS: u256 = u256.fromU64(100);
const BPS_DENOMINATOR: u256 = u256.fromU64(10_000);

// ─── Events ──────────────────────────────────────────────────────────────────

@final
class MarketCreatedEvent extends NetEvent {
    constructor(marketId: u256, endTime: u256, category: u8, poolAddrHash: u256) {
        const w = new BytesWriter(97);
        w.writeU256(marketId);
        w.writeU256(endTime);
        w.writeU8(category);
        w.writeU256(poolAddrHash);
        super('MarketCreated', w);
    }
}

@final
class MarketDescriptionEvent extends NetEvent {
    constructor(marketId: u256, description: string) {
        const descByteLen: i32 = String.UTF8.byteLength(description);
        const w = new BytesWriter(32 + 4 + descByteLen);
        w.writeU256(marketId);
        w.writeStringWithLength(description);
        super('MarketDescription', w);
    }
}

@final
class SharesBoughtEvent extends NetEvent {
    constructor(marketId: u256, buyer: Address, isYes: bool, sharesOut: u256, btcIn: u256) {
        const w = new BytesWriter(130);
        w.writeU256(marketId);
        w.writeAddress(buyer);
        w.writeU8(isYes ? 1 : 0);
        w.writeU256(sharesOut);
        w.writeU256(btcIn);
        super('SharesBought', w);
    }
}

@final
class SharesSoldEvent extends NetEvent {
    constructor(marketId: u256, seller: Address, isYes: bool, sharesIn: u256, btcOut: u256) {
        const w = new BytesWriter(130);
        w.writeU256(marketId);
        w.writeAddress(seller);
        w.writeU8(isYes ? 1 : 0);
        w.writeU256(sharesIn);
        w.writeU256(btcOut);
        super('SharesSold', w);
    }
}

@final
class MarketResolvedEvent extends NetEvent {
    constructor(marketId: u256, outcome: u8) {
        const w = new BytesWriter(33);
        w.writeU256(marketId);
        w.writeU8(outcome);
        super('MarketResolved', w);
    }
}

@final
class WinningsClaimedEvent extends NetEvent {
    constructor(marketId: u256, claimant: Address, amount: u256) {
        const w = new BytesWriter(97);
        w.writeU256(marketId);
        w.writeAddress(claimant);
        w.writeU256(amount);
        super('WinningsClaimed', w);
    }
}

@final
class ProtocolFeeCollectedEvent extends NetEvent {
    constructor(marketId: u256, fee: u256) {
        const w = new BytesWriter(64);
        w.writeU256(marketId);
        w.writeU256(fee);
        super('ProtocolFeeCollected', w);
    }
}

// ─── Contract ────────────────────────────────────────────────────────────────

@final
export class PredictionMarket extends OP_NET {
    private _marketCount: StoredU256 = new StoredU256(marketCountPtr, EMPTY_POINTER);

    private _yesBtcPool: StoredMapU256 = new StoredMapU256(yesBtcPoolPtr);
    private _noBtcPool: StoredMapU256 = new StoredMapU256(noBtcPoolPtr);
    private _yesSharesInPool: StoredMapU256 = new StoredMapU256(yesSharesInPoolPtr);
    private _noSharesInPool: StoredMapU256 = new StoredMapU256(noSharesInPoolPtr);
    private _outcomes: StoredMapU256 = new StoredMapU256(outcomePtr);
    private _endTimes: StoredMapU256 = new StoredMapU256(endTimePtr);
    private _categories: StoredMapU256 = new StoredMapU256(categoryPtr);
    private _poolAddrHashes: StoredMapU256 = new StoredMapU256(poolAddrHashPtr);
    private _createdAts: StoredMapU256 = new StoredMapU256(createdAtPtr);
    private _totalVolumes: StoredMapU256 = new StoredMapU256(totalVolumePtr);
    private _initialShares: StoredMapU256 = new StoredMapU256(initialSharesPtr);

    private _userYesShares: StoredMapU256 = new StoredMapU256(userYesSharesPtr);
    private _userNoShares: StoredMapU256 = new StoredMapU256(userNoSharesPtr);
    private _pendingClaims: StoredMapU256 = new StoredMapU256(pendingClaimsPtr);
    private _claimed: StoredMapU256 = new StoredMapU256(claimedPtr);
    private _protocolFees: StoredU256 = new StoredU256(protocolFeesPtr, EMPTY_POINTER);

    public constructor() {
        super();
    }

    // ── Admin: createMarket ─────────────────────────────────────────────────

    @method(
        { name: 'description', type: ABIDataTypes.STRING },
        { name: 'category', type: ABIDataTypes.UINT8 },
        { name: 'endTime', type: ABIDataTypes.UINT256 },
        { name: 'poolAddrHash', type: ABIDataTypes.UINT256 },
        { name: 'initialYesBps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @emit('MarketCreated', 'MarketDescription')
    public createMarket(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const description: string = calldata.readStringWithLength();
        const category: u8 = calldata.readU8();
        const endTime: u256 = calldata.readU256();
        const poolAddrHash: u256 = calldata.readU256();
        const initialYesBpsRaw: u256 = calldata.readU256();

        if (String.UTF8.byteLength(description) > 280) {
            throw new Revert('Description too long (max 280 bytes)');
        }
        if (category > CATEGORY_OTHER) {
            throw new Revert('Invalid category');
        }
        if (endTime.isZero()) {
            throw new Revert('endTime must be non-zero');
        }

        // initialYesBps: 0-10000 (basis points for YES probability).
        // 0 or out-of-range defaults to 5000 (50/50).
        // price_yes = noBtcPool / (yesBtcPool + noBtcPool), so:
        //   noBtcPool = initialYesBps * totalBtc / 10000
        //   yesBtcPool = totalBtc - noBtcPool
        const BPS_MAX: u256 = u256.fromU64(10_000);
        const TOTAL_BTC: u256 = SafeMath.mul(INITIAL_BTC, u256.fromU64(2));
        let initialYesBps: u256 = initialYesBpsRaw;
        if (initialYesBps.isZero() || u256.gt(initialYesBps, u256.fromU64(9900)) || u256.lt(initialYesBps, u256.fromU64(100))) {
            initialYesBps = u256.fromU64(5_000);
        }
        const initialNoBtcPool: u256 = SafeMath.div(SafeMath.mul(TOTAL_BTC, initialYesBps), BPS_MAX);
        const initialYesBtcPool: u256 = SafeMath.sub(TOTAL_BTC, initialNoBtcPool);

        const marketId: u256 = this._marketCount.value;
        this._marketCount.value = SafeMath.add(marketId, u256.fromU64(1));

        this._yesBtcPool.set(marketId, initialYesBtcPool);
        this._noBtcPool.set(marketId, initialNoBtcPool);
        this._yesSharesInPool.set(marketId, INITIAL_SHARES);
        this._noSharesInPool.set(marketId, INITIAL_SHARES);
        this._initialShares.set(marketId, INITIAL_SHARES);

        this._outcomes.set(marketId, OUTCOME_OPEN);
        this._endTimes.set(marketId, endTime);
        this._categories.set(marketId, u256.fromU64(category));
        this._poolAddrHashes.set(marketId, poolAddrHash);
        this._createdAts.set(marketId, u256.fromU64(Blockchain.block.number));

        this.emitEvent(new MarketCreatedEvent(marketId, endTime, category, poolAddrHash));
        this.emitEvent(new MarketDescriptionEvent(marketId, description));

        const w = new BytesWriter(32);
        w.writeU256(marketId);
        return w;
    }

    // ── Trading: buyShares ──────────────────────────────────────────────────

    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'isYes', type: ABIDataTypes.BOOL },
    )
    @returns({ name: 'sharesReceived', type: ABIDataTypes.UINT256 })
    @emit('SharesBought', 'ProtocolFeeCollected')
    public buyShares(calldata: Calldata): BytesWriter {
        const marketId: u256 = calldata.readU256();
        const isYes: bool = calldata.readBoolean();

        this.assertMarketOpen(marketId);

        const poolAddrHash: u256 = this._poolAddrHashes.get(marketId);
        const btcPaid: u256 = this.getBtcPaidToPool(poolAddrHash);

        if (btcPaid.isZero()) {
            throw new Revert('No BTC sent to pool address');
        }

        // ── Protocol fee (1%) deducted before AMM ──────────────────────────
        const protocolFee: u256 = SafeMath.div(
            SafeMath.mul(btcPaid, PROTOCOL_FEE_BPS),
            BPS_DENOMINATOR,
        );
        const btcForAMM: u256 = SafeMath.sub(btcPaid, protocolFee);
        this._protocolFees.value = SafeMath.add(this._protocolFees.value, protocolFee);

        let sharesOut: u256;

        if (isYes) {
            const yesBtcPool: u256 = this._yesBtcPool.get(marketId);
            const yesSharesInPool: u256 = this._yesSharesInPool.get(marketId);

            sharesOut = getAmountOut(btcForAMM, yesBtcPool, yesSharesInPool);
            if (sharesOut.isZero()) throw new Revert('Insufficient output');

            this._yesBtcPool.set(marketId, SafeMath.add(yesBtcPool, btcForAMM));
            this._yesSharesInPool.set(marketId, SafeMath.sub(yesSharesInPool, sharesOut));

            const posKey: u256 = this.positionKey(marketId, Blockchain.tx.sender);
            this._userYesShares.set(
                posKey,
                SafeMath.add(this._userYesShares.get(posKey), sharesOut),
            );
        } else {
            const noBtcPool: u256 = this._noBtcPool.get(marketId);
            const noSharesInPool: u256 = this._noSharesInPool.get(marketId);

            sharesOut = getAmountOut(btcForAMM, noBtcPool, noSharesInPool);
            if (sharesOut.isZero()) throw new Revert('Insufficient output');

            this._noBtcPool.set(marketId, SafeMath.add(noBtcPool, btcForAMM));
            this._noSharesInPool.set(marketId, SafeMath.sub(noSharesInPool, sharesOut));

            const posKey: u256 = this.positionKey(marketId, Blockchain.tx.sender);
            this._userNoShares.set(
                posKey,
                SafeMath.add(this._userNoShares.get(posKey), sharesOut),
            );
        }

        // Volume tracks total BTC paid (including fee) for display purposes
        this._totalVolumes.set(
            marketId,
            SafeMath.add(this._totalVolumes.get(marketId), btcPaid),
        );

        this.emitEvent(
            new SharesBoughtEvent(marketId, Blockchain.tx.sender, isYes, sharesOut, btcPaid),
        );
        this.emitEvent(new ProtocolFeeCollectedEvent(marketId, protocolFee));

        const w = new BytesWriter(32);
        w.writeU256(sharesOut);
        return w;
    }

    // ── Trading: sellShares ─────────────────────────────────────────────────

    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'isYes', type: ABIDataTypes.BOOL },
        { name: 'sharesIn', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    @emit('SharesSold')
    public sellShares(calldata: Calldata): BytesWriter {
        const marketId: u256 = calldata.readU256();
        const isYes: bool = calldata.readBoolean();
        const sharesIn: u256 = calldata.readU256();

        this.assertMarketOpen(marketId);

        if (sharesIn.isZero()) throw new Revert('Shares amount must be > 0');

        const posKey: u256 = this.positionKey(marketId, Blockchain.tx.sender);
        let btcOut: u256;

        if (isYes) {
            const userShares: u256 = this._userYesShares.get(posKey);
            if (u256.lt(userShares, sharesIn)) throw new Revert('Insufficient YES shares');

            const yesBtcPool: u256 = this._yesBtcPool.get(marketId);
            const yesSharesInPool: u256 = this._yesSharesInPool.get(marketId);

            btcOut = getAmountOut(sharesIn, yesSharesInPool, yesBtcPool);
            if (btcOut.isZero()) throw new Revert('Insufficient output');

            this._yesSharesInPool.set(marketId, SafeMath.add(yesSharesInPool, sharesIn));
            this._yesBtcPool.set(marketId, SafeMath.sub(yesBtcPool, btcOut));
            this._userYesShares.set(posKey, SafeMath.sub(userShares, sharesIn));
        } else {
            const userShares: u256 = this._userNoShares.get(posKey);
            if (u256.lt(userShares, sharesIn)) throw new Revert('Insufficient NO shares');

            const noBtcPool: u256 = this._noBtcPool.get(marketId);
            const noSharesInPool: u256 = this._noSharesInPool.get(marketId);

            btcOut = getAmountOut(sharesIn, noSharesInPool, noBtcPool);
            if (btcOut.isZero()) throw new Revert('Insufficient output');

            this._noSharesInPool.set(marketId, SafeMath.add(noSharesInPool, sharesIn));
            this._noBtcPool.set(marketId, SafeMath.sub(noBtcPool, btcOut));
            this._userNoShares.set(posKey, SafeMath.sub(userShares, sharesIn));
        }

        const claimKey: u256 = this.claimKey(Blockchain.tx.sender);
        this._pendingClaims.set(claimKey, SafeMath.add(this._pendingClaims.get(claimKey), btcOut));

        this.emitEvent(
            new SharesSoldEvent(marketId, Blockchain.tx.sender, isYes, sharesIn, btcOut),
        );

        const w = new BytesWriter(32);
        w.writeU256(btcOut);
        return w;
    }

    // ── Admin: resolveMarket ────────────────────────────────────────────────

    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'outcome', type: ABIDataTypes.UINT8 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('MarketResolved')
    public resolveMarket(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const marketId: u256 = calldata.readU256();
        const outcome: u8 = calldata.readU8();

        if (!u256.eq(this._outcomes.get(marketId), OUTCOME_OPEN)) {
            throw new Revert('Market already resolved');
        }
        if (outcome !== 1 && outcome !== 2) {
            throw new Revert('Invalid outcome: must be 1 (YES) or 2 (NO)');
        }

        this._outcomes.set(marketId, u256.fromU64(outcome));
        this.emitEvent(new MarketResolvedEvent(marketId, outcome));

        const w = new BytesWriter(1);
        w.writeBoolean(true);
        return w;
    }

    // ── User: claimWinnings ─────────────────────────────────────────────────

    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'btcOwed', type: ABIDataTypes.UINT256 })
    @emit('WinningsClaimed')
    public claimWinnings(calldata: Calldata): BytesWriter {
        const marketId: u256 = calldata.readU256();
        const outcome: u256 = this._outcomes.get(marketId);

        if (u256.eq(outcome, OUTCOME_OPEN)) throw new Revert('Market not yet resolved');

        const posKey: u256 = this.positionKey(marketId, Blockchain.tx.sender);

        if (!this._claimed.get(posKey).isZero()) {
            throw new Revert('Already claimed');
        }

        const winnerIsYes: bool = u256.eq(outcome, OUTCOME_YES);
        let winnerShares: u256;

        if (winnerIsYes) {
            winnerShares = this._userYesShares.get(posKey);
        } else {
            winnerShares = this._userNoShares.get(posKey);
        }

        if (winnerShares.isZero()) throw new Revert('No winning shares');

        const totalPot: u256 = SafeMath.add(
            this._yesBtcPool.get(marketId),
            this._noBtcPool.get(marketId),
        );

        const initialSh: u256 = this._initialShares.get(marketId);
        let totalOutstanding: u256;

        if (winnerIsYes) {
            totalOutstanding = SafeMath.sub(initialSh, this._yesSharesInPool.get(marketId));
        } else {
            totalOutstanding = SafeMath.sub(initialSh, this._noSharesInPool.get(marketId));
        }

        const btcOwed: u256 = getWinningPayout(winnerShares, totalPot, totalOutstanding);
        if (btcOwed.isZero()) throw new Revert('Zero payout');

        if (winnerIsYes) {
            this._userYesShares.set(posKey, u256.Zero);
        } else {
            this._userNoShares.set(posKey, u256.Zero);
        }

        this._claimed.set(posKey, u256.fromU64(1));

        const claimKey: u256 = this.claimKey(Blockchain.tx.sender);
        this._pendingClaims.set(claimKey, SafeMath.add(this._pendingClaims.get(claimKey), btcOwed));

        this.emitEvent(new WinningsClaimedEvent(marketId, Blockchain.tx.sender, btcOwed));

        const w = new BytesWriter(32);
        w.writeU256(btcOwed);
        return w;
    }

    // ── Views ───────────────────────────────────────────────────────────────

    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'yesBtcPool', type: ABIDataTypes.UINT256 },
        { name: 'noBtcPool', type: ABIDataTypes.UINT256 },
        { name: 'yesSharesInPool', type: ABIDataTypes.UINT256 },
        { name: 'noSharesInPool', type: ABIDataTypes.UINT256 },
        { name: 'outcome', type: ABIDataTypes.UINT256 },
        { name: 'endTime', type: ABIDataTypes.UINT256 },
        { name: 'category', type: ABIDataTypes.UINT256 },
        { name: 'totalVolume', type: ABIDataTypes.UINT256 },
        { name: 'yesPrice', type: ABIDataTypes.UINT256 },
        { name: 'noPrice', type: ABIDataTypes.UINT256 },
    )
    public getMarketInfo(calldata: Calldata): BytesWriter {
        const marketId: u256 = calldata.readU256();

        const yesBtcPool: u256 = this._yesBtcPool.get(marketId);
        const noBtcPool: u256 = this._noBtcPool.get(marketId);
        const yesSharesInPool: u256 = this._yesSharesInPool.get(marketId);
        const noSharesInPool: u256 = this._noSharesInPool.get(marketId);
        const outcome: u256 = this._outcomes.get(marketId);
        const endTime: u256 = this._endTimes.get(marketId);
        const category: u256 = this._categories.get(marketId);
        const totalVolume: u256 = this._totalVolumes.get(marketId);

        const yesPrice: u256 = getPrice(yesBtcPool, noBtcPool);
        const noPrice: u256 = getPrice(noBtcPool, yesBtcPool);

        const w = new BytesWriter(320);
        w.writeU256(yesBtcPool);
        w.writeU256(noBtcPool);
        w.writeU256(yesSharesInPool);
        w.writeU256(noSharesInPool);
        w.writeU256(outcome);
        w.writeU256(endTime);
        w.writeU256(category);
        w.writeU256(totalVolume);
        w.writeU256(yesPrice);
        w.writeU256(noPrice);
        return w;
    }

    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'user', type: ABIDataTypes.ADDRESS },
    )
    @returns(
        { name: 'yesShares', type: ABIDataTypes.UINT256 },
        { name: 'noShares', type: ABIDataTypes.UINT256 },
        { name: 'pendingClaim', type: ABIDataTypes.UINT256 },
        { name: 'hasClaimed', type: ABIDataTypes.BOOL },
    )
    public getUserPosition(calldata: Calldata): BytesWriter {
        const marketId: u256 = calldata.readU256();
        const user: Address = calldata.readAddress();

        const posKey: u256 = this.positionKey(marketId, user);
        const clKey: u256 = this.claimKey(user);

        const yesShares: u256 = this._userYesShares.get(posKey);
        const noShares: u256 = this._userNoShares.get(posKey);
        const pendingClaim: u256 = this._pendingClaims.get(clKey);
        const hasClaimed: bool = !this._claimed.get(posKey).isZero();

        const w = new BytesWriter(97);
        w.writeU256(yesShares);
        w.writeU256(noShares);
        w.writeU256(pendingClaim);
        w.writeBoolean(hasClaimed);
        return w;
    }

    @method()
    @returns({ name: 'marketCount', type: ABIDataTypes.UINT256 })
    public getMarketCount(_calldata: Calldata): BytesWriter {
        const w = new BytesWriter(32);
        w.writeU256(this._marketCount.value);
        return w;
    }

    @method()
    @returns({ name: 'totalFees', type: ABIDataTypes.UINT256 })
    public getProtocolFees(_calldata: Calldata): BytesWriter {
        const w = new BytesWriter(32);
        w.writeU256(this._protocolFees.value);
        return w;
    }

    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'isYes', type: ABIDataTypes.BOOL },
        { name: 'btcIn', type: ABIDataTypes.UINT256 },
    )
    @returns(
        { name: 'sharesOut', type: ABIDataTypes.UINT256 },
        { name: 'newPrice', type: ABIDataTypes.UINT256 },
    )
    public quoteShares(calldata: Calldata): BytesWriter {
        const marketId: u256 = calldata.readU256();
        const isYes: bool = calldata.readBoolean();
        const btcIn: u256 = calldata.readU256();

        let sharesOut: u256;
        let newPrice: u256;

        if (isYes) {
            const yesBtcPool: u256 = this._yesBtcPool.get(marketId);
            const yesSharesInPool: u256 = this._yesSharesInPool.get(marketId);
            sharesOut = getAmountOut(btcIn, yesBtcPool, yesSharesInPool);
            newPrice = getPrice(SafeMath.add(yesBtcPool, btcIn), this._noBtcPool.get(marketId));
        } else {
            const noBtcPool: u256 = this._noBtcPool.get(marketId);
            const noSharesInPool: u256 = this._noSharesInPool.get(marketId);
            sharesOut = getAmountOut(btcIn, noBtcPool, noSharesInPool);
            newPrice = getPrice(this._yesBtcPool.get(marketId), SafeMath.add(noBtcPool, btcIn));
        }

        const w = new BytesWriter(64);
        w.writeU256(sharesOut);
        w.writeU256(newPrice);
        return w;
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    private assertMarketOpen(marketId: u256): void {
        if (this._createdAts.get(marketId).isZero()) {
            throw new Revert('Market does not exist');
        }
        if (!u256.eq(this._outcomes.get(marketId), OUTCOME_OPEN)) {
            throw new Revert('Market already resolved');
        }
        // Note: time-based expiry disabled for regtest (chain medianTimestamp is unreliable).
        // On mainnet/testnet, re-enable by comparing against Blockchain.block.medianTimestamp.
    }

    private getBtcPaidToPool(poolAddrHash: u256): u256 {
        let total: u256 = u256.Zero;
        const txOutputs = Blockchain.tx.outputs;

        for (let i: i32 = 0; i < txOutputs.length; i++) {
            const output = txOutputs[i];
            if (!output.hasTo) continue;

            const outHash: u256 = u256.fromUint8ArrayBE(sha256String(output.to as string));
            if (u256.eq(outHash, poolAddrHash)) {
                total = SafeMath.add(total, u256.fromU64(output.value));
            }
        }

        return total;
    }

    private positionKey(marketId: u256, user: Address): u256 {
        const combined = new Uint8Array(64);
        const marketIdBytes: Uint8Array = marketId.toUint8Array(true);

        for (let i: i32 = 0; i < 32; i++) {
            combined[i] = marketIdBytes[i];
        }

        const userLen: i32 = user.length < 32 ? user.length : 32;
        for (let i: i32 = 0; i < userLen; i++) {
            combined[32 + i] = user[i];
        }

        return u256.fromUint8ArrayBE(sha256(combined));
    }

    private claimKey(user: Address): u256 {
        const padded = new Uint8Array(32);
        const copyLen: i32 = user.length < 32 ? user.length : 32;
        for (let i: i32 = 0; i < copyLen; i++) {
            padded[i] = user[i];
        }
        return u256.fromUint8ArrayBE(sha256(padded));
    }
}
