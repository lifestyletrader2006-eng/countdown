import React, { useState } from 'react';
import {
  Sliders,
  ShieldCheck,
  Key,
  Lock,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Power,
  ExternalLink,
  HelpCircle,
  Copy,
  Check,
  Globe,
  Server,
  Bell,
  Volume2,
  Smartphone,
  Target,
  ShieldAlert,
  WifiOff,
  Sparkles,
  Zap,
  VolumeX,
  Shield,
  Database,
  Clock,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import type { ExchangeConfig, DeltaEnvironment, SetupTimeframe, CoinCountdownLock } from '../types/index.js';
import { alertService } from '../utils/audioAlert.js';

interface ExchangeSettingsProps {
  config: ExchangeConfig;
  onSaveConfig: (updated: Partial<ExchangeConfig>) => Promise<void>;
  onTestConnection: (creds?: { apiKey: string; apiSecret: string; environment: DeltaEnvironment }) => Promise<{ success: boolean; error?: string; latencyMs?: number }>;
  onDisconnect: () => Promise<void>;
  onDeleteCredentials: () => Promise<void>;
}

export const ExchangeSettings: React.FC<ExchangeSettingsProps> = ({
  config,
  onSaveConfig,
  onTestConnection,
  onDisconnect,
  onDeleteCredentials,
}) => {
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [apiSecret, setApiSecret] = useState(config.apiSecret || '');
  const [environment, setEnvironment] = useState<DeltaEnvironment>(config.environment || 'production');
  const [copiedIp, setCopiedIp] = useState(false);

  const serverIp = config.serverIp || '34.34.244.50';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2500);
  };

  // Risk parameters
  const [tradingCapital, setTradingCapital] = useState(config.tradingCapital || 10000);
  const [capitalLimit, setCapitalLimit] = useState(config.capitalLimit || 8000);
  const [maxDailyLoss, setMaxDailyLoss] = useState(config.maxDailyLoss || 500);
  const [maxOpenTrades, setMaxOpenTrades] = useState(config.maxOpenTrades || 3);
  const [lotSize, setLotSize] = useState(config.lotSize || 1);
  const [minProfit, setMinProfit] = useState(config.minExpectedNetProfitPercent || 2.0);
  const [minEdge, setMinEdge] = useState(config.minNetEdgePercent || 0.8);
  const [minRR, setMinRR] = useState(config.minRiskReward || 1.8);
  const [leverageMode, setLeverageMode] = useState(config.leverageMode || 'AUTOMATIC');
  const [manualLeverage, setManualLeverage] = useState(config.manualLeverage || 10);
  const [tradingType, setTradingType] = useState(config.tradingType || 'FUTURES_ONLY');

  // Mode toggles & TP progress settings
  const [isReadMode, setIsReadMode] = useState(config.isReadMode ?? true);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(config.autoTradeEnabled ?? false);
  const [autoSaveHistory, setAutoSaveHistory] = useState(config.autoSaveHistory ?? true);
  const [tpProgressEnabled, setTpProgressEnabled] = useState(config.tpProgressEnabled ?? true);
  const [tpProgressRatio, setTpProgressRatio] = useState(config.tpProgressRatio || 50);
  const [scanningTimeframe, setScanningTimeframe] = useState<SetupTimeframe>(config.scanningTimeframe || '15m');
  const [botScanningTimeframes, setBotScanningTimeframes] = useState<SetupTimeframe[]>(
    config.botScanningTimeframes && config.botScanningTimeframes.length > 0
      ? config.botScanningTimeframes
      : ['15m', '30m', '1h', '4h', '1d']
  );
  const [exchangeScanningTimeframes, setExchangeScanningTimeframes] = useState<SetupTimeframe[]>(
    config.exchangeScanningTimeframes && config.exchangeScanningTimeframes.length > 0
      ? config.exchangeScanningTimeframes
      : ['15m', '30m', '1h', '4h', '1d']
  );

  // Price Change Distribution (PCD) Settings State
  const [pcdEnabled, setPcdEnabled] = useState(config.pcdEnabled ?? true);
  const [pcdBreadthFilterEnabled, setPcdBreadthFilterEnabled] = useState(config.pcdBreadthFilterEnabled ?? true);
  const [pcdChopProtectionEnabled, setPcdChopProtectionEnabled] = useState(config.pcdChopProtectionEnabled ?? true);
  const [pcdMinBullishRatioForLongs, setPcdMinBullishRatioForLongs] = useState(config.pcdMinBullishRatioForLongs ?? 40);
  const [pcdMaxBearishRatioForShorts, setPcdMaxBearishRatioForShorts] = useState(config.pcdMaxBearishRatioForShorts ?? 40);
  const [pcdAllowOutliersInOppositeMarket, setPcdAllowOutliersInOppositeMarket] = useState(config.pcdAllowOutliersInOppositeMarket ?? true);
  const [pcdConfluenceScoreBonus, setPcdConfluenceScoreBonus] = useState(config.pcdConfluenceScoreBonus ?? 10);
  const [pcdMinOutlierGainPercent, setPcdMinOutlierGainPercent] = useState(config.pcdMinOutlierGainPercent ?? 5.0);

  // Side Change (Opposite Order Placement) State
  const [sideChangeEnabled, setSideChangeEnabled] = useState(config.sideChangeEnabled ?? false);
  const [sideChangeSlMode, setSideChangeSlMode] = useState<'SL' | '10%' | '20%' | '30%' | '40%' | '50%'>(config.sideChangeSlMode ?? 'SL');

  // Trade Expiry Countdown Section State
  const [countdownMode, setCountdownMode] = useState<'OFF' | 'ONLY_TIMEFRAME' | 'ALL_TIMEFRAME'>(
    config.countdownMode ?? 'OFF'
  );
  const [countdownAllTfDuration, setCountdownAllTfDuration] = useState<'12h' | '24h' | 'CUSTOM'>(
    config.countdownAllTfDuration ?? '12h'
  );
  const [countdownCustomHours, setCountdownCustomHours] = useState<number>(
    config.countdownCustomHours ?? 12
  );
  const [countdownLocks, setCountdownLocks] = useState<CoinCountdownLock[]>([]);
  const [isClearingLockId, setIsClearingLockId] = useState<string | null>(null);

  // Sync countdown locks live from server
  React.useEffect(() => {
    let isMounted = true;
    const fetchLocks = async () => {
      try {
        const res = await fetch('/api/countdown');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.locks) {
            setCountdownLocks(data.locks);
          }
        }
      } catch {
        // ignore fetch error
      }
    };

    fetchLocks();
    const interval = setInterval(fetchLocks, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Sync state when config prop updates
  React.useEffect(() => {
    setIsReadMode(config.isReadMode ?? true);
    setAutoTradeEnabled(config.autoTradeEnabled ?? false);
    setAutoSaveHistory(config.autoSaveHistory ?? true);
    setTpProgressEnabled(config.tpProgressEnabled ?? true);
    setTpProgressRatio(config.tpProgressRatio || 50);
    setScanningTimeframe(config.scanningTimeframe || '15m');
    if (config.botScanningTimeframes && config.botScanningTimeframes.length > 0) {
      setBotScanningTimeframes(config.botScanningTimeframes);
    }
    if (config.exchangeScanningTimeframes && config.exchangeScanningTimeframes.length > 0) {
      setExchangeScanningTimeframes(config.exchangeScanningTimeframes);
    }
    setPcdEnabled(config.pcdEnabled ?? true);
    setPcdBreadthFilterEnabled(config.pcdBreadthFilterEnabled ?? true);
    setPcdChopProtectionEnabled(config.pcdChopProtectionEnabled ?? true);
    setPcdMinBullishRatioForLongs(config.pcdMinBullishRatioForLongs ?? 40);
    setPcdMaxBearishRatioForShorts(config.pcdMaxBearishRatioForShorts ?? 40);
    setPcdAllowOutliersInOppositeMarket(config.pcdAllowOutliersInOppositeMarket ?? true);
    setPcdConfluenceScoreBonus(config.pcdConfluenceScoreBonus ?? 10);
    setPcdMinOutlierGainPercent(config.pcdMinOutlierGainPercent ?? 5.0);
    setSideChangeEnabled(config.sideChangeEnabled ?? false);
    setSideChangeSlMode(config.sideChangeSlMode ?? 'SL');
    setCountdownMode(config.countdownMode ?? 'OFF');
    setCountdownAllTfDuration(config.countdownAllTfDuration ?? '12h');
    setCountdownCustomHours(config.countdownCustomHours ?? 12);
  }, [
    config.isReadMode,
    config.autoTradeEnabled,
    config.autoSaveHistory,
    config.tpProgressEnabled,
    config.tpProgressRatio,
    config.scanningTimeframe,
    config.botScanningTimeframes,
    config.exchangeScanningTimeframes,
    config.pcdEnabled,
    config.pcdBreadthFilterEnabled,
    config.pcdChopProtectionEnabled,
    config.pcdMinBullishRatioForLongs,
    config.pcdMaxBearishRatioForShorts,
    config.pcdAllowOutliersInOppositeMarket,
    config.pcdConfluenceScoreBonus,
    config.pcdMinOutlierGainPercent,
    config.sideChangeEnabled,
    config.sideChangeSlMode,
    config.countdownMode,
    config.countdownAllTfDuration,
    config.countdownCustomHours,
  ]);

  const handleUpdateCountdownMode = async (mode: 'OFF' | 'ONLY_TIMEFRAME' | 'ALL_TIMEFRAME') => {
    setCountdownMode(mode);
    await onSaveConfig({ countdownMode: mode });
    try {
      await fetch('/api/countdown/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, allTfDuration: countdownAllTfDuration, customHours: countdownCustomHours }),
      });
    } catch {}
  };

  const handleUpdateCountdownAllTf = async (duration: '12h' | '24h' | 'CUSTOM') => {
    setCountdownAllTfDuration(duration);
    await onSaveConfig({ countdownAllTfDuration: duration });
    try {
      await fetch('/api/countdown/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: countdownMode, allTfDuration: duration, customHours: countdownCustomHours }),
      });
    } catch {}
  };

  const handleUpdateCustomHours = async (hours: number) => {
    const val = Math.max(1, Number(hours) || 1);
    setCountdownCustomHours(val);
    await onSaveConfig({ countdownCustomHours: val });
    try {
      await fetch('/api/countdown/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: countdownMode, allTfDuration: countdownAllTfDuration, customHours: val }),
      });
    } catch {}
  };

  const handleClearCountdownLock = async (lockId?: string, coin?: string) => {
    setIsClearingLockId(lockId || 'ALL');
    try {
      const res = await fetch('/api/countdown/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockId, coin }),
      });
      if (res.ok) {
        const data = await res.json();
        setCountdownLocks(data.locks || []);
      }
    } finally {
      setIsClearingLockId(null);
    }
  };

  const handleToggleSideChange = async () => {
    const nextVal = !sideChangeEnabled;
    setSideChangeEnabled(nextVal);
    await onSaveConfig({ sideChangeEnabled: nextVal });
  };

  const handleSelectSideChangeSlMode = async (mode: 'SL' | '10%' | '20%' | '30%' | '40%' | '50%') => {
    setSideChangeSlMode(mode);
    await onSaveConfig({ sideChangeSlMode: mode });
  };

  const handleToggleReadMode = async () => {
    const nextVal = !isReadMode;
    setIsReadMode(nextVal);
    await onSaveConfig({ isReadMode: nextVal });
  };

  const handleToggleAutoTrade = async () => {
    const nextVal = !autoTradeEnabled;
    setAutoTradeEnabled(nextVal);
    await onSaveConfig({ autoTradeEnabled: nextVal });
  };

  const handleToggleAutoSaveHistory = async () => {
    const nextVal = !autoSaveHistory;
    setAutoSaveHistory(nextVal);
    await onSaveConfig({ autoSaveHistory: nextVal });
  };

  const handleToggleTpProgress = async () => {
    const nextVal = !tpProgressEnabled;
    setTpProgressEnabled(nextVal);
    await onSaveConfig({ tpProgressEnabled: nextVal });
  };

  const handleSelectScanningTimeframe = async (tf: SetupTimeframe) => {
    setScanningTimeframe(tf);
    await onSaveConfig({ scanningTimeframe: tf });
  };

  const handleToggleBotTimeframe = async (tf: SetupTimeframe) => {
    let next = [...botScanningTimeframes];
    if (next.includes(tf)) {
      if (next.length > 1) next = next.filter((t) => t !== tf);
    } else {
      next.push(tf);
    }
    setBotScanningTimeframes(next);
    await onSaveConfig({ botScanningTimeframes: next });
    await fetch('/api/timeframe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botScanningTimeframes: next }),
    });
  };

  const handleToggleExchangeTimeframe = async (tf: SetupTimeframe) => {
    let next = [...exchangeScanningTimeframes];
    if (next.includes(tf)) {
      if (next.length > 1) next = next.filter((t) => t !== tf);
    } else {
      next.push(tf);
    }
    setExchangeScanningTimeframes(next);
    await onSaveConfig({ exchangeScanningTimeframes: next });
    await fetch('/api/timeframe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeScanningTimeframes: next }),
    });
  };

  // Notification and Visual/Audio Alert settings
  const [alertOnTpHit, setAlertOnTpHit] = useState(config.alertOnTpHit ?? true);
  const [alertOnSlHit, setAlertOnSlHit] = useState(config.alertOnSlHit ?? true);
  const [alertOnTriggerWarnings, setAlertOnTriggerWarnings] = useState(config.alertOnTriggerWarnings ?? true);
  const [alertOnApiDisconnect, setAlertOnApiDisconnect] = useState(config.alertOnApiDisconnect ?? true);
  const [notifyOnApproaching, setNotifyOnApproaching] = useState(config.notifyOnApproaching ?? true);
  const [notifyOnTriggered, setNotifyOnTriggered] = useState(config.notifyOnTriggered ?? true);
  const [enableSoundAlerts, setEnableSoundAlerts] = useState(config.enableSoundAlerts ?? true);
  const [enableBrowserPush, setEnableBrowserPush] = useState(config.enableBrowserPush ?? false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);

  // Global Category Notification Mute Settings
  const [muteTriggerAlerts, setMuteTriggerAlerts] = useState(config.muteTriggerAlerts ?? false);
  const [muteTpHitAlerts, setMuteTpHitAlerts] = useState(config.muteTpHitAlerts ?? false);
  const [muteSlHitAlerts, setMuteSlHitAlerts] = useState(config.muteSlHitAlerts ?? false);
  const [muteReconnectAlerts, setMuteReconnectAlerts] = useState(config.muteReconnectAlerts ?? false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string; latency?: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection({
        apiKey,
        apiSecret,
        environment,
      });
      setTestResult({
        success: res.success,
        error: res.error,
        latency: res.latencyMs,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig({
        apiKey,
        apiSecret,
        environment,
        tradingCapital: Number(tradingCapital),
        capitalLimit: Number(capitalLimit),
        maxDailyLoss: Number(maxDailyLoss),
        maxOpenTrades: Number(maxOpenTrades),
        lotSize: Number(lotSize),
        minExpectedNetProfitPercent: Number(minProfit),
        minNetEdgePercent: Number(minEdge),
        minRiskReward: Number(minRR),
        leverageMode,
        manualLeverage: Number(manualLeverage),
        tradingType,
        isReadMode,
        autoTradeEnabled,
        autoSaveHistory,
        tpProgressEnabled,
        tpProgressRatio: Number(tpProgressRatio),
        scanningTimeframe,
        alertOnTpHit,
        alertOnSlHit,
        alertOnTriggerWarnings,
        alertOnApiDisconnect,
        notifyOnApproaching,
        notifyOnTriggered,
        enableSoundAlerts,
        enableBrowserPush,
        muteTriggerAlerts,
        muteTpHitAlerts,
        muteSlHitAlerts,
        muteReconnectAlerts,
        // Price Change Distribution Settings
        pcdEnabled,
        pcdBreadthFilterEnabled,
        pcdChopProtectionEnabled,
        pcdMinBullishRatioForLongs: Number(pcdMinBullishRatioForLongs),
        pcdMaxBearishRatioForShorts: Number(pcdMaxBearishRatioForShorts),
        pcdAllowOutliersInOppositeMarket,
        pcdConfluenceScoreBonus: Number(pcdConfluenceScoreBonus),
        pcdMinOutlierGainPercent: Number(pcdMinOutlierGainPercent),
        sideChangeEnabled,
        sideChangeSlMode,
        countdownMode,
        countdownAllTfDuration,
        countdownCustomHours: Number(countdownCustomHours),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* OUTBOUND IP WHITELIST BANNER */}
      <div className="bg-gradient-to-r from-blue-950/40 via-[#101622] to-emerald-950/30 border border-blue-500/30 rounded-xl p-4 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0 mt-0.5">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                24/7 Cloud Bot IP Whitelist & Unrestricted Recommendation
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30 font-bold">
                RECOMMENDED: UNRESTRICTED
              </span>
            </div>
            <div className="text-xs text-zinc-300 mt-1 leading-relaxed space-y-1">
              <p>
                <strong className="text-amber-300">24x7 Continuous Bot Solution:</strong> Cloud servers me outbound IP dynamically assign hota hai (currently <code className="text-emerald-400 font-mono font-bold">{serverIp}</code>).
              </p>
              <p>
                Delta Exchange me API Key banate ya edit karte samay <strong className="text-emerald-400 underline">IP Access Restriction ko "Unrestricted" (Allow all IPs)</strong> rakhein, jisse IP badalne par bhi bot bina ruke 24x7 trade execute kar sake. Agar whitelist lagana chahte hain, toh neeche diya IP add karein:
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <code className="px-3 py-1.5 rounded-md bg-black/70 border border-blue-500/40 font-mono text-sm font-bold text-emerald-400 tracking-wider">
                {serverIp}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(serverIp)}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIp ? 'IP Copied!' : 'Copy IP'}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="text-[11px] text-zinc-400 font-mono border-l-0 md:border-l border-zinc-800 md:pl-4 space-y-1">
          <p className="text-amber-300 font-semibold">24x7 Delta Setup Rules:</p>
          <p>&bull; <strong className="text-emerald-400">Best:</strong> IP restriction = "Unrestricted"</p>
          <p>&bull; Whitelist karna ho: <code className="text-emerald-400">{serverIp}</code></p>
          <p>&bull; India users select <strong className="text-emerald-400">Delta India</strong></p>
        </div>
      </div>

      {/* 1. Delta Exchange API Connection & Key Placement Guide */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">Delta Exchange API Credentials</h2>
              <p className="text-xs text-zinc-400">
                Production-grade HMAC-SHA256 authenticated connection to Delta Exchange only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono border ${
                config.isConnected
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                  : 'bg-rose-950/40 text-rose-400 border-rose-500/40'
              }`}
            >
              {config.isConnected ? 'AUTHENTICATED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        {/* Clear Instructions Guide */}
        <div className="bg-[#0b0f17] border border-zinc-800/80 rounded-lg p-3.5 text-xs text-zinc-300 space-y-2">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <HelpCircle className="w-4 h-4" />
            <span>Where to get and place your Delta Exchange API credentials:</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            1. Visit Delta Exchange (<a href="https://india.delta.exchange" target="_blank" rel="noreferrer" className="text-emerald-400 underline">india.delta.exchange</a> or <a href="https://www.delta.exchange" target="_blank" rel="noreferrer" className="text-emerald-400 underline">delta.exchange</a>).<br />
            2. Go to <strong>Settings &rarr; API Management &rarr; Create API Key</strong>.<br />
            3. Grant <em>Read</em> and <em>Trade</em> permissions for Futures & Options.<br />
            4. In IP restriction, enter <strong className="text-emerald-400">{serverIp}</strong> (or leave blank if unrestricted).<br />
            5. Copy and paste your <strong>API Key</strong> and <strong>API Secret</strong> below, select the correct region, and click <strong>Test Connection</strong>.
          </p>
        </div>

        {/* Credentials Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-mono text-zinc-300 mb-1.5">
              DELTA API KEY <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="e.g. 3axid78QsEGzOPthrHepz2iMPn9Uyb"
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-300 mb-1.5">
              DELTA API SECRET <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Enter your API Secret (never logged or exposed)"
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Environment Selection: India vs Global vs Testnet */}
        <div className="pt-2">
          <label className="block text-xs font-mono text-zinc-300 mb-1.5">
            DELTA EXCHANGE REGION & ENVIRONMENT <span className="text-rose-400">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setEnvironment('india')}
              className={`p-3 rounded-lg border text-xs font-mono text-left transition relative ${
                environment === 'india'
                  ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                  : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-100">Delta India</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  INR / India
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">api.india.delta.exchange</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">For india.delta.exchange accounts</div>
            </button>

            <button
              type="button"
              onClick={() => setEnvironment('production')}
              className={`p-3 rounded-lg border text-xs font-mono text-left transition relative ${
                environment === 'production'
                  ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                  : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-100">Delta Global</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Global
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">api.delta.exchange</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">For delta.exchange accounts</div>
            </button>

            <button
              type="button"
              onClick={() => setEnvironment('testnet')}
              className={`p-3 rounded-lg border text-xs font-mono text-left transition relative ${
                environment === 'testnet'
                  ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                  : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-100">Delta Testnet</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Sandbox
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">testnet-api.delta.exchange</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">For paper trading testing</div>
            </button>
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            className={`p-3 rounded-lg border text-xs font-mono ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
            }`}
          >
            {testResult.success ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Delta Exchange API connection SUCCESSFUL! Round-trip latency: {testResult.latency}ms</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Connection Verification Failed:</span>
                    <p className="text-zinc-200 mt-0.5">{testResult.error}</p>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-400 pl-6 space-y-0.5 pt-1 border-t border-rose-900/40">
                  <p className="text-rose-300 font-semibold">Troubleshooting checklist:</p>
                  <p>1. Ensure your IP <code className="text-white font-bold bg-black/50 px-1 rounded">{serverIp}</code> is added in Delta API key whitelist.</p>
                  <p>2. If your account is with Delta India (KYC with PAN/Aadhaar), choose <strong className="text-white">Delta India</strong> above.</p>
                  <p>3. Verify that your API Secret is completely copied without extra whitespace.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Connection Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || !apiKey}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-xs transition flex items-center gap-1.5"
          >
            {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
            <span>{isTesting ? 'Testing Delta Exchange API...' : 'Test Delta API Now'}</span>
          </button>

          {config.isConnected && (
            <button
              type="button"
              onClick={onDisconnect}
              className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition border border-zinc-700 flex items-center gap-1.5"
            >
              <Power className="w-3.5 h-3.5 text-amber-400" />
              <span>Disconnect</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDeleteCredentials}
            className="px-3.5 py-2 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 text-rose-400 text-xs font-mono transition border border-rose-800/50 flex items-center gap-1.5 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Credentials</span>
          </button>
        </div>
      </div>

      {/* 2. Execution Mode, Auto Trading & History Persistence */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">Execution Mode & Auto Trading</h2>
              <p className="text-xs text-zinc-400">Strict guards against unintended real orders & history persistence control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
              isReadMode
                ? 'bg-sky-950/40 text-sky-400 border-sky-500/40'
                : 'bg-amber-950/40 text-amber-400 border-amber-500/40'
            }`}>
              {isReadMode ? 'READ-ONLY (BOT ORDER)' : 'LIVE EXCHANGE READY'}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
              autoTradeEnabled
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              {autoTradeEnabled ? 'AUTO TRADE ON' : 'AUTO TRADE OFF'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Read vs Live Mode */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-200">READ-ONLY MODE</span>
                <button
                  type="button"
                  id="toggle-read-mode"
                  onClick={handleToggleReadMode}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition ${
                    isReadMode ? 'bg-sky-600 justify-end' : 'bg-emerald-600 justify-start'
                  }`}
                  title={isReadMode ? 'Click to enable Live Exchange Trading' : 'Click to enable Read-Only Simulation'}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
                </button>
              </div>
              <div className="mt-1">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                  isReadMode ? 'bg-sky-500/10 text-sky-300' : 'bg-emerald-500/10 text-emerald-300'
                }`}>
                  {isReadMode ? 'PROTECTED SIMULATION' : 'EXCHANGE EXECUTION'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {isReadMode
                ? 'SAFE: Bot evaluates setups, analyzes confluence, and places Bot Orders. No real exchange orders are sent.'
                : 'LIVE: When trigger is met and API is connected with Auto Trade ON, real orders are sent directly to Delta Exchange.'}
            </p>
          </div>

          {/* Auto Trade */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-200">AUTONOMOUS AUTO TRADE</span>
                <button
                  type="button"
                  id="toggle-auto-trade"
                  onClick={handleToggleAutoTrade}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition ${
                    autoTradeEnabled ? 'bg-emerald-600 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                  title={autoTradeEnabled ? 'Click to turn OFF Auto Trading' : 'Click to turn ON Auto Trading'}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
                </button>
              </div>
              <div className="mt-1">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                  autoTradeEnabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {autoTradeEnabled ? 'AUTOMATED TRIGGER' : 'MANUAL CONFIRMATION'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {autoTradeEnabled
                ? 'ACTIVE: Setups trigger and execute automatically on trigger price reach without manual button presses.'
                : 'OFF: Setups do not place exchange orders automatically. Triggers shift to Bot Order with reason logged.'}
            </p>
          </div>

          {/* Auto-Save History Toggle */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs font-mono font-bold text-zinc-200">AUTO-SAVE HISTORY</span>
                </div>
                <button
                  type="button"
                  id="toggle-auto-save-history"
                  onClick={handleToggleAutoSaveHistory}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition ${
                    autoSaveHistory ? 'bg-purple-600 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                  title={autoSaveHistory ? 'Click to disable history persistence' : 'Click to enable history persistence'}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
                </button>
              </div>
              <div className="mt-1">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                  autoSaveHistory ? 'bg-purple-500/10 text-purple-300' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {autoSaveHistory ? 'PERSISTENT DISK DB' : 'EPHEMERAL / PRIVACY'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {autoSaveHistory
                ? 'ON: Trade records, setups, open/close dates, and SL/TP forensic history are saved persistently to database disk storage.'
                : 'OFF (Privacy Mode): Backend stops writing trade and performance records to database file. Active run retains in-memory session only.'}
            </p>
          </div>

          {/* 50% TP Progress Setting */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-mono font-bold text-zinc-200">50% TP PROGRESS SETTING</span>
                </div>
                <button
                  type="button"
                  id="toggle-tp-progress"
                  onClick={handleToggleTpProgress}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition ${
                    tpProgressEnabled ? 'bg-amber-600 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                  title={tpProgressEnabled ? 'Click to disable 50% TP progress partial booking' : 'Click to enable 50% TP progress partial booking'}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                  tpProgressEnabled ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {tpProgressEnabled ? 'PARTIAL PROFIT & TRAIL SL ACTIVE' : 'DISABLED (FULL TP ONLY)'}
                </span>

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-zinc-400 font-mono">Target:</span>
                  <select
                    value={tpProgressRatio}
                    onChange={(e) => setTpProgressRatio(Number(e.target.value))}
                    disabled={!tpProgressEnabled}
                    className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-1.5 py-0.5 font-mono"
                  >
                    <option value={30}>30% TP</option>
                    <option value={40}>40% TP</option>
                    <option value={50}>50% TP (Default)</option>
                    <option value={60}>60% TP</option>
                    <option value={70}>70% TP</option>
                  </select>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {tpProgressEnabled
                ? `ON: Jab trade ${tpProgressRatio}% TP progress tak pahunchega, turnt 50% quantity profit book hogi, date/time/price history mai save hoga aur Stop Loss breakeven entry price par trail hoga.`
                : 'OFF: Bot will hold full position until 100% TP target or Stop Loss is reached without intermediate partial profit booking.'}
            </p>
          </div>

          {/* Dual Multi-Timeframe Scanning Configuration: Bot vs Exchange */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-4 col-span-1 md:col-span-2">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-mono font-bold text-zinc-100">
                  MULTI-TIMEFRAME SCANNING CONFIGURATION (मल्टीपल टाइमफ्रेम सेटअप)
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 font-bold">
                15m, 30m, 1h, 4h, 1d Multiple Horizon Support
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Bot Scanning Timeframes */}
              <div className="p-3 bg-[#0d1422] border border-emerald-900/60 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-300">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🤖 BOT SCAN TIMEFRAMES (बॉट टाइमफ्रेम)</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                    {botScanningTimeframes.length} Selected
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {(['15m', '30m', '1h', '4h', '1d'] as SetupTimeframe[]).map((tf) => {
                    const isSelected = botScanningTimeframes.includes(tf);
                    return (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => handleToggleBotTimeframe(tf)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition flex items-center gap-1 ${
                          isSelected
                            ? 'bg-emerald-500 text-black shadow-md font-bold'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {isSelected && <span>✓</span>}
                        <span>{tf}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={async () => {
                      const all: SetupTimeframe[] = ['15m', '30m', '1h', '4h', '1d'];
                      setBotScanningTimeframes(all);
                      await onSaveConfig({ botScanningTimeframes: all });
                      await fetch('/api/timeframe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ botScanningTimeframes: all }),
                      });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700"
                  >
                    Select All
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed pt-1">
                  Active for autonomous Bot simulation: <strong>{botScanningTimeframes.join(', ')}</strong>. Setups matching these timeframes will execute as Bot Virtual orders.
                </p>
              </div>

              {/* 2. Exchange Scanning Timeframes */}
              <div className="p-3 bg-[#0c1626] border border-sky-900/60 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-sky-300">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>⚡ EXCHANGE SCAN TIMEFRAMES (एक्सचेंज टाइमफ्रेम)</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-bold">
                    {exchangeScanningTimeframes.length} Selected
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {(['15m', '30m', '1h', '4h', '1d'] as SetupTimeframe[]).map((tf) => {
                    const isSelected = exchangeScanningTimeframes.includes(tf);
                    return (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => handleToggleExchangeTimeframe(tf)}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition flex items-center gap-1 ${
                          isSelected
                            ? 'bg-sky-500 text-black shadow-md font-bold'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {isSelected && <span>✓</span>}
                        <span>{tf}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={async () => {
                      const all: SetupTimeframe[] = ['15m', '30m', '1h', '4h', '1d'];
                      setExchangeScanningTimeframes(all);
                      await onSaveConfig({ exchangeScanningTimeframes: all });
                      await fetch('/api/timeframe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ exchangeScanningTimeframes: all }),
                      });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700"
                  >
                    Select All
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed pt-1">
                  Active for real Delta Exchange live trading: <strong>{exchangeScanningTimeframes.join(', ')}</strong>. If any exchange error occurs, orders automatically convert into Bot Orders with failure reasons logged.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2b. Side Change (Opposite Order Placement) Configuration */}
      <div className="bg-[#101622] border border-amber-500/40 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-zinc-800/80 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  Side Change / Opposite Order Mode (साइड चेंज फ़ीचर)
                </h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  sideChangeEnabled
                    ? 'bg-amber-950 text-amber-300 border border-amber-600'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  {sideChangeEnabled ? 'FEATURE ON' : 'FEATURE OFF'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Setup trigger hone par Delta Exchange par opposite side ka order place hoga aur original side benchmark rahega
              </p>
            </div>
          </div>

          {/* Master Toggle */}
          <button
            type="button"
            onClick={handleToggleSideChange}
            className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition border shadow-md ${
              sideChangeEnabled
                ? 'bg-amber-500 text-black border-amber-400 shadow-amber-950/40'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full ${sideChangeEnabled ? 'bg-black' : 'bg-zinc-500'}`} />
            <span>{sideChangeEnabled ? 'Side Change: ON' : 'Side Change: OFF'}</span>
          </button>
        </div>

        {/* Informative Explanation & Live Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Explanation Box */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-zinc-200">
                <span>🔄 SIDE CHANGE RULE ENGINE</span>
                <span className="text-[10px] text-amber-400 font-normal">
                  {sideChangeEnabled ? 'Exchange Order: INVERTED' : 'Exchange Order: NORMAL'}
                </span>
              </div>
              <div className="mt-2 space-y-2 text-[11px] text-zinc-300 leading-relaxed">
                <p>
                  <strong>OFF रहने पर:</strong> बॉट जिस दिशा का सेटअप बनेगा (BUY या SELL), वही ओरिजिनल ऑर्डर Delta Exchange पर भेजेगा।
                </p>
                <p>
                  <strong>ON रहने पर:</strong> Delta Exchange पर <strong>सिर्फ और सिर्फ Side Changed ऑर्डर ही जाएगा</strong> (BUY बना तो SELL, SELL बना तो BUY)। ओरिजिनल सेटअप आपकी स्क्रीन पर तुलना (Benchmark) के लिए दिखेगा लेकिन एक्सचेंज पर प्लेस नहीं होगा।
                </p>
              </div>
            </div>

            <div className="p-2.5 bg-[#050810] rounded border border-amber-900/40 flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Live Order View:</span>
              <span className="text-amber-300 font-bold flex items-center gap-1">
                <span>EXCHANGE (SIDE CHANGED)</span>
                <span className="text-zinc-500">&bull;</span>
                <span className="text-zinc-400">NORMAL SETUP (BENCHMARK)</span>
              </span>
            </div>
          </div>

          {/* SL Setting Selector */}
          <div className="p-4 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">🎯 SL SETTING FOR SIDE CHANGE</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700 font-bold">
                Selected: {sideChangeSlMode}
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              जब साइड बदलती है, तो नया स्टॉप लॉस कैसे तय हो?
              <br />
              <strong className="text-zinc-300">SL (Direct Inverted):</strong> Original TP बन जाएगा SL और Original SL बन जाएगा TP।
              <br />
              <strong className="text-zinc-300">10% - 50%:</strong> आपके ट्रेड के मार्जिन का उतना % रिस्क कैलकुलेट होकर नया SL सेट होगा।
            </p>

            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {(['SL', '10%', '20%', '30%', '40%', '50%'] as const).map((mode) => {
                const isSelected = sideChangeSlMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleSelectSideChangeSlMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-black shadow-md font-bold'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                    }`}
                  >
                    {isSelected && <span>✓</span>}
                    <span>{mode === 'SL' ? 'SL (TP=SL)' : mode}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-2 bg-[#050810] rounded text-[10.5px] text-zinc-400 border border-zinc-800">
              <span className="text-amber-400 font-bold">Preview: </span>
              {sideChangeSlMode === 'SL'
                ? 'Opposite Side Order will take Original SL price as Take Profit and Original TP price as Stop Loss.'
                : `Opposite Side Order will take Original SL price as Take Profit, and Stop Loss risk capped at ${sideChangeSlMode} of margin.`}
            </div>
          </div>
        </div>
      </div>

      {/* 2c. Trade Expiry Countdown Section (ट्रेड एक्सपायरी काउंटडाउन फ़ीचर) */}
      <div className="bg-[#101622] border-2 border-indigo-500/50 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs relative overflow-hidden">
        {/* Glow ambient background accent */}
        <div className="absolute -top-14 -right-14 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-zinc-800/80 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 shadow-md">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-zinc-100 flex items-center gap-2">
                  <span>Countdown Section (ट्रेड एक्सपायरी काउंटडाउन)</span>
                </h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                  countdownMode === 'OFF'
                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    : countdownMode === 'ONLY_TIMEFRAME'
                    ? 'bg-sky-950 text-sky-300 border border-sky-600'
                    : 'bg-purple-950 text-purple-300 border border-purple-600 animate-pulse'
                }`}>
                  {countdownMode === 'OFF'
                    ? 'MODE: OFF (NORMAL)'
                    : countdownMode === 'ONLY_TIMEFRAME'
                    ? 'MODE: ONLY TIMEFRAME COUNTDOWN'
                    : `MODE: ALL TIMEFRAME COUNTDOWN (${countdownAllTfDuration === 'CUSTOM' ? `${countdownCustomHours}h` : countdownAllTfDuration})`}
                </span>
                {countdownLocks.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600">
                    {countdownLocks.length} COIN(S) LOCKED
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                SL/TP ya Manual close hone par bina fresh new data ke turant dusra setup banne se rokta hai aur fresh market se profit nikalta hai.
              </p>
            </div>
          </div>
        </div>

        {/* 3-Way Mode Selection Buttons */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
            1. Select Countdown Mode (मोड चुनें):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Mode 1: OFF */}
            <button
              type="button"
              onClick={() => handleUpdateCountdownMode('OFF')}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                countdownMode === 'OFF'
                  ? 'bg-zinc-800 border-zinc-500 text-white shadow-lg ring-1 ring-zinc-400'
                  : 'bg-[#0a0e16] border-zinc-800/90 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-zinc-100">OFF</span>
                {countdownMode === 'OFF' && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-[10.5px] text-zinc-400 leading-snug">
                Normal working: Jaise pehle bot bina kisi countdown delay ke kaam karta tha.
              </p>
            </button>

            {/* Mode 2: ONLY_TIMEFRAME */}
            <button
              type="button"
              onClick={() => handleUpdateCountdownMode('ONLY_TIMEFRAME')}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                countdownMode === 'ONLY_TIMEFRAME'
                  ? 'bg-sky-950/80 border-sky-400 text-white shadow-lg shadow-sky-950/50 ring-1 ring-sky-400'
                  : 'bg-[#0a0e16] border-zinc-800/90 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-sky-200">Only Timeframe Countdown</span>
                {countdownMode === 'ONLY_TIMEFRAME' && <Check className="w-4 h-4 text-sky-400" />}
              </div>
              <p className="text-[10.5px] text-zinc-400 leading-snug">
                Jis timeframe me trade close hua, sirf wahi lock hoga (15m=4h, 30m=8h, 1h=12h, 4h=24h). Dusre timeframe free rahenge.
              </p>
            </button>

            {/* Mode 3: ALL_TIMEFRAME */}
            <button
              type="button"
              onClick={() => handleUpdateCountdownMode('ALL_TIMEFRAME')}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                countdownMode === 'ALL_TIMEFRAME'
                  ? 'bg-purple-950/80 border-purple-400 text-white shadow-lg shadow-purple-950/50 ring-1 ring-purple-400'
                  : 'bg-[#0a0e16] border-zinc-800/90 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-purple-200">All Timeframe Countdown</span>
                {countdownMode === 'ALL_TIMEFRAME' && <Check className="w-4 h-4 text-purple-400" />}
              </div>
              <p className="text-[10.5px] text-zinc-400 leading-snug">
                Koi bhi timeframe close ho, us coin ke sabhi timeframes set duration (12h, 24h, Custom) tak lock rahenge.
              </p>
            </button>
          </div>
        </div>

        {/* Sub-Settings for ALL_TIMEFRAME Mode */}
        {countdownMode === 'ALL_TIMEFRAME' && (
          <div className="p-3.5 bg-[#0a0f1d] border border-purple-900/60 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>All Timeframe Duration Setting (लॉक रहने का समय):</span>
              </span>
              <span className="text-[11px] text-zinc-400 font-bold">
                Active: <strong className="text-purple-300">{countdownAllTfDuration === 'CUSTOM' ? `${countdownCustomHours} Hours` : `${countdownAllTfDuration}`}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['12h', '24h', 'CUSTOM'] as const).map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => handleUpdateCountdownAllTf(dur)}
                  className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    countdownAllTfDuration === dur
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-950/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:border-zinc-600'
                  }`}
                >
                  {countdownAllTfDuration === dur && <Check className="w-3.5 h-3.5" />}
                  <span>{dur === 'CUSTOM' ? 'Custom Set (कस्टम)' : dur}</span>
                </button>
              ))}

              {countdownAllTfDuration === 'CUSTOM' && (
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-zinc-400">Hours:</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={countdownCustomHours}
                    onChange={(e) => handleUpdateCustomHours(Number(e.target.value))}
                    className="w-20 px-2 py-1 rounded bg-black border border-purple-500 text-purple-200 font-bold text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                  <span className="text-xs text-zinc-500">ghante (1h - 168h)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detailed Explanation & Rules Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Card A: Only Timeframe Rules */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800 rounded-lg space-y-2">
            <span className="text-[11px] font-bold text-sky-300 block uppercase">
              ⏳ Only Timeframe Expiry Rules:
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
              <div className="p-1.5 rounded bg-[#060a12] border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">15m Timeframe:</span>
                <span className="text-sky-300 font-bold">4 Hours Lock</span>
              </div>
              <div className="p-1.5 rounded bg-[#060a12] border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">30m Timeframe:</span>
                <span className="text-sky-300 font-bold">8 Hours Lock</span>
              </div>
              <div className="p-1.5 rounded bg-[#060a12] border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">1h Timeframe:</span>
                <span className="text-sky-300 font-bold">12 Hours Lock</span>
              </div>
              <div className="p-1.5 rounded bg-[#060a12] border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">4h Timeframe:</span>
                <span className="text-sky-300 font-bold">24 Hours Lock</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed pt-1">
              <strong>Note:</strong> Jis timeframe me order close hua wahi timeframe lock hoga. Usi coin ka dusra timeframe scan ho sakega aur profitable setup bana sakega.
            </p>
          </div>

          {/* Card B: All Timeframe Rules */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800 rounded-lg space-y-2">
            <span className="text-[11px] font-bold text-purple-300 block uppercase">
              🔒 All Timeframe Expiry Rules:
            </span>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              Is mode me jab kisi coin ka order close hota hai (TP, SL ya Manual), tab us coin par <strong>sabhee timeframes (15m, 30m, 1h, 4h, 1d)</strong> par complete lock lag jata hai.
            </p>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Jab tak countdown chalega tab tak koi bhi timeframe ka setup aur order nahi banega. Countdown khatam hote hi bot all timeframes me fresh data scan karega.
            </p>
          </div>
        </div>

        {/* Live Active Countdown Locks Section */}
        <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                Live Active Countdown Locks (सक्रिय कॉइन लॉक):
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                countdownLocks.length > 0 ? 'bg-amber-950 text-amber-300 border border-amber-600 animate-pulse' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {countdownLocks.length} Active
              </span>
            </div>

            {countdownLocks.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearCountdownLock()}
                disabled={isClearingLockId === 'ALL'}
                className="px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700 text-[10.5px] font-bold transition flex items-center gap-1 cursor-pointer"
                title="Clear all active countdown locks immediately"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>{isClearingLockId === 'ALL' ? 'Clearing...' : 'Clear All Locks'}</span>
              </button>
            )}
          </div>

          {countdownLocks.length === 0 ? (
            <div className="p-3.5 bg-[#080d16] border border-zinc-800/70 rounded-lg text-center text-zinc-500 text-xs">
              <span>No coins are currently in countdown lock. All scanned coins are free for fresh setup formation.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {countdownLocks.map((lock) => (
                <div
                  key={lock.id}
                  className="p-3 bg-[#080d18] border border-amber-500/40 rounded-xl space-y-2 text-xs relative overflow-hidden shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-white tracking-wide">{lock.coin}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold bg-amber-950 text-amber-300 border border-amber-600">
                      {lock.timeframe === 'ALL' ? 'ALL TIMEFRAMES' : `${lock.timeframe} LOCK`}
                    </span>
                  </div>

                  <div className="p-2 bg-[#050810] rounded border border-zinc-800 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold">Time Remaining:</span>
                    <span className="font-mono text-sm font-black text-amber-300 animate-pulse">
                      ⏳ {lock.formattedTimeLeft || `${Math.round((lock.remainingSeconds || 0) / 60)}m`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                    <span>Reason: <strong className="text-zinc-200">{lock.closeReason}</strong></span>
                    <button
                      type="button"
                      onClick={() => handleClearCountdownLock(lock.id, lock.coin)}
                      disabled={isClearingLockId === lock.id}
                      className="text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
                      title="Unlock this coin early"
                    >
                      {isClearingLockId === lock.id ? 'Unlocking...' : 'Unlock Now'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2d. Price Change Distribution (PCD) Market Breadth Intelligence Configuration */}
      <div className="bg-[#101622] border border-cyan-500/40 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-zinc-800/80 gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Price Change Distribution (PCD) Market Breadth Intelligence
              </h2>
              <p className="text-xs text-zinc-400">
                Statistical market breadth gating, bull/bear trap elimination, and relative strength outlier hunting
              </p>
            </div>
          </div>

          {/* Master Toggle */}
          <button
            type="button"
            onClick={() => setPcdEnabled(!pcdEnabled)}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition border ${
              pcdEnabled
                ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{pcdEnabled ? 'PCD INTELLIGENCE ON' : 'PCD INTELLIGENCE OFF'}</span>
          </button>
        </div>

        {/* Informative Guidance */}
        <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-lg text-[11px] text-zinc-300 leading-relaxed">
          <strong className="text-cyan-300">How PCD Boosts Setup Accuracy: </strong>
          Delta Exchange par sabhi contracts ke 24H price changes ko 7 brackets me measure karke market ka macro trend jaan liya jaata hai. Jab market deep red ho, tab altcoins ke fake breakout longs block ho jaate hain taaki trap trades me stop loss hit na ho.
        </div>

        {/* Detailed Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Setting 1: Breadth Filter Gating */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">1. Market Breadth Filter (मार्केट ट्रेंड फ़िल्टर)</span>
              <button
                type="button"
                onClick={() => setPcdBreadthFilterEnabled(!pcdBreadthFilterEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  pcdBreadthFilterEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  pcdBreadthFilterEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Agar poori market dump ho rahi ho toh Long trades block karta hai, aur rally me counter Short block karta hai.
            </p>
          </div>

          {/* Setting 2: Neutral Chop Protection */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">2. Neutral Chop Protection (साइडवेज़ चॉप प्रोटेक्शन)</span>
              <button
                type="button"
                onClick={() => setPcdChopProtectionEnabled(!pcdChopProtectionEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  pcdChopProtectionEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  pcdChopProtectionEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Jab &gt;60% market [-2%, +2%] ke sideways zone me phansi ho, tab low-conviction trades ko reject karke wicks se bachta hai.
            </p>
          </div>

          {/* Setting 3: Relative Strength Exemption */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">3. Relative Strength Exemption (स्ट्रॉन्ग कॉइन छूट)</span>
              <button
                type="button"
                onClick={() => setPcdAllowOutliersInOppositeMarket(!pcdAllowOutliersInOppositeMarket)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  pcdAllowOutliersInOppositeMarket ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  pcdAllowOutliersInOppositeMarket ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Agar poori market Red ho lekin koi single coin +5% se zyada heavy volume se badh raha ho, toh use allow karta hai.
            </p>
          </div>

          {/* Setting 4: Confluence Bonus Points */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">4. Breadth Confluence Bonus</span>
              <span className="text-cyan-400 font-bold font-mono">+{pcdConfluenceScoreBonus} Points</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="1"
              value={pcdConfluenceScoreBonus}
              onChange={(e) => setPcdConfluenceScoreBonus(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Jab setup market breadth ke sath perfectly align ho, toh setup score me extra points judte hain.
            </p>
          </div>

          {/* Setting 5: Min Green Ratio for Longs */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">5. Min Bullish Ratio for Longs</span>
              <span className="text-emerald-400 font-bold font-mono">{pcdMinBullishRatioForLongs}% Green</span>
            </div>
            <input
              type="range"
              min="20"
              max="70"
              step="5"
              value={pcdMinBullishRatioForLongs}
              onChange={(e) => setPcdMinBullishRatioForLongs(Number(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Market me kam se kam itne % coins Green hone chahiye normal Long orders place karne ke liye.
            </p>
          </div>

          {/* Setting 6: Min Red Ratio for Shorts */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">6. Min Bearish Ratio for Shorts</span>
              <span className="text-rose-400 font-bold font-mono">{pcdMaxBearishRatioForShorts}% Red</span>
            </div>
            <input
              type="range"
              min="20"
              max="70"
              step="5"
              value={pcdMaxBearishRatioForShorts}
              onChange={(e) => setPcdMaxBearishRatioForShorts(Number(e.target.value))}
              className="w-full accent-rose-400 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Market me kam se kam itne % coins Red hone chahiye normal Short orders place karne ke liye.
            </p>
          </div>

          {/* Setting 7: Outlier Gain Threshold */}
          <div className="p-3 bg-[#0a0e16] border border-zinc-800/80 rounded-lg space-y-2 col-span-1 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">7. Relative Strength Outlier Threshold (%)</span>
              <span className="text-amber-400 font-bold font-mono">+{pcdMinOutlierGainPercent}%</span>
            </div>
            <input
              type="range"
              min="2.0"
              max="15.0"
              step="0.5"
              value={pcdMinOutlierGainPercent}
              onChange={(e) => setPcdMinOutlierGainPercent(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Kisi coin ko institutional leader (outlier) maanne ke liye minimum 24-hour gain percentage threshold.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Risk & Capital Parameters */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-base font-bold text-zinc-100">Risk, Leverage & Capital Management</h2>
            <p className="text-xs text-zinc-400">Pre-trade risk enforcement gates</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 font-mono text-xs">
          <div className="col-span-1 sm:col-span-2 md:col-span-3 p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-lg">
            <span className="text-emerald-400 font-bold block mb-1">DYNAMIC SIZING: LOT SIZE + LEVERAGE WITH AMOUNT CEILING</span>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Order place hote samay aapka chuna hua <strong>Lot Size</strong> aur <strong>Leverage</strong> ke anusaar required margin calculate hoga. Bot aapke dwara set kiye gaye <strong>Trading Capital Ceiling Amount</strong> tak ke total orders place karega.
            </p>
          </div>

          <div>
            <label className="block text-emerald-400 font-bold mb-1">TRADING CAPITAL CEILING ($)</label>
            <input
              type="number"
              value={tradingCapital}
              onChange={(e) => setTradingCapital(Number(e.target.value))}
              placeholder="e.g. 500 or 1000"
              className="w-full bg-[#0a0e16] border border-emerald-500/60 rounded-lg px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-emerald-400"
            />
            <span className="text-[10px] text-zinc-500">Max cumulative amount bot can utilize for open orders</span>
          </div>

          <div>
            <label className="block text-emerald-400 font-bold mb-1">LOT SIZE (CONTRACTS / QTY)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(Number(e.target.value))}
              placeholder="e.g. 1, 5, 10"
              className="w-full bg-[#0a0e16] border border-emerald-500/60 rounded-lg px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-emerald-400"
            />
            <span className="text-[10px] text-zinc-500">Exact quantity per trade submitted to Delta</span>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">MAX DAILY LOSS ($)</label>
            <input
              type="number"
              value={maxDailyLoss}
              onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-zinc-500">Daily stop trading loss limit</span>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">MAX OPEN TRADES</label>
            <input
              type="number"
              value={maxOpenTrades}
              onChange={(e) => setMaxOpenTrades(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-zinc-500">Concurrent open positions permitted</span>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">MIN RISK/REWARD RATIO</label>
            <input
              type="number"
              step="0.1"
              value={minRR}
              onChange={(e) => setMinRR(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">MIN EXPECTED PROFIT (%)</label>
            <input
              type="number"
              step="0.1"
              value={minProfit}
              onChange={(e) => setMinProfit(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">MIN NET EDGE (%)</label>
            <input
              type="number"
              step="0.1"
              value={minEdge}
              onChange={(e) => setMinEdge(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">TRADING TYPE</label>
            <select
              value={tradingType}
              onChange={(e) => setTradingType(e.target.value as any)}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="FUTURES_ONLY">Futures Only</option>
              <option value="OPTIONS_ONLY">Options Only</option>
              <option value="FUTURES_AND_OPTIONS">Futures & Options</option>
              <option value="ARBITRAGE">Future-Option Arbitrage</option>
            </select>
          </div>
        </div>

        {/* Leverage Controls */}
        <div className="pt-3 border-t border-zinc-800/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-emerald-400 font-bold">TRADING LEVERAGE:</span>
              <span className="text-xs font-mono text-zinc-300">Aapka chuna hua leverage exchange par apply hoga</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLeverageMode('MANUAL')}
                className={`px-3 py-1 rounded text-xs font-mono border ${
                  leverageMode === 'MANUAL'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-[#0a0e16] border-zinc-800 text-zinc-400'
                }`}
              >
                EXACT LEVERAGE (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setLeverageMode('AUTOMATIC')}
                className={`px-3 py-1 rounded text-xs font-mono border ${
                  leverageMode === 'AUTOMATIC'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-[#0a0e16] border-zinc-800 text-zinc-400'
                }`}
              >
                AUTO (Risk-adjusted)
              </button>
            </div>
          </div>

          <div className="p-3.5 bg-black/40 border border-zinc-800 rounded-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-300">Active Leverage:</span>
                <span className="text-base font-bold text-emerald-400 font-mono px-2.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/40">
                  {manualLeverage}x
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[2, 5, 10, 20, 25, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setManualLeverage(preset);
                      setLeverageMode('MANUAL');
                    }}
                    className={`px-2.5 py-1 text-xs font-mono rounded border transition ${
                      manualLeverage === preset
                        ? 'bg-emerald-500 text-black font-bold border-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-400">Custom:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={manualLeverage}
                  onChange={(e) => {
                    setManualLeverage(Math.max(1, Math.min(100, Number(e.target.value))));
                    setLeverageMode('MANUAL');
                  }}
                  className="w-16 bg-[#0a0e16] border border-emerald-500/60 rounded px-2 py-1 text-xs font-mono text-center font-bold text-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            <input
              type="range"
              min="1"
              max="100"
              value={manualLeverage}
              onChange={(e) => {
                setManualLeverage(Number(e.target.value));
                setLeverageMode('MANUAL');
              }}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 font-mono">
              &bull; <strong>Order Execution Guarantee:</strong> Bot Delta Exchange par order place karte samay <strong className="text-emerald-400">{manualLeverage}x leverage</strong> set karega, aur order ke sath <strong className="text-emerald-400">Stop-Loss (SL) aur Take-Profit (TP)</strong> dono exchange par live register karega.
            </p>
          </div>
        </div>

        {/* 6. NOTIFICATION SETTINGS SECTION */}
        <div className="bg-[#101622] p-5 rounded-xl border border-zinc-800/80 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 font-mono">
                  Notification Settings
                </h3>
                <p className="text-xs text-zinc-400">
                  Toggle real-time alerts for 1:5 TP/SL hits, trigger warnings, and Delta API connectivity issues.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 font-mono border border-emerald-800">
                AUDIO & PUSH ACTIVE
              </span>
            </div>
          </div>

          {/* Core Event Alert Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. TP Hit Alert */}
            <div className={`p-3.5 rounded-xl border transition ${alertOnTpHit ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-black/30 border-zinc-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={alertOnTpHit}
                    onChange={(e) => setAlertOnTpHit(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 w-4 h-4 mt-0.5"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-mono font-bold text-zinc-100">
                        Take-Profit (TP) Hit Alert
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                        1:5 PROFIT
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Instant celebratory audio chime & desktop alert when price reaches the locked 1:5 TP profit target.
                    </p>
                  </div>
                </label>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Preview sound:</span>
                <button
                  type="button"
                  onClick={() => alertService.playTpHitAlert()}
                  className="px-2 py-1 text-[11px] bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 rounded border border-emerald-700 font-mono transition"
                >
                  Test TP Chime
                </button>
              </div>
            </div>

            {/* 2. Stop-Loss (SL) Hit Alert */}
            <div className={`p-3.5 rounded-xl border transition ${alertOnSlHit ? 'bg-rose-950/20 border-rose-500/40' : 'bg-black/30 border-zinc-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={alertOnSlHit}
                    onChange={(e) => setAlertOnSlHit(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-0 w-4 h-4 mt-0.5"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-xs font-mono font-bold text-zinc-100">
                        Stop-Loss (SL) Hit Alert
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700">
                        RISK GUARD
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Immediate acoustic warning when market invalidates setup and hits stop loss to safeguard capital.
                    </p>
                  </div>
                </label>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Preview sound:</span>
                <button
                  type="button"
                  onClick={() => alertService.playSlHitAlert()}
                  className="px-2 py-1 text-[11px] bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 rounded border border-rose-700 font-mono transition"
                >
                  Test SL Tone
                </button>
              </div>
            </div>

            {/* 3. Trigger Warnings & Price Proximity Alerts */}
            <div className={`p-3.5 rounded-xl border transition ${alertOnTriggerWarnings ? 'bg-amber-950/20 border-amber-500/40' : 'bg-black/30 border-zinc-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={alertOnTriggerWarnings}
                    onChange={(e) => {
                      setAlertOnTriggerWarnings(e.target.checked);
                      setNotifyOnApproaching(e.target.checked);
                    }}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 w-4 h-4 mt-0.5"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-mono font-bold text-zinc-100">
                        Trigger Warnings (0.5% Proximity)
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700">
                        IMMINENT
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Proactive warning notification when coin spot price moves within 0.5% of the locked trigger entry.
                    </p>
                  </div>
                </label>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Preview sound:</span>
                <button
                  type="button"
                  onClick={() => alertService.playApproachingAlert()}
                  className="px-2 py-1 text-[11px] bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 rounded border border-amber-700 font-mono transition"
                >
                  Test Warning Chime
                </button>
              </div>
            </div>

            {/* 4. API Connectivity Issues Alert */}
            <div className={`p-3.5 rounded-xl border transition ${alertOnApiDisconnect ? 'bg-blue-950/20 border-blue-500/40' : 'bg-black/30 border-zinc-800'}`}>
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={alertOnApiDisconnect}
                    onChange={(e) => setAlertOnApiDisconnect(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0 w-4 h-4 mt-0.5"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <WifiOff className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-mono font-bold text-zinc-100">
                        API Connectivity & Heartbeat Issues
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-blue-950 text-blue-300 border border-blue-700">
                        CRITICAL
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Urgent audible chime & notification if Delta Exchange REST heartbeat drops or WebSocket disconnects.
                    </p>
                  </div>
                </label>
              </div>
              <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">Preview sound:</span>
                <button
                  type="button"
                  onClick={() => alertService.playApiDisconnectAlert()}
                  className="px-2 py-1 text-[11px] bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 rounded border border-blue-700 font-mono transition"
                >
                  Test Disconnect Alert
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Channels (Audio & Desktop Push) */}
          <div className="pt-2 border-t border-zinc-800/80">
            <h4 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider mb-2.5">
              Alert Delivery Channels & Preferences
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Audio Chime Master Toggle */}
              <div className="p-3 bg-black/40 border border-zinc-800 rounded-lg space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSoundAlerts}
                    onChange={(e) => setEnableSoundAlerts(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0 w-4 h-4"
                  />
                  <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-blue-400" />
                    Web Audio Synthesized Chimes
                  </span>
                </label>
                <p className="text-[11px] text-zinc-500 font-mono">
                  Zero-latency synthesizers using Web Audio API (no audio assets required).
                </p>
              </div>

              {/* Browser Push Notifications */}
              <div className="p-3 bg-black/40 border border-zinc-800 rounded-lg space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableBrowserPush}
                    onChange={(e) => setEnableBrowserPush(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-purple-500 focus:ring-0 w-4 h-4"
                  />
                  <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-purple-400" />
                    System & Browser Push Notifications
                  </span>
                </label>
                <div className="flex items-center justify-between pt-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const granted = await alertService.requestNotificationPermission();
                      if (granted) {
                        setEnableBrowserPush(true);
                        setPushStatusMessage('Push notifications enabled!');
                        alertService.sendPushNotification(
                          'Delta Bot Alert',
                          'Push notifications are active for setups!'
                        );
                      } else {
                        setPushStatusMessage('Permission denied by browser.');
                      }
                      setTimeout(() => setPushStatusMessage(null), 3000);
                    }}
                    className="px-2.5 py-1 text-[11px] bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 rounded border border-purple-800 font-mono transition"
                  >
                    Request Permission / Test
                  </button>
                  {pushStatusMessage && (
                    <span className="text-[10px] text-zinc-400 font-mono">{pushStatusMessage}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Global Category Notification Mute Rules */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold font-mono text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <VolumeX className="w-4 h-4 text-amber-400" />
                  <span>Category Mute Controls & Sound Filters</span>
                </h4>
                <p className="text-[11px] text-zinc-400">
                  Selectively mute repetitive non-critical notifications while keeping vital error alerts active.
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 font-mono border border-amber-800">
                SELECTIVE FILTER
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Mute Trigger Alerts */}
              <div className={`p-3 rounded-lg border transition ${muteTriggerAlerts ? 'bg-amber-950/25 border-amber-500/60' : 'bg-black/40 border-zinc-800'}`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Mute Trigger Alerts
                  </span>
                  <input
                    type="checkbox"
                    checked={muteTriggerAlerts}
                    onChange={(e) => setMuteTriggerAlerts(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 w-4 h-4"
                  />
                </label>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">
                  Mutes alerts when coins cross entry trigger. Order placement still executes.
                </p>
              </div>

              {/* Mute TP Hit Alerts */}
              <div className={`p-3 rounded-lg border transition ${muteTpHitAlerts ? 'bg-emerald-950/25 border-emerald-500/60' : 'bg-black/40 border-zinc-800'}`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    Mute TP Hit Alerts
                  </span>
                  <input
                    type="checkbox"
                    checked={muteTpHitAlerts}
                    onChange={(e) => setMuteTpHitAlerts(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 w-4 h-4"
                  />
                </label>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">
                  Mutes celebratory chimes when 1:5 take-profit target is achieved.
                </p>
              </div>

              {/* Mute SL Hit Alerts */}
              <div className={`p-3 rounded-lg border transition ${muteSlHitAlerts ? 'bg-rose-950/25 border-rose-500/60' : 'bg-black/40 border-zinc-800'}`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-rose-400" />
                    Mute SL Hit Alerts
                  </span>
                  <input
                    type="checkbox"
                    checked={muteSlHitAlerts}
                    onChange={(e) => setMuteSlHitAlerts(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-0 w-4 h-4"
                  />
                </label>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">
                  Mutes audio/push when position hits protective stop loss.
                </p>
              </div>

              {/* Mute Reconnection Alerts */}
              <div className={`p-3 rounded-lg border transition ${muteReconnectAlerts ? 'bg-sky-950/25 border-sky-500/60' : 'bg-black/40 border-zinc-800'}`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-sky-400" />
                    Mute Reconnection Info
                  </span>
                  <input
                    type="checkbox"
                    checked={muteReconnectAlerts}
                    onChange={(e) => setMuteReconnectAlerts(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-sky-500 focus:ring-0 w-4 h-4"
                  />
                </label>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">
                  Mutes routine background sync and reconnection success notices.
                </p>
              </div>
            </div>

            {/* Locked Vital Error Alerts Notice */}
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-rose-300 font-mono flex items-center gap-1.5">
                    <span>Vital Error Alerts (Permanent Protection)</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-900/60 text-rose-200 border border-rose-700 font-bold">
                      PERMANENTLY ACTIVE
                    </span>
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Order rejections, margin exhaustion, and exchange disconnect warnings are never muted to protect capital.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between">
          <div>
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> All settings saved and synced with active worker
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs font-mono transition shadow-lg shadow-emerald-500/20"
          >
            {isSaving ? 'Saving Configuration...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
