import type { BacktestParams, BacktestResult, Candle, FutureSetup } from '../../src/types/index.js';
import { FutureSetupEngine } from '../strategies/futureSetupEngine.js';
import type { HistoricalForensicMove } from '../../src/types/index.js';

export class BacktestEngine {
  private setupEngine = new FutureSetupEngine();

  /**
   * Runs rule-based backtest on historical Delta candle sequence without look-ahead bias
   */
  public runBacktest(
    params: BacktestParams,
    historicalCandlesBySymbol: Record<string, Candle[]>,
    historicalForensics: HistoricalForensicMove[]
  ): BacktestResult {
    const symbolsToTest =
      params.symbol === 'ALL'
        ? Object.keys(historicalCandlesBySymbol)
        : [params.symbol].filter((s) => historicalCandlesBySymbol[s]);

    const trades: BacktestResult['trades'] = [];
    let grossPnl = 0;
    let totalFees = 0;
    let totalSlippage = 0;
    let totalFunding = 0;

    let wins = 0;
    let losses = 0;
    let winSum = 0;
    let lossSum = 0;
    let largestWin = 0;
    let largestLoss = 0;

    let peakEquity = params.initialCapital;
    let currentEquity = params.initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    let totalHoldingTimeBars = 0;

    for (const symbol of symbolsToTest) {
      const candles = historicalCandlesBySymbol[symbol] || [];
      if (candles.length < 50) continue;

      // Sliding window evaluation: evaluate at bar i using only [0...i]
      const step = 4; // Step through bars to simulate time progression
      for (let i = 35; i < candles.length - 12; i += step) {
        const window = candles.slice(0, i + 1);
        const currentCandle = candles[i];

        const mockProduct = {
          id: 1,
          symbol,
          description: symbol,
          contract_type: 'perpetual_future',
          underlying_asset: { symbol },
          quoting_asset: { symbol: 'USDT' },
          settling_asset: { symbol: 'USDT' },
          tick_size: '0.1',
          contract_value: '1',
        };

        const mockTicker = {
          symbol,
          product_id: 1,
          close: currentCandle.close,
          mark_price: currentCandle.close,
          index_price: currentCandle.close,
          high: currentCandle.high,
          low: currentCandle.low,
          volume: currentCandle.volume,
          turnover: currentCandle.volume * currentCandle.close,
          open_interest: 1000,
          funding_rate: 0.0001,
          quotes: {
            best_bid_price: String(currentCandle.close),
            best_bid_size: '10',
            best_ask_price: String(currentCandle.close),
            best_ask_size: '10',
          },
          price_change_percent_24h: 0,
        };

        const setup = this.setupEngine.evaluateInstrument(
          mockProduct,
          mockTicker,
          window,
          historicalForensics,
          params.riskRewardMin
        );

        if (!setup) continue;

        // Walk forward future candles to resolve trade outcome strictly without look-ahead
        const forwardCandles = candles.slice(i + 1, Math.min(candles.length, i + 25));
        let entryFilled = false;
        let outcomeResolved = false;
        let exitPrice = setup.entryPrice;
        let outcome: 'WIN' | 'LOSS' = 'LOSS';
        let holdingBars = 0;

        for (let f = 0; f < forwardCandles.length; f++) {
          const fc = forwardCandles[f];
          holdingBars++;

          // 1. Check if trigger/entry filled
          if (!entryFilled) {
            const hitTrigger =
              setup.direction === 'BUY/LONG'
                ? fc.high >= setup.triggerPrice
                : fc.low <= setup.triggerPrice;

            if (hitTrigger) {
              entryFilled = true;
            } else {
              continue;
            }
          }

          // 2. Check TP / SL resolution
          if (setup.direction === 'BUY/LONG') {
            if (fc.high >= setup.tp1) {
              exitPrice = setup.tp1;
              outcome = 'WIN';
              outcomeResolved = true;
              break;
            }
            if (fc.low <= setup.sl) {
              exitPrice = setup.sl;
              outcome = 'LOSS';
              outcomeResolved = true;
              break;
            }
          } else {
            if (fc.low <= setup.tp1) {
              exitPrice = setup.tp1;
              outcome = 'WIN';
              outcomeResolved = true;
              break;
            }
            if (fc.high >= setup.sl) {
              exitPrice = setup.sl;
              outcome = 'LOSS';
              outcomeResolved = true;
              break;
            }
          }
        }

        if (entryFilled && outcomeResolved) {
          totalHoldingTimeBars += holdingBars;
          const posSizeUsd = 1000;
          const qty = posSizeUsd / setup.entryPrice;

          const pnlDelta =
            setup.direction === 'BUY/LONG'
              ? (exitPrice - setup.entryPrice) * qty
              : (setup.entryPrice - exitPrice) * qty;

          const fees = posSizeUsd * 0.001; // Round-trip 10 bps
          const slippage = posSizeUsd * 0.0006;
          const funding = posSizeUsd * 0.0002;

          const netTradePnl = pnlDelta - fees - slippage - funding;
          grossPnl += pnlDelta;
          totalFees += fees;
          totalSlippage += slippage;
          totalFunding += funding;

          currentEquity += netTradePnl;
          if (currentEquity > peakEquity) {
            peakEquity = currentEquity;
          }
          const dd = peakEquity - currentEquity;
          if (dd > maxDrawdown) {
            maxDrawdown = dd;
            maxDrawdownPercent = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
          }

          const pnlPercent = Math.round((netTradePnl / posSizeUsd) * 10000) / 100;

          if (outcome === 'WIN') {
            wins++;
            winSum += netTradePnl;
            if (netTradePnl > largestWin) largestWin = netTradePnl;
            currentWinStreak++;
            currentLossStreak = 0;
            if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
          } else {
            losses++;
            lossSum += Math.abs(netTradePnl);
            if (Math.abs(netTradePnl) > largestLoss) largestLoss = Math.abs(netTradePnl);
            currentLossStreak++;
            currentWinStreak = 0;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
          }

          trades.push({
            date: new Date(currentCandle.time).toISOString().split('T')[0],
            symbol,
            side: setup.direction === 'BUY/LONG' ? 'BUY' : 'SELL',
            entry: Math.round(setup.entryPrice * 100) / 100,
            exit: Math.round(exitPrice * 100) / 100,
            pnl: Math.round(netTradePnl * 100) / 100,
            result: outcome,
            pnlPercent,
          });

          // Skip ahead so we don't open overlapping duplicate signals for same candle range
          i += holdingBars;
        }
      }
    }

    const totalSetups = wins + losses;
    const winRate = totalSetups > 0 ? Math.round((wins / totalSetups) * 1000) / 10 : 0;
    const netPnl = Math.round((grossPnl - totalFees - totalSlippage - totalFunding) * 100) / 100;

    const avgWin = wins > 0 ? Math.round((winSum / wins) * 100) / 100 : 0;
    const avgLoss = losses > 0 ? Math.round((lossSum / losses) * 100) / 100 : 0;
    const profitFactor = lossSum > 0 ? Math.round((winSum / lossSum) * 100) / 100 : winSum > 0 ? 99 : 0;
    const expectancy =
      totalSetups > 0
        ? Math.round(((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss) * 100) / 100
        : 0;

    return {
      totalSetups,
      wins,
      losses,
      winRate,
      grossPnl: Math.round(grossPnl * 100) / 100,
      fees: Math.round(totalFees * 100) / 100,
      funding: Math.round(totalFunding * 100) / 100,
      slippage: Math.round(totalSlippage * 100) / 100,
      netPnl,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: Math.round(largestWin * 100) / 100,
      largestLoss: Math.round(largestLoss * 100) / 100,
      profitFactor,
      expectancy,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
      averageHoldingTimeMinutes: totalSetups > 0 ? Math.round((totalHoldingTimeBars / totalSetups) * 15) : 0,
      consecutiveWinsMax: maxWinStreak,
      consecutiveLossesMax: maxLossStreak,
      sampleSize: totalSetups,
      trades: trades.slice(-50), // Send last 50 trades
    };
  }
}
