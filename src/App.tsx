import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Server, Copy, Check } from 'lucide-react';
import { Header } from './components/Header.js';
import { NavigationTabs } from './components/NavigationTabs.js';
import { UnconnectedBanner } from './components/UnconnectedBanner.js';
import { StatusDashboard } from './components/StatusDashboard.js';
import { ExchangeSettings } from './components/ExchangeSettings.js';
import { Future24hScanner } from './components/Future24hScanner.js';
import { OptionChainView } from './components/OptionChainView.js';
import { FutureSetupEngineView } from './components/FutureSetupEngineView.js';
import { SetupHistoryView } from './components/SetupHistoryView.js';
import { ArbitrageView } from './components/ArbitrageView.js';
import { BacktestView } from './components/BacktestView.js';
import { LiveOrdersView } from './components/LiveOrdersView.js';
import { ReportsLearningView } from './components/ReportsLearningView.js';
import { ErrorCenterView } from './components/ErrorCenterView.js';
import { SmartCommandCenter } from './components/SmartCommandCenter.js';
import { SetupWizardModal } from './components/SetupWizardModal.js';
import { NotificationToasts, type InAppAlert } from './components/NotificationToasts.js';
import { PriceChangeDistributionView } from './components/PriceChangeDistributionView.js';
import { AITradeForensicsModal } from './components/AITradeForensicsModal.js';
import { deltaWsService, type DeltaLiveTickerTick, type DeltaWsStatus } from './services/deltaWebSocket.js';
import { alertService } from './utils/audioAlert.js';
import type {
  BotStatusState,
  ExchangeConfig,
  DeltaTicker,
  DeltaProduct,
  FutureSetup,
  TradeRecord,
  OptionChainItem,
  ArbitrageSetup,
  HistoricalForensicMove,
  BotErrorRecord,
  BacktestParams,
  BacktestResult,
  SetupHistoryRecord,
  SetupTimeframe,
  PriceChangeDistributionState,
} from './types/index.js';

const INITIAL_STATUS: BotStatusState = {
  isConnected: false,
  connectionState: 'DISCONNECTED',
  botStatus: 'PAUSED',
  lastPingMs: 0,
  dataFreshnessSeconds: 0,
  totalFuturesCoins: 0,
  totalSetups: 0,
  openSetups: 0,
  triggeredSetups: 0,
  openTrades: 0,
  totalOrders: 0,
  tpHitCount: 0,
  slHitCount: 0,
  runningPnl: 0,
  totalCapital: 10000,
  usedCapital: 0,
  availableCapital: 10000,
  reservedMargin: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  dailyPnl: 0,
  activeEnvironment: 'production',
  isReadMode: true,
  autoTradeEnabled: false,
};

const INITIAL_CONFIG: ExchangeConfig = {
  apiKey: '',
  apiSecret: '',
  environment: 'production',
  isConnected: false,
  isReadMode: true,
  autoTradeEnabled: false,
  tradingCapital: 10000,
  capitalLimit: 8000,
  maxDailyLoss: 500,
  maxOpenTrades: 3,
  lotSize: 1,
  minExpectedNetProfitPercent: 2.0,
  minNetEdgePercent: 0.8,
  minRiskReward: 1.8,
  leverageMode: 'MANUAL',
  manualLeverage: 10,
  tradingType: 'FUTURES_ONLY',
  alertOnTpHit: true,
  alertOnSlHit: true,
  alertOnTriggerWarnings: true,
  alertOnApiDisconnect: true,
  notifyOnApproaching: true,
  notifyOnTriggered: true,
  enableSoundAlerts: true,
  enableBrowserPush: false,
};

/**
 * Defensively fetches and parses JSON.
 * Guards against non-JSON and HTML responses (e.g., <!doctype html> during server boot or restart),
 * completely preventing "Unexpected token '<'" JSON parse exceptions.
 */
async function fetchSafeJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(input, init);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('status');
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Core Data States
  const [status, setStatus] = useState<BotStatusState>(INITIAL_STATUS);
  const [config, setConfig] = useState<ExchangeConfig>(INITIAL_CONFIG);
  const [tickers, setTickers] = useState<DeltaTicker[]>([]);
  const [gainers, setGainers] = useState<DeltaTicker[]>([]);
  const [losers, setLosers] = useState<DeltaTicker[]>([]);
  const [products, setProducts] = useState<DeltaProduct[]>([]);
  const [setups, setSetups] = useState<FutureSetup[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [optionItems, setOptionItems] = useState<OptionChainItem[]>([]);
  const [optionFuturesPrice, setOptionFuturesPrice] = useState(0);
  const [selectedUnderlying, setSelectedUnderlying] = useState('BTC');
  const [arbitrageSetups, setArbitrageSetups] = useState<ArbitrageSetup[]>([]);
  const [forensics, setForensics] = useState<HistoricalForensicMove[]>([]);
  const [history, setHistory] = useState<SetupHistoryRecord[]>([]);
  const [errors, setErrors] = useState<BotErrorRecord[]>([]);
  const [commandLogs, setCommandLogs] = useState<any[]>([]);
  const [pcdDistribution, setPcdDistribution] = useState<PriceChangeDistributionState | null>(null);
  const [copiedIp, setCopiedIp] = useState(false);
  const [wsStatus, setWsStatus] = useState<DeltaWsStatus>('DISCONNECTED');
  const [wsLatency, setWsLatency] = useState<number>(0);
  const [activeAIForensicsSetup, setActiveAIForensicsSetup] = useState<FutureSetup | null>(null);

  // In-app alert notifications state
  const [activeAlerts, setActiveAlerts] = useState<InAppAlert[]>([]);

  const addAlert = useCallback((alertData: Omit<InAppAlert, 'id' | 'timestamp'>) => {
    const newAlert: InAppAlert = {
      ...alertData,
      id: `ALERT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    setActiveAlerts((prev) => [newAlert, ...prev.slice(0, 4)]);

    // Auto-dismiss in 8 seconds
    setTimeout(() => {
      setActiveAlerts((prev) => prev.filter((a) => a.id !== newAlert.id));
    }, 8000);
  }, []);

  // Strict alert deduplication tracking refs (ensures triggers, TP/SL, errors alert strictly ONCE)
  const prevTradesStatusRef = useRef<Map<string, string>>(new Map());
  const prevApiConnectedRef = useRef<boolean | null>(null);
  const isDisconnectAlertedRef = useRef<boolean>(false);
  const alertedTriggersRef = useRef<Set<string>>(new Set());
  const alertedTradesRef = useRef<Set<string>>(new Set());
  const alertedErrorsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);

  // State initialization routine: Triggers a full data synchronization (trades, open positions, history)
  // immediately upon detecting a transition from a 'Disconnected' or 'Offline' state back to 'Connected'.
  const initializeAndSyncOnReconnect = useCallback(async () => {
    try {
      console.log('[State Initialization] Transition detected: Offline/Disconnected -> Connected. Starting full data synchronization...');

      // 1. Trigger server-side reconciliation of trades and positions against Delta Exchange
      try {
        await fetch('/api/trades/reconcile', { method: 'POST' });
      } catch (e) {
        console.warn('Reconcile endpoint call completed with notice:', e);
      }

      // 2. Fetch all critical datasets in parallel
      const [statusData, tradesData, historyData, setupsData, errorsData, cmdData] = await Promise.all([
        fetchSafeJson<BotStatusState>('/api/status'),
        fetchSafeJson<{ trades: TradeRecord[] }>('/api/trades'),
        fetchSafeJson<{ history: SetupHistoryRecord[] }>('/api/history'),
        fetchSafeJson<{ setups: FutureSetup[] }>('/api/setups'),
        fetchSafeJson<{ errors: BotErrorRecord[] }>('/api/errors'),
        fetchSafeJson<{ logs: any[] }>('/api/command-logs'),
      ]);

      if (statusData) {
        setStatus(statusData);
      }
      if (tradesData) {
        const incomingTrades: TradeRecord[] = tradesData.trades || [];
        setTrades(incomingTrades);
        // Seed status map to prevent duplicate alerts
        incomingTrades.forEach((t) => {
          prevTradesStatusRef.current.set(t.tradeId, t.status);
          if (t.status === 'TP HIT' || t.status === 'SL HIT' || t.status === 'CLOSED') {
            alertedTradesRef.current.add(`${t.tradeId}_${t.status}`);
          }
        });
      }
      if (historyData) {
        setHistory(historyData.history || []);
      }
      if (setupsData) {
        setSetups(setupsData.setups || []);
      }
      if (errorsData) {
        setErrors(errorsData.errors || []);
      }
      if (cmdData) {
        setCommandLogs(cmdData.logs || []);
      }

      // 3. User feedback toast for successful full state sync
      if (!config.muteReconnectAlerts) {
        addAlert({
          type: 'CONNECTED',
          title: '🟢 Delta Exchange Reconnected',
          message: 'Connection restored. Full data synchronization completed (trades, positions, and history updated).',
        });
      }

      isDisconnectAlertedRef.current = false;
    } catch (err) {
      console.warn('[State Initialization] Reconnection sync completed with notice:', err);
    }
  }, [addAlert, config.muteReconnectAlerts]);

  // Fetch bot & connection status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await fetchSafeJson<BotStatusState>('/api/status');
      if (!data) return;
      setStatus(data);

      // Transition from Disconnected/Offline -> Connected
      if (prevApiConnectedRef.current === false && data.isConnected) {
        initializeAndSyncOnReconnect();
      }
      // Transition from Connected -> Disconnected
      else if (prevApiConnectedRef.current === true && !data.isConnected) {
        if (!isDisconnectAlertedRef.current && config.alertOnApiDisconnect !== false) {
          isDisconnectAlertedRef.current = true;
          if (config.enableSoundAlerts !== false) alertService.playApiDisconnectAlert();
          addAlert({
            type: 'DISCONNECT',
            title: '⚠️ Delta Exchange Disconnected',
            message: 'API connectivity dropped or heartbeat timed out. Please check exchange settings.',
          });
          if (config.enableBrowserPush) {
            alertService.sendPushNotification(
              '⚠️ Delta API Disconnected',
              'API connectivity dropped or heartbeat timed out. Check exchange settings.'
            );
          }
        }
      } else if (data.isConnected) {
        isDisconnectAlertedRef.current = false;
      }

      prevApiConnectedRef.current = data.isConnected;
    } catch {
      // Ignored
    }
  }, [config.alertOnApiDisconnect, config.enableSoundAlerts, config.enableBrowserPush, addAlert, initializeAndSyncOnReconnect]);

  // Fetch exchange config
  const fetchConfig = useCallback(async () => {
    try {
      const data = await fetchSafeJson<ExchangeConfig>('/api/config');
      if (!data) return;
      setConfig(data);
      if (!data.apiKey && !data.isConnected) {
        setIsWizardOpen(true);
      }
    } catch {
      // Ignored
    }
  }, []);

  // Fetch live market data (Tickers, Setups, Trades, etc.)
  const fetchMarketData = useCallback(async () => {
    try {
      // Tickers
      const tData = await fetchSafeJson<{ tickers: DeltaTicker[]; gainers: DeltaTicker[]; losers: DeltaTicker[] }>('/api/tickers');
      if (tData) {
        setTickers(tData.tickers || []);
        setGainers(tData.gainers || []);
        setLosers(tData.losers || []);
      }

      // Price Change Distribution (PCD) Market Breadth
      const pcdData = await fetchSafeJson<{ success: boolean; distribution: PriceChangeDistributionState }>('/api/price-change-distribution');
      if (pcdData && pcdData.distribution) {
        setPcdDistribution(pcdData.distribution);
      }

      // Products
      const pData = await fetchSafeJson<{ products: DeltaProduct[] }>('/api/products');
      if (pData) {
        setProducts(pData.products || []);
      }

      // Setups: deduplicate by coin and update with live price from Delta Exchange
      const sData = await fetchSafeJson<{ setups: FutureSetup[] }>('/api/setups');
      if (sData) {
        const incoming: FutureSetup[] = sData.setups || [];

        // Check for genuine coin trigger from backend bot (Strictly ONCE per coin/setup)
        incoming.forEach((s) => {
          if (
            (s.status === 'TRIGGERED' || s.hasTriggeredOnce || s.status === 'TRADE OPEN') &&
            config.notifyOnTriggered !== false &&
            !config.muteTriggerAlerts
          ) {
            const triggerKey = `${s.id || s.coin}_${s.entryPrice}_TRIGGERED`;
            if (!isInitialLoadRef.current && !alertedTriggersRef.current.has(triggerKey)) {
              alertedTriggersRef.current.add(triggerKey);
              const isVirtual = s.executionMode === 'BOT_SIMULATED' || s.executionMode !== 'EXCHANGE';
              const sourceLabel: 'EXCHANGE LIVE' | 'BOT VIRTUAL' = isVirtual ? 'BOT VIRTUAL' : 'EXCHANGE LIVE';

              if (config.enableSoundAlerts !== false) alertService.playTriggeredAlert();
              addAlert({
                type: 'TRIGGERED',
                title: `⚡ Entry Triggered: ${s.coin}!`,
                message: `${s.coin} reached entry price $${s.entryPrice} [${s.direction}]. Order executed on ${sourceLabel}!`,
                coin: s.coin,
                source: sourceLabel,
                entryPrice: s.entryPrice,
                direction: s.direction,
              });
              if (config.enableBrowserPush) {
                alertService.sendPushNotification(
                  `⚡ Entry Triggered: ${s.coin} [${sourceLabel}]`,
                  `${s.coin} triggered entry price $${s.entryPrice}! Order placed on ${sourceLabel}.`
                );
              }
            } else if (isInitialLoadRef.current) {
              alertedTriggersRef.current.add(triggerKey);
            }
          }
        });

        setSetups((prev) => {
          // Deduplicate incoming by coin
          const seenCoins = new Set<string>();
          const dedupedIncoming: FutureSetup[] = [];
          for (const inc of incoming) {
            if (!inc.coin || seenCoins.has(inc.coin)) continue;
            seenCoins.add(inc.coin);
            dedupedIncoming.push(inc);
          }

          return dedupedIncoming.map((inc) => {
            const existing = prev.find((p) => p.id === inc.id || p.coin === inc.coin);
            // Always prefer the freshest live price from the incoming Delta Exchange feed or WebSocket
            const livePrice =
              inc.currentPrice && inc.currentPrice > 0
                ? inc.currentPrice
                : existing?.currentPrice && existing.currentPrice > 0
                ? existing.currentPrice
                : inc.entryPrice;

            const lockedPrice = inc.entryPrice ?? inc.triggerPrice;
            const isLong = inc.direction.includes('BUY') || inc.direction.includes('LONG');
            const remainingDistance = isLong
              ? Math.max(0, lockedPrice - livePrice)
              : Math.max(0, livePrice - lockedPrice);
            const distancePercent =
              lockedPrice > 0 ? (Math.abs(lockedPrice - livePrice) / lockedPrice) * 100 : 0;

            return {
              ...inc,
              currentPrice: livePrice,
              distanceToTrigger: Math.round(remainingDistance * 100000) / 100000,
              distanceToTriggerPercent: Math.round(distancePercent * 1000) / 1000,
            };
          });
        });
      }

      // Trades
      const trData = await fetchSafeJson<{ trades: TradeRecord[] }>('/api/trades');
      if (trData) {
        const incomingTrades: TradeRecord[] = trData.trades || [];

        // Check for TP/SL alerts with precise coin name, order source (Bot vs Exchange), and financial details
        // Strictly ONCE per trade lifecycle
        incomingTrades.forEach((t) => {
          const oldStatus = prevTradesStatusRef.current.get(t.tradeId);
          const tradeAlertKey = `${t.tradeId}_${t.status}`;

          if (
            !isInitialLoadRef.current &&
            oldStatus &&
            oldStatus !== t.status &&
            !alertedTradesRef.current.has(tradeAlertKey)
          ) {
            const isVirtual = t.executionType === 'BOT_VIRTUAL' || String(t.orderId || '').startsWith('BOT_VIRTUAL');
            const sourceLabel: 'EXCHANGE LIVE' | 'BOT VIRTUAL' = isVirtual ? 'BOT VIRTUAL' : 'EXCHANGE LIVE';

            if (t.status === 'TP HIT' && config.alertOnTpHit !== false && !config.muteTpHitAlerts) {
              alertedTradesRef.current.add(tradeAlertKey);
              if (config.enableSoundAlerts !== false) alertService.playTpHitAlert();
              addAlert({
                type: 'TP_HIT',
                title: `🎯 1:5 Take-Profit Hit: ${t.coin}!`,
                message: `Target achieved at $${t.exitPrice || t.tp}! Realized Profit: +$${(t.realizedPnl || 0).toFixed(2)} (${t.pnlPercent || 0}%). Routed via ${sourceLabel}.`,
                coin: t.coin,
                source: sourceLabel,
                pnl: t.realizedPnl,
                pnlPercent: t.pnlPercent,
                exitPrice: t.exitPrice || t.tp,
                direction: t.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
              });
              if (config.enableBrowserPush) {
                alertService.sendPushNotification(
                  `🎯 1:5 TP Hit: ${t.coin}! [${sourceLabel}]`,
                  `Take Profit target hit at $${t.exitPrice || t.tp}! Realized PnL: +$${(t.realizedPnl || 0).toFixed(2)}`
                );
              }
            } else if (t.status === 'SL HIT' && config.alertOnSlHit !== false && !config.muteSlHitAlerts) {
              alertedTradesRef.current.add(tradeAlertKey);
              if (config.enableSoundAlerts !== false) alertService.playSlHitAlert();
              addAlert({
                type: 'SL_HIT',
                title: `🛡️ Stop-Loss Hit: ${t.coin}`,
                message: `Position closed at SL $${t.exitPrice || t.sl}. Risk guard protected capital. Loss: -$${Math.abs(t.realizedPnl || 0).toFixed(2)} (${t.pnlPercent || 0}%). Routed via ${sourceLabel}.`,
                coin: t.coin,
                source: sourceLabel,
                pnl: t.realizedPnl,
                pnlPercent: t.pnlPercent,
                exitPrice: t.exitPrice || t.sl,
                direction: t.side === 'BUY' ? 'BUY/LONG' : 'SELL/SHORT',
              });
              if (config.enableBrowserPush) {
                alertService.sendPushNotification(
                  `🛡️ Stop Loss Hit: ${t.coin} [${sourceLabel}]`,
                  `Position closed at SL $${t.exitPrice || t.sl}. Risk guard protected capital.`
                );
              }
            }
          } else if (
            isInitialLoadRef.current &&
            (t.status === 'TP HIT' || t.status === 'SL HIT' || t.status === 'CLOSED')
          ) {
            alertedTradesRef.current.add(tradeAlertKey);
          }

          prevTradesStatusRef.current.set(t.tradeId, t.status);
        });

        setTrades(incomingTrades);
      }

      // Option Chain
      const optData = await fetchSafeJson<{ items: OptionChainItem[]; futuresPrice: number }>(`/api/option-chain?underlying=${selectedUnderlying}`);
      if (optData) {
        setOptionItems(optData.items || []);
        setOptionFuturesPrice(optData.futuresPrice || 0);
      }

      // Arbitrage
      const arbData = await fetchSafeJson<{ setups: ArbitrageSetup[] }>('/api/arbitrage');
      if (arbData) {
        setArbitrageSetups(arbData.setups || []);
      }

      // Forensics
      const fData = await fetchSafeJson<{ forensics: HistoricalForensicMove[] }>('/api/forensics');
      if (fData) {
        setForensics(fData.forensics || []);
      }

      // Trade & Setup History
      const hData = await fetchSafeJson<{ history: SetupHistoryRecord[] }>('/api/history');
      if (hData) {
        setHistory(hData.history || []);
      }

      // Errors: Alert strictly ONCE per unique error ID with synchronized sound
      const errData = await fetchSafeJson<{ errors: BotErrorRecord[] }>('/api/errors');
      if (errData) {
        const incomingErrors: BotErrorRecord[] = errData.errors || [];
        incomingErrors.forEach((err) => {
          if (
            !isInitialLoadRef.current &&
            (err.severity === 'ERROR' || err.severity === 'CRITICAL') &&
            !alertedErrorsRef.current.has(err.errorId)
          ) {
            alertedErrorsRef.current.add(err.errorId);
            if (config.alertOnApiDisconnect !== false && config.enableSoundAlerts !== false) {
              alertService.playApiDisconnectAlert();
            }
            addAlert({
              type: 'ERROR',
              title: `⚠️ Bot Error: ${err.module || 'Exchange API'}`,
              message: err.errorMessage || err.systemMessage || 'An unexpected error occurred.',
              coin: err.coin,
            });
          } else if (isInitialLoadRef.current) {
            alertedErrorsRef.current.add(err.errorId);
          }
        });
        setErrors(incomingErrors);
      }

      // Mark initial load complete so only subsequent events trigger notifications
      isInitialLoadRef.current = false;

      // Command Logs
      const cmdData = await fetchSafeJson<{ logs: any[] }>('/api/command-logs');
      if (cmdData) {
        setCommandLogs(cmdData.logs || []);
      }
    } catch {
      // Ignored - safely prevents console error spam during restarts
    }
  }, [selectedUnderlying, config.alertOnApiDisconnect, config.alertOnSlHit, config.alertOnTpHit, config.enableBrowserPush, config.enableSoundAlerts, config.muteReconnectAlerts, config.muteSlHitAlerts, config.muteTpHitAlerts, config.muteTriggerAlerts, config.notifyOnTriggered, addAlert]);

  // Initial load
  useEffect(() => {
    fetchConfig();
    fetchStatus();
    fetchMarketData();
  }, [fetchConfig, fetchStatus, fetchMarketData]);

  // Periodic continuous polling
  useEffect(() => {
    const statusInterval = setInterval(fetchStatus, 3000);
    const dataInterval = setInterval(fetchMarketData, 4000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(dataInterval);
    };
  }, [fetchStatus, fetchMarketData]);

  // Pending ticks map for frame-aligned micro-batching
  const pendingTicksRef = useRef<Map<string, DeltaLiveTickerTick>>(new Map());
  const tickAnimationRef = useRef<number | null>(null);

  // Dedicated WebSocket listener for Delta Exchange market data
  // Directly maps price state updates to unique instrument ID (productId) & symbol,
  // micro-batching via requestAnimationFrame to eliminate latency and state-tree re-rendering.
  useEffect(() => {
    deltaWsService.setEnvironment(config.environment || 'production');
    deltaWsService.connect();

    const unsubStatus = deltaWsService.subscribeToStatus((s, lat) => {
      setWsStatus(s);
      setWsLatency(lat);
    });

    const unsubTicks = deltaWsService.subscribeToTicks((tick: DeltaLiveTickerTick) => {
      // Mark price represents the continuous, real-time live valuation on Delta Exchange
      const livePrice = tick.markPrice > 0 ? tick.markPrice : (tick.close > 0 ? tick.close : 0);
      if (!livePrice || livePrice <= 0) return;

      // Index incoming tick by unique instrument key
      const key = tick.productId ? `pid_${tick.productId}` : `sym_${tick.symbol}`;
      pendingTicksRef.current.set(key, tick);

      // Micro-batch via requestAnimationFrame to prevent re-rendering the entire state tree on every packet
      if (tickAnimationRef.current === null) {
        tickAnimationRef.current = requestAnimationFrame(() => {
          tickAnimationRef.current = null;
          const ticks: DeltaLiveTickerTick[] = Array.from(pendingTicksRef.current.values());
          pendingTicksRef.current.clear();
          if (ticks.length === 0) return;

          // Direct O(1) maps by productId and symbol
          const ticksByProductId = new Map<number, DeltaLiveTickerTick>();
          const ticksBySymbol = new Map<string, DeltaLiveTickerTick>();
          for (const t of ticks) {
            if (t.productId) ticksByProductId.set(t.productId, t);
            if (t.symbol) {
              ticksBySymbol.set(t.symbol, t);
              ticksBySymbol.set(t.symbol.replace(/[^A-Z0-9]/g, ''), t);
            }
          }

          // 1. Direct instrument ID map update for setups
          setSetups((prevSetups) => {
            let changed = false;
            const updated = prevSetups.map((s) => {
              const matchedTick =
                (s.productId ? ticksByProductId.get(s.productId) : undefined) ||
                ticksBySymbol.get(s.coin) ||
                ticksBySymbol.get(s.coin.replace(/[^A-Z0-9]/g, ''));
              if (!matchedTick) return s;

              const tickLivePrice =
                matchedTick.markPrice > 0
                  ? matchedTick.markPrice
                  : matchedTick.close > 0
                  ? matchedTick.close
                  : 0;
              if (!tickLivePrice || tickLivePrice <= 0 || s.currentPrice === tickLivePrice) return s;

              changed = true;
              const lockedPrice = s.entryPrice ?? s.triggerPrice;
              const isLong = s.direction.includes('BUY') || s.direction.includes('LONG');

              const remainingDistance = isLong
                ? Math.max(0, lockedPrice - tickLivePrice)
                : Math.max(0, tickLivePrice - lockedPrice);

              const distancePercent =
                lockedPrice > 0 ? (Math.abs(lockedPrice - tickLivePrice) / lockedPrice) * 100 : 0;
              const roundedDistancePercent = Math.round(distancePercent * 1000) / 1000;

              let newStatus = s.status;
              if (['WATCHING', 'NEAR SETUP', 'TRIGGER APPROACHING'].includes(s.status)) {
                if (roundedDistancePercent <= 0.35) {
                  newStatus = 'TRIGGER APPROACHING';
                } else if (roundedDistancePercent <= 1.5) {
                  newStatus = 'NEAR SETUP';
                } else {
                  newStatus = 'WATCHING';
                }
              }

              return {
                ...s,
                currentPrice: tickLivePrice,
                distanceToTrigger: Math.round(remainingDistance * 10000) / 10000,
                distanceToTriggerPercent: roundedDistancePercent,
                status: newStatus,
              };
            });

            return changed ? updated : prevSetups;
          });

          // 2. Direct instrument ID map update for tickers in Future24hScanner
          setTickers((prev) => {
            let tickerChanged = false;
            const copy = prev.map((t) => {
              const matchedTick =
                (t.product_id ? ticksByProductId.get(t.product_id) : undefined) ||
                ticksBySymbol.get(t.symbol) ||
                ticksBySymbol.get(t.symbol.replace(/[^A-Z0-9]/g, ''));
              if (!matchedTick) return t;
              if (t.mark_price === matchedTick.markPrice && t.close === matchedTick.close) return t;

              tickerChanged = true;
              return {
                ...t,
                close: matchedTick.close,
                mark_price: matchedTick.markPrice,
                price_change_percent_24h: matchedTick.change24h,
                high: matchedTick.high || t.high,
                low: matchedTick.low || t.low,
                turnover: matchedTick.turnoverUsd || t.turnover,
              };
            });
            return tickerChanged ? copy : prev;
          });

          // 3. Direct real-time WebSocket sync for Live Orders & Positions (millisecond precision)
          setTrades((prevTrades) => {
            let tradesChanged = false;
            const updated = prevTrades.map((t) => {
              const matchedTick =
                ticksBySymbol.get(t.coin) ||
                ticksBySymbol.get(t.coin.replace(/[^A-Z0-9]/g, '')) ||
                ticksBySymbol.get(`C-${t.coin}`) ||
                ticksBySymbol.get(`${t.coin}USD`) ||
                ticksBySymbol.get(`${t.coin}USDT`);

              if (!matchedTick) return t;

              const tickLivePrice =
                matchedTick.markPrice > 0
                  ? matchedTick.markPrice
                  : matchedTick.close > 0
                  ? matchedTick.close
                  : 0;

              if (!tickLivePrice || tickLivePrice <= 0 || t.currentPrice === tickLivePrice) return t;

              tradesChanged = true;
              const isBuy = t.side === 'BUY';
              const fillPrice = t.actualFillPrice || t.entryPrice;

              let unrealizedPnl = t.unrealizedPnl;
              let pnlPercent = t.pnlPercent;
              let status = t.status;
              let realizedPnl = t.realizedPnl;
              let exitPrice = t.exitPrice;
              let closedAt = t.closedAt;
              let partialProfitBooked = t.partialProfitBooked;
              let partialProfitBookedAt = t.partialProfitBookedAt;
              let partialProfitBookedPrice = t.partialProfitBookedPrice;
              let partialProfitBookedPnl = t.partialProfitBookedPnl;

              if (t.status === 'OPEN') {
                const diff = isBuy ? (tickLivePrice - fillPrice) : (fillPrice - tickLivePrice);
                const rawPercent = fillPrice > 0 ? (diff / fillPrice) * 100 * (t.leverage || 10) : 0;
                pnlPercent = Math.round(rawPercent * 100) / 100;

                const marginAllocated = t.margin || t.capitalUsed || 100;
                unrealizedPnl = Math.round((marginAllocated * (rawPercent / 100)) * 100) / 100;

                // 50% TP Progress calculation (Halfway point between entry and TP)
                const halfTpPrice = (fillPrice + t.tp) / 2;
                const hitHalfTp = isBuy ? (tickLivePrice >= halfTpPrice) : (tickLivePrice <= halfTpPrice);
                if (hitHalfTp && !partialProfitBooked) {
                  partialProfitBooked = true;
                  partialProfitBookedAt = new Date().toISOString();
                  partialProfitBookedPrice = tickLivePrice;
                  partialProfitBookedPnl = Math.round((unrealizedPnl * 0.5) * 100) / 100;
                }

                // Live TP / SL check
                const hitTp = isBuy ? (tickLivePrice >= t.tp) : (tickLivePrice <= t.tp);
                const hitSl = isBuy ? (tickLivePrice <= t.sl) : (tickLivePrice >= t.sl);

                let normalSetupSnapshot = t.normalSetupSnapshot;
                let exchangeOrderStatus = t.exchangeOrderStatus || 'OPEN';
                let exchangeOrderExitPrice = t.exchangeOrderExitPrice;
                let exchangeOrderClosedAt = t.exchangeOrderClosedAt;

                if (t.isSideChangedOrder && normalSetupSnapshot) {
                  const normDirection = normalSetupSnapshot.direction;
                  const normIsBuy = normDirection.includes('BUY') || normDirection === 'BUY/LONG';
                  const normEntry = normalSetupSnapshot.entry || fillPrice;
                  const normTp = normalSetupSnapshot.tp1;
                  const normSl = normalSetupSnapshot.sl;

                  let normStatus = normalSetupSnapshot.status || 'OPEN';
                  let normExitPrice = normalSetupSnapshot.exitPrice;
                  let normClosedAt = normalSetupSnapshot.closedAt;

                  if (normStatus === 'OPEN') {
                    const normDiff = normIsBuy ? (tickLivePrice - normEntry) : (normEntry - tickLivePrice);
                    const normPnlPct = normEntry > 0 ? (normDiff / normEntry) * 100 * (t.leverage || 10) : 0;
                    const normPnl = Math.round((marginAllocated * (normPnlPct / 100)) * 100) / 100;

                    const normHitTp = normIsBuy ? (tickLivePrice >= normTp) : (tickLivePrice <= normTp);
                    const normHitSl = normIsBuy ? (tickLivePrice <= normSl) : (tickLivePrice >= normSl);

                    if (normHitTp) {
                      normStatus = 'TP HIT';
                      normExitPrice = tickLivePrice;
                      normClosedAt = new Date().toISOString();
                    } else if (normHitSl) {
                      normStatus = 'SL HIT';
                      normExitPrice = tickLivePrice;
                      normClosedAt = new Date().toISOString();
                    }

                    normalSetupSnapshot = {
                      ...normalSetupSnapshot,
                      pnl: normPnl,
                      pnlPercent: Math.round(normPnlPct * 100) / 100,
                      status: normStatus,
                      exitPrice: normExitPrice,
                      closedAt: normClosedAt,
                    };
                  }

                  if (exchangeOrderStatus === 'OPEN') {
                    if (hitTp) {
                      exchangeOrderStatus = 'TP HIT';
                      exchangeOrderExitPrice = tickLivePrice;
                      exchangeOrderClosedAt = new Date().toISOString();
                    } else if (hitSl) {
                      exchangeOrderStatus = 'SL HIT';
                      exchangeOrderExitPrice = tickLivePrice;
                      exchangeOrderClosedAt = new Date().toISOString();
                    }
                  }

                  // Keep trade OPEN in Live Orders until BOTH legs finish or manual close
                  if (exchangeOrderStatus === 'OPEN' || normStatus === 'OPEN') {
                    status = 'OPEN';
                  } else {
                    status = exchangeOrderStatus === 'TP HIT' ? 'TP HIT' : 'SL HIT';
                    realizedPnl = unrealizedPnl;
                    exitPrice = tickLivePrice;
                    closedAt = exchangeOrderClosedAt || new Date().toISOString();
                  }
                } else {
                  if (hitTp) {
                    status = 'TP HIT';
                    realizedPnl = unrealizedPnl;
                    exitPrice = tickLivePrice;
                    closedAt = new Date().toISOString();
                  } else if (hitSl) {
                    status = 'SL HIT';
                    realizedPnl = unrealizedPnl;
                    exitPrice = tickLivePrice;
                    closedAt = new Date().toISOString();
                  }
                }
              }

              return {
                ...t,
                currentPrice: tickLivePrice,
                unrealizedPnl,
                pnlPercent,
                status,
                realizedPnl,
                exitPrice,
                closedAt,
                partialProfitBooked,
                partialProfitBookedAt,
                partialProfitBookedPrice,
                partialProfitBookedPnl,
                margin: t.margin || t.capitalUsed || 100,
                normalSetupSnapshot: t.normalSetupSnapshot ? (t.normalSetupSnapshot) : undefined,
                exchangeOrderStatus: t.exchangeOrderStatus,
                exchangeOrderExitPrice: t.exchangeOrderExitPrice,
                exchangeOrderClosedAt: t.exchangeOrderClosedAt,
              };
            });

            return tradesChanged ? updated : prevTrades;
          });

          // 4. Update livePrice in history records matching incoming symbol
          setHistory((prevHistory) => {
            let histChanged = false;
            const updated = prevHistory.map((h) => {
              const matchedTick =
                ticksBySymbol.get(h.coin) ||
                ticksBySymbol.get(h.coin.replace(/[^A-Z0-9]/g, ''));
              if (!matchedTick) return h;

              const tickLivePrice =
                matchedTick.markPrice > 0
                  ? matchedTick.markPrice
                  : matchedTick.close > 0
                  ? matchedTick.close
                  : 0;

              if (!tickLivePrice || tickLivePrice <= 0 || h.livePrice === tickLivePrice) return h;

              histChanged = true;
              return {
                ...h,
                livePrice: tickLivePrice,
              };
            });

            return histChanged ? updated : prevHistory;
          });
        });
      }
    });

    return () => {
      unsubStatus();
      unsubTicks();
      if (tickAnimationRef.current !== null) {
        cancelAnimationFrame(tickAnimationRef.current);
        tickAnimationRef.current = null;
      }
    };
  }, [config.environment]);

  // Handle configuration updates
  const handleSaveConfig = async (updated: Partial<ExchangeConfig>) => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      await fetchConfig();
      await fetchStatus();
    }
  };

  // Test connection to Delta
  const handleTestConnection = async (creds?: {
    apiKey: string;
    apiSecret: string;
    environment: string;
  }) => {
    const res = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds || {}),
    });
    const data = await res.json();
    await fetchConfig();
    await fetchStatus();
    if (data.success) {
      fetchMarketData();
    }
    return data;
  };

  // Disconnect
  const handleDisconnect = async () => {
    await fetch('/api/disconnect', { method: 'POST' });
    await fetchConfig();
    await fetchStatus();
  };

  // Delete credentials
  const handleDeleteCredentials = async () => {
    await fetch('/api/delete-credentials', { method: 'POST' });
    await fetchConfig();
    await fetchStatus();
  };

  // Bot Action (start, pause, resume, halt)
  const handleToggleBot = async (action: 'start' | 'pause' | 'resume' | 'halt') => {
    const res = await fetch('/api/bot/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(data.status);
    }
  };

  // Execute setup trade manually
  const handleExecuteSetup = async (setupId: string, executionPreference?: 'EXCHANGE' | 'BOT') => {
    const res = await fetch('/api/setups/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupId, executionPreference }),
    });
    const data = await res.json();
    if (!data.success && data.error) {
      addAlert({
        title: 'Execution Blocked',
        message: data.error,
        type: 'ERROR',
      });
    } else {
      addAlert({
        title: executionPreference === 'BOT' ? 'Bot Virtual Order Triggered' : 'Exchange Order Triggered',
        message: `Order for setup ${setupId} processed successfully.`,
        type: 'SUCCESS',
      });
    }
    await fetchMarketData();
    await fetchStatus();
  };

  // Change bot scanning timeframe (15m, 30m, 1h, 4h, 1d) and trigger dynamic scan
  const handleTimeframeChange = async (newTimeframe: SetupTimeframe) => {
    try {
      const res = await fetch('/api/timeframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe: newTimeframe }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.setups) {
          setSetups(data.setups);
        }
        await fetchConfig();
        await fetchStatus();
        await fetchMarketData();
      }
    } catch (err) {
      console.error('Error changing scanning timeframe:', err);
    }
  };

  // Multi-timeframe configuration handler for Bot and Exchange
  const handleMultiTimeframeChange = async (params: {
    botScanningTimeframes?: SetupTimeframe[];
    exchangeScanningTimeframes?: SetupTimeframe[];
    scanningTimeframe?: SetupTimeframe;
  }) => {
    try {
      const res = await fetch('/api/timeframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.setups) {
          setSetups(data.setups);
        }
        await fetchConfig();
        await fetchStatus();
        await fetchMarketData();
      }
    } catch (err) {
      console.error('Error updating multi-timeframes:', err);
    }
  };

  // Update TP/SL on live order
  const handleUpdateTpSl = async (tradeId: string, newTp?: number, newSl?: number) => {
    const res = await fetch('/api/trades/update-tpsl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId, tp: newTp, sl: newSl }),
    });
    const data = await res.json();
    if (data.success) {
      await fetchMarketData();
      return { success: true };
    }
    return { success: false, error: data.error };
  };

  // Close live order immediately at market price on Delta Exchange (Full position or partial lot)
  const handleCloseTrade = async (tradeId: string, closeQuantity?: number, reason?: string) => {
    try {
      const res = await fetch('/api/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId, closeQuantity, reason }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchMarketData();
        await fetchStatus();
        return { success: true, isPartial: data.isPartial, trade: data.trade };
      }
      return { success: false, error: data.error || 'Failed to close order' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error while closing trade' };
    }
  };

  // Bulk close all open orders at market price (Both Exchange Live and Bot orders)
  const handleCloseAllTrades = async (filter?: 'ALL' | 'BOT_VIRTUAL' | 'EXCHANGE_LIVE') => {
    try {
      const res = await fetch('/api/trades/close-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: filter || 'ALL' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchMarketData();
        await fetchStatus();
        return {
          success: true,
          totalClosed: data.totalClosed,
          exchangeClosed: data.exchangeClosed,
          botClosed: data.botClosed,
          failed: data.failed,
        };
      }
      return { success: false, error: data.error || 'Failed to close orders' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during bulk close' };
    }
  };

  // Update Auto Close Order on Exchange Settings
  const handleUpdateAutoCloseSettings = async (newSettings: {
    enabled?: boolean;
    profitPnlPercent?: number | null;
    lossPnlPercent?: number | null;
    lotMode?: 'ALL' | 'CUSTOM';
    lotSize?: number;
  }) => {
    try {
      const res = await fetch('/api/trades/auto-close-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setConfig(data.config);
        addAlert({
          type: 'TRIGGER',
          title: 'Auto Close Settings Updated',
          message: data.config.autoCloseOnExchangeEnabled
            ? `Active on Exchange: TP +${data.config.autoCloseProfitPnlPercent ?? 'OFF'}%, SL -${data.config.autoCloseLossPnlPercent ?? 'OFF'}% (${data.config.autoCloseLotMode === 'ALL' ? 'All Lots' : `${data.config.autoCloseLotSize} Lots`})`
            : 'Auto Close on Delta Exchange is currently DISABLED (Normal Mode)',
        });
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to update auto close settings' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // Run Backtest
  const handleRunBacktest = async (params: BacktestParams): Promise<BacktestResult> => {
    const res = await fetch('/api/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  };

  // Clear errors
  const handleClearErrors = async () => {
    await fetch('/api/errors/clear', { method: 'POST' });
    setErrors([]);
  };

  // Clear trade & setup history (1-click clears both History and Status Dashboard execution records)
  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/history/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeOpen: false }),
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        if (data.trades) {
          setTrades(data.trades);
        } else {
          await fetchMarketData();
        }
        await fetchStatus();
      }
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  // 1-Click Clear Trades (Filtered by date or closed only)
  const handleClearTrades = async (options?: { date?: string; status?: 'ALL' | 'CLOSED_ONLY' }) => {
    try {
      const res = await fetch('/api/trades/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      const data = await res.json();
      if (res.ok) {
        setTrades(data.trades || []);
        return { success: true, removed: data.removed };
      }
      return { success: false, error: data.error || 'Failed to clear trades' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Error clearing trades' };
    }
  };

  // 1-Click Clear Day Records (Removes trades and history for that date)
  const handleClearDay = async (date: string) => {
    try {
      const res = await fetch('/api/trades/clear-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (res.ok) {
        setTrades(data.trades || []);
        if (data.history) setHistory(data.history);
        return { success: true, removedTrades: data.removedTrades, removedHistory: data.removedHistory };
      }
      return { success: false, error: data.error || 'Failed to clear day records' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Error clearing day records' };
    }
  };

  // 1-Click Clear All Trades & Day History
  const handleClearAllTrades = async (options?: { onlyClosed?: boolean }) => {
    try {
      const res = await fetch('/api/trades/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      const data = await res.json();
      if (res.ok) {
        setTrades(data.trades || []);
        if (data.history) setHistory(data.history);
        return { success: true, removedTrades: data.removedTrades, removedHistory: data.removedHistory };
      }
      return { success: false, error: data.error || 'Failed to clear all orders' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Error clearing all orders' };
    }
  };

  // Execute command
  const handleExecuteCommand = async (cmd: string) => {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    });
    const data = await res.json();
    await fetchMarketData();
    return data;
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Dynamic Floating In-App Alerts (Triggered, TP/SL Hits, Disconnect, Errors) */}
      <NotificationToasts
        alerts={activeAlerts}
        onDismiss={(id) => setActiveAlerts((prev) => prev.filter((a) => a.id !== id))}
        onClearAll={() => setActiveAlerts([])}
        config={config}
        onUpdateConfig={handleSaveConfig}
      />

      {/* 1. Global Navigation Header */}
      <Header
        status={status}
        config={config}
        onOpenSettings={() => setActiveTab('settings')}
        onOpenCommandCenter={() => setActiveTab('command')}
        onToggleBot={handleToggleBot}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        wsStatus={wsStatus}
        wsLatency={wsLatency}
      />

      {/* 2. Navigation Tabs Bar */}
      <NavigationTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        errorCount={errors.length}
        historyCount={history.length}
        openSetupsCount={setups.filter((s) => ['WATCHING', 'NEAR SETUP', 'TRIGGER APPROACHING'].includes(s.status)).length}
        openOrdersCount={trades.filter((t) => t.status === 'OPEN').length}
      />

      {/* 3. Main Workspace Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* Market Data Live / Account Connection Notice Bar */}
        {!status.isConnected && activeTab !== 'settings' && (
          <div className="mb-5 bg-gradient-to-r from-[#101622] via-[#121c2e] to-[#101622] border border-blue-500/30 rounded-xl p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg font-mono text-xs">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-zinc-100 text-xs sm:text-sm">
                  DELTA MARKET DATA LIVE — ACCOUNT NOT CONNECTED
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/50 text-[10px] font-bold">
                  PAPER TRADING MODE
                </span>
              </div>
              <p className="text-zinc-400 text-[11px]">
                Real-time Delta tickers, perpetual contracts, option chains, setups, arbitrage & backtest are live. Connect API keys in Settings to execute live orders with real capital.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#090d14] border border-blue-500/30 text-[11px] text-zinc-300">
                <Server className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-zinc-400">Whitelist IP:</span>
                <code className="text-emerald-400 font-bold">{config.serverIp || '34.34.244.50'}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(config.serverIp || '34.34.244.50');
                    setCopiedIp(true);
                    setTimeout(() => setCopiedIp(false), 2000);
                  }}
                  className="ml-1 text-zinc-400 hover:text-white"
                  title="Copy Server IP"
                >
                  {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                onClick={() => setActiveTab('settings')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition shadow-md shadow-emerald-500/20"
              >
                Connect Delta API
              </button>
            </div>
          </div>
        )}

        {/* Tab Views */}
        {activeTab === 'status' && (
          <StatusDashboard
            status={status}
            trades={trades}
            setups={setups}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'settings' && (
          <ExchangeSettings
            config={config}
            onSaveConfig={handleSaveConfig}
            onTestConnection={handleTestConnection}
            onDisconnect={handleDisconnect}
            onDeleteCredentials={handleDeleteCredentials}
          />
        )}

        {activeTab === 'scanner' && (
          <Future24hScanner
            tickers={tickers}
            gainers={gainers}
            losers={losers}
            products={products}
            config={config}
            isWsConnected={wsStatus === 'CONNECTED'}
            onTriggerForensics={(sym) => {
              handleExecuteCommand(`Analyze mover ${sym}`);
              setActiveTab('reports');
            }}
            onSelectCoinForSetup={(sym) => {
              setActiveTab('setups');
            }}
          />
        )}

        {activeTab === 'distribution' && (
          <PriceChangeDistributionView
            distribution={pcdDistribution}
            config={config}
            onRefresh={fetchMarketData}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'optionChain' && (
          <OptionChainView
            items={optionItems}
            futuresPrice={optionFuturesPrice}
            underlying={selectedUnderlying}
            onUnderlyingChange={(u) => setSelectedUnderlying(u)}
          />
        )}

        {activeTab === 'setups' && (
          <FutureSetupEngineView
            setups={setups}
            trades={trades}
            history={history}
            config={config}
            currentTimeframe={config.scanningTimeframe || '15m'}
            onTimeframeChange={handleTimeframeChange}
            onMultiTimeframeChange={handleMultiTimeframeChange}
            onExecuteSetup={handleExecuteSetup}
            onClearHistory={handleClearHistory}
            onInspectForensics={(sym) => {
              const foundSetup = setups.find((s) => s.coin === sym);
              if (foundSetup) {
                setActiveAIForensicsSetup(foundSetup);
                return;
              }
              const foundTrade = trades.find((t) => t.coin === sym);
              if (foundTrade) {
                setActiveAIForensicsSetup({
                  id: foundTrade.setupId || `S_${foundTrade.coin}_ai`,
                  coin: foundTrade.coin,
                  exchange: 'Delta',
                  instrumentType: 'Future',
                  direction: foundTrade.direction,
                  currentPrice: foundTrade.currentPrice,
                  triggerPrice: foundTrade.entryPrice,
                  entryPrice: foundTrade.entryPrice,
                  tp1: foundTrade.tp1,
                  sl: foundTrade.sl,
                  distanceToTrigger: 0,
                  distanceToTriggerPercent: 0,
                  expectedMovePercent: Math.abs(((foundTrade.tp1 - foundTrade.entryPrice) / foundTrade.entryPrice) * 100),
                  riskPercent: Math.abs(((foundTrade.entryPrice - foundTrade.sl) / foundTrade.entryPrice) * 100),
                  rewardPercent: Math.abs(((foundTrade.tp1 - foundTrade.entryPrice) / foundTrade.entryPrice) * 100),
                  riskReward: 5,
                  score: 88,
                  historicalProbability: 82,
                  sampleSize: 30,
                  confidence: 85,
                  reason: foundTrade.whyFormed || foundTrade.primaryReason || 'PCD Momentum Breakout',
                  whyFormed: foundTrade.whyFormed || 'Dynamic institutional breakout scan on Delta Exchange.',
                  primaryReason: foundTrade.primaryReason || `${foundTrade.coin} 1:5 asymmetric momentum trigger`,
                  supportingReasons: foundTrade.supportingReasons || ['PCD Breadth Checked', 'EMA Trend Alignment'],
                  historicalEvidence: 'High confluence institutional volume expansion',
                  indicatorConfirmations: {
                    trend: 'Bullish Continuation',
                    rsi: 58.4,
                    macd: 'Positive Momentum',
                    adx: 32,
                    volumeProfile: 'Institutional Surge',
                    volatility: 'Normal ATR',
                    pattern: 'Breakout & Retest',
                    marketStructure: 'Higher Lows',
                  },
                  status: 'TRADE OPEN',
                  createdAt: foundTrade.createdAt,
                  productId: 1,
                  timeframe: foundTrade.timeframe || '15m',
                  pcdReason: foundTrade.pcdReason || 'PCD Breadth & Trend Clearance',
                  marketBreadthAtEntry: foundTrade.marketBreadthAtEntry || 'Broad Market Aligned',
                  pcdVerdict: foundTrade.pcdReason?.toLowerCase().includes('outlier') ? 'PCD OUTLIER EXEMPTION' : 'PCD APPROVED',
                });
                return;
              }
              const foundHist = history.find((h) => h.coin === sym);
              if (foundHist) {
                setActiveAIForensicsSetup({
                  id: foundHist.id || `S_${foundHist.coin}_hist`,
                  coin: foundHist.coin,
                  exchange: 'Delta',
                  instrumentType: 'Future',
                  direction: foundHist.direction,
                  currentPrice: foundHist.livePrice || foundHist.entryPrice,
                  triggerPrice: foundHist.entryPrice,
                  entryPrice: foundHist.entryPrice,
                  tp1: foundHist.tp1,
                  sl: foundHist.sl,
                  distanceToTrigger: 0,
                  distanceToTriggerPercent: 0,
                  expectedMovePercent: Math.abs(((foundHist.tp1 - foundHist.entryPrice) / foundHist.entryPrice) * 100),
                  riskPercent: Math.abs(((foundHist.entryPrice - foundHist.sl) / foundHist.entryPrice) * 100),
                  rewardPercent: Math.abs(((foundHist.tp1 - foundHist.entryPrice) / foundHist.entryPrice) * 100),
                  riskReward: foundHist.riskRewardAchieved || foundHist.riskReward || 5,
                  score: foundHist.score || 85,
                  historicalProbability: 80,
                  sampleSize: 25,
                  confidence: 85,
                  reason: foundHist.whyFormed || foundHist.primaryReason || 'PCD Confluence',
                  whyFormed: foundHist.whyFormed || 'Historical trade setup with 1:5 asymmetric target.',
                  primaryReason: foundHist.primaryReason || `${foundHist.coin} Breakout`,
                  supportingReasons: foundHist.supportingReasons || ['PCD Breadth Passed'],
                  historicalEvidence: 'Institutional Volume Accumulation',
                  indicatorConfirmations: {
                    trend: 'Trend Continuation',
                    rsi: 55,
                    macd: 'Positive',
                    adx: 30,
                    volumeProfile: 'Accumulation Node',
                    volatility: 'Normal ATR',
                    pattern: 'Breakout',
                    marketStructure: 'Aligned',
                  },
                  status: 'TRADE OPEN',
                  createdAt: foundHist.openedAt || foundHist.timestamp || new Date().toISOString(),
                  productId: 1,
                  timeframe: foundHist.timeframe || '15m',
                  pcdReason: foundHist.pcdReason || 'PCD Breadth & Trend Clearance',
                  marketBreadthAtEntry: foundHist.marketBreadthAtEntry || 'Broad Market Aligned',
                  pcdVerdict: foundHist.pcdStatus || 'PCD APPROVED',
                });
              }
            }}
          />
        )}

        {activeTab === 'history' && (
          <SetupHistoryView
            history={history}
            onClearHistory={handleClearHistory}
            onOpenAIForensics={(hItem) => {
              setActiveAIForensicsSetup({
                id: hItem.id || `S_${hItem.coin}_hist`,
                coin: hItem.coin,
                exchange: 'Delta',
                instrumentType: 'Future',
                direction: hItem.direction,
                currentPrice: hItem.livePrice || hItem.entryPrice,
                triggerPrice: hItem.entryPrice,
                entryPrice: hItem.entryPrice,
                tp1: hItem.tp1,
                sl: hItem.sl,
                distanceToTrigger: 0,
                distanceToTriggerPercent: 0,
                expectedMovePercent: Math.abs(((hItem.tp1 - hItem.entryPrice) / hItem.entryPrice) * 100),
                riskPercent: Math.abs(((hItem.entryPrice - hItem.sl) / hItem.entryPrice) * 100),
                rewardPercent: Math.abs(((hItem.tp1 - hItem.entryPrice) / hItem.entryPrice) * 100),
                riskReward: hItem.riskRewardAchieved || hItem.riskReward || 5,
                score: hItem.score || 85,
                historicalProbability: 80,
                sampleSize: 25,
                confidence: 85,
                reason: hItem.whyFormed || hItem.primaryReason || 'PCD Confluence',
                whyFormed: hItem.whyFormed || 'Historical trade setup with 1:5 asymmetric target.',
                primaryReason: hItem.primaryReason || `${hItem.coin} Breakout`,
                supportingReasons: hItem.supportingReasons || ['PCD Breadth Passed'],
                historicalEvidence: 'Institutional Volume Accumulation',
                indicatorConfirmations: {
                  trend: 'Trend Continuation',
                  rsi: 55,
                  macd: 'Positive',
                  adx: 30,
                  volumeProfile: 'Accumulation Node',
                  volatility: 'Normal ATR',
                  pattern: 'Breakout',
                  marketStructure: 'Aligned',
                },
                status: 'TRADE OPEN',
                createdAt: hItem.openedAt || hItem.timestamp || new Date().toISOString(),
                productId: 1,
                timeframe: hItem.timeframe || '15m',
                pcdReason: hItem.pcdReason || 'PCD Breadth & Trend Clearance',
                marketBreadthAtEntry: hItem.marketBreadthAtEntry || 'Broad Market Aligned',
                pcdVerdict: hItem.pcdStatus || 'PCD APPROVED',
              });
            }}
          />
        )}

        {activeTab === 'arbitrage' && (
          <ArbitrageView
            setups={arbitrageSetups}
            onRefreshArbitrage={() => fetchMarketData()}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestView onRunBacktest={handleRunBacktest} />
        )}

        {activeTab === 'orders' && (
          <LiveOrdersView
            trades={trades}
            config={config}
            onUpdateTpSl={handleUpdateTpSl}
            onCloseTrade={handleCloseTrade}
            onCloseAllTrades={handleCloseAllTrades}
            onClearTrades={handleClearTrades}
            onClearDay={handleClearDay}
            onClearAllTrades={handleClearAllTrades}
            onUpdateAutoCloseSettings={handleUpdateAutoCloseSettings}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsLearningView
            forensics={forensics}
            history={history}
            trades={trades}
            config={config}
            currentTimeframe={config.scanningTimeframe || '15m'}
            onTimeframeChange={handleTimeframeChange}
            totalTrades={trades.length + history.length}
            winRate={
              history.length > 0
                ? Math.round((history.filter((h) => h.outcome === 'TP HIT').length / history.length) * 100)
                : status.tpHitCount + status.slHitCount > 0
                ? Math.round((status.tpHitCount / (status.tpHitCount + status.slHitCount)) * 100)
                : 0
            }
            onClearHistory={handleClearHistory}
            onTriggerScan={() => handleExecuteCommand('scan top 24h')}
          />
        )}

        {activeTab === 'errors' && (
          <ErrorCenterView errors={errors} onClearErrors={handleClearErrors} />
        )}

        {activeTab === 'command' && (
          <SmartCommandCenter
            onExecuteCommand={handleExecuteCommand}
            logs={commandLogs}
          />
        )}
      </main>

      {/* First-Run Setup Wizard Modal */}
      <SetupWizardModal
        config={config}
        isOpen={isWizardOpen && !status.isConnected}
        onClose={() => setIsWizardOpen(false)}
        onComplete={async (updates) => {
          await handleSaveConfig(updates);
          await handleTestConnection();
        }}
        onTestConnection={handleTestConnection}
      />

      {/* Global AI Quant Forensics Explainer Modal */}
      <AITradeForensicsModal
        setup={activeAIForensicsSetup}
        isOpen={Boolean(activeAIForensicsSetup)}
        onClose={() => setActiveAIForensicsSetup(null)}
        onExecute={handleExecuteSetup}
      />
    </div>
  );
}
