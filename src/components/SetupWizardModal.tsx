import React, { useState } from 'react';
import {
  CheckCircle2,
  Key,
  Shield,
  Sliders,
  Play,
  X,
  Radio,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Copy,
  Check,
  Server,
} from 'lucide-react';
import type { ExchangeConfig, DeltaEnvironment } from '../types/index.js';

interface SetupWizardModalProps {
  config: ExchangeConfig;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (configUpdates: Partial<ExchangeConfig>) => Promise<void>;
  onTestConnection: (creds: { apiKey: string; apiSecret: string; environment: DeltaEnvironment }) => Promise<{ success: boolean; error?: string; latencyMs?: number }>;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  config,
  isOpen,
  onClose,
  onComplete,
  onTestConnection,
}) => {
  const [step, setStep] = useState(1);

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
  const [isReadMode, setIsReadMode] = useState(true);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [tradingCapital, setTradingCapital] = useState(config.tradingCapital || 10000);
  const [maxDailyLoss, setMaxDailyLoss] = useState(config.maxDailyLoss || 500);
  const [maxOpenTrades, setMaxOpenTrades] = useState(config.maxOpenTrades || 3);
  const [tradingType, setTradingType] = useState(config.tradingType || 'FUTURES_ONLY');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string; latency?: number } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection({ apiKey, apiSecret, environment });
      setTestResult({ success: res.success, error: res.error, latency: res.latencyMs });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFinish = async () => {
    await onComplete({
      apiKey,
      apiSecret,
      environment,
      isReadMode,
      autoTradeEnabled,
      tradingCapital: Number(tradingCapital),
      maxDailyLoss: Number(maxDailyLoss),
      maxOpenTrades: Number(maxOpenTrades),
      tradingType,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-[#101622] border border-zinc-700 rounded-2xl p-6 shadow-2xl space-y-5 font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              Step {step} of 4
            </span>
            <h2 className="text-base font-bold text-zinc-100 mt-0.5">
              Delta Exchange Setup Wizard
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: CREDENTIALS */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-zinc-300 space-y-1">
              <p className="font-bold text-sm">Step 1: Delta API Connection</p>
              <p className="text-zinc-400 text-[11px]">
                Paste your API Key and Secret from your Delta Exchange account settings (Settings &rarr; API Management).
              </p>
            </div>

            {/* SERVER IP WHITELIST BANNER */}
            <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-500/30 text-zinc-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-blue-300 font-bold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  Delta API Whitelist IP
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(serverIp)}
                  className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold flex items-center gap-1 transition"
                >
                  {copiedIp ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedIp ? 'Copied' : 'Copy IP'}</span>
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                Delta Exchange me API Key banate samay "IP Access Restriction" me yeh IP daalein: <code className="text-emerald-400 font-bold bg-black/60 px-1 rounded">{serverIp}</code> (ya blank chhod dein).
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">DELTA API KEY</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste API Key..."
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">DELTA API SECRET</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Paste API Secret..."
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">DELTA REGION / ENVIRONMENT</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEnvironment('india')}
                    className={`p-2 rounded-lg border text-left ${
                      environment === 'india'
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <div className="font-bold text-[11px]">Delta India</div>
                    <div className="text-[9px] text-zinc-500">api.india.delta.exchange</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEnvironment('production')}
                    className={`p-2 rounded-lg border text-left ${
                      environment === 'production'
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <div className="font-bold text-[11px]">Delta Global</div>
                    <div className="text-[9px] text-zinc-500">api.delta.exchange</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEnvironment('testnet')}
                    className={`p-2 rounded-lg border text-left ${
                      environment === 'testnet'
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <div className="font-bold text-[11px]">Testnet</div>
                    <div className="text-[9px] text-zinc-500">testnet-api</div>
                  </button>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-2.5 rounded text-[11px] ${
                    testResult.success
                      ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border border-rose-800 text-rose-300'
                  }`}
                >
                  {testResult.success
                    ? `Connected successfully! Ping: ${testResult.latency}ms`
                    : `Connection failed: ${testResult.error}`}
                </div>
              )}

              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !apiKey}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isTesting ? 'Verifying...' : 'Test Delta API Now'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: MODE & SAFETY */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-zinc-300 space-y-1">
              <p className="font-bold text-sm">Step 2: Execution Mode & Auto Trade</p>
              <p className="text-zinc-400 text-[11px]">
                Configure autonomous behavior. We default to Read-Only mode for maximum safety.
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-[#0a0e16] border border-zinc-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-zinc-200">READ-ONLY MODE</div>
                  <div className="text-[10px] text-zinc-500">
                    No real orders placed. Scans and logs setups only.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReadMode(!isReadMode)}
                  className={`w-11 h-6 rounded-full p-1 flex items-center transition ${
                    isReadMode ? 'bg-sky-600 justify-end' : 'bg-rose-600 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>

              <div className="p-3 bg-[#0a0e16] border border-zinc-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-zinc-200">AUTO TRADE (AUTONOMOUS)</div>
                  <div className="text-[10px] text-zinc-500">
                    Place orders automatically when trigger condition is reached.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
                  className={`w-11 h-6 rounded-full p-1 flex items-center transition ${
                    autoTradeEnabled ? 'bg-emerald-600 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: RISK & CAPITAL */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-zinc-300 space-y-1">
              <p className="font-bold text-sm">Step 3: Capital & Risk Guardrails</p>
              <p className="text-zinc-400 text-[11px]">
                Pre-trade risk enforcement stops trades if daily loss or open trade caps are hit.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">TRADING CAPITAL ($)</label>
                <input
                  type="number"
                  value={tradingCapital}
                  onChange={(e) => setTradingCapital(Number(e.target.value))}
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">MAX DAILY LOSS ($)</label>
                <input
                  type="number"
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">MAX OPEN TRADES CONCURRENTLY</label>
                <input
                  type="number"
                  value={maxOpenTrades}
                  onChange={(e) => setMaxOpenTrades(Number(e.target.value))}
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: STRATEGY & CONFIRMATION */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="text-zinc-300 space-y-1">
              <p className="font-bold text-sm">Step 4: Strategy & Verification</p>
              <p className="text-zinc-400 text-[11px]">
                Choose target instrument strategies to activate in the autonomous loop.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">ACTIVE STRATEGY FOCUS</label>
                <select
                  value={tradingType}
                  onChange={(e) => setTradingType(e.target.value as any)}
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:border-emerald-500"
                >
                  <option value="FUTURES_ONLY">Futures Only (Perpetuals)</option>
                  <option value="OPTIONS_ONLY">Options Only</option>
                  <option value="FUTURES_AND_OPTIONS">Futures & Options Combined</option>
                  <option value="ARBITRAGE">Future-Option Parity Arbitrage</option>
                </select>
              </div>

              <div className="p-3 bg-[#0a0e16] border border-emerald-900/50 rounded-lg text-emerald-400 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Ready to Launch Delta Smart Bot
                </div>
                <p className="text-[11px] text-zinc-400">
                  Clicking "Launch Autonomous Bot" will activate the 24/7 background worker, stream live Delta market data, and begin calculating high-confluence setups.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold flex items-center gap-1 shadow-md shadow-emerald-500/20 ml-auto"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/25 ml-auto"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Autonomous Bot</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
