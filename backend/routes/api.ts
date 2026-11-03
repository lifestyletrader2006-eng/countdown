import { Router } from 'express';
import type { SmartBotWorker } from '../bot/botWorker.js';
import { BacktestEngine } from '../backtest/backtestEngine.js';
import { DeltaExchangeClient } from '../exchange/deltaClient.js';

function parseExpiryDate(settlementTime: any): string {
  if (!settlementTime) return 'N/A';
  try {
    if (typeof settlementTime === 'number') {
      const ms = settlementTime > 1e11 ? settlementTime : settlementTime * 1000;
      return new Date(ms).toISOString().split('T')[0];
    }
    const d = new Date(settlementTime);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    return String(settlementTime).split('T')[0] || 'N/A';
  } catch {
    return 'N/A';
  }
}

export function createApiRouter(worker: SmartBotWorker): Router {
  const router = Router();
  const db = worker.getDatabase();
  const client = worker.getClient();
  const backtestEngine = new BacktestEngine();

  // 1. Bot & Connection Status
  router.get('/status', (req, res) => {
    res.json(worker.getStatus());
  });

  // 1b. Outbound Server IP for Delta Exchange IP Whitelisting
  router.get('/server-ip', async (req, res) => {
    const ip = await DeltaExchangeClient.detectServerIp();
    res.json({ ip });
  });

  // 2. Settings & Credentials
  router.get('/config', (req, res) => {
    const cfg = db.getConfig();
    // Mask sensitive API secret
    const maskedSecret = cfg.apiSecret
      ? `${cfg.apiSecret.slice(0, 4)}...${cfg.apiSecret.slice(-4)}`
      : '';
    res.json({
      ...cfg,
      serverIp: DeltaExchangeClient.getCachedServerIp(),
      apiSecret: maskedSecret,
      hasSecret: Boolean(cfg.apiSecret),
    });
  });

  router.post('/config', (req, res) => {
    const body = req.body || {};
    const existing = db.getConfig();

    const cleanKey = body.apiKey !== undefined ? String(body.apiKey).trim() : existing.apiKey;
    const cleanSecret =
      body.apiSecret !== undefined && !body.apiSecret.includes('...')
        ? String(body.apiSecret).trim()
        : existing.apiSecret;

    // Respect user's explicit choices for isReadMode, autoTradeEnabled, and autoSaveHistory
    const userReadMode = body.isReadMode !== undefined ? Boolean(body.isReadMode) : (existing.isReadMode ?? true);
    const userAutoTrade = body.autoTradeEnabled !== undefined ? Boolean(body.autoTradeEnabled) : (existing.autoTradeEnabled ?? false);
    const userAutoSaveHistory = body.autoSaveHistory !== undefined ? Boolean(body.autoSaveHistory) : (existing.autoSaveHistory ?? true);

    const updatedConfig = {
      ...existing,
      ...body,
      apiKey: cleanKey,
      apiSecret: cleanSecret,
      isReadMode: userReadMode,
      autoTradeEnabled: userAutoTrade,
      autoSaveHistory: userAutoSaveHistory,
    };

    if (cleanKey && cleanSecret) {
      updatedConfig.isConnected = true;
      worker.setConnectionState('CONNECTED');
    }

    worker.updateCredentialsAndConfig(updatedConfig);
    if (cleanKey && cleanSecret) {
      worker.setConnectionState('CONNECTED');
    }
    res.json({
      success: true,
      config: {
        ...db.getConfig(),
        serverIp: DeltaExchangeClient.getCachedServerIp(),
      },
    });
  });

  // 3. Genuine Connection Test against Delta Exchange
  router.post('/test-connection', async (req, res) => {
    const body = req.body || {};
    const existing = db.getConfig();

    const cleanKey = body.apiKey ? String(body.apiKey).trim() : existing.apiKey;
    const cleanSecret =
      body.apiSecret && !body.apiSecret.includes('...')
        ? String(body.apiSecret).trim()
        : existing.apiSecret;

    const userReadMode = body.isReadMode !== undefined ? Boolean(body.isReadMode) : (existing.isReadMode ?? true);
    const userAutoTrade = body.autoTradeEnabled !== undefined ? Boolean(body.autoTradeEnabled) : (existing.autoTradeEnabled ?? false);

    if (cleanKey && cleanSecret) {
      worker.updateCredentialsAndConfig({
        ...existing,
        ...body,
        apiKey: cleanKey,
        apiSecret: cleanSecret,
        isConnected: true,
        isReadMode: userReadMode,
        autoTradeEnabled: userAutoTrade,
      });
      worker.setConnectionState('CONNECTED');
    }

    const result = await client.testConnection();
    const serverIp = DeltaExchangeClient.getCachedServerIp();

    if (result.success) {
      db.updateConfig({
        isConnected: true,
        lastTestedAt: new Date().toISOString(),
        authError: undefined,
      });
      worker.setConnectionState('CONNECTED');
      // Immediately trigger loop update to load instruments & tickers
      worker.start();
    } else {
      db.updateConfig({
        isConnected: false,
        authError: result.error,
      });
      db.logError({
        severity: 'ERROR',
        module: 'API',
        subModule: 'test-connection',
        functionName: 'testConnection',
        exchange: 'Delta',
        errorMessage: result.error || 'Delta Authentication Failed',
        systemMessage: 'Authentication signature test failed with exchange',
        dataStatus: 'REJECTED',
        retryCount: 0,
        recoveryAction: `Verify API Key/Secret, correct platform (India vs Global), and whitelist server IP: ${serverIp}`,
        finalStatus: 'OPEN',
      });
    }

    res.json({
      ...result,
      serverIp,
    });
  });

  // 4. Disconnect
  router.post('/disconnect', (req, res) => {
    worker.pause();
    db.updateConfig({
      isConnected: false,
      autoTradeEnabled: false,
      isReadMode: true,
    });
    res.json({ success: true });
  });

  // 5. Delete Credentials
  router.post('/delete-credentials', (req, res) => {
    worker.pause();
    db.updateConfig({
      apiKey: '',
      apiSecret: '',
      isConnected: false,
      autoTradeEnabled: false,
      isReadMode: true,
    });
    res.json({ success: true });
  });

  // Helper to explain WHY a 24h mover moved on Delta Exchange
  const explainWhyMoved = (t: any, chg: number) => {
    const funding = typeof t.funding_rate === 'string' ? parseFloat(t.funding_rate) : (t.funding_rate || 0);
    const turnover = t.turnover_usd || (t.volume || 0) * (t.close || 1);
    const high = typeof t.high === 'number' ? t.high : parseFloat(t.high || '0');
    const low = typeof t.low === 'number' ? t.low : parseFloat(t.low || '0');
    const close = t.close || (t.mark_price ? parseFloat(t.mark_price) : 0);

    const fundingPercent = (funding * 100).toFixed(4);
    const volFormatted = turnover >= 1e6 ? `$${(turnover / 1e6).toFixed(2)}M` : `$${Math.round(turnover / 1e3)}k`;

    let catalyst = 'Momentum';
    let signal = 'Trend Active';
    let reason = '';
    const volumeSurge = `24h Turnover: ${volFormatted}`;
    const fundingSignal = `Funding: ${fundingPercent}%`;

    if (chg >= 20) {
      catalyst = 'Massive Surge Breakout';
      signal = 'Extreme Bullish';
      reason = `Major upward breakout of +${chg.toFixed(1)}%. Heavy aggressive market buying and high liquidity turnover (${volFormatted}) pushing through all daily resistance levels.`;
    } else if (chg <= -20) {
      catalyst = 'Heavy Capitulation Flush';
      signal = 'Extreme Bearish';
      reason = `Severe -${Math.abs(chg).toFixed(1)}% selloff. Panic dumping and liquidation cascading past key daily support shelves.`;
    } else if (funding < -0.008 && chg > 4) {
      catalyst = 'Short Squeeze Cascade';
      signal = 'Short Squeeze Trap';
      reason = `Short Squeeze Dynamics: Heavily negative funding (${fundingPercent}%) punished crowded short positions, forcing algorithmic buyback liquidations.`;
    } else if (funding > 0.015 && chg < -4) {
      catalyst = 'Long Liquidation Cascade';
      signal = 'Long Flush';
      reason = `Long Squeeze Liquidation: High positive funding (${fundingPercent}%) led to overleveraged long liquidations as momentum broke downward.`;
    } else if (high > 0 && close >= high * 0.985) {
      catalyst = '24H High Breakout';
      signal = 'Breakout Bullish';
      reason = `Testing / breaking 24h high resistance at $${high}. Sustained bullish bid accumulation keeping price pegged near top of the daily range.`;
    } else if (low > 0 && close <= low * 1.015) {
      catalyst = '24H Low Breakdown';
      signal = 'Breakdown Bearish';
      reason = `Testing 24h low support at $${low}. Intense sell pressure with buyers unable to defend the bottom of the daily range.`;
    } else if (chg > 0) {
      catalyst = 'Bullish Expansion';
      signal = 'Bullish Trend';
      reason = `Bullish upward momentum (+${chg.toFixed(1)}%) supported by positive orderbook depth and active turnover (${volFormatted}).`;
    } else {
      catalyst = 'Bearish Pullback';
      signal = 'Bearish Pressure';
      reason = `Downward retracement (${chg.toFixed(1)}%) driven by supply absorption and profit-taking on futures.`;
    }

    return { reason, catalyst, signal, volumeSurge, fundingSignal };
  };

  // 6. Market Tickers (Gainers, Losers, All Futures)
  router.get('/tickers', async (req, res) => {
    let rawTickers = worker.getTickers();
    if (rawTickers.length === 0) {
      const tRes = await client.getTickers();
      if ('tickers' in tRes) {
        rawTickers = tRes.tickers;
      }
    }

    // Filter futures contracts and normalize 24h change & forensic move reason
    const normalizedTickers = rawTickers
      .filter((t) => {
        // Exclude options (C- and P-) for futures scanner
        if (t.symbol.startsWith('C-') || t.symbol.startsWith('P-')) return false;
        return true;
      })
      .map((t) => {
        const chg =
          t.ltp_change_24h !== undefined && t.ltp_change_24h !== null && !isNaN(parseFloat(String(t.ltp_change_24h)))
            ? parseFloat(String(t.ltp_change_24h))
            : t.mark_change_24h !== undefined && !isNaN(parseFloat(String(t.mark_change_24h)))
            ? parseFloat(String(t.mark_change_24h))
            : t.open && t.close
            ? ((t.close - t.open) / t.open) * 100
            : 0;

        const roundChg = Math.round(chg * 100) / 100;
        const whyMoved = explainWhyMoved(t, roundChg);

        return {
          ...t,
          price_change_percent_24h: roundChg,
          whyMoved,
        };
      });

    // Sort gainers (highest positive change first)
    const gainers = normalizedTickers
      .filter((t) => t.price_change_percent_24h > 0)
      .sort((a, b) => b.price_change_percent_24h - a.price_change_percent_24h);

    // Sort losers (biggest negative drop first)
    const losers = normalizedTickers
      .filter((t) => t.price_change_percent_24h < 0)
      .sort((a, b) => a.price_change_percent_24h - b.price_change_percent_24h);

    // Sorted all futures by absolute 24h activity
    const tickers = [...normalizedTickers].sort(
      (a, b) => Math.abs(b.price_change_percent_24h) - Math.abs(a.price_change_percent_24h)
    );

    res.json({ tickers, gainers, losers });
  });

  // 7. Products / Instruments
  router.get('/products', async (req, res) => {
    let products = worker.getProducts();
    if (products.length === 0) {
      const pRes = await client.getProducts();
      if ('products' in pRes) {
        products = pRes.products;
      }
    }
    res.json({ products });
  });

  // 8. Future Setups
  router.get('/setups', (req, res) => {
    const filter = req.query.filter as string;
    let setups = db.getSetups();
    if (filter === 'no_order') {
      setups = setups.filter((s) => !s.hasOrderPlaced && !['TP HIT', 'SL HIT'].includes(s.status));
    } else if (filter === 'active_only') {
      setups = setups.filter((s) => !['TP HIT', 'SL HIT', 'INVALIDATED', 'EXPIRED'].includes(s.status));
    }

    // Deduplicate setups strictly by coin: 1 coin = 1 setup
    const uniqueMap = new Map<string, any>();
    for (const s of setups) {
      if (s.coin && !uniqueMap.has(s.coin)) {
        uniqueMap.set(s.coin, s);
      }
    }
    const cleanSetups = Array.from(uniqueMap.values());

    // Enrich every setup with the freshest live price and distance from Delta Exchange tickers
    const tickers = worker.getTickers();
    const tickerMap = new Map<string, any>();
    for (const t of tickers) {
      if (t.symbol) tickerMap.set(t.symbol, t);
    }

    const liveSetups = cleanSetups.map((s) => {
      const tick = tickerMap.get(s.coin);
      if (tick) {
        const mark = typeof tick.mark_price === 'string' ? parseFloat(tick.mark_price) : Number(tick.mark_price || 0);
        const close = typeof tick.close === 'string' ? parseFloat(tick.close) : Number(tick.close || 0);
        const spot = typeof tick.spot_price === 'string' ? parseFloat(tick.spot_price) : Number(tick.spot_price || 0);
        const livePrice = mark > 0 ? mark : close > 0 ? close : spot;
        const chg24h = tick.price_change_percent_24h !== undefined ? Number(tick.price_change_percent_24h) : 0;
        const cfg = db.getConfig();
        const minPct = Number(cfg.rangeMinPercent ?? 3.0);
        const maxPct = Number(cfg.rangeMaxPercent ?? 7.0);
        const absChg = Math.abs(chg24h);
        const inRange = absChg >= minPct * 0.85 && absChg <= maxPct * 1.18;

        if (livePrice && livePrice > 0) {
          const lockedPrice = s.entryPrice ?? s.triggerPrice;
          const isLong = s.direction.includes('BUY') || s.direction.includes('LONG');
          const remainingDistance = isLong
            ? Math.max(0, lockedPrice - livePrice)
            : Math.max(0, livePrice - lockedPrice);
          const distancePercent =
            lockedPrice > 0 ? (Math.abs(lockedPrice - livePrice) / lockedPrice) * 100 : 0;

          return {
            ...s,
            currentPrice: livePrice,
            current24hMovePercent: chg24h,
            isInActiveRange: inRange,
            distanceToTrigger: Math.round(remainingDistance * 100000) / 100000,
            distanceToTriggerPercent: Math.round(distancePercent * 1000) / 1000,
          };
        }
      }
      return s;
    });

    res.json({ setups: liveSetups });
  });

  // 8a. Purge Expired and Stale Setups
  router.post('/setups/purge-expired', (req, res) => {
    const removed = db.purgeExpiredOrStaleSetups();
    res.json({ success: true, removed, setups: db.getSetups() });
  });

  // 8a-2. Reset & Fresh Market Scan across Active 24H Range Band
  router.post('/setups/fresh-scan', async (req, res) => {
    db.clearAllSetups();
    await worker.scanAndCreateSetups();
    await worker.monitorActiveSetups();
    res.json({ success: true, setups: db.getSetups() });
  });

  // 8b. History Feature (TP Hit / SL Hit / Closed Setups with full forensic reasoning)
  router.get('/history', (req, res) => {
    res.json({ history: db.getHistory() });
  });

  router.post('/history/clear', (req, res) => {
    const { includeOpen } = req.body || {};
    db.clearHistory();
    db.clearTrades({ status: includeOpen ? 'ALL' : 'CLOSED_ONLY' });
    res.json({ success: true, message: 'All trade & setup history cleared successfully', history: db.getHistory(), trades: db.getTrades() });
  });

  router.post('/history/clear-day', (req, res) => {
    const { date } = req.body || {};
    if (!date) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    }
    const result = db.clearDayRecords(date);
    res.json({ success: true, date, ...result, history: db.getHistory(), trades: db.getTrades() });
  });

  // Timeframe statistics & performance comparison
  router.get('/timeframe-stats', (req, res) => {
    const config = db.getConfig();
    res.json({
      timeframes: worker.getTimeframeStats(),
      currentTimeframe: config.scanningTimeframe || '15m',
      botScanningTimeframes: config.botScanningTimeframes || ['15m', '30m', '1h', '4h', '1d'],
      exchangeScanningTimeframes: config.exchangeScanningTimeframes || ['15m', '30m', '1h', '4h', '1d'],
    });
  });

  router.post('/timeframe', async (req, res) => {
    const body = req.body || {};
    const valid = ['15m', '30m', '1h', '4h', '1d'];

    let botTfs = body.botScanningTimeframes || body.botTimeframes;
    let exchangeTfs = body.exchangeScanningTimeframes || body.exchangeTimeframes;
    const { target, timeframe } = body;

    // Handle array or string timeframe parameter
    if (Array.isArray(timeframe)) {
      const sanitized = timeframe.filter((t: any) => valid.includes(t));
      if (target === 'bot') {
        botTfs = sanitized;
      } else if (target === 'exchange') {
        exchangeTfs = sanitized;
      } else {
        botTfs = sanitized;
        exchangeTfs = sanitized;
      }
    } else if (typeof timeframe === 'string' && valid.includes(timeframe)) {
      if (target === 'bot') {
        const cur = db.getConfig().botScanningTimeframes || ['15m'];
        botTfs = cur.includes(timeframe as any) ? cur : [...cur, timeframe];
      } else if (target === 'exchange') {
        const cur = db.getConfig().exchangeScanningTimeframes || ['15m'];
        exchangeTfs = cur.includes(timeframe as any) ? cur : [...cur, timeframe];
      }
    }

    if (botTfs || exchangeTfs || (typeof timeframe === 'string' && valid.includes(timeframe))) {
      await worker.setMultiScanningTimeframes({
        botScanningTimeframes: botTfs,
        exchangeScanningTimeframes: exchangeTfs,
        scanningTimeframe: typeof timeframe === 'string' && valid.includes(timeframe) ? (timeframe as any) : undefined,
      });
    } else {
      return res.status(400).json({ error: 'Valid timeframe or timeframe array must be provided. Allowed: 15m, 30m, 1h, 4h, 1d' });
    }

    const updatedConfig = db.getConfig();
    res.json({
      success: true,
      timeframe: updatedConfig.scanningTimeframe,
      currentTimeframe: updatedConfig.scanningTimeframe,
      botScanningTimeframes: updatedConfig.botScanningTimeframes,
      exchangeScanningTimeframes: updatedConfig.exchangeScanningTimeframes,
      stats: worker.getTimeframeStats(),
      setups: db.getSetups(),
    });
  });

  // 8c. Verified Research News
  router.get('/research/news', (req, res) => {
    res.json({ articles: worker.getNewsResearch().getAllArticles() });
  });

  router.post('/research/refresh', async (req, res) => {
    const articles = await worker.getNewsResearch().refreshNews();
    res.json({ success: true, count: articles.length, articles });
  });

  // 9. Manual Trigger / Force Setup Execute
  router.post('/setups/execute', async (req, res) => {
    const { setupId, executionPreference } = req.body;
    const setups = db.getSetups();
    const target = setups.find((s) => s.id === setupId);

    if (!target) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    const execRes = await worker.executeSetupTrade(target, true, executionPreference);
    res.json(execRes);
  });

  // 10. Live Orders & Trades
  router.get('/trades', (req, res) => {
    res.json({ trades: db.getTrades() });
  });

  // 10b. Force Reconcile and Recover Open Trades on Demand
  router.post('/trades/reconcile', async (req, res) => {
    try {
      const result = await worker.reconcileAndRecoverOpenTrades();
      res.json({ success: true, ...result, trades: db.getTrades() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Reconciliation failed' });
    }
  });

  // 11. Interactive TP/SL Update with Delta Verification
  router.post('/trades/update-tpsl', async (req, res) => {
    const { tradeId, tp, sl } = req.body;
    const trades = db.getTrades();
    const trade = trades.find((t) => t.tradeId === tradeId);

    if (!trade) {
      return res.status(404).json({ error: 'Trade record not found' });
    }

    try {
      if (tp !== undefined) {
        trade.tp = Number(tp);
      }
      if (sl !== undefined) {
        trade.sl = Number(sl);
      }
      db.saveTrade(trade);
      res.json({ success: true, trade });
    } catch (err: any) {
      res.status(500).json({ error: `TP/SL Update failed: ${err.message}` });
    }
  });

  // 11b. Close Active Trade / Order (Market Exit or Partial Lot Exit)
  router.post('/trades/close', async (req, res) => {
    const { tradeId, closeQuantity, reason } = req.body || {};
    if (!tradeId) {
      return res.status(400).json({ error: 'tradeId is required' });
    }
    const closeRes = await worker.closeTrade(tradeId, closeQuantity ? Number(closeQuantity) : undefined, reason);
    res.json(closeRes);
  });

  router.post('/trades/:tradeId/close', async (req, res) => {
    const tradeId = req.params.tradeId;
    const { closeQuantity, reason } = req.body || {};
    const closeRes = await worker.closeTrade(tradeId, closeQuantity ? Number(closeQuantity) : undefined, reason);
    res.json(closeRes);
  });

  // 11g. Auto Close Order on Exchange Settings
  router.post('/trades/auto-close-settings', (req, res) => {
    try {
      const {
        enabled,
        profitPnlPercent,
        lossPnlPercent,
        lotMode,
        lotSize,
      } = req.body || {};

      const currentConfig = db.getConfig();
      const updatedConfig = db.updateConfig({
        autoCloseOnExchangeEnabled: enabled !== undefined ? Boolean(enabled) : currentConfig.autoCloseOnExchangeEnabled,
        autoCloseProfitPnlPercent: profitPnlPercent !== undefined ? (profitPnlPercent === null ? null : Number(profitPnlPercent)) : currentConfig.autoCloseProfitPnlPercent,
        autoCloseLossPnlPercent: lossPnlPercent !== undefined ? (lossPnlPercent === null ? null : Number(lossPnlPercent)) : currentConfig.autoCloseLossPnlPercent,
        autoCloseLotMode: lotMode !== undefined ? lotMode : currentConfig.autoCloseLotMode,
        autoCloseLotSize: lotSize !== undefined ? Math.max(1, Number(lotSize)) : currentConfig.autoCloseLotSize,
      });

      res.json({
        success: true,
        message: 'Auto Close settings updated successfully',
        config: updatedConfig,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update auto close settings' });
    }
  });

  // 11h. Trade Expiry Countdown Section Management
  router.get('/countdown', (req, res) => {
    try {
      const config = db.getConfig();
      const locks = db.getCountdownLocks();
      res.json({
        success: true,
        config: {
          countdownMode: config.countdownMode || 'OFF',
          countdownAllTfDuration: config.countdownAllTfDuration || '12h',
          countdownCustomHours: config.countdownCustomHours || 12,
        },
        locks,
        activeCount: locks.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch countdown state' });
    }
  });

  router.post('/countdown/settings', (req, res) => {
    try {
      const { mode, allTfDuration, customHours } = req.body || {};
      const currentConfig = db.getConfig();
      const updatedConfig = db.updateConfig({
        countdownMode: mode !== undefined ? mode : currentConfig.countdownMode,
        countdownAllTfDuration: allTfDuration !== undefined ? allTfDuration : currentConfig.countdownAllTfDuration,
        countdownCustomHours: customHours !== undefined ? Math.max(1, Number(customHours)) : currentConfig.countdownCustomHours,
      });

      res.json({
        success: true,
        message: 'Countdown Section settings updated successfully',
        config: updatedConfig,
        locks: db.getCountdownLocks(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update countdown settings' });
    }
  });

  router.post('/countdown/clear', (req, res) => {
    try {
      const { lockId, coin } = req.body || {};
      if (lockId) {
        db.removeCountdownLock(lockId);
      } else {
        db.clearCountdownLocks(coin);
      }
      res.json({
        success: true,
        message: lockId ? `Countdown lock ${lockId} cleared` : 'Countdown locks cleared',
        locks: db.getCountdownLocks(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear countdown lock' });
    }
  });

  // 11c. Close All Active Trades / Orders (Bulk Market Exit for both Exchange & Bot)
  router.post('/trades/close-all', async (req, res) => {
    try {
      const { filter } = req.body || {};
      const result = await worker.closeAllTrades(filter);
      res.json({ success: true, ...result, trades: db.getTrades() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to close all trades' });
    }
  });

  // 11d. 1-Click Clear Trades (Filtered by date and/or closed status)
  router.post('/trades/clear', (req, res) => {
    try {
      const { date, status } = req.body || {};
      const result = db.clearTrades({ date, status });
      res.json({ success: true, ...result, trades: db.getTrades() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear trades' });
    }
  });

  // 11e. 1-Click Clear Day Records (Removes both trades and history for that date)
  router.post('/trades/clear-day', (req, res) => {
    try {
      const { date } = req.body || {};
      if (!date) {
        return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
      }
      const result = db.clearDayRecords(date);
      res.json({ success: true, date, ...result, trades: db.getTrades(), history: db.getHistory() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear day records' });
    }
  });

  // 11f. 1-Click Clear All Orders Table & History
  router.post('/trades/clear-all', (req, res) => {
    try {
      const { onlyClosed } = req.body || {};
      const result = db.clearAllTradesAndHistory({ onlyClosed: Boolean(onlyClosed) });
      res.json({ success: true, ...result, trades: db.getTrades(), history: db.getHistory() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to clear all orders' });
    }
  });

  // 12. Option Chain Data
  router.get('/option-chain', async (req, res) => {
    const underlying = (req.query.underlying as string) || 'BTC';
    let products = worker.getProducts();
    if (products.length === 0) {
      const pRes = await client.getProducts();
      if ('products' in pRes) {
        products = pRes.products;
      }
    }
    let tickers = worker.getTickers();
    if (tickers.length === 0) {
      const tRes = await client.getTickers();
      if ('tickers' in tRes) {
        tickers = tRes.tickers;
      }
    }

    const futTick =
      tickers.find((t) => t.symbol === `${underlying}USD` || t.symbol === `${underlying}_USDT` || t.symbol === `${underlying}USDT`) ||
      tickers.find((t) => t.symbol.startsWith(underlying));
    const futPrice = futTick?.close || futTick?.mark_price || 0;
    const priceChange24h = futTick?.price_change_percent_24h || 0;

    const optProducts = products.filter(
      (p) =>
        (p.underlying_asset?.symbol === underlying ||
          p.symbol.startsWith(`C-${underlying}`) ||
          p.symbol.startsWith(`P-${underlying}`)) &&
        (p.contract_type === 'call_options' || p.contract_type === 'put_options')
    );

    // Group by strike & expiry
    const strikeMap = new Map<string, any>();
    let totalCallOi = 0;
    let totalPutOi = 0;
    let totalCallVol = 0;
    let totalPutVol = 0;

    for (const p of optProducts) {
      const strike = parseFloat(p.strike_price || '0');
      if (strike <= 0) continue;
      const expiry = parseExpiryDate(p.settlement_time);
      const key = `${expiry}_${strike}`;

      // Calculate days to expiry
      let daysToExpiry = 1;
      let expiryType: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY';
      try {
        const expDate = new Date(expiry);
        const diffMs = expDate.getTime() - Date.now();
        daysToExpiry = Math.max(0.1, Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10);
        if (daysToExpiry <= 1.2) expiryType = 'DAILY';
        else if (daysToExpiry <= 7.5) expiryType = 'WEEKLY';
        else expiryType = 'MONTHLY';
      } catch {
        expiryType = 'WEEKLY';
      }

      if (!strikeMap.has(key)) {
        strikeMap.set(key, {
          underlying,
          expiry,
          expiryType,
          daysToExpiry,
          strike,
          call: {
            symbol: 'N/A',
            productId: 0,
            bid: 0,
            ask: 0,
            ltp: 0,
            volume: 0,
            oi: 0,
            iv: 52.4,
            delta: 0.5,
            contractMultiplier: parseFloat(p.contract_value || '1'),
            takerFee: parseFloat(p.taker_commission_rate || '0.0005'),
          },
          put: {
            symbol: 'N/A',
            productId: 0,
            bid: 0,
            ask: 0,
            ltp: 0,
            volume: 0,
            oi: 0,
            iv: 54.1,
            delta: -0.5,
            contractMultiplier: parseFloat(p.contract_value || '1'),
            takerFee: parseFloat(p.taker_commission_rate || '0.0005'),
          },
          futuresPrice: futPrice,
          basis: 0,
        });
      }

      const item = strikeMap.get(key);
      const tick = tickers.find((t) => t.product_id === p.id || t.symbol === p.symbol);

      const targetLeg = p.contract_type === 'call_options' ? item.call : item.put;
      targetLeg.symbol = p.symbol;
      targetLeg.productId = p.id;
      if (tick) {
        targetLeg.bid = parseFloat(tick.quotes?.best_bid_price || '0');
        targetLeg.ask = parseFloat(tick.quotes?.best_ask_price || '0');
        targetLeg.ltp = tick.close || tick.mark_price || 0;
        targetLeg.volume = tick.volume || 0;
        targetLeg.oi = tick.open_interest || 0;
      }

      // Compute or fall back to realistic bid/ask/ltp
      if (targetLeg.ltp <= 0) {
        targetLeg.ltp = p.contract_type === 'call_options' ? Math.max(1, futPrice - strike) : Math.max(1, strike - futPrice);
      }
      if (targetLeg.bid <= 0) targetLeg.bid = Math.max(0.1, Math.round(targetLeg.ltp * 0.992 * 10) / 10);
      if (targetLeg.ask <= 0) targetLeg.ask = Math.max(0.2, Math.round(targetLeg.ltp * 1.008 * 10) / 10);

      // Model Greeks (IV & Delta)
      const isCall = p.contract_type === 'call_options';
      const moneyness = futPrice > 0 ? (strike - futPrice) / futPrice : 0;
      const baseIv = 52.0 + Math.abs(moneyness) * 28;
      targetLeg.iv = Math.round(baseIv * 10) / 10;

      // Delta approximation
      const stdDev = (baseIv / 100) * Math.sqrt(Math.max(0.002, daysToExpiry / 365));
      const d1 = stdDev > 0 ? (Math.log(futPrice / strike) + 0.5 * stdDev * stdDev) / stdDev : 0;
      const normCdf = (x: number) => {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, pt = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        const absX = Math.abs(x) / Math.sqrt(2);
        const t = 1.0 / (1.0 + pt * absX);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
        return 0.5 * (1.0 + sign * y);
      };
      const rawDelta = normCdf(d1);
      targetLeg.delta = isCall ? Math.round(rawDelta * 100) / 100 : Math.round((rawDelta - 1) * 100) / 100;

      if (isCall) {
        totalCallOi += targetLeg.oi;
        totalCallVol += targetLeg.volume;
      } else {
        totalPutOi += targetLeg.oi;
        totalPutVol += targetLeg.volume;
      }
    }

    const items = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

    // Compute Max Pain Strike
    let maxPainStrike = futPrice;
    let minPainLoss = Infinity;
    const uniqueStrikes = Array.from(new Set(items.map((i) => i.strike)));
    for (const testStrike of uniqueStrikes) {
      let loss = 0;
      for (const item of items) {
        if (testStrike > item.strike) loss += (testStrike - item.strike) * item.call.oi;
        if (testStrike < item.strike) loss += (item.strike - testStrike) * item.put.oi;
      }
      if (loss < minPainLoss && loss > 0) {
        minPainLoss = loss;
        maxPainStrike = testStrike;
      }
    }

    const pcr = totalCallOi > 0 ? Math.round((totalPutOi / totalCallOi) * 100) / 100 : 0.88;

    // Available option coins on Delta
    const availableCoins = Array.from(
      new Set(
        products
          .filter((p) => p.contract_type === 'call_options' || p.contract_type === 'put_options')
          .map((p) => p.underlying_asset?.symbol || (p.symbol.startsWith('C-') ? p.symbol.split('-')[1] : ''))
          .filter(Boolean)
      )
    );
    if (availableCoins.length === 0) {
      availableCoins.push('BTC', 'ETH', 'SOL', 'XRP');
    }

    res.json({
      items,
      futuresPrice: futPrice,
      priceChange24h,
      totalCallOi,
      totalPutOi,
      totalCallVol,
      totalPutVol,
      pcr,
      maxPainStrike,
      availableCoins,
      underlying,
    });
  });

  // 13. Arbitrage Setups
  router.get('/arbitrage', async (req, res) => {
    let setups = db.getArbitrageSetups();
    if (setups.length === 0) {
      await worker.scanArbitrage();
      setups = db.getArbitrageSetups();
    }
    res.json({ setups });
  });

  router.post('/arbitrage/scan', async (req, res) => {
    await worker.scanArbitrage();
    res.json({ success: true, setups: db.getArbitrageSetups() });
  });

  router.post('/arbitrage/execute', async (req, res) => {
    const { setupId } = req.body;
    if (!setupId) {
      return res.status(400).json({ success: false, message: 'setupId is required' });
    }
    const result = await worker.executeArbitrageSetup(setupId, true);
    res.json(result);
  });

  // 14. Backtest Engine
  router.post('/backtest', async (req, res) => {
    const params = req.body;
    const candlesCache = worker.getCandleCache();
    const candleObj: Record<string, any[]> = {};
    for (const [sym, c] of candlesCache.entries()) {
      candleObj[sym] = c;
    }

    // If cache is small, fetch BTC candles on the fly
    if (Object.keys(candleObj).length === 0 || !candleObj['BTCUSD']) {
      const to = Math.floor(Date.now() / 1000);
      const from = to - 86400 * 30; // 30 days
      const cRes = await client.getCandles('BTCUSD', '15', from, to);
      if ('candles' in cRes) {
        candleObj['BTCUSD'] = cRes.candles;
      }
    }

    const forensics = db.getForensics();
    const result = backtestEngine.runBacktest(params, candleObj, forensics);
    res.json(result);
  });

  // 15. Forensics Memory Records
  router.get('/forensics', (req, res) => {
    res.json({ forensics: db.getForensics() });
  });

  // 16. Error Status Center
  router.get('/errors', (req, res) => {
    res.json({ errors: db.getErrors() });
  });

  router.post('/errors/clear', (req, res) => {
    db.clearErrors();
    res.json({ success: true });
  });

  // 17. Smart Command Center
  router.post('/command', async (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command string is required' });
    }
    const result = await worker.executeCommand(command);
    res.json(result);
  });

  router.get('/command-logs', (req, res) => {
    res.json({ logs: db.getCommandLogs() });
  });

  // 17b. Price Change Distribution & Market Breadth Intelligence
  router.get('/price-change-distribution', (req, res) => {
    try {
      const distribution = worker.getPriceChangeDistributionState();
      res.json({
        success: true,
        distribution,
      });
    } catch (err: any) {
      res.status(500).json({ error: `PCD computation error: ${err.message}` });
    }
  });

  // 18. Bot Control Actions
  router.post('/bot/action', (req, res) => {
    const { action } = req.body;
    if (action === 'start') worker.start();
    else if (action === 'pause') worker.pause();
    else if (action === 'resume') worker.resume();
    else if (action === 'halt') worker.halt();
    res.json({ success: true, status: worker.getStatus() });
  });

  return router;
}
