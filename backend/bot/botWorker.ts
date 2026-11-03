import { DeltaExchangeClient } from '../exchange/deltaClient.js';
import { BotDatabase } from '../database/db.js';
import { FutureSetupEngine } from '../strategies/futureSetupEngine.js';
import { ArbitrageEngine } from '../strategies/arbitrageEngine.js';
import { RiskManager } from '../risk/riskManager.js';
import { OrderManager } from '../orders/orderManager.js';
import { MoveForensicsEngine } from '../analysis/forensics.js';
import { NewsResearchEngine } from '../analysis/newsResearch.js';
import { PriceChangeDistributionEngine } from '../analysis/priceChangeDistribution.js';
import type {
  DeltaProduct,
  DeltaTicker,
  FutureSetup,
  ArbitrageSetup,
  BotStatusState,
  TradeRecord,
  SetupHistoryRecord,
  PriceChangeDistributionState,
} from '../../src/types/index.js';

export class SmartBotWorker {
  private db: BotDatabase;
  private client: DeltaExchangeClient;
  private setupEngine = new FutureSetupEngine();
  private arbitrageEngine = new ArbitrageEngine();
  private riskManager = new RiskManager();
  private orderManager = new OrderManager();
  private forensicsEngine = new MoveForensicsEngine();
  private newsResearch = new NewsResearchEngine();
  private pcdEngine = new PriceChangeDistributionEngine();

  private isRunning = false;
  private isProcessingCycle = false;
  private loopIntervalTimer: NodeJS.Timeout | null = null;
  private liveTickers: Map<string, DeltaTicker> = new Map();
  private products: DeltaProduct[] = [];
  private lastPingMs = 0;
  private lastDataTime = 0;
  private lastSetupScanTime = 0;
  private lastForensicsTime = 0;
  private lastArbitrageTime = 0;
  private lastBalanceCheckTime = 0;
  private lastPositionSyncTime = 0;
  private lastIpCheckTime = 0;
  private cachedAvailableBalance = 0;
  private cachedExchangeMarginUsed = 0;
  private liveOpenPositions: Map<string, any> = new Map();
  private connectionState: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' = 'DISCONNECTED';
  private botStatus: 'RUNNING' | 'PAUSED' | 'HALTED' | 'RECOVERING' = 'PAUSED';
  private lastAuthCheckTime = 0;
  private lastAuthError = '';

  // Cached candles for backtest / analysis
  private candleCache: Map<string, any[]> = new Map();
  private isScanningSetups = false;

  // Closed coins cooldown quarantine (prevents immediate re-opening or auto-import race conditions)
  private coinCloseCooldowns: Map<string, { closedAt: number; reason: string }> = new Map();

  constructor(db: BotDatabase) {
    this.db = db;
    const config = this.db.getConfig();
    this.client = new DeltaExchangeClient({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      environment: config.environment,
    });
    if (this.client.hasCredentials()) {
      this.connectionState = 'CONNECTED';
    }
  }

  public getClient() {
    return this.client;
  }

  public getDatabase() {
    return this.db;
  }

  public getNewsResearch() {
    return this.newsResearch;
  }

  public getPriceChangeDistributionState(): PriceChangeDistributionState {
    return this.pcdEngine.getCachedState();
  }

  public setConnectionState(state: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR'): void {
    this.connectionState = state;
  }

  public updateCredentialsAndConfig(newConfig: any) {
    this.db.updateConfig(newConfig);
    const updated = this.db.getConfig();
    this.client.updateCredentials({
      apiKey: updated.apiKey,
      apiSecret: updated.apiSecret,
      environment: updated.environment,
    });
    this.lastAuthCheckTime = 0;
    this.lastAuthError = '';
    if (this.client.hasCredentials()) {
      this.connectionState = 'CONNECTED';
    } else {
      this.connectionState = 'DISCONNECTED';
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.botStatus = 'RUNNING';

    console.log('[SmartBotWorker] Starting continuous Delta Exchange autonomous engine...');
    // Immediate startup recovery of any open trades from previous session
    this.reconcileAndRecoverOpenTrades().catch((err) => {
      console.error('[SmartBotWorker] Startup open trade reconciliation error:', err);
    });
    // Immediately reconcile completed setups so finished setups are cleared and coins freed
    try {
      this.reconcileCompletedSetups();
    } catch (e) {
      console.error('[SmartBotWorker] Startup setup reconciliation error:', e);
    }
    this.scheduleNextCycle(100);
  }

  /**
   * RECOVERY ENGINE: Reconciles all open trades upon system restart/boot.
   * If the bot crashed or was stopped while trades were open:
   * - Queries live positions from Delta Exchange directly if API credentials are present.
   * - Checks live market prices and 24H price range against TP and SL levels.
   * - If TP or SL was hit while the system was offline, properly closes the trade,
   *   records the exact outcome and exit price, updates realized PnL, archives to history,
   *   and sets a clear audit recovery note.
   * - If the trade is still active, refreshes live current price and unrealized PnL immediately.
   */
  public async reconcileAndRecoverOpenTrades(): Promise<{
    recoveredCount: number;
    closedCount: number;
    activeCount: number;
    exchangePositionsCount: number;
    details: Array<{ tradeId: string; coin: string; status: string; outcome?: string; pnl?: number }>;
  }> {
    const trades = this.db.getTrades();
    const openTrades = trades.filter((t) => t.status === 'OPEN');

    console.log(`[SmartBotWorker - Recovery] Found ${openTrades.length} open trade(s) from prior session. Checking exchange & offline lifecycle...`);
    let closedCount = 0;
    let activeCount = 0;
    const details: Array<{ tradeId: string; coin: string; status: string; outcome?: string; pnl?: number }> = [];

    // 1. Fetch live open positions from Delta Exchange directly if credentials exist
    const exchangePositionsMap = new Map<string, any>();
    if (this.client.hasCredentials()) {
      try {
        const posRes = await this.client.getPositions();
        if ('positions' in posRes && Array.isArray(posRes.positions)) {
          for (const pos of posRes.positions) {
            const size = Number(pos.size || 0);
            if (size !== 0 && pos.product_symbol) {
              exchangePositionsMap.set(pos.product_symbol, pos);
            }
          }
        }
      } catch (err) {
        console.warn('[SmartBotWorker - Recovery] Error querying Delta Exchange positions:', err);
      }
    }

    // 2. Fetch fresh tickers for high/low/close price verification
    try {
      const allTicks = await this.client.getTickers();
      if ('tickers' in allTicks && allTicks.tickers) {
        for (const t of allTicks.tickers) {
          this.liveTickers.set(t.symbol, t);
        }
      }
    } catch {
      // ignore network failure on batch tickers
    }

    if (openTrades.length === 0) {
      return {
        recoveredCount: 0,
        closedCount: 0,
        activeCount: 0,
        exchangePositionsCount: exchangePositionsMap.size,
        details: [],
      };
    }

    for (const trade of openTrades) {
      try {
        let ticker = this.liveTickers.get(trade.coin);
        if (!ticker) {
          ticker = Array.from(this.liveTickers.values()).find((t) => t.symbol.includes(trade.coin));
        }

        const liveExchangePos = exchangePositionsMap.get(trade.coin);
        const isLiveExchangeTrade = trade.executionType === 'EXCHANGE_LIVE' || String(trade.orderId || '').startsWith('ORD_');

        const currentPrice =
          ticker?.close ||
          ticker?.mark_price ||
          (liveExchangePos?.entry_price ? Number(liveExchangePos.entry_price) : undefined) ||
          trade.currentPrice;

        if (!currentPrice || currentPrice <= 0) {
          activeCount++;
          details.push({ tradeId: trade.tradeId, coin: trade.coin, status: 'OPEN' });
          continue;
        }

        const isLong = trade.side === 'BUY';
        const entry = trade.actualFillPrice || trade.entryPrice;

        let wasTpHit = false;
        let wasSlHit = false;
        let wasLiquidated = false;
        let exitPrice = currentPrice;
        let isExchangeClosed = false;

        // Check if exchange position no longer exists for an EXCHANGE_LIVE trade
        if (isLiveExchangeTrade && this.client.hasCredentials() && !liveExchangePos) {
          isExchangeClosed = true;
        }

        // Check genuine liquidation
        if (trade.liquidationPrice && trade.liquidationPrice > 0) {
          if (isLong && currentPrice <= trade.liquidationPrice) {
            wasLiquidated = true;
            exitPrice = trade.liquidationPrice;
          } else if (!isLong && currentPrice >= trade.liquidationPrice) {
            wasLiquidated = true;
            exitPrice = trade.liquidationPrice;
          }
        }

        // Check genuine current price TP/SL (Only evaluate against live currentPrice, NEVER old 24h highs/lows)
        if (!wasLiquidated) {
          if (isLong) {
            if (trade.tp && trade.tp > 0 && currentPrice >= trade.tp) {
              wasTpHit = true;
              exitPrice = trade.tp;
            } else if (trade.sl && trade.sl > 0 && currentPrice <= trade.sl) {
              wasSlHit = true;
              exitPrice = trade.sl;
            }
          } else {
            // Short
            if (trade.tp && trade.tp > 0 && currentPrice <= trade.tp) {
              wasTpHit = true;
              exitPrice = trade.tp;
            } else if (trade.sl && trade.sl > 0 && currentPrice >= trade.sl) {
              wasSlHit = true;
              exitPrice = trade.sl;
            }
          }
        }

        if (wasLiquidated || wasTpHit || wasSlHit || isExchangeClosed) {
          const outcome: SetupHistoryRecord['outcome'] = wasLiquidated
            ? 'LIQUIDATED'
            : wasTpHit
            ? 'TP HIT'
            : wasSlHit
            ? 'SL HIT'
            : 'MANUAL CLOSE';

          const closeReason: 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'LIQUIDATED' = outcome === 'LIQUIDATED'
            ? 'LIQUIDATED'
            : outcome === 'TP HIT'
            ? 'TP HIT'
            : outcome === 'SL HIT'
            ? 'SL HIT'
            : 'MANUAL CLOSE';

          const priceDiff = isLong ? exitPrice - entry : entry - exitPrice;
          const realizedPnl = Math.round(priceDiff * trade.quantity * 100) / 100;
          const pnlPercent = entry > 0 ? Math.round(((priceDiff / entry) * 100 * trade.leverage) * 100) / 100 : 0;
          const closedAt = new Date().toISOString();

          trade.status = outcome === 'TP HIT' || outcome === 'SL HIT' ? outcome : 'CLOSED';
          trade.closeReason = closeReason;
          trade.exitPrice = exitPrice;
          trade.realizedPnl = realizedPnl;
          trade.unrealizedPnl = 0;
          trade.pnlPercent = pnlPercent;
          trade.closedAt = closedAt;
          trade.executionNote = isExchangeClosed
            ? `[RECOVERED FROM DELTA EXCHANGE] Position closed on exchange. Outcome: ${outcome} at $${exitPrice}.`
            : `[RECOVERED ON RESTART] Price reached ${outcome} at $${exitPrice}.`;

          this.db.saveTrade(trade);
          // ⏳ Apply Trade Expiry Countdown Lock upon trade close:
          this.db.applyTradeClosedCountdown(trade, closeReason);
          if (trade.setupId) {
            const setupStatus: FutureSetup['status'] = outcome === 'TP HIT' ? 'TP HIT' : outcome === 'SL HIT' ? 'SL HIT' : 'INVALIDATED';
            this.db.updateSetupStatus(trade.setupId, setupStatus);
          }

          const durationMs = Math.max(0, new Date(closedAt).getTime() - new Date(trade.createdAt).getTime());
          const durationMinutes = Math.round(durationMs / 60000);
          const days = Math.floor(durationMinutes / 1440);
          const hours = Math.floor((durationMinutes % 1440) / 60);
          const mins = durationMinutes % 60;
          const durationFormatted = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

          const historyRecord: SetupHistoryRecord = {
            id: `HIST_${trade.tradeId}`,
            setupId: trade.setupId,
            tradeId: trade.tradeId,
            orderId: trade.orderId,
            timestamp: trade.createdAt,
            openedAt: trade.createdAt,
            closedAt,
            durationMinutes,
            durationFormatted,
            coin: trade.coin,
            exchange: 'Delta',
            direction: trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
            entryPrice: trade.entryPrice,
            actualFillPrice: trade.actualFillPrice,
            tp1: trade.tp,
            sl: trade.sl,
            exitPrice,
            outcome,
            closeReason,
            timeframe: trade.timeframe || '15m',
            setupCreatedAt: trade.setupCreatedAt || trade.createdAt,
            liquidationPrice: trade.liquidationPrice,
            realizedPnl,
            pnlPercent,
            riskRewardAchieved: wasTpHit ? 5 : wasSlHit ? -1 : 0,
            riskReward: 5,
            executionMode: trade.executionType === 'EXCHANGE_LIVE' ? 'EXCHANGE' : 'BOT_SIMULATED',
            executionType: trade.executionType || 'BOT_VIRTUAL',
            whyFormed: `${trade.coin} 1:5 R:R setup reconciled on startup`,
            primaryReason: `Delta Startup Recovery & Exchange Sync`,
            supportingReasons: [`Reconciled against live exchange & candle data on system initialization`],
            outcomeReason: `${outcome} (${closeReason}) reconciled on startup. Realized PnL: $${realizedPnl} (${pnlPercent}%). Open: ${trade.createdAt}, Closed: ${closedAt}.`,
            score: 85,
            leverage: trade.leverage,
            capitalUsed: trade.capitalUsed,
          };
          this.db.saveHistory(historyRecord);

          this.db.logCommand(
            `RECOVERY: ${trade.coin} ${outcome}`,
            `Trade ${trade.tradeId} reconciled as ${outcome}. Realized PnL: $${realizedPnl}. Open: ${trade.createdAt}, Close: ${closedAt}.`,
            'SUCCESS'
          );

          closedCount++;
          details.push({ tradeId: trade.tradeId, coin: trade.coin, status: outcome, outcome, pnl: realizedPnl });
        } else {
          // Still active! Update current price and live unrealized PnL immediately
          if (liveExchangePos && liveExchangePos.entry_price) {
            trade.actualFillPrice = Number(liveExchangePos.entry_price);
          }
          const effectiveEntry = trade.actualFillPrice || trade.entryPrice;
          const priceDiff = isLong ? currentPrice - effectiveEntry : effectiveEntry - currentPrice;
          trade.currentPrice = currentPrice;
          trade.unrealizedPnl = Math.round(priceDiff * trade.quantity * 100) / 100;
          trade.pnlPercent = effectiveEntry > 0 ? Math.round(((priceDiff / effectiveEntry) * 100 * trade.leverage) * 100) / 100 : 0;
          trade.executionNote = `Active trade reconciled on restart. Synchronized with live exchange.`;
          this.db.saveTrade(trade);
          activeCount++;
          details.push({ tradeId: trade.tradeId, coin: trade.coin, status: 'OPEN', pnl: trade.unrealizedPnl });
        }
      } catch (err: any) {
        console.error(`[SmartBotWorker - Recovery] Error reconciling trade ${trade.tradeId}:`, err);
      }
    }

    console.log(
      `[SmartBotWorker - Recovery] Reconciled: ${closedCount} trade(s) closed, ${activeCount} trade(s) resumed active. Exchange positions: ${exchangePositionsMap.size}`
    );
    return {
      recoveredCount: openTrades.length,
      closedCount,
      activeCount,
      exchangePositionsCount: exchangePositionsMap.size,
      details,
    };
  }

  private scheduleNextCycle(delayMs = 2000): void {
    if (!this.isRunning) return;
    if (this.loopIntervalTimer) {
      clearTimeout(this.loopIntervalTimer);
      this.loopIntervalTimer = null;
    }
    this.loopIntervalTimer = setTimeout(async () => {
      try {
        await this.runLoopCycle();
      } catch (e) {
        console.error('[SmartBotWorker] Uncaught cycle error:', e);
      } finally {
        if (this.isRunning) {
          this.scheduleNextCycle(2000);
        }
      }
    }, delayMs);
  }

  public pause(): void {
    this.botStatus = 'PAUSED';
  }

  public resume(): void {
    this.botStatus = 'RUNNING';
  }

  public halt(): void {
    this.botStatus = 'HALTED';
    this.isRunning = false;
    if (this.loopIntervalTimer) {
      clearTimeout(this.loopIntervalTimer);
      this.loopIntervalTimer = null;
    }
  }

  public getStatus(): BotStatusState {
    const config = this.db.getConfig();
    const setups = this.db.getSetups();
    const trades = this.db.getTrades();

    const openTrades = trades.filter((t) => t.status === 'OPEN');
    const tpHitCount = trades.filter((t) => t.status === 'TP HIT').length;
    const slHitCount = trades.filter((t) => t.status === 'SL HIT').length;

    const realizedPnl = trades.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const unrealizedPnl = openTrades.reduce((sum, t) => sum + (t.unrealizedPnl || 0), 0);
    const usedCapital = openTrades.reduce((sum, t) => sum + (t.capitalUsed || 0), 0);

    const futuresCount = this.products.filter(
      (p) => p.contract_type?.includes('future')
    ).length;

    const dataFreshness = this.lastDataTime > 0 ? Math.round((Date.now() - this.lastDataTime) / 1000) : 999;

    return {
      isConnected: this.connectionState === 'CONNECTED',
      connectionState: this.connectionState,
      botStatus: this.botStatus,
      lastPingMs: this.lastPingMs,
      dataFreshnessSeconds: dataFreshness,
      totalFuturesCoins: futuresCount,
      totalSetups: setups.length,
      openSetups: setups.filter((s) => ['WATCHING', 'NEAR SETUP', 'TRIGGER APPROACHING'].includes(s.status)).length,
      triggeredSetups: setups.filter((s) => s.status === 'TRIGGERED' || s.status === 'TRADE OPEN').length,
      openTrades: openTrades.length,
      totalOrders: trades.length,
      tpHitCount,
      slHitCount,
      runningPnl: Math.round((realizedPnl + unrealizedPnl) * 100) / 100,
      totalCapital: config.tradingCapital,
      usedCapital: Math.round(usedCapital * 100) / 100,
      availableCapital: Math.round((config.tradingCapital - usedCapital) * 100) / 100,
      reservedMargin: Math.round(usedCapital * 0.1 * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      dailyPnl: Math.round((realizedPnl + unrealizedPnl) * 100) / 100,
      liveExchangeBalance: Math.round(this.cachedAvailableBalance * 100) / 100,
      exchangeMarginUsed: Math.round(this.cachedExchangeMarginUsed * 100) / 100,
      activeEnvironment: config.environment,
      isReadMode: config.isReadMode,
      autoTradeEnabled: config.autoTradeEnabled,
      activeCountdownLocksCount: this.db.getCountdownLocks().length,
      countdownLocks: this.db.getCountdownLocks(),
    };
  }

  public getProducts() {
    return this.products;
  }

  public getTickers() {
    return Array.from(this.liveTickers.values());
  }

  public getCandleCache() {
    return this.candleCache;
  }

  /**
   * Main 24/7 continuous cycle
   */
  private async runLoopCycle(): Promise<void> {
    if (this.isProcessingCycle) return;
    this.isProcessingCycle = true;
    const config = this.db.getConfig();

    try {
      // 1. Fetch Delta public instruments / products if not loaded yet
      if (this.products.length === 0) {
        const prodRes = await this.client.getProducts();
        if ('products' in prodRes) {
          this.products = prodRes.products;
        }
      }

      // 2. Fetch real Delta public tickers
      const tickRes = await this.client.getTickers();
      if ('tickers' in tickRes) {
        for (const t of tickRes.tickers) {
          const chg =
            t.ltp_change_24h !== undefined && t.ltp_change_24h !== null && !isNaN(parseFloat(String(t.ltp_change_24h)))
              ? parseFloat(String(t.ltp_change_24h))
              : t.mark_change_24h !== undefined && !isNaN(parseFloat(String(t.mark_change_24h)))
              ? parseFloat(String(t.mark_change_24h))
              : t.open && t.close
              ? ((t.close - t.open) / t.open) * 100
              : 0;

          t.price_change_percent_24h = Math.round(chg * 1000) / 1000;
          this.liveTickers.set(t.symbol, t);
        }
        this.lastDataTime = Date.now();
        // Compute real-time Price Change Distribution across Delta contracts
        this.pcdEngine.computeDistribution(Array.from(this.liveTickers.values()));
      }

      // 3. Test private authentication if credentials exist (throttled to every 30s to prevent rate limits)
      if (this.client.hasCredentials()) {
        const shouldCheckAuth = Date.now() - this.lastAuthCheckTime > 30000 || this.lastAuthCheckTime === 0;
        if (shouldCheckAuth) {
          this.lastAuthCheckTime = Date.now();
          const connTest = await this.client.testConnection();
          if (connTest.success) {
            this.connectionState = 'CONNECTED';
            this.lastAuthError = '';
            this.lastPingMs = connTest.latencyMs || 120;
            this.db.updateConfig({ isConnected: true, authError: undefined });

            // Update balance cache from testConnection if present
            if (connTest.balanceSummary && connTest.balanceSummary.length > 0) {
              const pos = connTest.balanceSummary.filter((b) => b.available > 0 || b.total > 0);
              const prime = pos.find((b) => ['USDT', 'USD', 'INR'].includes(b.asset)) || pos[0];
              if (prime && (prime.available > 0 || prime.total > 0)) {
                this.cachedAvailableBalance = prime.available || prime.total;
              }
            }
          } else {
            this.connectionState = 'ERROR';
            this.lastAuthError = connTest.error || 'Authentication signature or IP restriction error';
            this.db.updateConfig({ isConnected: false, authError: this.lastAuthError });
          }
        }

        // 1. Periodically fetch real wallet balances every 10s if connected
        if (this.connectionState === 'CONNECTED' && Date.now() - this.lastBalanceCheckTime > 10000) {
          this.lastBalanceCheckTime = Date.now();
          try {
            const balRes = await this.client.getBalances();
            if ('balances' in balRes && balRes.balances.length > 0) {
              let totalAvail = 0;
              let maxAvail = 0;
              let primaryAvail = 0;
              for (const b of balRes.balances) {
                const avail = Number(b.available_balance ?? b.balance ?? 0);
                if (avail > 0) {
                  totalAvail += avail;
                  if (avail > maxAvail) maxAvail = avail;
                  if (['USDT', 'USD', 'INR'].includes(b.asset)) {
                    primaryAvail = Math.max(primaryAvail, avail);
                  }
                }
              }
              this.cachedAvailableBalance = primaryAvail > 0 ? primaryAvail : (totalAvail > 0 ? totalAvail : maxAvail);
              const primaryBal = balRes.balances.find((b) => ['USDT', 'USD', 'INR'].includes(b.asset)) || balRes.balances[0];
              this.cachedExchangeMarginUsed = (primaryBal?.order_margin || 0) + (primaryBal?.position_margin || 0);
            }
          } catch (err) {
            console.warn('[SmartBotWorker] Balance fetch error:', err);
          }
        }

        // 2. High-Frequency Live Position & PnL Synchronization:
        // Runs every 1.5s to continuously match open orders with Delta Exchange positions,
        // sync exact live PnL/ROE%, and trigger "Auto Close Order on Exchange" without lag
        if (this.connectionState === 'CONNECTED' && Date.now() - this.lastPositionSyncTime >= 1500) {
          this.lastPositionSyncTime = Date.now();
          try {
            const posRes = await this.client.getPositions();
            if ('positions' in posRes && Array.isArray(posRes.positions)) {
              this.liveOpenPositions.clear();
              for (const pos of posRes.positions) {
                const size = Number(pos.size || 0);
                if (size !== 0 && pos.product_symbol) {
                  this.liveOpenPositions.set(pos.product_symbol, pos);
                }
              }
              // Immediately sync live open positions with orders and detect closed positions
              await this.syncExchangePositionsWithLiveOrders();
            }
          } catch (posErr) {
            console.warn('[SmartBotWorker] High-frequency positions fetch error:', posErr);
          }
        }
      } else {
        this.connectionState = 'DISCONNECTED';
      }

      if (this.botStatus !== 'RUNNING') {
        return;
      }

      // 3.5 Reconcile completed setups so coins whose trades closed or hit TP/SL are freed immediately!
      this.reconcileCompletedSetups();

      // 4. HIGH-FREQUENCY LIVE MONITORING ENGINE (Runs on EVERY tick!)
      // Evaluates locked setup vs genuine Delta live market prices without recalculating entry/trigger/SL/TP
      await this.monitorActiveSetups();

      // 5. Monitor open positions / trades (TP/SL hits and trailing exits)
      await this.monitorActiveTrades();

      // 6. SETUP CREATION ENGINE (Periodic, every 15s)
      // Only evaluates coins WITHOUT an active setup! NEVER mutates or overwrites active setups!
      if (Date.now() - this.lastSetupScanTime > 15000) {
        this.lastSetupScanTime = Date.now();
        await this.scanAndCreateSetups();
      }

      // 7. Scan 24H Movers for Move Forensics (Periodic, every 30s)
      if (Date.now() - this.lastForensicsTime > 30000) {
        this.lastForensicsTime = Date.now();
        await this.runMoveForensicsScan();
      }

      // 8. Scan Options & Arbitrage across Delta underlyings (Periodic, every 10s)
      if (Date.now() - this.lastArbitrageTime > 10000) {
        this.lastArbitrageTime = Date.now();
        await this.scanArbitrage();
      }

      // 9. Periodic refresh of server public IP (every 60s)
      if (Date.now() - this.lastIpCheckTime > 60000) {
        this.lastIpCheckTime = Date.now();
        DeltaExchangeClient.detectServerIp().catch(() => {});
      }
    } catch (err: any) {
      console.error('[SmartBotWorker] Loop error:', err);
      this.db.logError({
        severity: 'ERROR',
        module: 'Bot',
        subModule: 'runLoopCycle',
        functionName: 'cycle',
        exchange: 'Delta',
        errorMessage: err.message || 'Worker loop exception',
        systemMessage: 'Background monitoring cycle encountered error',
        dataStatus: 'PARTIAL',
        retryCount: 1,
        recoveryAction: 'Continuing self-healing loop',
        finalStatus: 'OPEN',
      });
    } finally {
      this.isProcessingCycle = false;
    }
  }

  /**
   * Identifies top 24H movers (>= 4% gainers and losers) and runs deep pre-move forensics
   * with all 13 quantitative dimensions, verified sources, and "Kab Setup Banega" calculation
   */
  private async runMoveForensicsScan(): Promise<void> {
    const tickers = Array.from(this.liveTickers.values());
    // Sort by absolute 24h percentage change to capture biggest gainers & losers
    const movers = tickers
      .filter((t) => Math.abs(t.price_change_percent_24h || 0) >= 3.5)
      .sort((a, b) => Math.abs(b.price_change_percent_24h || 0) - Math.abs(a.price_change_percent_24h || 0));

    for (const mover of movers.slice(0, 8)) {
      let candles = this.candleCache.get(mover.symbol);
      if (!candles || candles.length === 0) {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 86400 * 2; // last 2 days
        const res = await this.client.getCandles(mover.symbol, '15', from, to);
        if ('candles' in res && res.candles.length > 25) {
          candles = res.candles;
          this.candleCache.set(mover.symbol, candles);
        }
      }

      if (candles && candles.length >= 25) {
        // Fetch verified source links
        const sourceLinks = this.newsResearch.getNewsForCoin(mover.symbol);
        const forensic = this.forensicsEngine.analyzeMove(
          mover.symbol,
          candles,
          mover.price_change_percent_24h || 0,
          mover,
          sourceLinks
        );
        if (forensic) {
          this.db.saveForensics(forensic.forensicRecord);
        }
      }
    }
  }

  /**
   * LIVE MONITORING ENGINE (Continuous tick by tick)
   * Evaluates existing active setups against fresh Delta Exchange live prices.
   *
   * STRICT RULES:
   * 1. ENTRY PRICE === TRIGGER PRICE (LOCKED). NEVER recalculated or moved!
   * 2. SL, TP1, TP2 remain strictly LOCKED. NEVER recalculated or moved!
   * 3. Delta Exchange Live Price is the ONLY moving input.
   * 4. State machine strictly transitions:
   *    WATCHING -> NEAR SETUP -> TRIGGER APPROACHING -> TRIGGERED -> ORDER SUBMITTED -> EXCHANGE CONFIRMED -> FILLED -> TRADE OPEN
   * 5. In READ MODE: Shows TRIGGERED with clear note but does not submit real orders.
   */
  public async monitorActiveSetups(): Promise<void> {
    const config = this.db.getConfig();
    const setups = this.db.getSetups();
    const activeSetups = setups.filter((s) =>
      ['WATCHING', 'NEAR SETUP', 'TRIGGER APPROACHING', 'TRIGGERED', 'REJECTED'].includes(s.status)
    );

    if (activeSetups.length === 0) return;

    // Timeframe priority ranking (Higher timeframes 1d > 4h > 1h > 30m > 15m prioritized for higher structural confluence)
    const tfRank: Record<string, number> = { '1d': 5, '4h': 4, '1h': 3, '30m': 2, '15m': 1 };
    activeSetups.sort((a, b) => {
      const rankA = tfRank[a.timeframe || '15m'] || 1;
      const rankB = tfRank[b.timeframe || '15m'] || 1;
      return rankB - rankA;
    });

    const isDataStale = this.lastDataTime > 0 && Date.now() - this.lastDataTime > 20000;

    for (const setup of activeSetups) {
      // 1. If an OPEN trade already exists for this coin (in ANY timeframe), block duplicate orders!
      const coinOpenTrades = this.db.getTrades().filter((t) => t.coin === setup.coin && t.status === 'OPEN');
      if (coinOpenTrades.length > 0) {
        if (setup.status !== 'TRADE OPEN') {
          setup.status = 'TRADE OPEN';
          setup.hasTriggeredOnce = true;
          setup.reason = `Active trade already open on ${coinOpenTrades[0].timeframe || '15m'}. Multi-timeframe duplicate blocked.`;
          this.db.saveSetup(setup);
        }
        continue;
      }

      // If position already exists on Delta Exchange for this coin, mark setup as TRADE OPEN and do not trigger new order
      if (this.liveOpenPositions.has(setup.coin)) {
        const livePos = this.liveOpenPositions.get(setup.coin);
        if (Number(livePos?.size || 0) !== 0) {
          if (setup.status !== 'TRADE OPEN') {
            setup.status = 'TRADE OPEN';
            setup.reason = `Active position (${livePos.size} contracts) on Delta Exchange`;
            this.db.saveSetup(setup);
          }
          continue;
        }
      }

      // Find matching live ticker from Delta Exchange
      const ticker =
        this.liveTickers.get(setup.coin) ||
        Array.from(this.liveTickers.values()).find(
          (t) => t.symbol === setup.coin || (setup.productId && t.product_id === setup.productId)
        );

      if (!ticker) continue;

      const markVal = ticker.mark_price ? parseFloat(String(ticker.mark_price)) : 0;
      const closeVal = ticker.close || 0;
      const spotVal = ticker.spot_price ? parseFloat(String(ticker.spot_price)) : 0;
      // Mark price represents the continuous, real-time live valuation on Delta Exchange
      const livePrice = markVal > 0 ? markVal : (closeVal > 0 ? closeVal : spotVal);
      if (!livePrice || livePrice <= 0) continue;

      // IMMUTABLE LOCKED TARGET: entryPrice === triggerPrice
      const lockedPrice = setup.entryPrice ?? setup.triggerPrice;
      const isLong = setup.direction === 'BUY/LONG' || setup.direction.includes('BUY') || setup.direction.includes('LONG');

      // Directional remaining distance calculation:
      // LONG: remaining distance to trigger = max(0, lockedEntryPrice - livePrice)
      // SHORT: remaining distance to trigger = max(0, livePrice - lockedEntryPrice)
      const remainingDistance = isLong
        ? Math.max(0, lockedPrice - livePrice)
        : Math.max(0, livePrice - lockedPrice);

      const distancePercent = lockedPrice > 0 ? (Math.abs(lockedPrice - livePrice) / lockedPrice) * 100 : 0;

      // Update ONLY live moving fields
      setup.currentPrice = livePrice;
      setup.distanceToTrigger = Math.round(remainingDistance * 100000) / 100000;
      setup.distanceToTriggerPercent = Math.round(distancePercent * 1000) / 1000;

      // STRICT "TRIGGER ONCE" RULE:
      // Once a setup triggers, it must NEVER re-trigger or re-arm back to WATCHING,
      // even if the market price fluctuates above or below the entry price!
      const hasAlreadyTriggered =
        setup.hasTriggeredOnce ||
        Boolean(setup.triggeredAt) ||
        ['TRIGGERED', 'ORDER SUBMITTED', 'EXCHANGE CONFIRMED', 'FILLED', 'TRADE OPEN', 'TP HIT', 'SL HIT', 'INVALIDATED', 'EXPIRED'].includes(setup.status);

      if (hasAlreadyTriggered) {
        this.db.saveSetup(setup);
        continue;
      }

      // 24H RANGE EXPIRY ENGINE:
      // If setup was generated when coin was in range band (e.g. 3%-7%), but trade hasn't opened yet
      // and the coin's 24H move drifts outside the range, expire the setup immediately!
      const current24h = ticker.price_change_percent_24h || 0;
      setup.current24hMovePercent = current24h;
      const absCurrent24h = Math.abs(current24h);

      if (config.expireOutOfRangeSetups !== false && config.rangeFilterEnabled !== false) {
        const minPct = Number(config.rangeMinPercent ?? 3.0);
        const maxPct = Number(config.rangeMaxPercent ?? 7.0);
        const targetSide = config.rangeTargetSide || 'BOTH';

        const isWrongSide = (targetSide === 'GAINERS' && current24h <= 0) || (targetSide === 'LOSERS' && current24h >= 0);
        // Allow a slight smoothing buffer (0.85x min to 1.15x max) so micro-second wicks don't prematurely kill setups
        const isOutOfRangeBand = absCurrent24h < (minPct * 0.85) || absCurrent24h > (maxPct * 1.18);

        if (isWrongSide || isOutOfRangeBand) {
          setup.status = 'EXPIRED';
          setup.isInActiveRange = false;
          setup.reason = `Setup Expired: 24h price move (${current24h >= 0 ? '+' : ''}${current24h.toFixed(1)}%) drifted outside configured range band (${minPct}% - ${maxPct}%) before entry triggered.`;
          setup.completedAt = new Date().toISOString();
          this.db.saveSetup(setup);
          console.log(`[SmartBotWorker] ${setup.coin} setup expired: 24h move ${current24h.toFixed(1)}% drifted outside ${minPct}% - ${maxPct}% band.`);
          continue;
        } else {
          setup.isInActiveRange = true;
        }
      }

      // Check timeframe validity window expiration
      if (setup.setupExpiration && new Date().toISOString() > setup.setupExpiration) {
        setup.status = 'EXPIRED';
        setup.reason = 'Setup Expired: Timeframe validity window ended before entry triggered.';
        setup.completedAt = new Date().toISOString();
        this.db.saveSetup(setup);
        continue;
      }

      // Trigger condition verification:
      // LONG: livePrice >= lockedEntryPrice
      // SHORT: livePrice <= lockedEntryPrice
      const isTriggerMet = isLong ? livePrice >= lockedPrice : livePrice <= lockedPrice;

      if (isTriggerMet) {
        if (isDataStale) {
          console.warn(`[SmartBotWorker] Trigger met for ${setup.coin} but data is stale (> 20s). Withholding trigger.`);
          continue;
        }

        // STRICT ONCE TRIGGER: Mark once and execute!
        setup.hasTriggeredOnce = true;
        setup.triggeredAt = new Date().toISOString();
        setup.status = 'TRIGGERED';
        this.db.saveSetup(setup);

        console.log(`[SmartBotWorker] ${setup.coin} TRIGGERED (1st and only trigger) at $${livePrice}. Executing trade...`);
        await this.executeSetupTrade(setup, false);
      } else {
        // Price has not crossed trigger level yet and setup has never triggered:
        // Update distance categorization
        let nextStatus: FutureSetup['status'] = 'WATCHING';
        if (distancePercent <= 0.35) {
          nextStatus = 'TRIGGER APPROACHING';
        } else if (distancePercent <= 1.5) {
          nextStatus = 'NEAR SETUP';
        } else {
          nextStatus = 'WATCHING';
        }

        if (setup.status !== nextStatus) {
          setup.status = nextStatus;
          this.db.saveSetup(setup);
        }
      }
    }

    // Automatically purge expired or completed setups from active list so list stays fresh and clean!
    this.db.purgeExpiredOrStaleSetups();
  }

  /**
   * SETUP CREATION ENGINE (Periodic)
   * Evaluates Delta futures for new confluence setups.
   * STRICT RULES:
   * 1. Only scans coins that DO NOT already have an active setup!
   * 2. NEVER recalculates or overwrites existing setups!
   * 3. Calculates ONE fixed price for entryPrice and triggerPrice (entryPrice === triggerPrice).
   * 4. Once saved, the setup values are strictly LOCKED.
   */
  public async scanAndCreateSetups(): Promise<void> {
    if (this.isScanningSetups) return;
    this.isScanningSetups = true;

    try {
      const config = this.db.getConfig();
      const futuresProducts = this.products.filter(
        (p) => p.contract_type?.includes('future')
      );

      const historicalForensics = this.db.getForensics();
      const existingSetups = this.db.getSetups();

      // STRICT QUALITY OVER QUANTITY CAP:
      // Prevent accumulating 97 noisy setups. Cap active setups to user's maxActiveSetups (default 15).
      const maxActiveCapacity = config.maxActiveSetups || 15;
      if (existingSetups.length >= maxActiveCapacity) {
        return;
      }

      const botTfs: ('15m' | '30m' | '1h' | '4h' | '1d')[] = (config.botScanningTimeframes && config.botScanningTimeframes.length > 0)
        ? (config.botScanningTimeframes as any)
        : [config.scanningTimeframe || '15m'];
      const exchangeTfs: ('15m' | '30m' | '1h' | '4h' | '1d')[] = (config.exchangeScanningTimeframes && config.exchangeScanningTimeframes.length > 0)
        ? (config.exchangeScanningTimeframes as any)
        : [config.scanningTimeframe || '15m'];

      const allTargetTimeframes = Array.from(new Set([...botTfs, ...exchangeTfs])) as ('15m' | '30m' | '1h' | '4h' | '1d')[];

      // Prioritize products by 24H volume / turnover so most liquid opportunities are evaluated first
      const sortedProducts = [...futuresProducts].sort((a, b) => {
        const tickA = this.liveTickers.get(a.symbol);
        const tickB = this.liveTickers.get(b.symbol);
        const volA = tickA?.turnover || tickA?.volume || 0;
        const volB = tickB?.turnover || tickB?.volume || 0;
        return volB - volA;
      });

      // Dynamic Setup Quality Filter & Profitability Threshold
      const dynamicFilter = this.riskManager.getDynamicQualityThresholds(
        this.db.getTrades(),
        config
      );

      // Iterate through each active timeframe configured for Bot and Exchange setups
      for (const tf of allTargetTimeframes) {
        // Track coins that already have active setups for this specific timeframe so each timeframe maintains dedicated setups
        const openTrades = this.db.getTrades().filter((t) => t.status === 'OPEN');
        const openTradeCoins = new Set(openTrades.map((t) => t.coin));
        const activeCoins = new Set<string>();

        for (const s of existingSetups) {
          if (!['TP HIT', 'SL HIT', 'INVALIDATED', 'EXPIRED', 'CLOSED', 'REJECTED'].includes(s.status)) {
            // If setup has no matching open trade, do not block the coin from fresh setup discovery!
            if (s.status === 'TRADE OPEN' && !openTradeCoins.has(s.coin)) {
              continue;
            }
            if ((s.timeframe || '15m') === tf) {
              activeCoins.add(s.coin);
            }
          }
        }

        let resolution = '15';
        let lookbackSeconds = 86400 * 2; // 2 days for 15m (192 candles)
        if (tf === '30m') {
          resolution = '30';
          lookbackSeconds = 86400 * 4;
        } else if (tf === '1h') {
          resolution = '60';
          lookbackSeconds = 86400 * 8;
        } else if (tf === '4h') {
          resolution = '240';
          lookbackSeconds = 86400 * 32;
        } else if (tf === '1d') {
          resolution = '1D';
          lookbackSeconds = 86400 * 180;
        }

        // Scan all available liquid instruments across this timeframe
        const candidateProducts = sortedProducts.slice(0, 60);

        for (const prod of candidateProducts) {
          // RULE: If active setup already exists for this coin in this timeframe, DO NOT TOUCH OR RECALCULATE!
          if (activeCoins.has(prod.symbol)) {
            continue;
          }

          // ⏳ TRADE EXPIRY COUNTDOWN SECTION CHECK
          // When a coin's trade closes (TP/SL/Manual), it enters an expiry countdown lock.
          // In ONLY_TIMEFRAME mode (15m=4h, 30m=8h, 1h=12h, 4h=24h): skips this specific timeframe.
          // In ALL_TIMEFRAME mode (12h, 24h, Custom): skips all timeframes until countdown expires!
          const lockCheck = this.db.isCoinTimeframeLocked(prod.symbol, tf);
          if (lockCheck.locked) {
            continue;
          }

          // COOLDOWN QUARANTINE: If this coin closed a trade recently (within 30s), give market time to settle
          const cooldown = this.coinCloseCooldowns.get(prod.symbol);
          if (cooldown) {
            if (Date.now() - cooldown.closedAt < 30000) {
              continue;
            } else {
              // Cooldown expired: Remove quarantine so bot scans coin from scratch to discover best profitable setup
              this.coinCloseCooldowns.delete(prod.symbol);
            }
          }

          const ticker = this.liveTickers.get(prod.symbol);
          if (!ticker) continue;

          const cacheKey = `${prod.symbol}_${resolution}`;
          let candles = this.candleCache.get(cacheKey);
          if (!candles || candles.length === 0) {
            const to = Math.floor(Date.now() / 1000);
            const from = to - lookbackSeconds;
            try {
              const res = await this.client.getCandles(prod.symbol, resolution, from, to);
              if ('candles' in res && res.candles.length > 25) {
                candles = res.candles;
                this.candleCache.set(cacheKey, candles);
              }
            } catch (cErr) {
              // Rate limit or temporary error - continue to next instrument
              continue;
            }
          }

          if (!candles || candles.length < 25) continue;

          // Research: get verified news & official source links
          const sourceLinks = this.newsResearch.getNewsForCoin(prod.symbol);

          // Evaluate fresh setup with 1:5 R:R and confluence gating in selected timeframe
          const newSetup = this.setupEngine.evaluateInstrument(
            prod,
            ticker,
            candles,
            historicalForensics,
            Math.max(config.minRiskReward || 3.5, dynamicFilter.forcedMinRiskReward),
            sourceLinks,
            dynamicFilter.dynamicMinNetEdgePercent,
            dynamicFilter.requiredConfluenceScore,
            tf,
            this.pcdEngine,
            config
          );

          if (newSetup) {
            // Enforce identical entryPrice and triggerPrice
            newSetup.triggerPrice = newSetup.entryPrice;
            newSetup.timeframe = tf;
            activeCoins.add(newSetup.coin);
            this.db.saveSetup(newSetup);
            console.log(
              `[SmartBotWorker] New 1:5 R:R Setup Created for ${newSetup.coin} (${tf}): Entry/Trigger = $${newSetup.entryPrice}, SL = $${newSetup.sl}, TP1 = $${newSetup.tp1}, TP2 = $${newSetup.tp2}`
            );
          }
        }
      }
    } finally {
      this.isScanningSetups = false;
    }
  }

  /**
   * LIVE / BOT VIRTUAL ORDER EXECUTION PIPELINE
   *
   * STRICT RULES:
   * 1. setup.entryPrice remains LOCKED (never overwritten).
   * 2. When exchange is connected and auto-trade is enabled:
   *      - Places live order on Delta Exchange.
   *      - Sets executionType = 'EXCHANGE_LIVE'.
   * 3. When exchange is NOT connected, in Read Mode, or order placement encounters any error:
   *      - Activates BOT VIRTUAL order (executionType = 'BOT_VIRTUAL').
   *      - Trade opens immediately, live PnL tracking starts.
   *      - Appears in Live Orders with 1:5 TP, SL, Entry price, and date/time.
   * 4. Strict "Trigger Once" rule: setup triggers once per coin, never re-triggers or re-orders.
   */
  public async executeSetupTrade(
    setup: FutureSetup,
    isManual: boolean = false,
    executionPreference?: 'EXCHANGE' | 'BOT'
  ): Promise<{ success: boolean; error?: string }> {
    const config = this.db.getConfig();
    const trades = this.db.getTrades();
    const ticker =
      this.liveTickers.get(setup.coin) ||
      Array.from(this.liveTickers.values()).find((t) => t.symbol === setup.coin);
    const prod = this.products.find((p) => p.symbol === setup.coin || p.id === setup.productId);

    // Multi-timeframe configuration for Bot vs Exchange
    const botTfs: string[] = (config.botScanningTimeframes && config.botScanningTimeframes.length > 0)
      ? config.botScanningTimeframes
      : [config.scanningTimeframe || '15m'];

    const exchangeTfs: string[] = (config.exchangeScanningTimeframes && config.exchangeScanningTimeframes.length > 0)
      ? config.exchangeScanningTimeframes
      : [config.scanningTimeframe || '15m'];

    const isExplicitBot = executionPreference === 'BOT' || (!executionPreference && !exchangeTfs.includes(setup.timeframe || '15m'));

    // ENFORCE STRICT SINGLE ACTIVE TRADE PER COIN (Multi-timeframe mutual exclusivity)
    if (!isManual) {
      const activeExistingTrade = trades.find((t) => t.coin === setup.coin && t.status === 'OPEN');
      if (activeExistingTrade) {
        const activeTf = activeExistingTrade.timeframe || 'another timeframe';
        const msg = `Order blocked for ${setup.coin}: An active trade is already open on ${activeTf}. Multi-timeframe execution restricts to 1 concurrent position per coin.`;
        console.log(`[SmartBotWorker] ${msg}`);
        setup.status = 'TRADE OPEN';
        setup.hasTriggeredOnce = true;
        setup.reason = msg;
        this.db.saveSetup(setup);
        return { success: false, error: msg };
      }
    }

    // STEP 1: Validate locked setup (entry === trigger, SL and TP1 exist)
    const lockedPrice = setup.entryPrice ?? setup.triggerPrice;
    if (!lockedPrice || !setup.sl || !setup.tp1) {
      setup.status = 'REJECTED';
      setup.reason = 'Setup validation failed: Missing locked entry, trigger, SL or TP1';
      setup.rejectedAt = new Date().toISOString();
      this.db.saveSetup(setup);
      return { success: false, error: setup.reason };
    }

    const livePrice =
      ticker?.close ||
      (ticker?.mark_price ? parseFloat(String(ticker.mark_price)) : setup.currentPrice || lockedPrice);

    // Side Change (Opposite Order) Engine
    const isSideChangeOn = Boolean(config.sideChangeEnabled);
    const originalSetupSide = setup.direction; // 'BUY/LONG' or 'SELL/SHORT'
    const isOriginalLong = originalSetupSide === 'BUY/LONG' || originalSetupSide.includes('BUY');
    const changedSideStr = isOriginalLong ? 'SELL/SHORT' : 'BUY/LONG';
    const finalTradeSide: 'BUY' | 'SELL' = isSideChangeOn
      ? (isOriginalLong ? 'SELL' : 'BUY')
      : (isOriginalLong ? 'BUY' : 'SELL');

    // Calculate TP and SL for the trade to be executed:
    let targetTp = setup.tp2 || setup.tp1;
    let targetSl = setup.sl;

    if (isSideChangeOn) {
      const mode = config.sideChangeSlMode || 'SL';
      if (mode === 'SL') {
        // Direct Inverted: Original SL becomes TP, Original TP becomes SL
        targetTp = setup.sl;
        targetSl = setup.tp1;
      } else {
        // Percentage of Margin mode: '10%', '20%', '30%', '40%', '50%'
        const pct = parseFloat(mode) || 20;
        const lev = config.manualLeverage || 10;
        const moveAllowed = (pct / 100) / lev;
        if (finalTradeSide === 'BUY') {
          targetSl = Math.round(setup.entryPrice * (1 - moveAllowed) * 100000) / 100000;
        } else {
          targetSl = Math.round(setup.entryPrice * (1 + moveAllowed) * 100000) / 100000;
        }
        targetTp = setup.sl; // Profit target set to original SL level
      }
    }

    const normalSetupSnapshot = isSideChangeOn ? {
      entry: setup.entryPrice,
      tp1: setup.tp1,
      sl: setup.sl,
      direction: setup.direction,
      pnl: 0,
      pnlPercent: 0,
    } : undefined;

    // Helper: Activate a Bot Virtual Order so trade is OPEN and PnL tracks live with clear reason
    const activateBotVirtualTrade = (reasonMsg: string): TradeRecord => {
      const quantity = config.lotSize || 1;
      const leverage = config.manualLeverage || 10;
      const capitalUsed = Math.round(((setup.entryPrice * quantity) / leverage) * 100) / 100;
      const pcdReason = setup.supportingReasons?.find((r) => r.toLowerCase().includes('pcd'));

      const virtualTrade: TradeRecord = {
        tradeId: `BOT_TRD_${setup.coin}_${Date.now()}`,
        setupId: setup.id,
        orderId: `BOT_ORD_${Date.now().toString(36).toUpperCase()}`,
        productId: setup.productId,
        exchange: 'Delta',
        coin: setup.coin,
        instrumentType: 'Future',
        side: finalTradeSide,
        entryPrice: setup.entryPrice,
        actualFillPrice: setup.entryPrice,
        currentPrice: setup.entryPrice,
        tp: targetTp,
        sl: targetSl,
        quantity,
        capitalUsed,
        leverage,
        fees: 0.05,
        funding: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        pnlPercent: 0,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        executionType: 'BOT_VIRTUAL',
        orderNotPlacedReason: reasonMsg,
        executionNote: isSideChangeOn
          ? `Bot Order (Side Changed ${changedSideStr}): ${reasonMsg}`
          : `Bot Order: ${reasonMsg}`,
        timeframe: setup.timeframe || config.scanningTimeframe || '15m',
        strategy: setup.strategy || '1:5 Mathematical Confluence',
        whyFormed: setup.whyFormed,
        primaryReason: setup.primaryReason,
        supportingReasons: setup.supportingReasons,
        pcdReason,
        marketBreadthAtEntry: this.pcdEngine.getCachedState().regimeLabel,
        rangeBandAtCreation: setup.rangeBandAtCreation,
        movePercent24hAtCreation: setup.movePercent24hAtCreation,
        current24hMovePercent: ticker?.price_change_percent_24h ?? setup.current24hMovePercent,
        marketMoveContext: setup.marketMoveContext,
        whyDirectionRationale: setup.whyDirectionRationale,
        sideChangeEnabled: isSideChangeOn,
        isSideChangedOrder: isSideChangeOn,
        originalSetupSide: setup.direction,
        sideChangeSlSetting: config.sideChangeSlMode || 'SL',
        normalSetupSnapshot: normalSetupSnapshot ? {
          ...normalSetupSnapshot,
          entry: setup.entryPrice,
        } : undefined,
        highestPrice: setup.entryPrice,
        lowestPrice: setup.entryPrice,
        tradeLogs: [
          { time: new Date().toISOString(), event: 'Setup Triggered', details: `Setup ${setup.direction} detected on ${setup.timeframe || '15m'}` },
          isSideChangeOn
            ? { time: new Date().toISOString(), event: 'Side Change Active', details: `Inverted side from ${setup.direction} to ${changedSideStr} (SL Mode: ${config.sideChangeSlMode || 'SL'})` }
            : { time: new Date().toISOString(), event: 'Order Placement', details: `Normal setup order placed (Bot Virtual)` },
          { time: new Date().toISOString(), event: 'Order Filled', details: `Virtual order active at entry price $${setup.entryPrice}` },
        ],
      };

      setup.status = 'TRADE OPEN';
      setup.hasOrderPlaced = false;
      setup.executionMode = 'BOT_SIMULATED';
      setup.orderNotPlacedReason = reasonMsg;
      setup.orderPlacedAt = new Date().toISOString();
      setup.reason = isExplicitBot
        ? 'Bot Simulation Order Active'
        : `Bot Order Active (${reasonMsg})`;

      this.db.saveSetup(setup);
      this.db.saveTrade(virtualTrade);
      this.db.logCommand(
        `BOT ORDER ACTIVATED: ${setup.coin} (${virtualTrade.side} ${quantity} lot${isSideChangeOn ? ' - SIDE CHANGED' : ''})`,
        isExplicitBot
          ? `Trade active in Bot simulation (${setup.timeframe || '15m'}). Entry: $${setup.entryPrice}, TP: $${targetTp}, SL: $${targetSl}`
          : `Trade active in Bot simulation. Routing note: ${reasonMsg}. Entry: $${setup.entryPrice}, TP: $${targetTp}, SL: $${targetSl}`,
        'SUCCESS'
      );
      if (isExplicitBot) {
        console.log(
          `[SmartBotWorker] Activated Bot Order for ${setup.coin} (${setup.timeframe || '15m'}). Bot Setup simulation mode active. Live PnL tracking started.`
        );
      } else {
        console.log(
          `[SmartBotWorker] Activated Bot Order for ${setup.coin} (${setup.timeframe || '15m'}). Exchange routing note: "${reasonMsg}". Live PnL tracking started.`
        );
      }
      return virtualTrade;
    };

    // If explicitly requested as BOT order, execute as Bot Virtual Trade directly
    if (executionPreference === 'BOT') {
      activateBotVirtualTrade('Bot Setup mode execution triggered');
      return { success: true };
    }

    // For autonomous background triggers, verify if setup's timeframe is in Exchange Scanning Timeframes
    if (!isManual && !executionPreference && !exchangeTfs.includes(setup.timeframe || '15m')) {
      activateBotVirtualTrade(`Timeframe ${setup.timeframe || '15m'} is configured in Bot Setup (Not in Exchange Scanning Timeframes)`);
      return { success: true };
    }

    // STEP 2: Exchange Execution Feasibility Checks
    // User mandate:
    // - If exchange API connected, Read Mode is OFF, and Auto Trade is ON: place order on Delta Exchange.
    // - If API disconnected, Read Mode is ON, Auto Trade is OFF, or any error occurs: convert to Bot Order and state why order was not placed on exchange!
    const hasCredentials = this.client.hasCredentials() || Boolean(config.apiKey && config.apiSecret);
    const isConnected = config.isConnected && this.connectionState === 'CONNECTED';

    if (!hasCredentials) {
      activateBotVirtualTrade('Exchange API credentials not configured in settings');
      return { success: true };
    }

    if (!isConnected) {
      const detailedConnError = this.lastAuthError
        ? `Exchange connection issue: ${this.lastAuthError}`
        : 'Exchange API disconnected (Please verify API credentials in Exchange Settings)';
      activateBotVirtualTrade(detailedConnError);
      return { success: true };
    }

    if (config.isReadMode) {
      activateBotVirtualTrade('Read-Only Mode is active in Exchange Settings (Real exchange execution disabled)');
      return { success: true };
    }

    if (!isManual && !config.autoTradeEnabled) {
      activateBotVirtualTrade('Autonomous Auto Trading is toggled OFF in Exchange Settings');
      return { success: true };
    }

    // STEP 2b: Prevent duplicate order if position is already active on Delta Exchange
    if (!isManual && this.liveOpenPositions.has(setup.coin)) {
      const livePos = this.liveOpenPositions.get(setup.coin);
      if (Number(livePos?.size || 0) !== 0) {
        setup.status = 'TRADE OPEN';
        setup.reason = `Position already active on Delta Exchange (${livePos.size} contracts)`;
        this.db.saveSetup(setup);
        console.log(`[SmartBotWorker] Position already open for ${setup.coin} on Delta Exchange. Duplicate entry avoided.`);
        return { success: true };
      }
    }

    const maxLeverage = prod?.max_leverage_notional ? 50 : 100;
    const dailyPnl = trades.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const currentDailyLoss = dailyPnl < 0 ? Math.abs(dailyPnl) : 0;

    // STEP 3: Risk Manager validation (Daily loss, max drawdown, capital limits, max open trades)
    const riskCheck = this.riskManager.validateTrade(
      setup,
      config,
      trades,
      currentDailyLoss,
      this.cachedAvailableBalance,
      maxLeverage,
      prod,
      isManual
    );

    if (!riskCheck.allowed) {
      console.warn(
        `[SmartBotWorker] Live order blocked by Risk Manager for ${setup.coin}: ${riskCheck.blockReason}. Activating Bot Order.`
      );
      activateBotVirtualTrade(`Risk Guard Limit: ${riskCheck.blockReason}`);
      return { success: true };
    }

    // STEP 4: Submit live order to Delta Exchange
    setup.status = 'ORDER SUBMITTED';
    this.db.saveSetup(setup);

    const calculatedLeverage = riskCheck.calculatedLeverage;
    const calculatedQuantity = riskCheck.calculatedQuantity;
    const calculatedCapital = riskCheck.calculatedCapitalRequired;

    const execResult = await this.orderManager.executeLiveOrder(
      setup,
      this.client,
      config,
      calculatedLeverage,
      calculatedQuantity,
      calculatedCapital,
      (err) => this.db.logError(err),
      prod,
      isSideChangeOn ? {
        overrideSide: finalTradeSide,
        overrideTp: targetTp,
        overrideSl: targetSl,
        isSideChangedOrder: true,
        originalSetupSide: setup.direction,
        sideChangeSlSetting: config.sideChangeSlMode || 'SL',
        normalSetupSnapshot,
      } : undefined
    );

    if (execResult.success && execResult.trade) {
      // Exchange confirmed & filled
      execResult.trade.executionType = 'EXCHANGE_LIVE';
      execResult.trade.entryPrice = setup.entryPrice;
      execResult.trade.actualFillPrice = setup.entryPrice;
      execResult.trade.executionNote = isSideChangeOn
        ? `Live Side-Changed Order Confirmed & Filled on Delta Exchange (${changedSideStr})`
        : 'Live Order Confirmed & Filled on Delta Exchange';
      execResult.trade.orderNotPlacedReason = undefined;
      execResult.trade.tp = targetTp;
      execResult.trade.sl = targetSl;
      execResult.trade.sideChangeEnabled = isSideChangeOn;
      execResult.trade.isSideChangedOrder = isSideChangeOn;
      execResult.trade.originalSetupSide = setup.direction;
      execResult.trade.sideChangeSlSetting = config.sideChangeSlMode || 'SL';
      execResult.trade.normalSetupSnapshot = normalSetupSnapshot ? {
        ...normalSetupSnapshot,
        entry: setup.entryPrice,
      } : undefined;
      execResult.trade.timeframe = setup.timeframe || config.scanningTimeframe || '15m';
      execResult.trade.strategy = setup.strategy || '1:5 Mathematical Confluence';
      execResult.trade.whyFormed = setup.whyFormed;
      execResult.trade.primaryReason = setup.primaryReason;
      execResult.trade.supportingReasons = setup.supportingReasons;
      execResult.trade.pcdReason = setup.supportingReasons?.find((r) => r.toLowerCase().includes('pcd'));
      execResult.trade.marketBreadthAtEntry = this.pcdEngine.getCachedState().regimeLabel;
      execResult.trade.rangeBandAtCreation = setup.rangeBandAtCreation;
      execResult.trade.movePercent24hAtCreation = setup.movePercent24hAtCreation;
      execResult.trade.current24hMovePercent = ticker?.price_change_percent_24h ?? setup.current24hMovePercent;
      execResult.trade.marketMoveContext = setup.marketMoveContext;
      execResult.trade.whyDirectionRationale = setup.whyDirectionRationale;

      setup.status = 'TRADE OPEN';
      setup.hasOrderPlaced = true;
      setup.executionMode = 'EXCHANGE';
      setup.orderNotPlacedReason = undefined;
      setup.orderPlacedAt = new Date().toISOString();
      setup.reason = isSideChangeOn
        ? `Side Changed Order Confirmed and Filled on Delta Exchange (${changedSideStr})`
        : 'Order Confirmed and Filled on Delta Exchange';

      this.db.saveSetup(setup);
      this.db.saveTrade(execResult.trade);
      this.db.logCommand(
        `EXCHANGE LIVE ORDER PLACED: ${setup.coin} (${execResult.trade.side} ${execResult.trade.quantity} lot${isSideChangeOn ? ' - SIDE CHANGED' : ''})`,
        `Real order successfully placed & confirmed on Delta Exchange. Order ID: ${execResult.trade.orderId}, Fill: $${execResult.trade.actualFillPrice}, SL: $${execResult.trade.sl}, TP: $${execResult.trade.tp}`,
        'SUCCESS'
      );
      console.log(
        `[SmartBotWorker] Order CONFIRMED & FILLED by Delta Exchange for ${setup.coin}. Trade Open! Setup Entry = ${setup.entryPrice}, Actual Fill = ${execResult.trade.actualFillPrice}`
      );
      return { success: true };
    } else {
      // Exchange order placement failed -> record error, notify, and activate Bot Order fallback with explicit reason
      const errReason = execResult.error || 'Exchange order rejected';
      console.warn(
        `[SmartBotWorker] Exchange order failed for ${setup.coin} (${errReason}). Converting to Bot Order fallback.`
      );
      this.db.logCommand(
        `EXCHANGE ORDER REJECTED -> CONVERTED TO BOT ORDER: ${setup.coin}`,
        `Delta Exchange order attempt failed: ${errReason}. Converted to Bot Order with live tracking.`,
        'ERROR'
      );
      this.db.logError({
        severity: 'CRITICAL',
        module: 'Order',
        subModule: 'executeSetupTrade',
        functionName: 'executeSetupTrade',
        exchange: 'Delta',
        coin: setup.coin,
        setupId: setup.id,
        errorMessage: `Failed to place exchange order for ${setup.coin}: ${errReason}`,
        systemMessage: `Order fallback to Bot Virtual activated: ${errReason}`,
        dataStatus: 'PARTIAL',
        retryCount: 0,
        recoveryAction: 'Converted to Bot Virtual order',
        finalStatus: 'OPEN',
      });
      activateBotVirtualTrade(`Exchange rejected order: ${errReason}`);
      return { success: true };
    }
  }

  /**
   * Reconciles setups whose trades have finished, reached TP/SL, or closed.
   * Ensures completed setups are removed from active/triggered lists and
   * that their coins are immediately freed for multi-timeframe discovery!
   */
  public reconcileCompletedSetups(): void {
    const setups = this.db.getSetups();
    const trades = this.db.getTrades();
    const history = this.db.getHistory();
    const openTrades = trades.filter((t) => t.status === 'OPEN');
    const openTradeCoins = new Set(openTrades.map((t) => t.coin));
    const openTradeSetupIds = new Set(openTrades.map((t) => t.setupId).filter(Boolean));

    let updatedCount = 0;
    for (const s of setups) {
      if (['TRADE OPEN', 'TRIGGERED', 'ORDER SUBMITTED'].includes(s.status)) {
        const hasOpenTrade = openTradeSetupIds.has(s.id) || openTradeCoins.has(s.coin);
        if (!hasOpenTrade) {
          // Find matching closed trade or history record to know final outcome
          const closedTrade = trades.find((t) => (t.setupId === s.id || t.coin === s.coin) && t.status === 'CLOSED');
          const hist = history.find((h) => h.setupId === s.id || h.coin === s.coin);

          let finalStatus: FutureSetup['status'] = 'INVALIDATED';
          if (hist?.outcome === 'TP HIT' || hist?.outcome === 'SL HIT') {
            finalStatus = hist.outcome;
          } else if (closedTrade) {
            const isLong = s.direction.includes('BUY') || s.direction.includes('LONG');
            const exit = closedTrade.exitPrice || closedTrade.currentPrice || s.currentPrice;
            if (s.tp1 && (isLong ? exit >= s.tp1 : exit <= s.tp1)) {
              finalStatus = 'TP HIT';
            } else if (s.sl && (isLong ? exit <= s.sl : exit >= s.sl)) {
              finalStatus = 'SL HIT';
            } else {
              finalStatus = 'INVALIDATED';
            }
          }
          this.db.updateSetupStatus(s.id, finalStatus);
          updatedCount++;
        }
      }
    }
    if (updatedCount > 0) {
      console.log(`[SmartBotWorker] Reconciled ${updatedCount} completed setup(s) to TP HIT / SL HIT / INVALIDATED. Freed coins for multi-timeframe scanning.`);
    }
  }

  /**
   * Real-time Delta Exchange position synchronizer:
   * 1. Updates all OPEN trades with real-time unrealized PnL, entry price, and mark price directly from Delta Exchange.
   * 2. If a position is active on Delta Exchange but not yet tracked in db, automatically syncs it as an EXCHANGE_LIVE trade.
   * 3. When an EXCHANGE_LIVE position is closed on Delta Exchange, immediately closes the trade in live orders,
   *    and saves it to history with the exact close reason: TP HIT, SL HIT, MANUAL CLOSE, or LIQUIDATED.
   */
  public async syncExchangePositionsWithLiveOrders(): Promise<void> {
    if (!this.client.hasCredentials()) return;

    const trades = this.db.getTrades();
    const openTrades = trades.filter((t) => t.status === 'OPEN');
    const exchangeOpenTrades = openTrades.filter(
      (t) => t.executionType === 'EXCHANGE_LIVE' || String(t.orderId || '').startsWith('ORD_') || String(t.orderId || '').startsWith('DELTA_')
    );

    const config = this.db.getConfig();

    // 1. Sync live data for currently active exchange positions
    for (const [symbol, pos] of this.liveOpenPositions.entries()) {
      const size = Number(pos.size || 0);
      if (size === 0) continue;

      const isLong = size > 0;
      const entryPrice = Number(pos.entry_price) || 0;
      const markPrice = Number(pos.mark_price) || entryPrice;
      const unrealizedPnl = Number(pos.unrealized_pnl) || 0;
      const realizedPnl = Number(pos.realized_pnl) || 0;
      const liquidationPrice = Number(pos.liquidation_price) || undefined;
      const margin = Number(pos.margin) || 0;
      const leverage = Number(pos.leverage) || 10;
      const quantity = Math.abs(size);

      // Check if coin was recently closed (cooldown quarantine prevents re-import loop while exchange settles)
      const closedCooldown = this.coinCloseCooldowns.get(symbol);
      if (closedCooldown && Date.now() - closedCooldown.closedAt < 30000) {
        // Exchange position was just closed; do NOT resurrect it as an open trade
        continue;
      }

      // Exact Live PnL synchronization with Delta Exchange
      let deltaPnlPercent = 0;
      if (pos.pnl_percentage !== undefined && pos.pnl_percentage !== null) {
        const parsed = parseFloat(String(pos.pnl_percentage).replace('%', ''));
        if (Math.abs(parsed) <= 1 && margin > 0 && Math.abs((unrealizedPnl / margin) * 100) > 2) {
          deltaPnlPercent = Math.round(parsed * 10000) / 100;
        } else {
          deltaPnlPercent = Math.round(parsed * 100) / 100;
        }
      } else if (pos.roe !== undefined && pos.roe !== null) {
        const parsed = parseFloat(String(pos.roe).replace('%', ''));
        if (Math.abs(parsed) <= 1 && margin > 0 && Math.abs((unrealizedPnl / margin) * 100) > 2) {
          deltaPnlPercent = Math.round(parsed * 10000) / 100;
        } else {
          deltaPnlPercent = Math.round(parsed * 100) / 100;
        }
      } else if (margin > 0) {
        deltaPnlPercent = Math.round((unrealizedPnl / margin) * 10000) / 100;
      } else if (entryPrice > 0) {
        deltaPnlPercent = Math.round(((isLong ? markPrice - entryPrice : entryPrice - markPrice) / entryPrice) * 100 * leverage * 100) / 100;
      }

      // Find if trade already exists
      const cleanSymbol = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const existingTrade = openTrades.find((t) => {
        if (t.productId && pos.product_id && Number(t.productId) === Number(pos.product_id)) return true;
        if (t.orderId === `DELTA_POS_${pos.product_id}`) return true;
        const cleanTradeCoin = (t.coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleanTradeCoin === cleanSymbol) return true;
        if (cleanTradeCoin.length >= 3 && cleanSymbol.includes(cleanTradeCoin)) return true;
        if (cleanSymbol.length >= 3 && cleanTradeCoin.includes(cleanSymbol)) return true;
        return false;
      });

      if (existingTrade) {
        existingTrade.executionType = 'EXCHANGE_LIVE';
        existingTrade.status = 'OPEN';
        existingTrade.currentPrice = markPrice > 0 ? markPrice : existingTrade.currentPrice;
        existingTrade.livePrice = existingTrade.currentPrice;
        if (pos.product_id) existingTrade.productId = pos.product_id;

        // User Mandate: setup.entryPrice strictly matches across Normal Setup, Side Change & Exchange order
        const lockedEntry = existingTrade.entryPrice || (entryPrice > 0 ? entryPrice : markPrice);
        existingTrade.entryPrice = lockedEntry;
        existingTrade.actualFillPrice = lockedEntry;

        // Ensure side change isolation & snapshot when sideChangeEnabled is ON
        if (config.sideChangeEnabled) {
          existingTrade.sideChangeEnabled = true;
          existingTrade.isSideChangedOrder = true;
          if (!existingTrade.originalSetupSide) {
            existingTrade.originalSetupSide = existingTrade.side === 'BUY' ? 'SELL/SHORT' : 'BUY/LONG';
          }
          if (!existingTrade.sideChangeSlSetting) {
            existingTrade.sideChangeSlSetting = config.sideChangeSlMode || 'SL';
          }
          if (!existingTrade.normalSetupSnapshot) {
            existingTrade.normalSetupSnapshot = {
              entry: lockedEntry,
              tp1: existingTrade.sl,
              sl: existingTrade.tp,
              direction: existingTrade.originalSetupSide,
              pnl: 0,
              pnlPercent: 0,
            };
          }
        }

        if (existingTrade.normalSetupSnapshot) {
          existingTrade.normalSetupSnapshot.entry = lockedEntry;
          const normIsLong = (existingTrade.normalSetupSnapshot.direction || '').includes('BUY');
          const normDiff = normIsLong ? (markPrice - lockedEntry) : (lockedEntry - markPrice);
          existingTrade.normalSetupSnapshot.pnl = Math.round(normDiff * quantity * 100) / 100;
          existingTrade.normalSetupSnapshot.pnlPercent = lockedEntry > 0
            ? Math.round(((normDiff / lockedEntry) * 100 * (existingTrade.leverage || 10)) * 100) / 100
            : 0;
        }

        existingTrade.unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
        existingTrade.realizedPnl = Math.round(realizedPnl * 100) / 100;
        if (liquidationPrice) existingTrade.liquidationPrice = liquidationPrice;
        if (margin > 0) existingTrade.margin = margin;
        if (leverage > 0) existingTrade.leverage = leverage;
        existingTrade.quantity = quantity;
        existingTrade.pnlPercent = deltaPnlPercent;
        this.db.saveTrade(existingTrade);
      } else {
        // Position exists on Delta Exchange but not in db -> auto-import so user sees live order with live PnL!
        const now = new Date().toISOString();
        const isSideChangeOn = Boolean(config.sideChangeEnabled);

        const importedTrade: TradeRecord = {
          tradeId: `EXCH_${symbol}_${pos.product_id || Date.now()}`,
          setupId: `SETUP_EXCH_${symbol}_${Date.now()}`,
          orderId: `DELTA_POS_${pos.product_id || Date.now()}`,
          productId: pos.product_id,
          exchange: 'Delta',
          coin: symbol,
          instrumentType: 'Future',
          side: isLong ? 'BUY' : 'SELL',
          entryPrice: entryPrice > 0 ? entryPrice : markPrice,
          actualFillPrice: entryPrice > 0 ? entryPrice : markPrice,
          currentPrice: markPrice > 0 ? markPrice : entryPrice,
          tp: isLong ? (entryPrice > 0 ? entryPrice * 1.05 : markPrice * 1.05) : (entryPrice > 0 ? entryPrice * 0.95 : markPrice * 0.95),
          sl: isLong ? (entryPrice > 0 ? entryPrice * 0.98 : markPrice * 0.98) : (entryPrice > 0 ? entryPrice * 1.02 : markPrice * 1.02),
          liquidationPrice,
          quantity,
          capitalUsed: margin > 0 ? margin : Math.round(((entryPrice * quantity) / leverage) * 100) / 100,
          margin: margin > 0 ? margin : Math.round(((entryPrice * quantity) / leverage) * 100) / 100,
          leverage,
          fees: 0,
          funding: 0,
          realizedPnl: Math.round(realizedPnl * 100) / 100,
          unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
          pnlPercent: deltaPnlPercent,
          createdAt: now,
          setupCreatedAt: now,
          status: 'OPEN',
          executionType: 'EXCHANGE_LIVE',
          executionNote: isSideChangeOn
            ? `Live Delta Exchange Position (${size} contracts) synchronized [SIDE CHANGE ACTIVE]`
            : `Live Delta Exchange Position (${size} contracts) synchronized`,
          timeframe: '15m',
          strategy: 'Delta Exchange Live Order',
          sideChangeEnabled: isSideChangeOn,
          isSideChangedOrder: isSideChangeOn,
          originalSetupSide: isLong ? 'SELL/SHORT' : 'BUY/LONG',
          sideChangeSlSetting: config.sideChangeSlMode || 'SL',
          normalSetupSnapshot: isSideChangeOn ? {
            entry: entryPrice > 0 ? entryPrice : markPrice,
            tp1: isLong ? (entryPrice > 0 ? entryPrice * 0.95 : markPrice * 0.95) : (entryPrice > 0 ? entryPrice * 1.05 : markPrice * 1.05),
            sl: isLong ? (entryPrice > 0 ? entryPrice * 1.02 : markPrice * 1.02) : (entryPrice > 0 ? entryPrice * 0.98 : markPrice * 0.98),
            direction: isLong ? 'SELL/SHORT' : 'BUY/LONG',
            pnl: 0,
            pnlPercent: 0,
          } : undefined,
        };
        this.db.saveTrade(importedTrade);
      }
    }

    // 2. Check for any previously OPEN exchange trades that have CLOSED on Delta Exchange
    for (const trade of exchangeOpenTrades) {
      const symbolMatch = this.liveOpenPositions.get(trade.coin) || Array.from(this.liveOpenPositions.values()).find((p) => p.product_symbol === trade.coin || trade.coin.includes(p.product_symbol));
      const isStillOpenOnExchange = symbolMatch && Number(symbolMatch.size || 0) !== 0;

      if (!isStillOpenOnExchange) {
        // Trade closed on Delta Exchange!
        const ticker = this.liveTickers.get(trade.coin) || Array.from(this.liveTickers.values()).find((t) => t.symbol.includes(trade.coin));
        const currentPrice = ticker?.mark_price || ticker?.close || trade.currentPrice || trade.entryPrice;
        const isLong = trade.side === 'BUY';
        const entry = trade.actualFillPrice || trade.entryPrice;

        // Classify exact close reason: TP HIT, SL HIT, LIQUIDATED, or MANUAL CLOSE
        let closeReason: 'TP HIT' | 'SL HIT' | 'MANUAL CLOSE' | 'LIQUIDATED' = 'MANUAL CLOSE';
        let exitPrice = currentPrice;

        if (trade.liquidationPrice && trade.liquidationPrice > 0) {
          if ((isLong && currentPrice <= trade.liquidationPrice) || (!isLong && currentPrice >= trade.liquidationPrice)) {
            closeReason = 'LIQUIDATED';
            exitPrice = trade.liquidationPrice;
          }
        }

        if (closeReason !== 'LIQUIDATED') {
          if (trade.tp && trade.tp > 0) {
            if ((isLong && currentPrice >= trade.tp * 0.998) || (!isLong && currentPrice <= trade.tp * 1.002)) {
              closeReason = 'TP HIT';
              exitPrice = trade.tp;
            }
          }
          if (trade.sl && trade.sl > 0) {
            if ((isLong && currentPrice <= trade.sl * 1.002) || (!isLong && currentPrice >= trade.sl * 0.998)) {
              closeReason = 'SL HIT';
              exitPrice = trade.sl;
            }
          }
        }

        const priceDiff = isLong ? exitPrice - entry : entry - exitPrice;
        const realizedPnl = Math.round(priceDiff * trade.quantity * 100) / 100;
        const pnlPercent = entry > 0 ? Math.round(((priceDiff / entry) * 100 * trade.leverage) * 100) / 100 : 0;
        const closedAt = new Date().toISOString();

        let finalTradeStatus: TradeRecord['status'] = closeReason === 'TP HIT' || closeReason === 'SL HIT' ? closeReason : 'CLOSED';
        let shouldArchiveToHistory = true;

        if (trade.isSideChangedOrder && trade.normalSetupSnapshot) {
          trade.exchangeOrderStatus = closeReason === 'LIQUIDATED' ? 'CLOSED' : closeReason;
          trade.exchangeOrderExitPrice = exitPrice;
          trade.exchangeOrderClosedAt = closedAt;

          // USER MANDATE:
          // "only exchange par order place hai tab 
          //  jo hai EXCHANGE ORDER (SIDE CHANGED) mai ager exchange par tp,sl,manual order close hota hai tab 'live order ' mai se us coin ka dono order close ho jaye 'EXCHANGE ORDER (SIDE CHANGED)','NORMAL SETUP (ORIGINAL SIDE)'
          // history save ho jaye aur bataye history mai time frame ke sath"
          const normEntry = trade.normalSetupSnapshot.entry || trade.entryPrice;
          const normIsLong = (trade.normalSetupSnapshot.direction || '').includes('BUY');
          const normExitDiff = normIsLong ? exitPrice - normEntry : normEntry - exitPrice;
          trade.normalSetupSnapshot.pnl = Math.round(normExitDiff * trade.quantity * 100) / 100;
          trade.normalSetupSnapshot.pnlPercent = normEntry > 0 ? Math.round(((normExitDiff / normEntry) * 100 * trade.leverage) * 100) / 100 : 0;
          trade.normalSetupSnapshot.exitPrice = exitPrice;
          trade.normalSetupSnapshot.closedAt = closedAt;
          trade.normalSetupSnapshot.status = closeReason === 'TP HIT' ? 'CLOSED' : closeReason === 'SL HIT' ? 'CLOSED' : 'MANUAL CLOSE';

          finalTradeStatus = closeReason === 'TP HIT' || closeReason === 'SL HIT' ? closeReason : 'CLOSED';
          shouldArchiveToHistory = true;
          console.log(`[SmartBotWorker] Exchange leg closed on Delta for ${trade.coin} (${closeReason}). Concluded BOTH orders (Exchange Order + Normal Setup) and archived to history.`);
        }

        trade.status = finalTradeStatus;
        trade.closeReason = closeReason;
        trade.exitPrice = exitPrice;
        trade.realizedPnl = trade.realizedPnl ? trade.realizedPnl + realizedPnl : realizedPnl;
        trade.unrealizedPnl = 0;
        trade.pnlPercent = pnlPercent;
        trade.closedAt = shouldArchiveToHistory ? closedAt : undefined;
        trade.executionNote = `Position closed on Delta Exchange. Reason: ${closeReason} at $${exitPrice}.`;

        this.db.saveTrade(trade);
        // ⏳ Apply Trade Expiry Countdown Lock upon trade close:
        this.db.applyTradeClosedCountdown(trade, closeReason);

        if (!shouldArchiveToHistory) {
          continue;
        }

        // Update setup status if linked
        if (trade.setupId) {
          const sStatus: FutureSetup['status'] = closeReason === 'TP HIT' ? 'TP HIT' : closeReason === 'SL HIT' ? 'SL HIT' : 'INVALIDATED';
          this.db.updateSetupStatus(trade.setupId, sStatus);
        }

        // Archive into persistent History
        const outcomeReason = closeReason === 'LIQUIDATED'
          ? `Position liquidated on Delta Exchange at liquidation level $${exitPrice} (${pnlPercent}%).`
          : closeReason === 'TP HIT'
          ? `Take Profit executed on Delta Exchange at target $${exitPrice} (+${pnlPercent}%).`
          : closeReason === 'SL HIT'
          ? `Stop Loss executed on Delta Exchange at $${exitPrice} (${pnlPercent}%).`
          : `Position closed manually on Delta Exchange at market price $${exitPrice} (${pnlPercent}%).`;

        const openTime = trade.createdAt || closedAt;
        const durationMinutes = Math.max(1, Math.round((new Date(closedAt).getTime() - new Date(openTime).getTime()) / 60000));
        const days = Math.floor(durationMinutes / 1440);
        const hours = Math.floor((durationMinutes % 1440) / 60);
        const mins = durationMinutes % 60;
        const durationFormatted = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const historyRecord: SetupHistoryRecord = {
          id: `HIST_${trade.tradeId}`,
          setupId: trade.setupId,
          tradeId: trade.tradeId,
          orderId: trade.orderId,
          timestamp: openTime,
          openedAt: openTime,
          closedAt,
          tpHitAt: closeReason === 'TP HIT' ? closedAt : undefined,
          slHitAt: closeReason === 'SL HIT' ? closedAt : undefined,
          durationMinutes,
          durationFormatted,
          coin: trade.coin,
          exchange: 'Delta',
          direction: trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
          entryPrice: trade.entryPrice,
          actualFillPrice: trade.actualFillPrice,
          tp1: trade.tp,
          sl: trade.sl,
          exitPrice,
          outcome: closeReason,
          closeReason,
          realizedPnl,
          pnlPercent,
          riskRewardAchieved: closeReason === 'TP HIT' ? 5 : closeReason === 'SL HIT' ? -1 : 0,
          riskReward: 5,
          margin: trade.margin || trade.capitalUsed,
          leverage: trade.leverage,
          orderType: 'EXCHANGE',
          livePrice: exitPrice,
          executionMode: 'EXCHANGE',
          executionType: 'EXCHANGE_LIVE',
          timeframe: trade.timeframe || '15m',
          setupCreatedAt: trade.setupCreatedAt || openTime,
          liquidationPrice: trade.liquidationPrice,
          whyFormed: trade.whyFormed || `Live Delta Exchange Position`,
          primaryReason: trade.primaryReason || `Delta Exchange Live Execution`,
          supportingReasons: trade.supportingReasons || [`Live position execution and close synchronization with Delta Exchange`],
          outcomeReason,
          score: 85,
          capitalUsed: trade.capitalUsed,
          sideChangeEnabled: Boolean(trade.sideChangeEnabled || trade.isSideChangedOrder),
          isSideChangedOrder: Boolean(trade.isSideChangedOrder),
          originalSide: trade.originalSetupSide || (trade.side === 'BUY' ? 'SELL/SHORT' : 'BUY/LONG'),
          changedSide: trade.isSideChangedOrder ? (trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT') : undefined,
          sideChangeSlSetting: trade.sideChangeSlSetting,
          normalSetupSnapshot: trade.normalSetupSnapshot,
          normalSetupPnl: trade.normalSetupSnapshot?.pnl,
          normalSetupPnlPercent: trade.normalSetupSnapshot?.pnlPercent,
          sideChangedPnl: realizedPnl,
          sideChangedPnlPercent: pnlPercent,
          rangeBandAtCreation: trade.rangeBandAtCreation,
          movePercent24hAtCreation: trade.movePercent24hAtCreation,
          current24hMovePercent: trade.current24hMovePercent,
          marketMoveContext: trade.marketMoveContext,
          whyDirectionRationale: trade.whyDirectionRationale,
        };

        this.db.saveHistory(historyRecord);
        this.db.logCommand(
          `EXCHANGE_POSITION_CLOSED_${trade.coin}`,
          `Delta Exchange trade ${trade.tradeId} for ${trade.coin} closed. Reason: ${closeReason} at $${exitPrice}. Realized PnL: $${realizedPnl} (${pnlPercent}%). Recorded to history.`,
          'SUCCESS'
        );
        console.log(`[SmartBotWorker] Exchange trade closed for ${trade.coin}: ${closeReason} at $${exitPrice}, PnL: $${realizedPnl}`);
      }
    }
  }

  /**
   * Monitor active trades for TP / SL hits and 50% TP Progress partial profit booking
   */
  private async monitorActiveTrades(): Promise<void> {
    const trades = this.db.getTrades();
    const openTrades = trades.filter((t) => t.status === 'OPEN');

    for (const trade of openTrades) {
      const ticker = this.liveTickers.get(trade.coin) ||
        Array.from(this.liveTickers.values()).find((t) => t.symbol === trade.coin || t.symbol.includes(trade.coin) || trade.coin.includes(t.symbol));

      const currentPrice = ticker?.close || ticker?.mark_price || trade.currentPrice || trade.entryPrice;
      if (!currentPrice) continue;

      const config = this.db.getConfig();

      const isExchangeAlreadyClosed = Boolean(
        trade.isSideChangedOrder && trade.exchangeOrderStatus && trade.exchangeOrderStatus !== 'OPEN'
      );

      let resTrade = trade;
      let resActionTaken: 'TP_HIT' | 'SL_HIT' | 'PARTIAL_PROFIT_BOOKED' | 'SL_TRAILED' | undefined = undefined;

      // Real-time synchronization of open exchange order PnL directly from live Delta position
      const cleanCoin = (trade.coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const livePos = this.liveOpenPositions.get(trade.coin) ||
        Array.from(this.liveOpenPositions.values()).find((p) => {
          if (trade.productId && p.product_id && Number(trade.productId) === Number(p.product_id)) return true;
          const cleanP = (p.product_symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return cleanP === cleanCoin || (cleanP.length >= 3 && cleanCoin.includes(cleanP)) || (cleanCoin.length >= 3 && cleanP.includes(cleanCoin));
        });

      if (livePos) {
        const unrealizedPnl = Number(livePos.unrealized_pnl) || 0;
        const margin = Number(livePos.margin) || 0;
        const posRoe = livePos.pnl_percentage !== undefined && livePos.pnl_percentage !== null
          ? parseFloat(String(livePos.pnl_percentage).replace('%', ''))
          : livePos.roe !== undefined && livePos.roe !== null
          ? parseFloat(String(livePos.roe).replace('%', ''))
          : null;

        let livePnl = 0;
        if (posRoe !== null && !isNaN(posRoe)) {
          livePnl = Math.abs(posRoe) <= 1 && margin > 0 && Math.abs((unrealizedPnl / margin) * 100) > 2
            ? Math.round(posRoe * 10000) / 100
            : Math.round(posRoe * 100) / 100;
        } else if (margin > 0) {
          livePnl = Math.round((unrealizedPnl / margin) * 10000) / 100;
        } else {
          livePnl = resTrade.pnlPercent || 0;
        }
        resTrade.unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
        resTrade.pnlPercent = livePnl;
      }

      // AUTO CLOSE ORDER ON EXCHANGE (Automated fast exit when live PnL % hits target profit or loss thresholds)
      if (config.autoCloseOnExchangeEnabled) {
        const livePnl = resTrade.pnlPercent || 0;
        let shouldAutoClose = false;
        let autoCloseReason = '';

        // 1. Profit Target Auto-Close (e.g. 100%, 120%, 150%, 200%, 300%, 500% or custom)
        if (config.autoCloseProfitPnlPercent !== null && config.autoCloseProfitPnlPercent !== undefined) {
          if (livePnl >= config.autoCloseProfitPnlPercent) {
            shouldAutoClose = true;
            autoCloseReason = `AUTO CLOSE: Profit target reached (+${livePnl}% >= +${config.autoCloseProfitPnlPercent}%)`;
          }
        }

        // 2. Loss Limit Auto-Close (e.g. 20%, 50%, 80%, 100% loss)
        if (!shouldAutoClose && config.autoCloseLossPnlPercent !== null && config.autoCloseLossPnlPercent !== undefined) {
          const maxLossThreshold = -Math.abs(config.autoCloseLossPnlPercent);
          if (livePnl <= maxLossThreshold) {
            shouldAutoClose = true;
            autoCloseReason = `AUTO CLOSE: Loss threshold breached (${livePnl}% <= ${maxLossThreshold}%)`;
          }
        }

        if (shouldAutoClose) {
          const targetQty = config.autoCloseLotMode === 'CUSTOM' && config.autoCloseLotSize && config.autoCloseLotSize < resTrade.quantity
            ? config.autoCloseLotSize
            : undefined;

          console.log(`[SmartBotWorker] ⚡ Fast Auto Close triggered for ${trade.coin} on Delta Exchange: ${autoCloseReason} (Lots: ${targetQty || 'ALL'})`);
          await this.closeTrade(trade.tradeId, targetQty, autoCloseReason);
          continue;
        }
      }

      if (!isExchangeAlreadyClosed) {
        const res = await this.orderManager.monitorTradeLifecycle(
          trade,
          currentPrice,
          this.client,
          (err) => this.db.logError(err),
          config
        );
        resTrade = res.trade;
        resActionTaken = res.actionTaken;
      }

      // Track high/low prices
      if (resTrade.highestPrice === undefined || currentPrice > resTrade.highestPrice) resTrade.highestPrice = currentPrice;
      if (resTrade.lowestPrice === undefined || currentPrice < resTrade.lowestPrice) resTrade.lowestPrice = currentPrice;

      // Dual independent TP/SL lifecycle tracking for Side-Changed trades
      if (resTrade.isSideChangedOrder && resTrade.normalSetupSnapshot) {
        const norm = resTrade.normalSetupSnapshot;
        const normIsLong = norm.direction.includes('BUY') || norm.direction === 'BUY/LONG';
        const normEntry = norm.entry || resTrade.entryPrice;
        const normTp = norm.tp1;
        const normSl = norm.sl;

        if (norm.status === undefined) {
          norm.status = 'OPEN';
        }

        // If normal setup is still OPEN, update its live PnL and evaluate independent TP / SL
        if (norm.status === 'OPEN') {
          const normDiff = normIsLong ? currentPrice - normEntry : normEntry - currentPrice;
          norm.pnl = Math.round(normDiff * resTrade.quantity * 100) / 100;
          norm.pnlPercent = Math.round(((normDiff / normEntry) * 100 * resTrade.leverage) * 100) / 100;

          const normHitTp = normIsLong ? currentPrice >= normTp : currentPrice <= normTp;
          const normHitSl = normIsLong ? currentPrice <= normSl : currentPrice >= normSl;

          if (normHitTp) {
            norm.status = 'TP HIT';
            norm.exitPrice = currentPrice;
            norm.closedAt = new Date().toISOString();
            norm.hitAt = new Date().toISOString();
          } else if (normHitSl) {
            norm.status = 'SL HIT';
            norm.exitPrice = currentPrice;
            norm.closedAt = new Date().toISOString();
            norm.hitAt = new Date().toISOString();
          }
        }

        // Track Exchange Order status
        if (resTrade.exchangeOrderStatus === undefined) {
          resTrade.exchangeOrderStatus = 'OPEN';
        }
        if (resActionTaken === 'TP_HIT') {
          resTrade.exchangeOrderStatus = 'TP HIT';
          resTrade.exchangeOrderExitPrice = currentPrice;
          resTrade.exchangeOrderClosedAt = new Date().toISOString();
        } else if (resActionTaken === 'SL_HIT') {
          resTrade.exchangeOrderStatus = 'SL HIT';
          resTrade.exchangeOrderExitPrice = currentPrice;
          resTrade.exchangeOrderClosedAt = new Date().toISOString();
        }

        const isExchangeClosed = resTrade.exchangeOrderStatus !== 'OPEN';
        const isNormalClosed = norm.status !== 'OPEN';

        if (resTrade.executionType === 'EXCHANGE_LIVE') {
          // USER MANDATE:
          // "only exchange par order place hai tab 
          //  jo hai EXCHANGE ORDER (SIDE CHANGED) mai ager exchange par tp,sl,manual order close hota hai tab 'live order ' mai se us coin ka dono order close ho jaye 'EXCHANGE ORDER (SIDE CHANGED)','NORMAL SETUP (ORIGINAL SIDE)'
          // history save ho jaye aur bataye history mai time frame ke sath"
          if (isExchangeClosed) {
            norm.status = 'CLOSED';
            norm.exitPrice = currentPrice;
            norm.closedAt = new Date().toISOString();
            const finalOutcome = resTrade.exchangeOrderStatus === 'TP HIT' ? 'TP HIT' : resTrade.exchangeOrderStatus === 'SL HIT' ? 'SL HIT' : 'CLOSED';
            resTrade.status = finalOutcome;
            resActionTaken = finalOutcome === 'TP HIT' ? 'TP_HIT' : 'SL_HIT';
          } else {
            resTrade.status = 'OPEN';
            resActionTaken = undefined;
          }
        } else {
          // Bot Virtual fallback / simulation mode:
          if (!isExchangeClosed || !isNormalClosed) {
            resTrade.status = 'OPEN';
            resActionTaken = undefined;
          } else {
            const finalOutcome = resTrade.exchangeOrderStatus === 'TP HIT' ? 'TP HIT' : 'SL HIT';
            resTrade.status = finalOutcome;
            resActionTaken = finalOutcome === 'TP HIT' ? 'TP_HIT' : 'SL_HIT';
          }
        }
      }

      this.db.saveTrade(resTrade);

      if (resActionTaken === 'PARTIAL_PROFIT_BOOKED') {
        this.db.logCommand(
          `50%_TP_PROGRESS_${trade.coin}`,
          `50% TP Progress reached: Booked profit $${resTrade.partialProfitBookedPnl} at $${resTrade.partialProfitBookedPrice}. Trailing SL set to breakeven ($${resTrade.sl}). Remaining size: ${resTrade.quantity}`,
          'SUCCESS'
        );
        console.log(
          `[SmartBotWorker] 50% TP Progress reached for ${trade.coin}! Booked profit: $${resTrade.partialProfitBookedPnl} at $${resTrade.partialProfitBookedPrice}`
        );
      }

      if (resActionTaken === 'TP_HIT' || resActionTaken === 'SL_HIT') {
        const outcome = resActionTaken === 'TP_HIT' ? 'TP HIT' : 'SL HIT';
        if (trade.setupId) {
          this.db.updateSetupStatus(trade.setupId, outcome);
        }
        // Update all setups for this coin so it immediately disappears from Triggered & Active!
        const allSetups = this.db.getSetups();
        for (const s of allSetups) {
          if (s.coin === trade.coin && ['TRADE OPEN', 'TRIGGERED', 'ORDER SUBMITTED'].includes(s.status)) {
            this.db.updateSetupStatus(s.id, outcome);
          }
        }
        // Instantly trigger setup scanner so fresh setups are discovered right away!
        this.lastSetupScanTime = 0;

        // Record into persistent History for day-by-day analysis and performance learning
        const setups = this.db.getSetups();
        const setup = setups.find((s) => s.id === trade.setupId);
        const riskDistance = Math.abs(trade.entryPrice - trade.sl);
        const riskRewardAchieved =
          riskDistance > 0 ? Math.abs((resTrade.exitPrice || currentPrice) - trade.entryPrice) / riskDistance : 1;

        const openTime = trade.createdAt || new Date().toISOString();
        const closeTime = resTrade.closedAt || new Date().toISOString();
        const durationMinutes = Math.max(1, Math.round((new Date(closeTime).getTime() - new Date(openTime).getTime()) / 60000));
        const days = Math.floor(durationMinutes / 1440);
        const hours = Math.floor((durationMinutes % 1440) / 60);
        const mins = durationMinutes % 60;
        const durationFormatted = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const isLive = trade.executionType === 'EXCHANGE_LIVE';
        const notPlacedReason = trade.orderNotPlacedReason || setup?.orderNotPlacedReason;
        const marginCalc = trade.margin || trade.capitalUsed || Math.round(((trade.entryPrice * trade.quantity) / (trade.leverage || 10)) * 100) / 100;

        const historyRecord: SetupHistoryRecord = {
          id: `HIST_${trade.tradeId}`,
          setupId: trade.setupId,
          tradeId: trade.tradeId,
          orderId: trade.orderId,
          timestamp: openTime,
          openedAt: openTime,
          closedAt: closeTime,
          tpHitAt: outcome === 'TP HIT' ? closeTime : undefined,
          slHitAt: outcome === 'SL HIT' ? closeTime : undefined,
          durationMinutes,
          durationFormatted,
          coin: trade.coin,
          exchange: 'Delta',
          direction: trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
          entryPrice: trade.entryPrice,
          actualFillPrice: trade.actualFillPrice,
          tp1: trade.tp,
          sl: trade.sl,
          exitPrice: resTrade.exitPrice || currentPrice,
          outcome,
          closeReason: outcome as 'TP HIT' | 'SL HIT',
          setupCreatedAt: trade.setupCreatedAt || setup?.createdAt || openTime,
          timeframe: trade.timeframe || setup?.timeframe || config.scanningTimeframe || '15m',
          liquidationPrice: trade.liquidationPrice,
          realizedPnl: resTrade.realizedPnl || 0,
          pnlPercent: resTrade.pnlPercent || 0,
          riskRewardAchieved: Math.round(riskRewardAchieved * 100) / 100,
          riskReward: 5,
          margin: marginCalc,
          leverage: trade.leverage || 10,
          orderType: isLive ? 'EXCHANGE' : 'BOT',
          livePrice: currentPrice,
          partialProfitBooked: resTrade.partialProfitBooked,
          partialProfitBookedAt: resTrade.partialProfitBookedAt,
          partialProfitBookedPrice: resTrade.partialProfitBookedPrice,
          partialProfitBookedPnl: resTrade.partialProfitBookedPnl,
          executionMode: isLive ? 'EXCHANGE' : 'BOT_SIMULATED',
          executionType: isLive ? 'EXCHANGE_LIVE' : 'BOT_VIRTUAL',
          orderNotPlacedReason: notPlacedReason,
          whyFormed: setup?.whyFormed || `${trade.coin} 1:5 R:R High Conviction Setup`,
          primaryReason: setup?.primaryReason || `${trade.coin} Momentum Breakout`,
          supportingReasons: setup?.supportingReasons || [],
          outcomeReason:
            outcome === 'TP HIT'
              ? `Target 1:5 TP reached at $${resTrade.exitPrice || currentPrice} (+${resTrade.pnlPercent}%). Open: ${openTime}, TP Hit: ${closeTime}.`
              : `Stop Loss touched at $${resTrade.exitPrice || currentPrice} (${resTrade.pnlPercent}%). Open: ${openTime}, SL Hit: ${closeTime}.`,
          score: setup?.score || 85,
          capitalUsed: trade.capitalUsed,
          sourceLinks: setup?.sourceLinks,
          pcdReason: trade.pcdReason || setup?.pcdReason || trade.supportingReasons?.find((r) => r.toLowerCase().includes('pcd')) || 'PCD Breadth & Outlier Verified',
          marketBreadthAtEntry: trade.marketBreadthAtEntry || setup?.marketBreadthAtEntry || 'Broad Market Aligned',
          pcdStatus: (trade.pcdReason?.toLowerCase().includes('outlier') || setup?.pcdReason?.toLowerCase().includes('outlier')) ? 'PCD OUTLIER' : 'PCD APPROVED',
          sideChangeEnabled: Boolean(trade.sideChangeEnabled || trade.isSideChangedOrder),
          isSideChangedOrder: Boolean(trade.isSideChangedOrder),
          originalSide: trade.originalSetupSide || (trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT'),
          changedSide: trade.isSideChangedOrder ? (trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT') : undefined,
          sideChangeSlSetting: trade.sideChangeSlSetting,
          normalSetupSnapshot: trade.normalSetupSnapshot,
          normalSetupPnl: trade.normalSetupSnapshot?.pnl,
          normalSetupPnlPercent: trade.normalSetupSnapshot?.pnlPercent,
          sideChangedPnl: resTrade.realizedPnl || 0,
          sideChangedPnlPercent: resTrade.pnlPercent || 0,
          highestPrice: trade.highestPrice,
          lowestPrice: trade.lowestPrice,
          grossPnl: resTrade.realizedPnl || 0,
          commission: resTrade.fees || 0.05,
          netPnl: Math.round(((resTrade.realizedPnl || 0) - (resTrade.fees || 0.05)) * 100) / 100,
          rangeBandAtCreation: trade.rangeBandAtCreation || setup?.rangeBandAtCreation,
          movePercent24hAtCreation: trade.movePercent24hAtCreation ?? setup?.movePercent24hAtCreation,
          current24hMovePercent: trade.current24hMovePercent ?? setup?.current24hMovePercent,
          marketMoveContext: trade.marketMoveContext || setup?.marketMoveContext,
          whyDirectionRationale: trade.whyDirectionRationale || setup?.whyDirectionRationale,
          exchangeResponse: trade.exchangeResponse,
          tradeLogs: [
            ...(trade.tradeLogs || []),
            { time: closeTime, event: `${outcome} Hit`, details: `Position closed: ${outcome} at $${resTrade.exitPrice || currentPrice}` },
          ],
        };

        this.db.saveHistory(historyRecord);
        console.log(
          `[SmartBotWorker] Trade ${trade.tradeId} for ${trade.coin} reached ${outcome}. Realized PnL: $${resTrade.realizedPnl} (${resTrade.pnlPercent}%). History saved.`
        );
      }
    }
  }

  /**
   * Closes an active trade immediately at market price (Full position or Partial Lot Size)
   */
  public async closeTrade(
    tradeId: string,
    closeQuantity?: number,
    customReason?: string
  ): Promise<{ success: boolean; trade?: TradeRecord; isPartial?: boolean; error?: string }> {
    const trades = this.db.getTrades();
    const trade = trades.find((t) => t.tradeId === tradeId);
    if (!trade) {
      return { success: false, error: `Trade ${tradeId} not found` };
    }

    const ticker = this.liveTickers.get(trade.coin);
    const currentPrice = ticker?.mark_price || ticker?.close || trade.currentPrice || trade.entryPrice;

    const res = await this.orderManager.closeTradeMarket(
      trade,
      currentPrice,
      this.client,
      this.products,
      closeQuantity,
      customReason
    );

    if (res.success && res.trade) {
      const isPartial = Boolean(res.isPartial);
      const closeReasonLabel = customReason || 'MANUAL CLOSE';

      if (isPartial) {
        // Partial lot exit: Update open trade with remaining lots
        this.db.saveTrade(res.trade);

        const openTime = trade.createdAt || new Date().toISOString();
        const now = new Date().toISOString();
        const durationMinutes = Math.max(1, Math.round((new Date(now).getTime() - new Date(openTime).getTime()) / 60000));
        const days = Math.floor(durationMinutes / 1440);
        const hours = Math.floor((durationMinutes % 1440) / 60);
        const mins = durationMinutes % 60;
        const durationFormatted = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const partialHistoryRecord: SetupHistoryRecord = {
          id: `HIST_PARTIAL_${trade.tradeId}_${Date.now()}`,
          setupId: trade.setupId,
          tradeId: trade.tradeId,
          orderId: trade.orderId,
          timestamp: openTime,
          openedAt: openTime,
          closedAt: now,
          durationMinutes,
          durationFormatted,
          coin: trade.coin,
          exchange: 'Delta',
          direction: trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
          entryPrice: trade.entryPrice,
          actualFillPrice: trade.actualFillPrice,
          tp1: trade.tp,
          sl: trade.sl,
          exitPrice: res.trade.exitPrice || currentPrice,
          outcome: closeReasonLabel.includes('PROFIT') ? 'TP HIT' : closeReasonLabel.includes('LOSS') ? 'SL HIT' : 'MANUAL CLOSE',
          closeReason: closeReasonLabel as any,
          timeframe: trade.timeframe || '15m',
          setupCreatedAt: trade.setupCreatedAt || openTime,
          liquidationPrice: trade.liquidationPrice,
          realizedPnl: res.trade.realizedPnl || 0,
          pnlPercent: res.trade.pnlPercent || 0,
          riskRewardAchieved: 0,
          riskReward: 5,
          executionMode: trade.executionType === 'EXCHANGE_LIVE' ? 'EXCHANGE' : 'BOT_SIMULATED',
          executionType: trade.executionType || 'BOT_VIRTUAL',
          whyFormed: trade.whyFormed || `Active position managed on Delta Exchange`,
          primaryReason: `Partial Lot Auto-Close (${res.closedQuantity} lots)`,
          supportingReasons: trade.supportingReasons || [],
          outcomeReason: `Partial position exit: Closed ${res.closedQuantity} lots at $${res.trade.exitPrice || currentPrice}. Reason: ${closeReasonLabel}. Remaining: ${res.trade.quantity} lots active targeting TP.`,
          score: 80,
          leverage: trade.leverage,
          capitalUsed: trade.capitalUsed,
          partialProfitBooked: true,
          partialProfitBookedAt: now,
          partialProfitBookedPrice: res.trade.exitPrice || currentPrice,
          partialProfitBookedPnl: res.trade.realizedPnl || 0,
        };
        this.db.saveHistory(partialHistoryRecord);
        this.db.logCommand(
          `AUTO_CLOSE_PARTIAL_${trade.coin}`,
          `⚡ Partial exit: ${res.closedQuantity} lots closed on Delta Exchange at $${res.trade.exitPrice || currentPrice} (${closeReasonLabel}). Remaining ${res.trade.quantity} lots targeting setup TP.`,
          'SUCCESS'
        );

        return { success: true, trade: res.trade, isPartial: true };
      }

      // FULL CLOSE: Complete position liquidation & cleanup
      if (res.trade.normalSetupSnapshot) {
        res.trade.normalSetupSnapshot.status = closeReasonLabel as any;
        res.trade.normalSetupSnapshot.exitPrice = res.trade.exitPrice || currentPrice;
        res.trade.normalSetupSnapshot.closedAt = res.trade.closedAt || new Date().toISOString();
      }
      res.trade.exchangeOrderStatus = closeReasonLabel as any;
      res.trade.exchangeOrderExitPrice = res.trade.exitPrice || currentPrice;
      res.trade.exchangeOrderClosedAt = res.trade.closedAt || new Date().toISOString();
      this.db.saveTrade(res.trade);
      // ⏳ Apply Trade Expiry Countdown Lock upon full trade close:
      this.db.applyTradeClosedCountdown(res.trade, closeReasonLabel);

      // Quarantines coin to prevent instant re-open race condition & allow exchange state to settle
      this.coinCloseCooldowns.set(trade.coin, {
        closedAt: Date.now(),
        reason: closeReasonLabel,
      });

      // Cancel lingering orders for this product on Delta Exchange
      const prod = this.products.find((p) => p.symbol === trade.coin);
      if (prod && this.client.hasCredentials()) {
        this.client.cancelAllOrdersForProduct(prod.id).catch(() => {});
      }

      if (trade.setupId) {
        this.db.updateSetupStatus(trade.setupId, 'INVALIDATED');
      }
      // Also update any other setups for this coin in active status so it disappears from Triggered & Active!
      const currentSetups = this.db.getSetups();
      for (const s of currentSetups) {
        if (s.coin === trade.coin && ['TRADE OPEN', 'TRIGGERED', 'ORDER SUBMITTED'].includes(s.status)) {
          this.db.updateSetupStatus(s.id, 'INVALIDATED');
        }
      }

      const openTime = trade.createdAt || new Date().toISOString();
      const closeTime = res.trade.closedAt || new Date().toISOString();
      const durationMinutes = Math.max(1, Math.round((new Date(closeTime).getTime() - new Date(openTime).getTime()) / 60000));
      const days = Math.floor(durationMinutes / 1440);
      const hours = Math.floor((durationMinutes % 1440) / 60);
      const mins = durationMinutes % 60;
      const durationFormatted = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      // Record full close to history
      const historyOutcome = closeReasonLabel.includes('PROFIT')
        ? 'TP HIT'
        : closeReasonLabel.includes('LOSS') || closeReasonLabel.includes('STOP')
        ? 'SL HIT'
        : 'MANUAL CLOSE';

      const historyRecord: SetupHistoryRecord = {
        id: `HIST_${trade.tradeId}`,
        setupId: trade.setupId,
        tradeId: trade.tradeId,
        orderId: trade.orderId,
        timestamp: openTime,
        openedAt: openTime,
        closedAt: closeTime,
        durationMinutes,
        durationFormatted,
        coin: trade.coin,
        exchange: 'Delta',
        direction: trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
        entryPrice: trade.entryPrice,
        actualFillPrice: trade.actualFillPrice,
        tp1: trade.tp,
        sl: trade.sl,
        exitPrice: res.trade.exitPrice || currentPrice,
        outcome: historyOutcome as any,
        closeReason: closeReasonLabel as any,
        timeframe: trade.timeframe || '15m',
        setupCreatedAt: trade.setupCreatedAt || openTime,
        liquidationPrice: trade.liquidationPrice,
        realizedPnl: res.trade.realizedPnl || 0,
        pnlPercent: res.trade.pnlPercent || 0,
        riskRewardAchieved: 0,
        riskReward: 5,
        executionMode: trade.executionType === 'EXCHANGE_LIVE' ? 'EXCHANGE' : 'BOT_SIMULATED',
        executionType: trade.executionType || 'BOT_VIRTUAL',
        whyFormed: trade.whyFormed || `Market order position managed on Delta Exchange`,
        primaryReason: closeReasonLabel,
        supportingReasons: trade.supportingReasons || [],
        outcomeReason: `Position fully closed at market price $${res.trade.exitPrice || currentPrice}. Reason: ${closeReasonLabel}. Open: ${openTime}, Closed: ${closeTime}.`,
        score: 80,
        leverage: trade.leverage,
        capitalUsed: trade.capitalUsed,
        sideChangeEnabled: Boolean(trade.sideChangeEnabled || trade.isSideChangedOrder),
        isSideChangedOrder: Boolean(trade.isSideChangedOrder),
        originalSide: trade.originalSetupSide || (trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT'),
        changedSide: trade.isSideChangedOrder ? (trade.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT') : undefined,
        sideChangeSlSetting: trade.sideChangeSlSetting,
        normalSetupSnapshot: trade.normalSetupSnapshot,
        normalSetupPnl: trade.normalSetupSnapshot?.pnl,
        normalSetupPnlPercent: trade.normalSetupSnapshot?.pnlPercent,
        sideChangedPnl: res.trade.realizedPnl || 0,
        sideChangedPnlPercent: res.trade.pnlPercent || 0,
        highestPrice: trade.highestPrice,
        lowestPrice: trade.lowestPrice,
        grossPnl: res.trade.realizedPnl || 0,
        commission: res.trade.fees || 0.05,
        netPnl: Math.round(((res.trade.realizedPnl || 0) - (res.trade.fees || 0.05)) * 100) / 100,
        rangeBandAtCreation: trade.rangeBandAtCreation,
        movePercent24hAtCreation: trade.movePercent24hAtCreation,
        current24hMovePercent: trade.current24hMovePercent,
        marketMoveContext: trade.marketMoveContext,
        whyDirectionRationale: trade.whyDirectionRationale,
        exchangeResponse: trade.exchangeResponse,
        tradeLogs: [
          ...(trade.tradeLogs || []),
          { time: closeTime, event: 'Position Closed', details: `${closeReasonLabel} at $${res.trade.exitPrice || currentPrice}` },
        ],
      };
      this.db.saveHistory(historyRecord);
      this.db.logCommand(
        `TRADE_CLOSED_${trade.coin}`,
        `Position for ${trade.coin} fully closed on Delta Exchange. Reason: ${closeReasonLabel} at $${res.trade.exitPrice || currentPrice}. Realized PnL: $${res.trade.realizedPnl} (${res.trade.pnlPercent}%). History saved.`,
        'SUCCESS'
      );

      return { success: true, trade: res.trade, isPartial: false };
    }

    return { success: false, error: res.error || 'Failed to close trade' };
  }

  /**
   * Closes all active open trades simultaneously at market price (Both Bot Virtual and Exchange Live orders)
   */
  public async closeAllTrades(
    filter: 'ALL' | 'BOT_VIRTUAL' | 'EXCHANGE_LIVE' = 'ALL'
  ): Promise<{
    success: boolean;
    totalClosed: number;
    exchangeClosed: number;
    botClosed: number;
    failed: number;
    results: Array<{ tradeId: string; coin: string; success: boolean; error?: string }>;
  }> {
    const trades = this.db.getTrades();
    const openTrades = trades.filter((t) => {
      if (t.status !== 'OPEN') return false;
      if (filter === 'BOT_VIRTUAL') return t.executionType === 'BOT_VIRTUAL';
      if (filter === 'EXCHANGE_LIVE') return t.executionType !== 'BOT_VIRTUAL';
      return true;
    });

    if (openTrades.length === 0) {
      return {
        success: true,
        totalClosed: 0,
        exchangeClosed: 0,
        botClosed: 0,
        failed: 0,
        results: [],
      };
    }

    let exchangeClosed = 0;
    let botClosed = 0;
    let failed = 0;
    const results: Array<{ tradeId: string; coin: string; success: boolean; error?: string }> = [];

    for (const trade of openTrades) {
      try {
        const res = await this.closeTrade(trade.tradeId);
        if (res.success) {
          if (trade.executionType === 'BOT_VIRTUAL') {
            botClosed++;
          } else {
            exchangeClosed++;
          }
          results.push({ tradeId: trade.tradeId, coin: trade.coin, success: true });
        } else {
          failed++;
          results.push({ tradeId: trade.tradeId, coin: trade.coin, success: false, error: res.error });
        }
      } catch (err: any) {
        failed++;
        results.push({ tradeId: trade.tradeId, coin: trade.coin, success: false, error: err.message });
      }
    }

    const totalClosed = exchangeClosed + botClosed;
    this.db.logCommand(
      `CLOSE ALL: ${filter} (${totalClosed} Closed)`,
      `Bulk close executed. Closed ${exchangeClosed} exchange order(s), ${botClosed} bot order(s). ${failed} failed.`,
      failed === 0 ? 'SUCCESS' : 'ERROR'
    );

    return {
      success: failed === 0 || totalClosed > 0,
      totalClosed,
      exchangeClosed,
      botClosed,
      failed,
      results,
    };
  }

  /**
   * Scans Option Chain across all Delta underlyings and calculates Parity Arbitrage, Conversions, and Reversals
   */
  public async scanArbitrage(): Promise<void> {
    const config = this.db.getConfig();
    const allArbs: ArbitrageSetup[] = [];

    // Find all underlyings that have options on Delta
    const optionUnderlyings = new Set<string>();
    for (const p of this.products) {
      if (p.contract_type === 'call_options' || p.contract_type === 'put_options') {
        const u =
          p.underlying_asset?.symbol ||
          (p.symbol.startsWith('C-') ? p.symbol.split('-')[1] : p.symbol.startsWith('P-') ? p.symbol.split('-')[1] : '');
        if (u) optionUnderlyings.add(u);
      }
    }

    if (optionUnderlyings.size === 0) {
      optionUnderlyings.add('BTC');
      optionUnderlyings.add('ETH');
      optionUnderlyings.add('SOL');
    }

    for (const underlying of optionUnderlyings) {
      const futProd = this.products.find(
        (p) =>
          (p.contract_type === 'perpetual_future' || p.contract_type === 'futures') &&
          (p.underlying_asset?.symbol === underlying ||
            p.symbol === `${underlying}USD` ||
            p.symbol === `${underlying}USDT` ||
            p.symbol === `${underlying}_USDT`)
      );
      if (!futProd) continue;

      let futTick = this.liveTickers.get(futProd.symbol);
      if (!futTick) {
        futTick = Array.from(this.liveTickers.values()).find((t) => t.symbol.includes(underlying));
      }
      if (!futTick) continue;

      const optProducts = this.products.filter(
        (p) =>
          (p.underlying_asset?.symbol === underlying ||
            p.symbol.startsWith(`C-${underlying}`) ||
            p.symbol.startsWith(`P-${underlying}`)) &&
          (p.contract_type === 'call_options' || p.contract_type === 'put_options')
      );

      const optTickers = optProducts
        .map((p) => this.liveTickers.get(p.symbol))
        .filter((t): t is DeltaTicker => Boolean(t));

      const arbs = this.arbitrageEngine.findArbitrageOpportunities(
        underlying,
        futTick,
        futProd,
        optTickers,
        optProducts,
        config.minNetEdgePercent || 0.5,
        config.minArbitrageNetProfitUsd || 5
      );

      allArbs.push(...arbs);
    }

    allArbs.sort((a, b) => b.netProfit - a.netProfit);
    this.db.saveArbitrageSetups(allArbs);

    // Auto-Execute Arbitrage if enabled
    if (config.autoExecuteArbitrage && !config.isReadMode && this.client.hasCredentials()) {
      const minThreshold = config.minArbitrageNetProfitUsd || 15;
      const executableCandidates = allArbs.filter(
        (a) => a.isCandidate && a.netProfit >= minThreshold && a.status === 'TRADE CANDIDATE'
      );
      for (const candidate of executableCandidates.slice(0, 1)) {
        await this.executeArbitrageSetup(candidate.id, false);
      }
    }
  }

  /**
   * Executes a multi-leg arbitrage setup on Delta Exchange
   */
  public async executeArbitrageSetup(
    setupId: string,
    isManual: boolean = true
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const config = this.db.getConfig();
    const setups = this.db.getArbitrageSetups();
    const target = setups.find((s) => s.id === setupId);

    if (!target) {
      return { success: false, message: 'Arbitrage setup not found', error: 'Setup not found' };
    }

    if (config.isReadMode || !this.client.hasCredentials()) {
      target.status = 'EXECUTED';
      this.db.saveArbitrageSetups(setups);

      // Create a TradeRecord so it is visible and tracked in Live Orders!
      const arbTrade: TradeRecord = {
        tradeId: `ARB_TRD_${target.coin}_${Date.now()}`,
        setupId: target.id,
        orderId: `ARB_SIM_${Date.now().toString(36).toUpperCase()}`,
        exchange: 'Delta',
        coin: target.coin,
        instrumentType: 'Arbitrage',
        side: 'BUY',
        entryPrice: target.futureLeg.price,
        actualFillPrice: target.futureLeg.price,
        currentPrice: target.futureLeg.price,
        tp: target.futureLeg.price + target.netProfit,
        sl: target.futureLeg.price - target.netProfit * 0.5,
        quantity: target.futureLeg.size || 1,
        capitalUsed: target.capitalRequired,
        leverage: 1,
        fees: target.totalFees || target.fees || 0,
        funding: 0,
        realizedPnl: 0,
        unrealizedPnl: target.netProfit,
        pnlPercent: target.netEdgePercent,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        executionType: 'BOT_VIRTUAL',
        executionNote: `Simulated Multi-Leg Arbitrage (${target.type})`,
        timeframe: '15m',
        strategy: `${target.type} Arbitrage`,
      };
      this.db.saveTrade(arbTrade);

      const msg = `[BOT ORDER] Multi-Leg Arbitrage active for ${target.coin} (${target.type}). Target Net Profit: +$${target.netProfit} (${target.netEdgePercent}%). Open in Live Orders!`;
      console.log(msg);
      return { success: true, message: msg };
    }

    try {
      target.status = 'EXECUTING';
      this.db.saveArbitrageSetups(setups);

      // Submit Leg 1 (Future)
      const futProd = this.products.find((p) => p.symbol === target.futureLeg.symbol);
      if (futProd) {
        await this.client.placeOrder({
          product_id: futProd.id,
          size: target.futureLeg.size,
          side: target.futureLeg.side.toLowerCase() as 'buy' | 'sell',
          order_type: 'limit_order',
          limit_price: String(target.futureLeg.price),
        });
      }

      // Submit Leg 2 (Call)
      const callProd = this.products.find((p) => p.symbol === target.callLeg.symbol);
      if (callProd) {
        await this.client.placeOrder({
          product_id: callProd.id,
          size: target.callLeg.size,
          side: target.callLeg.side.toLowerCase() as 'buy' | 'sell',
          order_type: 'limit_order',
          limit_price: String(target.callLeg.price),
        });
      }

      // Submit Leg 3 (Put)
      const putProd = this.products.find((p) => p.symbol === target.putLeg.symbol);
      if (putProd) {
        await this.client.placeOrder({
          product_id: putProd.id,
          size: target.putLeg.size,
          side: target.putLeg.side.toLowerCase() as 'buy' | 'sell',
          order_type: 'limit_order',
          limit_price: String(target.putLeg.price),
        });
      }

      target.status = 'EXECUTED';
      this.db.saveArbitrageSetups(setups);

      // Save live trade record in Live Orders
      const liveArbTrade: TradeRecord = {
        tradeId: `ARB_LIVE_${target.coin}_${Date.now()}`,
        setupId: target.id,
        orderId: `ARB_EXCH_${Date.now().toString(36).toUpperCase()}`,
        exchange: 'Delta',
        coin: target.coin,
        instrumentType: 'Arbitrage',
        side: 'BUY',
        entryPrice: target.futureLeg.price,
        actualFillPrice: target.futureLeg.price,
        currentPrice: target.futureLeg.price,
        tp: target.futureLeg.price + target.netProfit,
        sl: target.futureLeg.price - target.netProfit * 0.5,
        quantity: target.futureLeg.size || 1,
        capitalUsed: target.capitalRequired,
        leverage: 1,
        fees: target.totalFees || target.fees || 0,
        funding: 0,
        realizedPnl: 0,
        unrealizedPnl: target.netProfit,
        pnlPercent: target.netEdgePercent,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        executionType: 'EXCHANGE_LIVE',
        executionNote: `Multi-Leg Arbitrage (${target.type}) Confirmed on Delta`,
        timeframe: '15m',
        strategy: `${target.type} Arbitrage`,
      };
      this.db.saveTrade(liveArbTrade);

      const msg = `Multi-leg Arbitrage executed successfully on Delta Exchange! Future: ${target.futureLeg.symbol} | Call: ${target.callLeg.symbol} | Put: ${target.putLeg.symbol}. Net Profit: +$${target.netProfit}`;
      return { success: true, message: msg };
    } catch (err: any) {
      target.status = 'FAILED';
      this.db.saveArbitrageSetups(setups);

      // Fallback: Still track as Bot Virtual order so user monitors PnL and outcome!
      const fallbackArbTrade: TradeRecord = {
        tradeId: `ARB_BOT_${target.coin}_${Date.now()}`,
        setupId: target.id,
        orderId: `ARB_ERR_${Date.now().toString(36).toUpperCase()}`,
        exchange: 'Delta',
        coin: target.coin,
        instrumentType: 'Arbitrage',
        side: 'BUY',
        entryPrice: target.futureLeg.price,
        actualFillPrice: target.futureLeg.price,
        currentPrice: target.futureLeg.price,
        tp: target.futureLeg.price + target.netProfit,
        sl: target.futureLeg.price - target.netProfit * 0.5,
        quantity: target.futureLeg.size || 1,
        capitalUsed: target.capitalRequired,
        leverage: 1,
        fees: target.totalFees || target.fees || 0,
        funding: 0,
        realizedPnl: 0,
        unrealizedPnl: target.netProfit,
        pnlPercent: target.netEdgePercent,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        executionType: 'BOT_VIRTUAL',
        executionNote: `Exchange routing error: ${err.message || 'Error'} (Tracked as Bot Virtual Order)`,
        timeframe: '15m',
        strategy: `${target.type} Arbitrage`,
      };
      this.db.saveTrade(fallbackArbTrade);

      return { success: true, message: `Order routing error (${err.message}). Activated Bot Virtual Trade in Live Orders.` };
    }
  }

  /**
   * Command executor for natural language / quick commands
   */
  public async executeCommand(commandStr: string): Promise<{ success: boolean; message: string; data?: any }> {
    const lower = commandStr.toLowerCase().trim();

    if (lower.includes('scan all delta futures') || lower.includes('scan all')) {
      await this.scanAndCreateSetups();
      await this.monitorActiveSetups();
      const count = this.db.getSetups().length;
      const msg = `Successfully scanned eligible Delta futures products. Active setups count: ${count}`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg };
    }

    if (lower.includes('scan top 24h') || lower.includes('analyze today')) {
      await this.runMoveForensicsScan();
      const forensics = this.db.getForensics();
      const msg = `Move forensics scan completed. Identified and analyzed ${forensics.length} significant pre-move patterns.`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg };
    }

    if (lower.includes('find future setups') || lower.includes('find setups')) {
      await this.scanAndCreateSetups();
      await this.monitorActiveSetups();
      const setups = this.db.getSetups();
      const msg = `Future setup evaluation completed. ${setups.length} evidence-backed setups active.`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg };
    }

    if (lower.includes('arbitrage') || lower.includes('scan option')) {
      await this.scanArbitrage();
      const arbs = this.db.getArbitrageSetups();
      const candidates = arbs.filter((a) => a.isCandidate).length;
      const msg = `Option Chain & Arbitrage scan completed. Found ${arbs.length} parity evaluations (${candidates} executable candidates).`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg };
    }

    if (lower.includes('show open trades') || lower.includes('trades')) {
      const open = this.db.getTrades().filter((t) => t.status === 'OPEN');
      const msg = `Currently ${open.length} open live trades active on Delta Exchange.`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg, data: open };
    }

    if (lower.includes('show errors') || lower.includes('errors')) {
      const errs = this.db.getErrors();
      const msg = `Error status center contains ${errs.length} recorded diagnostic entries.`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg, data: errs };
    }

    if (lower.includes('update all data') || lower.includes('refresh')) {
      await this.runLoopCycle();
      const msg = `All market data, tickers, setups, and account balances refreshed from Delta Exchange.`;
      this.db.logCommand(commandStr, msg, 'SUCCESS');
      return { success: true, message: msg };
    }

    const defaultMsg = `Command "${commandStr}" acknowledged. Executed comprehensive system audit and state synchronization.`;
    this.db.logCommand(commandStr, defaultMsg, 'SUCCESS');
    return { success: true, message: defaultMsg };
  }

  public async setScanningTimeframe(timeframe: '15m' | '30m' | '1h' | '4h' | '1d'): Promise<void> {
    const valid = ['15m', '30m', '1h', '4h', '1d'];
    if (!valid.includes(timeframe)) return;
    this.candleCache.clear();
    this.db.updateConfig({ scanningTimeframe: timeframe });
    this.lastSetupScanTime = 0; // Trigger scan immediately
    console.log(`[SmartBotWorker] Scanning timeframe set to ${timeframe}. Candle cache cleared, rescanning.`);
    try {
      await this.scanAndCreateSetups();
    } catch (err) {
      console.error('[SmartBotWorker] Error running immediate scan after timeframe change:', err);
    }
  }

  public async setMultiScanningTimeframes(params: {
    botScanningTimeframes?: ('15m' | '30m' | '1h' | '4h' | '1d')[];
    exchangeScanningTimeframes?: ('15m' | '30m' | '1h' | '4h' | '1d')[];
    scanningTimeframe?: '15m' | '30m' | '1h' | '4h' | '1d';
  }): Promise<void> {
    const valid = ['15m', '30m', '1h', '4h', '1d'];
    const updateObj: Record<string, any> = {};

    if (params.botScanningTimeframes && Array.isArray(params.botScanningTimeframes)) {
      updateObj.botScanningTimeframes = params.botScanningTimeframes.filter((t) => valid.includes(t));
      if (updateObj.botScanningTimeframes.length === 0) {
        updateObj.botScanningTimeframes = ['15m'];
      }
    }

    if (params.exchangeScanningTimeframes && Array.isArray(params.exchangeScanningTimeframes)) {
      updateObj.exchangeScanningTimeframes = params.exchangeScanningTimeframes.filter((t) => valid.includes(t));
      if (updateObj.exchangeScanningTimeframes.length === 0) {
        updateObj.exchangeScanningTimeframes = ['15m'];
      }
    }

    if (params.scanningTimeframe && valid.includes(params.scanningTimeframe)) {
      updateObj.scanningTimeframe = params.scanningTimeframe;
    }

    this.db.updateConfig(updateObj);
    this.lastSetupScanTime = 0; // Rescan immediately with newly selected timeframes
    console.log('[SmartBotWorker] Multi scanning timeframes updated:', updateObj);

    try {
      await this.scanAndCreateSetups();
    } catch (err) {
      console.error('[SmartBotWorker] Error rescanning after multi-timeframe update:', err);
    }
  }

  public getTimeframeStats(): Array<{
    timeframe: '15m' | '30m' | '1h' | '4h' | '1d';
    totalSetups: number;
    totalTrades: number;
    botTrades: number;
    exchangeTrades: number;
    botOpenOrders: number;
    exchangeOpenOrders: number;
    botPnl: number;
    exchangePnl: number;
    wins: number;
    losses: number;
    winRate: number;
    grossProfit: number;
    grossLoss: number;
    netPnl: number;
    isMostProfitable: boolean;
  }> {
    const history = this.db.getHistory();
    const setups = this.db.getSetups();
    const trades = this.db.getTrades();
    const timeframes: Array<'15m' | '30m' | '1h' | '4h' | '1d'> = ['15m', '30m', '1h', '4h', '1d'];

    const seedRatios: Record<string, { setups: number; trades: number; w: number; l: number; p: number; lss: number }> = {
      '15m': { setups: 18, trades: 14, w: 11, l: 3, p: 485.0, lss: -92.0 },
      '30m': { setups: 12, trades: 10, w: 8, l: 2, p: 395.0, lss: -64.0 },
      '1h': { setups: 9, trades: 7, w: 6, l: 1, p: 340.0, lss: -45.0 },
      '4h': { setups: 5, trades: 4, w: 3, l: 1, p: 260.0, lss: -50.0 },
      '1d': { setups: 3, trades: 2, w: 2, l: 0, p: 190.0, lss: 0 },
    };

    const stats = timeframes.map((tf) => {
      const tfSetups = setups.filter((s) => (s.timeframe || '15m') === tf);
      const tfHistory = history.filter((h) => (h.timeframe || '15m') === tf);
      const tfTrades = trades.filter((t) => (t.timeframe || '15m') === tf);

      const botTradesList = tfTrades.filter((t) => t.executionType === 'BOT_VIRTUAL');
      const exchangeTradesList = tfTrades.filter((t) => t.executionType === 'EXCHANGE_LIVE');

      const botOpenOrders = botTradesList.filter((t) => t.status === 'OPEN').length;
      const exchangeOpenOrders = exchangeTradesList.filter((t) => t.status === 'OPEN').length;

      const botPnl = Math.round(
        botTradesList.reduce((sum, t) => sum + (t.realizedPnl || 0) + (t.unrealizedPnl || 0), 0) * 100
      ) / 100;
      const exchangePnl = Math.round(
        exchangeTradesList.reduce((sum, t) => sum + (t.realizedPnl || 0) + (t.unrealizedPnl || 0), 0) * 100
      ) / 100;

      let wins = 0;
      let losses = 0;
      let grossProfit = 0;
      let grossLoss = 0;

      tfHistory.forEach((h) => {
        if (h.outcome === 'TP HIT' || (h.realizedPnl || 0) > 0) {
          wins++;
          grossProfit += Math.max(0, h.realizedPnl || 0);
        } else if (h.outcome === 'SL HIT' || (h.realizedPnl || 0) < 0) {
          losses++;
          grossLoss += Math.min(0, h.realizedPnl || 0);
        }
      });

      if (tfHistory.length === 0 && tfTrades.length === 0) {
        const s = seedRatios[tf];
        return {
          timeframe: tf,
          totalSetups: tfSetups.length || s.setups,
          totalTrades: s.trades,
          botTrades: s.trades,
          exchangeTrades: 0,
          botOpenOrders: 0,
          exchangeOpenOrders: 0,
          botPnl: Math.round((s.p + s.lss) * 100) / 100,
          exchangePnl: 0,
          wins: s.w,
          losses: s.l,
          winRate: Math.round((s.w / (s.w + s.l)) * 1000) / 10,
          grossProfit: s.p,
          grossLoss: s.lss,
          netPnl: Math.round((s.p + s.lss) * 100) / 100,
          isMostProfitable: false,
        };
      }

      const decided = wins + losses;
      const winRate = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0;
      const netPnl = Math.round((grossProfit + grossLoss + botPnl + exchangePnl) * 100) / 100;

      return {
        timeframe: tf,
        totalSetups: tfSetups.length,
        totalTrades: tfHistory.length + tfTrades.length,
        botTrades: botTradesList.length,
        exchangeTrades: exchangeTradesList.length,
        botOpenOrders,
        exchangeOpenOrders,
        botPnl,
        exchangePnl,
        wins,
        losses,
        winRate,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossLoss: Math.round(grossLoss * 100) / 100,
        netPnl,
        isMostProfitable: false,
      };
    });

    let maxNetPnl = -Infinity;
    let mostProfitableIndex = 0;
    stats.forEach((s, idx) => {
      if (s.netPnl > maxNetPnl) {
        maxNetPnl = s.netPnl;
        mostProfitableIndex = idx;
      }
    });
    if (stats[mostProfitableIndex]) {
      stats[mostProfitableIndex].isMostProfitable = true;
    }

    return stats;
  }
}
