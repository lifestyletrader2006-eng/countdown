export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type DeltaEnvironment = 'production' | 'india' | 'testnet';

export interface ExchangeConfig {
  apiKey: string;
  apiSecret: string;
  environment: DeltaEnvironment;
  serverIp?: string;
  isConnected: boolean;
  isReadMode: boolean; // true = READ MODE, false = LIVE MODE
  autoTradeEnabled: boolean; // true = AUTO TRADE ON
  tradingCapital: number;
  capitalLimit: number;
  maxDailyLoss: number;
  maxOpenTrades: number;
  lotSize: number;
  minExpectedNetProfitPercent: number;
  minNetEdgePercent: number;
  minRiskReward: number;
  leverageMode: 'AUTOMATIC' | 'MANUAL';
  manualLeverage: number;
  tradingType: 'FUTURES_ONLY' | 'OPTIONS_ONLY' | 'FUTURES_AND_OPTIONS' | 'ARBITRAGE';
  lastTestedAt?: string;
  authError?: string;
  // Alert & Notification Settings
  notificationsEnabled?: boolean;
  soundAlertsEnabled?: boolean;
  visualAlertsEnabled?: boolean;
  alertOnApproaching?: boolean;
  alertOnTriggered?: boolean;
  alertOnTpHit?: boolean; // Specific alert for TP Hit
  alertOnSlHit?: boolean; // Specific alert for SL Hit
  alertOnTriggerWarnings?: boolean; // Specific alert for setup trigger warnings
  alertOnApiDisconnect?: boolean; // Specific alert for API connectivity issues
  muteTriggerAlerts?: boolean; // Mute entry trigger notifications
  muteTpHitAlerts?: boolean; // Mute TP Hit notifications
  muteSlHitAlerts?: boolean; // Mute SL Hit notifications
  muteReconnectAlerts?: boolean; // Mute Reconnection notifications
  // NOTE: Vital error alerts & critical system disconnections are ALWAYS ACTIVE and CANNOT be muted!
  notifyOnApproaching?: boolean;
  notifyOnTriggered?: boolean;
  enableSoundAlerts?: boolean;
  enableBrowserPush?: boolean;
  minArbitrageNetProfitUsd?: number;
  autoExecuteArbitrage?: boolean;
  autoSaveHistory?: boolean; // Controls whether trade, setup, and performance records are persisted to DB
  // 50% TP Progress Engine Settings
  tpProgressEnabled?: boolean; // Enable/disable 50% TP Progress Partial Profit Booking
  tpProgressTriggerPercent?: number; // Trigger % threshold (e.g. 50%)
  tpProgressBookPercent?: number; // Lot size % to book (e.g. 30%)
  tpProgressSlBufferPercent?: number; // Breakeven SL buffer % (e.g. 3%)
  // Multi-Timeframe Future Setup Scanning
  scanningTimeframe?: SetupTimeframe; // Active timeframe scanned by bot engine
  botScanningTimeframes?: SetupTimeframe[]; // Active timeframes for Bot setups (e.g. 15m, 30m, 1h, 4h, 1d)
  exchangeScanningTimeframes?: SetupTimeframe[]; // Active timeframes for Exchange setups (e.g. 15m, 30m, 1h, 4h, 1d)
  // Price Change Distribution (PCD) Intelligence Settings
  pcdEnabled?: boolean; // Master toggle: Price Change Distribution Intelligence ON/OFF
  pcdBreadthFilterEnabled?: boolean; // Prevent counter-trend setups (e.g. No Longs in deep red market)
  pcdChopProtectionEnabled?: boolean; // Protect against noise/wicks when market is compressed in Neutral bracket
  pcdMinBullishRatioForLongs?: number; // Minimum % green coins required for standard Longs (e.g. 40%)
  pcdMaxBearishRatioForShorts?: number; // Minimum % red coins required for standard Shorts (e.g. 40%)
  pcdAllowOutliersInOppositeMarket?: boolean; // Permit extreme Relative Strength leaders even if broad market is opposing
  pcdConfluenceScoreBonus?: number; // Confluence score bonus (+10 pts) for breadth-aligned setups
  pcdMinOutlierGainPercent?: number; // % gain threshold to qualify as Relative Strength leader (e.g. 5.0%)
  // Side Change / Opposite Order Settings
  sideChangeEnabled?: boolean; // When ON, places only the opposite side order on Delta Exchange
  sideChangeSlMode?: 'SL' | '10%' | '20%' | '30%' | '40%' | '50%'; // SL setting: direct inverted (TP=SL) or percentage of margin
  // 24H Range Scanner Settings (Configurable Gainers & Losers Band)
  rangeFilterEnabled?: boolean; // When ON, bot only generates setups for coins within the configured 24h % move range
  rangeMinPercent?: number; // Minimum 24h move % (default: 3.0%)
  rangeMaxPercent?: number; // Maximum 24h move % (default: 7.0%)
  rangeTargetSide?: 'BOTH' | 'GAINERS' | 'LOSERS'; // Target side for range scanning
  expireOutOfRangeSetups?: boolean; // Auto-expire setup if coin drifts outside the range band before triggering
  maxActiveSetups?: number; // Maximum active setups to maintain (Quality over Quantity, default: 15)
  // Auto Close Order on Exchange (Live PnL & Lot Sizing)
  autoCloseOnExchangeEnabled?: boolean; // Master toggle: Auto close orders on Delta Exchange
  autoCloseProfitPnlPercent?: number | null; // Configurable profit PnL % threshold (100%, 120%, 150%, 200%, 300%, 500%, or custom; null = OFF)
  autoCloseLossPnlPercent?: number | null; // Configurable loss PnL % threshold (20%, 50%, 80%, 100%, or custom; null = OFF)
  autoCloseLotMode?: 'ALL' | 'CUSTOM'; // 'ALL' = close entire position, 'CUSTOM' = close specific lot size
  autoCloseLotSize?: number; // Specific lot quantity to close (1, 2, 3, 5, 10, 50, 100, 500, etc.)
  // Trade Expiry Countdown Section Settings
  countdownMode?: 'OFF' | 'ONLY_TIMEFRAME' | 'ALL_TIMEFRAME'; // OFF, Only Timeframe (15m=4h, 30m=8h, 1h=12h, 4h=24h), or All Timeframe (12h, 24h, Custom)
  countdownAllTfDuration?: '12h' | '24h' | 'CUSTOM'; // All Timeframe duration preset
  countdownCustomHours?: number; // Custom hours for ALL_TIMEFRAME mode (default: 12)
}

export interface CoinCountdownLock {
  id: string; // e.g. LOCK_BTCUSD_15m_timestamp
  coin: string;
  timeframe: string; // '15m' | '30m' | '1h' | '4h' | '1d' | 'ALL'
  mode: 'ONLY_TIMEFRAME' | 'ALL_TIMEFRAME';
  lockStartedAt: string; // ISO Date string
  lockExpiresAt: string; // ISO Date string
  durationHours: number;
  closeReason: string; // 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE'
  tradeId?: string;
  remainingSeconds?: number;
  formattedTimeLeft?: string;
}

export interface DistributionBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  percent: number;
  color: string;
  coins: Array<{ symbol: string; change24h: number; volume: number }>;
}

export interface PriceChangeDistributionState {
  totalCoins: number;
  positiveCoins: number;
  negativeCoins: number;
  neutralCoins: number;
  bullishRatio: number;
  bearishRatio: number;
  marketRegime: 'STRONG_BULLISH' | 'MODERATE_BULLISH' | 'NEUTRAL_CHOP' | 'MODERATE_BEARISH' | 'STRONG_BEARISH';
  regimeLabel: string;
  regimeAdvice: string;
  buckets: DistributionBucket[];
  relativeStrengthCoins: Array<{ symbol: string; change24h: number; reason: string }>;
  relativeWeaknessCoins: Array<{ symbol: string; change24h: number; reason: string }>;
  updatedAt: string;
}

export interface DeltaProduct {
  id: number;
  symbol: string;
  description: string;
  contract_type: string; // 'perpetual_future' | 'futures' | 'call_options' | 'put_options'
  underlying_asset: {
    symbol: string;
  };
  quoting_asset: {
    symbol: string;
  };
  settling_asset: {
    symbol: string;
  };
  tick_size: string;
  contract_value: string;
  contract_unit_currency?: string;
  maker_commission_rate?: string;
  taker_commission_rate?: string;
  strike_price?: string;
  settlement_time?: number;
  max_leverage_notional?: string;
  trading_status?: string;
}

export interface DeltaTicker {
  symbol: string;
  product_id: number;
  close: number;
  mark_price: number;
  index_price: number;
  spot_price?: number | string;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  open_interest: number;
  funding_rate: number;
  quotes: {
    best_bid_price: string;
    best_bid_size: string;
    best_ask_price: string;
    best_ask_size: string;
  };
  price_change_percent_24h: number;
  ltp_change_24h?: number | string;
  mark_change_24h?: number | string;
  open?: number;
  contract_type?: string;
  tick_size?: string;
  contract_value?: string;
  status?: string;
  whyMoved?: {
    reason: string;
    catalyst: string;
    signal: string;
    volumeSurge?: string;
    fundingSignal?: string;
  };
}

export type SetupStatus =
  | 'WATCHING'
  | 'NEAR SETUP'
  | 'TRIGGER APPROACHING'
  | 'TRIGGERED'
  | 'ORDER SUBMITTED'
  | 'EXCHANGE CONFIRMED'
  | 'FILLED'
  | 'TRADE OPEN'
  | 'SL HIT'
  | 'TP HIT'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'REJECTED';

export interface IndicatorConfirmations {
  trend: string;
  rsi: number;
  macd: string;
  adx: number;
  volumeProfile: string;
  volatility: string;
  pattern: string;
  marketStructure: string;
}

export interface VerifiedSourceLink {
  sourceName: string;
  title: string;
  publishedAt: string;
  url: string;
  sourceType: 'Official' | 'Primary' | 'Secondary';
  evidence: string;
}

export interface SetupHistoryRecord {
  id: string;
  setupId: string;
  tradeId?: string;
  orderId?: string;
  timestamp: string; // Date and Time trade opened
  openedAt?: string; // Exact open date & time
  closedAt: string; // Exact close date & time
  durationMinutes?: number;
  durationFormatted?: string;
  coin: string;
  exchange?: 'Delta';
  direction: 'BUY/LONG' | 'SELL/SHORT';
  entryPrice: number;
  actualFillPrice?: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  sl: number;
  exitPrice?: number;
  outcome: 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'LIQUIDATED' | 'CLOSED' | 'INVALIDATED';
  closeReason?: 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'LIQUIDATED';
  liquidationPrice?: number;
  setupCreatedAt?: string; // Kab bana tha setup
  realizedPnl: number;
  pnlPercent: number;
  riskRewardAchieved: number;
  executionMode?: 'EXCHANGE' | 'BOT_SIMULATED';
  executionType?: 'EXCHANGE_LIVE' | 'BOT_VIRTUAL';
  orderNotPlacedReason?: string; // Why order was not placed on exchange if BOT_VIRTUAL
  tpHitAt?: string;
  slHitAt?: string;
  timeframe?: string;
  riskReward?: number;
  // "Kyu banta tha setup" (Why setup formed / Initial thesis & primary reason)
  whyFormed: string;
  primaryReason: string;
  supportingReasons: string[];
  // "Setup reason kya hua" (Outcome trigger: TP Hit or SL Hit and why)
  outcomeReason: string;
  score: number;
  leverage?: number;
  capitalUsed?: number;
  margin?: number; // Margin capital used
  livePrice?: number; // Latest/exit price matching exchange
  orderType?: 'BOT' | 'EXCHANGE'; // Friendly order source
  // 50% TP Progress Detailed Booking Record
  partialProfitBooked?: boolean;
  partialProfitBookedAt?: string; // Exact Date and Time when 50% TP profit was booked
  partialProfitBookedPrice?: number; // Price at which 50% TP profit was booked
  partialProfitBookedPnl?: number; // Realized profit from 50% TP booking
  sourceLinks?: VerifiedSourceLink[];
  pcdReason?: string;
  marketBreadthAtEntry?: string;
  pcdStatus?: string;
  // Side Change Architecture Fields
  sideChangeEnabled?: boolean;
  isSideChangedOrder?: boolean;
  originalSide?: string;
  changedSide?: string;
  sideChangeSlSetting?: string;
  normalSetupPnl?: number;
  normalSetupPnlPercent?: number;
  sideChangedPnl?: number;
  sideChangedPnlPercent?: number;
  highestPrice?: number;
  lowestPrice?: number;
  grossPnl?: number;
  commission?: number;
  netPnl?: number;
  exchangeResponse?: any;
  tradeLogs?: Array<{ time: string; event: string; details?: string }>;
  normalSetupSnapshot?: {
    entry: number;
    tp1: number;
    sl: number;
    direction: string;
    pnl?: number;
    pnlPercent?: number;
  };
  // 24H Range & Direction Forensic Fields
  rangeBandAtCreation?: string; // e.g. "3.0% - 7.0%"
  movePercent24hAtCreation?: number; // 24h change % at entry (e.g. +4.2% or -5.1%)
  current24hMovePercent?: number; // Live 24h change %
  marketMoveContext?: string; // e.g. "24H Gainer (+4.2%)" or "24H Loser (-5.1%)"
  whyDirectionRationale?: string; // Clear explanation: why BUY on Loser (Oversold Bounce) or why SELL on Gainer (Exhaustion Top)
}

export interface FutureSetup {
  id: string; // SETUP_ID
  coin: string;
  exchange: 'Delta';
  instrumentType: 'Future' | 'Option';
  direction: 'BUY/LONG' | 'SELL/SHORT';
  currentPrice: number;
  triggerPrice: number; // Trigger = Entry
  entryPrice: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  sl: number;
  distanceToTrigger: number;
  distanceToTriggerPercent: number;
  expectedMovePercent: number;
  riskPercent: number;
  rewardPercent: number;
  riskReward: number;
  score: number; // 0-100
  pcdReason?: string;
  marketBreadthAtEntry?: string;
  pcdVerdict?: string;
  historicalProbability: number; // 0-100%
  sampleSize: number;
  confidence: number; // 0-100%
  reason: string;
  historicalEvidence: string;
  indicatorConfirmations: IndicatorConfirmations;
  status: SetupStatus;
  createdAt: string;
  triggeredAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  productId: number;
  timeframe: string;
  source?: string;
  strategy?: string;
  compositeKey?: string;
  // Enhanced Research & Forensics Fields
  whyFormed?: string;
  primaryReason?: string;
  supportingReasons?: string[];
  marketConditions?: {
    btcTrend: string;
    ethTrend: string;
    marketRegime: string;
    fundingRegime: string;
    volatilityIndex: string;
  };
  setupExpiration?: string;
  invalidationCondition?: string;
  kabSetupBanega?: string; // Exact anticipated trigger condition and ETA
  sourceLinks?: VerifiedSourceLink[]; // Mandatory clickable verified sources
  hasOrderPlaced?: boolean;
  orderPlacedAt?: string;
  orderNotPlacedReason?: string; // Stated reason why exchange order was not placed (Read Mode, Disconnected, Auto Trade Off, Error)
  hasTriggeredOnce?: boolean;
  executionMode?: 'EXCHANGE' | 'BOT_SIMULATED';
  volumeProfileNode?: 'HVN_POC' | 'NORMAL' | 'LVN_BREAKOUT';
  volumeProfileConcentration?: number; // e.g. 84%
  volumeProfileBins?: Array<{ price: number; volumePct: number; isPOC?: boolean }>;
  // 24H Range & Direction Forensic Fields
  rangeBandAtCreation?: string; // e.g. "3.0% - 7.0%"
  movePercent24hAtCreation?: number; // 24h change % when setup was formulated (e.g. +4.2% or -5.1%)
  current24hMovePercent?: number; // Live 24h change % continuously updated from Delta Exchange
  marketMoveContext?: string; // e.g. "24H Gainer (+4.2%)" or "24H Loser (-5.1%)"
  whyDirectionRationale?: string; // Clear explanation: why BUY on Loser (Oversold Bounce) or why SELL on Gainer (Exhaustion Top)
  isInActiveRange?: boolean; // Whether coin is currently within user's configured range band
  isSideChangedSetup?: boolean; // Indicates whether setup is executing as inverted Side Change order
  targetInvertedSide?: 'BUY' | 'SELL'; // The actual opposite side that places on Delta Exchange when Side Change is ON
  countdownActive?: boolean; // Indicates if coin currently has an active expiry countdown lock
  countdownRemainingSeconds?: number;
}

export interface TradeRecord {
  tradeId: string;
  setupId: string;
  orderId: string;
  positionId?: string;
  productId?: number;
  exchange: 'Delta';
  coin: string;
  instrumentType: 'Future' | 'Option' | 'Arbitrage';
  side: 'BUY' | 'SELL';
  entryPrice: number;
  actualFillPrice: number;
  currentPrice: number;
  livePrice?: number;
  tp: number;
  sl: number;
  quantity: number;
  capitalUsed: number;
  leverage: number;
  fees: number;
  funding: number;
  exitPrice?: number;
  realizedPnl: number;
  unrealizedPnl: number;
  pnlPercent: number;
  createdAt: string;
  closedAt?: string;
  status: 'OPEN' | 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'LIQUIDATED' | 'CLOSED' | 'FAILED' | 'PARTIALLY_CLOSED';
  closeReason?: 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'LIQUIDATED';
  liquidationPrice?: number;
  setupCreatedAt?: string; // Kab bana tha setup
  margin?: number; // Margin capital used
  orderType?: 'BOT' | 'EXCHANGE';
  partialProfitBooked?: boolean;
  partialProfitBookedAt?: string; // Date & time when 50% TP progress profit was booked
  partialProfitBookedPrice?: number; // Price when 50% TP progress profit was booked
  partialProfitBookedPnl?: number; // Profit amount booked at 50% TP progress
  executionType?: 'EXCHANGE_LIVE' | 'BOT_VIRTUAL';
  orderNotPlacedReason?: string; // Reason why exchange order was not placed
  tpHitAt?: string;
  slHitAt?: string;
  executionNote?: string;
  timeframe?: string;
  strategy?: string;
  whyFormed?: string;
  primaryReason?: string;
  supportingReasons?: string[];
  pcdReason?: string;
  marketBreadthAtEntry?: string;
  // Side Change Architecture Fields
  sideChangeEnabled?: boolean;
  isSideChangedOrder?: boolean;
  originalSetupSide?: 'BUY/LONG' | 'SELL/SHORT' | string;
  sideChangeSlSetting?: string;
  normalSetupSnapshot?: {
    entry: number;
    tp1: number;
    sl: number;
    direction: string;
    pnl?: number;
    pnlPercent?: number;
    status?: 'OPEN' | 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'CLOSED';
    exitPrice?: number;
    closedAt?: string;
    hitAt?: string;
  };
  exchangeOrderStatus?: 'OPEN' | 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'CLOSED';
  exchangeOrderExitPrice?: number;
  exchangeOrderClosedAt?: string;
  highestPrice?: number;
  lowestPrice?: number;
  grossPnl?: number;
  commission?: number;
  exchangeResponse?: any;
  // 24H Range & Direction Forensic Fields
  rangeBandAtCreation?: string; // e.g. "3.0% - 7.0%"
  movePercent24hAtCreation?: number; // 24h change % at entry (e.g. +4.2% or -5.1%)
  current24hMovePercent?: number; // Live 24h change %
  marketMoveContext?: string; // e.g. "24H Gainer (+4.2%)" or "24H Loser (-5.1%)"
  whyDirectionRationale?: string; // Clear explanation: why BUY on Loser (Oversold Bounce) or why SELL on Gainer (Exhaustion Top)
  tradeLogs?: Array<{ time: string; event: string; details?: string }>;
}

export interface OptionChainItem {
  underlying: string;
  expiry: string;
  strike: number;
  call: {
    symbol: string;
    productId: number;
    bid: number;
    ask: number;
    ltp: number;
    volume: number;
    oi: number;
    iv?: number | null;
    delta?: number | null;
    gamma?: number | null;
    vega?: number | null;
    theta?: number | null;
    contractMultiplier: number;
    takerFee: number;
  };
  put: {
    symbol: string;
    productId: number;
    bid: number;
    ask: number;
    ltp: number;
    volume: number;
    oi: number;
    iv?: number | null;
    delta?: number | null;
    gamma?: number | null;
    vega?: number | null;
    theta?: number | null;
    contractMultiplier: number;
    takerFee: number;
  };
  futuresPrice: number;
  basis: number;
}

export interface ArbitrageSetup {
  id: string; // ARBITRAGE_SETUP_ID
  coin: string;
  expiry: string;
  expiryType?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  strike: number;
  type: 'CONVERSION' | 'REVERSAL' | 'BOX_SPREAD' | 'BASIS_CARRY' | 'SYNTHETIC_ARB' | 'CALENDAR_SPREAD';
  futureLeg: {
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
  };
  callLeg: {
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
  };
  putLeg: {
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
  };
  grossEdge: number;
  fees: number;
  totalFees?: number;
  slippage: number;
  funding: number;
  carry: number;
  safetyBuffer: number;
  netProfit: number;
  netEdgePercent: number;
  capitalRequired: number;
  liquidityScore: number;
  isCandidate: boolean;
  status: 'ANALYZING' | 'TRADE CANDIDATE' | 'INSUFFICIENT LIQUIDITY' | 'EXECUTING' | 'EXECUTED' | 'FAILED';
  createdAt: string;
  kabSetupBanega?: string;
  executionLegsBreakdown?: Array<{
    legNumber: number;
    action: 'BUY' | 'SELL';
    instrument: 'Future' | 'Call Option' | 'Put Option';
    symbol: string;
    strike?: number;
    expiry?: string;
    price: number;
    size: number;
    reason: string;
  }>;
}

export interface BotErrorRecord {
  errorId: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  module: 'API' | 'MarketData' | 'Order' | 'Bot' | 'Risk' | 'TPSL' | 'Scanner';
  subModule: string;
  functionName: string;
  exchange: 'Delta';
  market?: string;
  coin?: string;
  setupId?: string;
  orderId?: string;
  positionId?: string;
  requestId?: string;
  errorCode?: string;
  httpStatus?: number;
  deltaErrorCode?: string | number;
  errorMessage: string;
  systemMessage: string;
  inputValidation?: string;
  dataStatus: string;
  retryCount: number;
  recoveryAction: string;
  finalStatus: 'OPEN' | 'RESOLVED' | 'SUPPRESSED';
}

export interface HistoricalForensicMove {
  id: string;
  symbol: string;
  detectedAt: string;
  movePercent24h: number;
  moveMagnitudePercent?: number; // Alias for compatibility
  preMoveTrend: string;
  preMoveRsi: number;
  preMoveAdx: number;
  preMoveVolumeZScore: number;
  preMoveVolumeAcceleration?: number;
  preMoveOiChangePercent: number;
  preMoveVolatilityAtr: number;
  preMoveAtr?: number;
  preMoveCandlePattern: string;
  preMoveStructure: string;
  breakoutType: string;
  triggerPattern?: string; // e.g. "BOS Bullish + RVOL Volume Surge"
  subsequentMovePercent: number;
  durationHours: number;
  moveDurationBars?: number;
  evidenceSummary: string;
  deepRationale?: string;
  preMoveCompression?: boolean;
  
  // ADVANCED FORENSICS & RESEARCH DIMENSIONS
  kabSetupBanega: string; // "Kab setup banega" - Exact trigger conditions, ETA, and rule threshold!
  newsCatalyst?: string;
  sourceLinks?: VerifiedSourceLink[]; // Verified, clickable source links
  vwapDeviation?: string;
  openInterestDelta?: string;
  fundingRateAndTrend?: string;
  cvdAndTakerFlow?: string;
  liquidationContext?: string;
  orderFlowImbalance?: string;
  momentumDivergence?: string;
  fibPivotLevels?: string;
  btcMarketRegime?: string;
  historicalWinRate?: number;
  sampleSize?: number;
}

export interface BacktestParams {
  type?: 'Future' | 'Option' | 'Future + Option' | 'Arbitrage';
  backtestType?: 'FUTURE' | 'OPTION' | 'FUTURE_AND_OPTION' | 'ARBITRAGE';
  symbol: string; // 'ALL' or specific symbol
  timeframe?: '1m' | '2m' | '3m' | '6m' | '1y' | '2y';
  timeRange?: '1m' | '2m' | '3m' | '6m' | '1y' | '2y';
  useSmartBotScanData: boolean;
  initialCapital: number;
  riskRewardMin: number;
}

export interface BacktestResult {
  totalSetups: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  fees: number;
  funding: number;
  slippage: number;
  netPnl: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  averageHoldingTimeMinutes: number;
  consecutiveWinsMax: number;
  consecutiveLossesMax: number;
  sampleSize: number;
  trades: Array<{
    date: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    entry: number;
    exit: number;
    pnl: number;
    result: 'WIN' | 'LOSS';
    pnlPercent: number;
  }>;
}

export interface BotStatusState {
  isConnected: boolean;
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR';
  botStatus: 'RUNNING' | 'PAUSED' | 'HALTED' | 'RECOVERING';
  lastPingMs: number;
  dataFreshnessSeconds: number;
  totalFuturesCoins: number;
  totalSetups: number;
  openSetups: number;
  triggeredSetups: number;
  openTrades: number;
  totalOrders: number;
  tpHitCount: number;
  slHitCount: number;
  runningPnl: number;
  totalCapital: number;
  usedCapital: number;
  availableCapital: number;
  reservedMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
  dailyPnl: number;
  liveExchangeBalance?: number;
  exchangeMarginUsed?: number;
  activeEnvironment: DeltaEnvironment;
  isReadMode: boolean;
  autoTradeEnabled: boolean;
  activeCountdownLocksCount?: number;
  countdownLocks?: CoinCountdownLock[];
}

export type SetupTimeframe = '15m' | '30m' | '1h' | '4h' | '1d';

export interface TimeframeStats {
  timeframe: SetupTimeframe;
  label: string;
  candleMinutes: number;
  totalSetups: number;
  openSetups: number;
  triggeredSetups: number;
  tpHits: number;
  slHits: number;
  winRate: number;
  totalPnl: number;
  avgRiskReward: number;
  confluenceScore: number;
  isCurrentActive: boolean;
}
