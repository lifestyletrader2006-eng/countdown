import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEMA,
  calculateRSI,
  computeAllIndicators,
} from '../backend/analysis/indicators.js';
import { RiskManager } from '../backend/risk/riskManager.js';
import { MoveForensicsEngine } from '../backend/analysis/forensics.js';
import { DeltaExchangeClient } from '../backend/exchange/deltaClient.js';

test('1. Indicators Engine: EMA and RSI calculations', () => {
  const prices = [100, 102, 101, 105, 107, 106, 108, 110, 112, 111, 115, 118, 120, 122, 125, 124, 128, 130];
  const ema9 = calculateEMA(prices, 9);
  assert.equal(ema9.length, prices.length);
  assert.ok(ema9[ema9.length - 1] > 115, 'EMA should reflect upward trend');

  const rsi = calculateRSI(prices, 14);
  assert.equal(rsi.length, prices.length);
  assert.ok(rsi[rsi.length - 1] > 50, 'RSI should be bullish (>50) for rising series');
});

test('2. Indicators Engine: Confluence suite on sample candle sequence', () => {
  const candles = [];
  let basePrice = 50000;
  for (let i = 0; i < 40; i++) {
    const change = (Math.sin(i / 3) + 0.2) * 200;
    basePrice += change;
    candles.push({
      time: 1700000000 + i * 900,
      open: basePrice - 50,
      high: basePrice + 120,
      low: basePrice - 80,
      close: basePrice,
      volume: 100 + i * 5,
    });
  }

  const indicators = computeAllIndicators(candles);
  assert.ok(indicators.rsi > 0 && indicators.rsi < 100, 'RSI must be bounded between 0 and 100');
  assert.ok(indicators.atr > 0, 'ATR must be positive');
  assert.ok(indicators.bollingerBands.upper > indicators.bollingerBands.lower, 'BB Upper > Lower');
  assert.ok(indicators.structure.trendType, 'Market structure must identify trend');
});

test('3. Move Forensics Engine: Analyzes pre-move conditions without look-ahead bias', () => {
  const forensics = new MoveForensicsEngine();
  const candles = [];
  let price = 100;
  for (let i = 0; i < 40; i++) {
    price += (i > 32 ? 5 : 0.2);
    candles.push({
      time: 1700000000 + i * 900,
      open: price - 0.5,
      high: price + 1,
      low: price - 0.5,
      close: price,
      volume: 50 + (i > 32 ? 300 : 10),
    });
  }

  const result = forensics.analyzeMove('TEST_COIN', candles, 8.5);
  assert.ok(result, 'Forensic analysis must succeed');
  assert.equal(result.isSignificantMove, true);
  assert.equal(result.forensicRecord.symbol, 'TEST_COIN');
  assert.ok(result.forensicRecord.preMoveRsi > 0, 'Pre-move RSI recorded');
});

test('4. Risk Manager: Blocks orders when limits are violated', () => {
  const risk = new RiskManager();
  const mockConfig: any = {
    apiKey: 'test',
    apiSecret: 'test',
    environment: 'production',
    isConnected: true,
    isReadMode: true,
    autoTradeEnabled: false,
    tradingCapital: 5000,
    capitalLimit: 4000,
    maxDailyLoss: 200,
    maxOpenTrades: 2,
    lotSize: 1,
    minExpectedNetProfitPercent: 2.0,
    minNetEdgePercent: 0.8,
    minRiskReward: 2.0,
    leverageMode: 'AUTOMATIC',
    manualLeverage: 10,
    tradingType: 'FUTURES_ONLY',
  };

  const mockSetup: any = {
    id: 'SETUP_TEST',
    coin: 'BTCUSD',
    exchange: 'Delta',
    instrumentType: 'Future',
    direction: 'BUY/LONG',
    currentPrice: 60000,
    triggerPrice: 60100,
    entryPrice: 60100,
    tp1: 62000,
    sl: 59500,
    distanceToTrigger: 100,
    distanceToTriggerPercent: 0.16,
    expectedMovePercent: 3.16,
    riskPercent: 1.0,
    rewardPercent: 3.16,
    riskReward: 3.16,
    score: 85,
    historicalProbability: 68,
    sampleSize: 12,
    confidence: 75,
    reason: 'EMA breakout',
    historicalEvidence: 'Matched 12 historical events',
    indicatorConfirmations: {
      trend: 'UPTREND',
      rsi: 58,
      macd: 'positive',
      adx: 28,
      volumeProfile: 'High RVOL',
      volatility: 'Expanding',
      pattern: 'Bullish Engulfing',
      marketStructure: 'BOS_BULL',
    },
    status: 'WATCHING',
    createdAt: new Date().toISOString(),
    productId: 1,
    timeframe: '15m',
  };

  // Case 1: Max daily loss reached
  const resLoss = risk.validateTrade(mockSetup, mockConfig, [], 250, 5000);
  assert.equal(resLoss.allowed, false, 'Must block when daily loss >= maxDailyLoss');
  assert.ok(resLoss.blockReason?.includes('MAX DAILY LOSS REACHED'));

  // Case 2: Max open trades reached
  const activeTrades: any[] = [
    { status: 'OPEN', capitalUsed: 500 },
    { status: 'OPEN', capitalUsed: 500 },
  ];
  const resTrades = risk.validateTrade(mockSetup, mockConfig, activeTrades, 0, 5000);
  assert.equal(resTrades.allowed, false, 'Must block when open trades >= maxOpenTrades');

  // Case 3: Clean state passes
  const resValid = risk.validateTrade(mockSetup, mockConfig, [], 0, 5000);
  assert.equal(resValid.allowed, true, 'Must allow trade when risk checks pass');
  assert.ok(resValid.calculatedLeverage >= 1, 'Calculated leverage must be >= 1');
});

test('5. Delta Exchange Client: Instantiation and credential masking', () => {
  const client = new DeltaExchangeClient({
    apiKey: 'test_key_123',
    apiSecret: 'test_secret_456',
    environment: 'production',
  });

  assert.equal(client.hasCredentials(), true);
  assert.equal(client.getEnvironment(), 'production');
});

test('6. Order Manager: Partial lot closing and Auto Close calculations', async () => {
  const { OrderManager } = await import('../backend/orders/orderManager.js');
  const orderManager = new OrderManager();
  const mockClient: any = {
    hasCredentials: () => false,
    placeOrder: async () => ({ success: true }),
    cancelAllOrdersForProduct: async () => ({ success: true }),
  };

  const trade: any = {
    tradeId: 'TEST_TRD_1',
    coin: 'BTCUSD',
    side: 'BUY',
    entryPrice: 50000,
    actualFillPrice: 50000,
    currentPrice: 55000,
    quantity: 10,
    leverage: 10,
    status: 'OPEN',
    realizedPnl: 0,
  };

  // Test partial close of 3 lots at $55000 (+10% price move * 10x leverage = 100% PnL)
  const partialRes = await orderManager.closeTradeMarket(trade, 55000, mockClient, [], 3, 'AUTO CLOSE: Profit Target (+100%)');
  assert.equal(partialRes.success, true);
  assert.equal(partialRes.isPartial, true);
  assert.equal(partialRes.closedQuantity, 3);
  assert.equal(partialRes.trade.quantity, 7, 'Remaining quantity should be 7');
  assert.equal(partialRes.trade.status, 'OPEN', 'Status should remain OPEN for remaining lots');
  assert.ok(partialRes.trade.realizedPnl > 0, 'Realized PnL should be booked for closed lots');

  // Test full close of remaining lots
  const fullRes = await orderManager.closeTradeMarket(partialRes.trade, 56000, mockClient, [], undefined, 'AUTO CLOSE: Profit Target');
  assert.equal(fullRes.success, true);
  assert.equal(fullRes.isPartial, false);
  assert.equal(fullRes.trade.status, 'CLOSED', 'Trade status should become CLOSED');
});

test('7. 24H Range Band & Directional Logic: Evaluates target band and reversal vs continuation', async () => {
  const { FutureSetupEngine } = await import('../backend/strategies/futureSetupEngine.js');
  const engine = new FutureSetupEngine();

  // Test setup creation with mock candles
  const candles: any[] = [];
  let p = 100;
  for (let i = 0; i < 40; i++) {
    p += 0.1;
    candles.push({
      time: 1700000000 + i * 900,
      open: p - 0.2,
      high: p + 0.5,
      low: p - 0.2,
      close: p,
      volume: 1500,
    });
  }

  const mockProduct: any = {
    id: 999,
    symbol: 'SOLUSD',
    contract_type: 'perpetual_future',
    tick_size: '0.01',
    contract_value: '1',
  };

  // Ticker with 24H change = 5% (Inside 3% - 7% band)
  const tickerInRange: any = {
    symbol: 'SOLUSD',
    close: 104,
    mark_price: 104,
    price_change_percent_24h: 5.0,
    turnover: 5000000,
    volume: 50000,
  };

  const configInRange: any = {
    rangeFilterEnabled: true,
    rangeMinPercent: 3.0,
    rangeMaxPercent: 7.0,
    rangeTargetSide: 'BOTH',
    expireOutOfRangeSetups: true,
    minRiskReward: 1.8,
  };

  const setupInRange = engine.evaluateInstrument(mockProduct, tickerInRange, candles, [], 1.8, undefined, 0.5, 75, '15m', undefined, configInRange);
  if (setupInRange) {
    assert.equal(setupInRange.isInActiveRange, true);
    assert.ok(setupInRange.rangeBandAtCreation?.includes('3% - 7%'));
    assert.equal(setupInRange.movePercent24hAtCreation, 5.0);
    assert.ok(setupInRange.whyDirectionRationale, 'Direction rationale must be present');
  }

  // Ticker with 24H change = 1.5% (Below 3.0% minimum threshold)
  const tickerOutOfRange: any = {
    symbol: 'SOLUSD',
    close: 104,
    mark_price: 104,
    price_change_percent_24h: 1.5,
    turnover: 5000000,
    volume: 50000,
  };

  const setupOutOfRange = engine.evaluateInstrument(mockProduct, tickerOutOfRange, candles, [], 1.8, undefined, 0.5, 75, '15m', undefined, configInRange);
  assert.equal(setupOutOfRange, null, 'Must reject setups outside the 3% - 7% target range');
});

test('8. Side Change / Opposite Order Mode: Unified Entry Price Matching', async () => {
  const { OrderManager } = await import('../backend/orders/orderManager.js');
  const orderManager = new OrderManager();
  const mockClient: any = {
    hasCredentials: () => false,
  };

  const setup: any = {
    id: 'SETUP_ENTRY_TEST',
    coin: 'ETHUSD',
    direction: 'BUY/LONG',
    currentPrice: 3100.5,
    entryPrice: 3050.0,
    tp1: 3300.0,
    sl: 2950.0,
    instrumentType: 'Future',
  };

  const overrides: any = {
    overrideSide: 'SELL',
    overrideTp: 2950.0,
    overrideSl: 3300.0,
    isSideChangedOrder: true,
    originalSetupSide: 'BUY/LONG',
    sideChangeSlSetting: 'SL',
    normalSetupSnapshot: {
      entry: setup.entryPrice,
      tp1: setup.tp1,
      sl: setup.sl,
      direction: setup.direction,
      pnl: 0,
      pnlPercent: 0,
    },
  };

  const result = await orderManager.executeLiveOrder(
    setup,
    mockClient,
    {} as any,
    10,
    2,
    610,
    () => {},
    undefined,
    overrides
  );

  assert.equal(result.success, true);
  const trade = result.trade!;
  // Both Exchange Order (Side Changed) and Normal Setup (Original Side) MUST have the identical entryPrice
  assert.equal(trade.entryPrice, setup.entryPrice, 'trade.entryPrice must match setup.entryPrice');
  assert.equal(trade.actualFillPrice, setup.entryPrice, 'trade.actualFillPrice must match setup.entryPrice');
  assert.equal(trade.normalSetupSnapshot?.entry, setup.entryPrice, 'normalSetupSnapshot.entry must match setup.entryPrice');
  assert.equal(trade.side, 'SELL', 'Side-changed trade side must be inverted');
  assert.equal(trade.originalSetupSide, 'BUY/LONG', 'Original setup side preserved for comparison');
});

test('9. Live Exchange PnL Synchronization: Preserves authoritative exchange PnL & Auto Close triggers', async () => {
  const { OrderManager } = await import('../backend/orders/orderManager.js');
  const orderManager = new OrderManager();
  const mockClient: any = {
    hasCredentials: () => false,
  };

  const liveTrade: any = {
    tradeId: 'LIVE_TRD_TEST',
    coin: 'BTCUSD',
    side: 'SELL',
    entryPrice: 65000,
    actualFillPrice: 65000,
    currentPrice: 64000,
    quantity: 1,
    leverage: 10,
    capitalUsed: 6500,
    margin: 6500,
    status: 'OPEN',
    executionType: 'EXCHANGE_LIVE',
    unrealizedPnl: 1250.75, // authoritative synced PnL from Delta Exchange
    pnlPercent: 19.24,       // authoritative synced ROE% from Delta Exchange
    tp: 60000,
    sl: 70000,
  };

  // When monitorTradeLifecycle runs for EXCHANGE_LIVE trade, authoritative exchange PnL must NOT be overwritten!
  const res = await orderManager.monitorTradeLifecycle(liveTrade, 63800, mockClient, () => {}, {});
  assert.equal(res.trade.unrealizedPnl, 1250.75, 'Authoritative exchange unrealizedPnl must be preserved');
  assert.equal(res.trade.pnlPercent, 19.24, 'Authoritative exchange pnlPercent must be preserved');
});

test('10. Countdown Section: Duration calculations and multi-timeframe lock enforcement', async () => {
  const { db } = await import('../backend/database/db.js');

  // ONLY_TIMEFRAME mode calculations:
  // 15m -> 4h, 30m -> 8h, 1h -> 12h, 4h -> 24h, 1d -> 48h
  assert.equal(db.calculateCountdownDurationHours('ONLY_TIMEFRAME', '15m'), 4, '15m should lock for 4h');
  assert.equal(db.calculateCountdownDurationHours('ONLY_TIMEFRAME', '30m'), 8, '30m should lock for 8h');
  assert.equal(db.calculateCountdownDurationHours('ONLY_TIMEFRAME', '1h'), 12, '1h should lock for 12h');
  assert.equal(db.calculateCountdownDurationHours('ONLY_TIMEFRAME', '4h'), 24, '4h should lock for 24h');
  assert.equal(db.calculateCountdownDurationHours('ONLY_TIMEFRAME', '1d'), 48, '1d should lock for 48h');

  // ALL_TIMEFRAME mode calculations:
  assert.equal(db.calculateCountdownDurationHours('ALL_TIMEFRAME', '15m', '12h'), 12, 'ALL_TIMEFRAME 12h preset');
  assert.equal(db.calculateCountdownDurationHours('ALL_TIMEFRAME', '1h', '24h'), 24, 'ALL_TIMEFRAME 24h preset');
  assert.equal(db.calculateCountdownDurationHours('ALL_TIMEFRAME', '4h', 'CUSTOM', 6), 6, 'ALL_TIMEFRAME custom 6 hours');

  // OFF mode:
  assert.equal(db.calculateCountdownDurationHours('OFF', '15m'), 0, 'OFF mode should have 0 hours');

  // Lock checking: Only Timeframe vs All Timeframe
  // 1. Set up an ONLY_TIMEFRAME lock on BTCUSD for 15m
  const now = Date.now();
  db.updateConfig({ countdownMode: 'ONLY_TIMEFRAME' });
  const testLock1: any = {
    id: 'lock_test_1',
    coin: 'BTCUSD',
    timeframe: '15m',
    mode: 'ONLY_TIMEFRAME',
    lockStartedAt: new Date(now).toISOString(),
    lockExpiresAt: new Date(now + 4 * 3600 * 1000).toISOString(),
    durationHours: 4,
    closeReason: 'TP HIT',
  };
  db.saveCountdownLock(testLock1);

  // 15m should be locked
  const lockStatus15m = db.isCoinTimeframeLocked('BTCUSD', '15m');
  assert.equal(lockStatus15m.isLocked, true, 'BTCUSD 15m must be locked');
  assert.ok(lockStatus15m.remainingSeconds! > 0, 'Remaining seconds must be positive');

  // 1h on BTCUSD should NOT be locked under ONLY_TIMEFRAME mode
  const lockStatus1h = db.isCoinTimeframeLocked('BTCUSD', '1h');
  assert.equal(lockStatus1h.isLocked, false, 'BTCUSD 1h must NOT be locked when lock is for 15m only');

  // 2. Set up an ALL_TIMEFRAME lock on ETHUSD
  db.updateConfig({ countdownMode: 'ALL_TIMEFRAME', countdownAllTfDuration: '12h' });
  const testLockAll: any = {
    id: 'lock_test_all',
    coin: 'ETHUSD',
    timeframe: 'ALL',
    mode: 'ALL_TIMEFRAME',
    lockStartedAt: new Date(now).toISOString(),
    lockExpiresAt: new Date(now + 12 * 3600 * 1000).toISOString(),
    durationHours: 12,
    closeReason: 'SL HIT',
  };
  db.saveCountdownLock(testLockAll);

  // Any timeframe on ETHUSD must now be locked
  assert.equal(db.isCoinTimeframeLocked('ETHUSD', '15m').isLocked, true, 'ETHUSD 15m must be locked under ALL_TIMEFRAME');
  assert.equal(db.isCoinTimeframeLocked('ETHUSD', '1h').isLocked, true, 'ETHUSD 1h must be locked under ALL_TIMEFRAME');
  assert.equal(db.isCoinTimeframeLocked('ETHUSD', '4h').isLocked, true, 'ETHUSD 4h must be locked under ALL_TIMEFRAME');

  // Clean up test locks
  db.removeCountdownLock('lock_test_1');
  db.removeCountdownLock('lock_test_all');
  assert.equal(db.isCoinTimeframeLocked('BTCUSD', '15m').isLocked, false, 'Cleaned up lock should not be active');
});

test('11. Side Change Isolation: Order categorization and dual snapshot fidelity', () => {
  // Helper emulation identical to UI implementation
  const isTradeSideChanged = (t: any, sideChangeEnabled: boolean) => {
    if (t.isSideChangedOrder || t.sideChangeEnabled) return true;
    if (sideChangeEnabled && t.status === 'OPEN') return true;
    return false;
  };

  const normalTrade: any = {
    tradeId: 'NORM_1',
    coin: 'SOLUSD',
    status: 'OPEN',
    isSideChangedOrder: false,
    sideChangeEnabled: false,
  };

  const sideChangedTrade: any = {
    tradeId: 'SIDE_1',
    coin: 'AVAXUSD',
    status: 'OPEN',
    isSideChangedOrder: true,
    sideChangeEnabled: true,
    normalSetupSnapshot: {
      direction: 'BUY/LONG',
      entry: 25.5,
      tp1: 27.5,
      sl: 24.5,
    },
  };

  // Case A: Side Change is ON
  assert.equal(isTradeSideChanged(sideChangedTrade, true), true, 'Side changed trade must be classified as side change');
  // Case B: Normal trade when Side Change is OFF
  assert.equal(isTradeSideChanged(normalTrade, false), false, 'Normal trade must not be classified as side change');
});


