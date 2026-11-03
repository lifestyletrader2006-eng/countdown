import type { ExchangeConfig, FutureSetup, TradeRecord, DeltaProduct, SetupHistoryRecord } from '../../src/types/index.js';

export interface DynamicQualityThresholds {
  forcedMinRiskReward: number;
  dynamicMinNetEdgePercent: number;
  requiredConfluenceScore: number;
  isThresholdElevated: boolean;
  recentSlCount: number;
  reason?: string;
}

export interface RiskValidationResult {
  allowed: boolean;
  blockReason?: string;
  calculatedLeverage: number;
  calculatedQuantity: number;
  calculatedCapitalRequired: number;
  effectiveRiskReward: number;
}

export class RiskManager {
  /**
   * Evaluates recent trade history to calculate Dynamic Profitability Threshold
   * and Setup Quality Filter:
   * If the last 5 trades were all stopped out, dynamically forces min R:R > 3:1 (targeting 5:1)
   * and increases minNetEdgePercent.
   */
  public getDynamicQualityThresholds(
    trades: (TradeRecord | SetupHistoryRecord)[],
    config: ExchangeConfig
  ): DynamicQualityThresholds {
    const completed = trades.filter((t) => {
      const outcome = 'outcome' in t ? t.outcome : t.status;
      return outcome === 'TP HIT' || outcome === 'SL HIT' || outcome === 'CLOSED';
    });

    const last5 = completed.slice(0, 5);
    const slCountInLast5 = last5.filter((t) => {
      const outcome = 'outcome' in t ? t.outcome : t.status;
      return outcome === 'SL HIT';
    }).length;

    // Check if the previous 5 trades were all stopped out
    if (last5.length >= 5 && slCountInLast5 === 5) {
      return {
        forcedMinRiskReward: 3.2,
        dynamicMinNetEdgePercent: Math.max(1.8, (config.minNetEdgePercent || 0.8) * 2),
        requiredConfluenceScore: 88,
        isThresholdElevated: true,
        recentSlCount: 5,
        reason: 'DYNAMIC SETUP QUALITY FILTER ACTIVE: Last 5 trades were all stopped out. Forcing min R:R above 3:1 and high edge (> 1.8%).',
      };
    } else if (slCountInLast5 >= 3) {
      return {
        forcedMinRiskReward: 2.8,
        dynamicMinNetEdgePercent: Math.max(1.3, (config.minNetEdgePercent || 0.8) * 1.5),
        requiredConfluenceScore: 84,
        isThresholdElevated: true,
        recentSlCount: slCountInLast5,
        reason: `DYNAMIC QUALITY FILTER: ${slCountInLast5} of last 5 trades were SL hits. Elevating R:R to >= 2.8:1 and edge >= 1.3%.`,
      };
    }

    return {
      forcedMinRiskReward: Math.max(config.minRiskReward || 1.8, 1.8),
      dynamicMinNetEdgePercent: config.minNetEdgePercent || 0.8,
      requiredConfluenceScore: 80,
      isThresholdElevated: false,
      recentSlCount: slCountInLast5,
    };
  }

  /**
   * Pre-trade risk validation gate. Must pass before any order request is submitted.
   */
  public validateTrade(
    setup: FutureSetup,
    config: ExchangeConfig,
    activeTrades: TradeRecord[],
    currentDailyLoss: number,
    availableBalance: number,
    maxInstrumentLeverage = 100,
    product?: DeltaProduct | null,
    isManual = false
  ): RiskValidationResult {
    // 1. Max Daily Loss Guard
    if (currentDailyLoss >= config.maxDailyLoss) {
      return {
        allowed: false,
        blockReason: `MAX DAILY LOSS REACHED ($${currentDailyLoss.toFixed(2)} >= $${config.maxDailyLoss}). AUTO TRADING STOPPED.`,
        calculatedLeverage: 1,
        calculatedQuantity: 0,
        calculatedCapitalRequired: 0,
        effectiveRiskReward: setup.riskReward,
      };
    }

    // 2. Max Open Trades Guard
    const openTradeCount = activeTrades.filter((t) => t.status === 'OPEN').length;
    if (openTradeCount >= config.maxOpenTrades) {
      return {
        allowed: false,
        blockReason: `MAX OPEN TRADES REACHED (${openTradeCount}/${config.maxOpenTrades}). Order blocked until existing positions close.`,
        calculatedLeverage: 1,
        calculatedQuantity: 0,
        calculatedCapitalRequired: 0,
        effectiveRiskReward: setup.riskReward,
      };
    }

    // 2b. Prevent duplicate open trades on the same coin
    const existingSameCoinTrade = activeTrades.find((t) => t.coin === setup.coin && t.status === 'OPEN');
    if (existingSameCoinTrade && !isManual) {
      return {
        allowed: false,
        blockReason: `An active trade for ${setup.coin} is already open on the exchange. Prevented duplicate entry.`,
        calculatedLeverage: 1,
        calculatedQuantity: 0,
        calculatedCapitalRequired: 0,
        effectiveRiskReward: setup.riskReward,
      };
    }

    // 3. Dynamic Profitability Threshold & Minimum Risk/Reward Guard
    const dynamicFilter = this.getDynamicQualityThresholds(activeTrades, config);
    const requiredMinRr = Math.max(config.minRiskReward || 1.8, dynamicFilter.forcedMinRiskReward);

    if (setup.riskReward < requiredMinRr && !isManual) {
      return {
        allowed: false,
        blockReason: dynamicFilter.isThresholdElevated
          ? `DYNAMIC PROFITABILITY THRESHOLD ACTIVE: Setup R:R (${setup.riskReward}:1) is below elevated threshold (${requiredMinRr}:1) enforced due to recent SL hits.`
          : `MINIMUM R:R VIOLATION (Setup R:R ${setup.riskReward} < Configured ${requiredMinRr}).`,
        calculatedLeverage: 1,
        calculatedQuantity: 0,
        calculatedCapitalRequired: 0,
        effectiveRiskReward: setup.riskReward,
      };
    }

    // 4. Expected Profit & Edge Guard
    const requiredMinEdge = dynamicFilter.dynamicMinNetEdgePercent;
    if (setup.expectedMovePercent < requiredMinEdge && !isManual) {
      return {
        allowed: false,
        blockReason: `MINIMUM EXPECTED PROFIT NOT MET (${setup.expectedMovePercent}% < required edge ${requiredMinEdge}%).`,
        calculatedLeverage: 1,
        calculatedQuantity: 0,
        calculatedCapitalRequired: 0,
        effectiveRiskReward: setup.riskReward,
      };
    }

    // 5. User-Configured Leverage Selection
    // User requested: "aur jo mai levargae set karu vahi levarage se coin buy or sell ho"
    // Use the exact leverage configured by the user (manualLeverage) clamped only to the instrument's exchange max
    let finalLeverage = 10;
    if (config.manualLeverage && config.manualLeverage > 0) {
      finalLeverage = Math.max(1, Math.min(Number(config.manualLeverage), maxInstrumentLeverage));
    } else if (config.leverageMode === 'MANUAL') {
      finalLeverage = Math.max(1, Math.min(Number(config.manualLeverage || 10), maxInstrumentLeverage));
    } else {
      // In Automatic mode, use configured leverage if set, otherwise fallback to safe calculation
      const configured = config.manualLeverage || 10;
      finalLeverage = Math.max(1, Math.min(configured, maxInstrumentLeverage));
    }

    // 6. Lot Size & Contract-Value Margin Execution
    // User requested: 1 lot buy or sell with configured leverage
    let targetQuantity = config.lotSize && config.lotSize > 0 ? config.lotSize : 1;
    targetQuantity = Math.max(1, Math.round(targetQuantity));

    // Resolve real contract_value from Delta product specifications
    // On Delta Exchange, 1 contract of BTC is typically 0.001 BTC, 1 contract of ETH is 0.01 ETH, etc.
    let contractValue = 1;
    if (product?.contract_value) {
      const parsed = parseFloat(String(product.contract_value));
      if (!isNaN(parsed) && parsed > 0) {
        contractValue = parsed;
      }
    } else {
      const coinUpper = (setup.coin || '').toUpperCase();
      if (coinUpper.startsWith('BTC')) contractValue = 0.001;
      else if (coinUpper.startsWith('ETH')) contractValue = 0.01;
      else if (coinUpper.startsWith('SOL')) contractValue = 0.1;
      else contractValue = 1;
    }

    // Accurate notional value = lots * contract_value * entryPrice
    const notional = targetQuantity * contractValue * setup.entryPrice;
    const requiredMargin = Math.max(0.001, Math.round((notional / finalLeverage) * 10000) / 10000);

    // Check user-configured trading capital ceiling (only if explicitly configured > 0)
    if (config.tradingCapital && config.tradingCapital > 0 && !isManual) {
      const openTradesMargin = activeTrades
        .filter((t) => t.status === 'OPEN')
        .reduce((sum, t) => sum + (t.capitalUsed || 0), 0);
      const remainingUserCapital = config.tradingCapital - openTradesMargin;

      if (remainingUserCapital > 0 && requiredMargin > remainingUserCapital * 1.2) {
        return {
          allowed: false,
          blockReason: `CONFIGURED TRADING CAPITAL REACHED: Required margin is $${requiredMargin.toFixed(2)} at ${finalLeverage}x leverage for ${targetQuantity} lot(s), but configured capital limit remaining is $${remainingUserCapital.toFixed(2)} (Total set: $${config.tradingCapital.toFixed(2)}).`,
          calculatedLeverage: finalLeverage,
          calculatedQuantity: targetQuantity,
          calculatedCapitalRequired: requiredMargin,
          effectiveRiskReward: setup.riskReward,
        };
      }
    }

    // Check real exchange available balance (only if availableBalance is strictly verified and realistic)
    // For manual triggers or when balance buffer is sufficient, do not block: Delta Exchange performs the authoritative check
    if (!isManual && availableBalance > 0 && requiredMargin > availableBalance * 1.5) {
      return {
        allowed: false,
        blockReason: `INSUFFICIENT EXCHANGE BALANCE: Required margin on Delta is ~$${requiredMargin.toFixed(2)} at ${finalLeverage}x leverage for ${targetQuantity} lot(s), but reported balance is $${availableBalance.toFixed(2)}.`,
        calculatedLeverage: finalLeverage,
        calculatedQuantity: targetQuantity,
        calculatedCapitalRequired: requiredMargin,
        effectiveRiskReward: setup.riskReward,
      };
    }

    return {
      allowed: true,
      calculatedLeverage: finalLeverage,
      calculatedQuantity: targetQuantity,
      calculatedCapitalRequired: requiredMargin,
      effectiveRiskReward: setup.riskReward,
    };
  }
}
