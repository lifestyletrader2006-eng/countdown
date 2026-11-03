import React, { useState } from 'react';
import {
  Shuffle,
  Zap,
  DollarSign,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Coins,
  Clock,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ArbitrageSetup, ExchangeConfig } from '../types/index.js';
import { LivePriceTicker } from './LivePriceTicker.js';

interface ArbitrageViewProps {
  setups: ArbitrageSetup[];
  onRefreshArbitrage: () => void;
  config?: ExchangeConfig;
  onUpdateConfig?: (cfg: Partial<ExchangeConfig>) => void;
  onExecuteArbitrage?: (setupId: string) => Promise<{ success: boolean; message: string }>;
}

export const ArbitrageView: React.FC<ArbitrageViewProps> = ({
  setups,
  onRefreshArbitrage,
  config,
  onUpdateConfig,
  onExecuteArbitrage,
}) => {
  const [selectedCoin, setSelectedCoin] = useState<string>('ALL');
  const [selectedHorizon, setSelectedHorizon] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('ALL');
  const [expandedSetupId, setExpandedSetupId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [executionFeedback, setExecutionFeedback] = useState<{ id: string; success: boolean; text: string } | null>(null);

  // Auto-arbitrage settings state
  const [autoArbEnabled, setAutoArbEnabled] = useState<boolean>(config?.autoExecuteArbitrage || false);
  const [minProfitThreshold, setMinProfitThreshold] = useState<number>(config?.minArbitrageNetProfitUsd || 10);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  // Extract unique coins from setups
  const availableCoins = ['ALL', ...Array.from(new Set(setups.map((s) => s.coin).filter(Boolean)))];

  // Filter setups
  const filteredSetups = setups.filter((s) => {
    if (selectedCoin !== 'ALL' && s.coin !== selectedCoin) return false;
    if (selectedHorizon !== 'ALL' && s.expiryType !== selectedHorizon) return false;
    return true;
  });

  const bestSetup: ArbitrageSetup | null =
    setups.length > 0
      ? setups.reduce((best, s) => (s.netProfit > best.netProfit ? s : best))
      : null;

  const handleSaveAutoSettings = () => {
    if (onUpdateConfig) {
      onUpdateConfig({
        autoExecuteArbitrage: autoArbEnabled,
        minArbitrageNetProfitUsd: Number(minProfitThreshold),
      });
    }
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  const handleExecute = async (setup: ArbitrageSetup) => {
    setIsExecuting(setup.id);
    setExecutionFeedback(null);
    try {
      if (onExecuteArbitrage) {
        const res = await onExecuteArbitrage(setup.id);
        setExecutionFeedback({ id: setup.id, success: res.success, text: res.message });
      } else {
        const res = await fetch('/api/arbitrage/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupId: setup.id }),
        });
        const data = await res.json();
        setExecutionFeedback({ id: setup.id, success: data.success, text: data.message });
      }
      onRefreshArbitrage();
    } catch (err: any) {
      setExecutionFeedback({ id: setup.id, success: false, text: err.message || 'Execution failed' });
    } finally {
      setIsExecuting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Quick Controls */}
      <div className="bg-[#101622] p-4 rounded-xl border border-zinc-800/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              Delta Options & Futures Parity Arbitrage Engine
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                LIVE PARITY
              </span>
            </h2>
          </div>
          <p className="text-xs text-zinc-400 max-w-3xl">
            Real-time Put-Call-Futures Parity Arbitrage with 100% transparent fee, slippage, and carry deduction. Clear
            buy/sell legs on Delta Exchange options & perpetual contracts with one-click multi-leg execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={onRefreshArbitrage}
            className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700 transition flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Scan Parity Now
          </button>
        </div>
      </div>

      {/* Auto-Execution & Profit Threshold Settings Bar */}
      <div className="bg-[#131b2c] p-3.5 rounded-xl border border-blue-900/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-zinc-200">Auto-Order Placement Rule:</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoArbEnabled}
              onChange={(e) => setAutoArbEnabled(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
            />
            <span className={autoArbEnabled ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
              Auto-Place Order on Exchange
            </span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Min Net Profit Threshold:</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
              <input
                type="number"
                min={1}
                max={500}
                value={minProfitThreshold}
                onChange={(e) => setMinProfitThreshold(Math.max(1, Number(e.target.value)))}
                className="w-20 pl-5 pr-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 text-xs font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-zinc-400">(After all fees & slippage)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {settingsSaved && <span className="text-emerald-400 text-xs">✓ Settings Saved</span>}
          <button
            onClick={handleSaveAutoSettings}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition"
          >
            Save Rule
          </button>
        </div>
      </div>

      {/* Metric Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Active Arbitrage Setups</span>
          <span className="text-lg font-bold font-mono text-zinc-100">{filteredSetups.length} Found</span>
          <span className="text-[10px] text-zinc-500 block">All Delta eligible coins</span>
        </div>
        <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Top Net Profit Available</span>
          <span className="text-lg font-bold font-mono text-emerald-400">
            {bestSetup ? `+$${bestSetup.netProfit}` : '$0.00'}
          </span>
          <span className="text-[10px] text-zinc-500 block">
            {bestSetup ? `+${bestSetup.netEdgePercent}% net yield` : 'Scanning...'}
          </span>
        </div>
        <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Dominant Strategy</span>
          <span className="text-lg font-bold font-mono text-blue-400">
            {bestSetup ? bestSetup.type : 'PARITY CONV'}
          </span>
          <span className="text-[10px] text-zinc-500 block">Zero directional risk</span>
        </div>
        <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Deduction Model</span>
          <span className="text-lg font-bold font-mono text-amber-400">FEE + SLIP + CARRY</span>
          <span className="text-[10px] text-zinc-500 block">Conservative 100% net</span>
        </div>
      </div>

      {/* Filter Tabs: Coin & Horizon */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#101622] p-2.5 rounded-xl border border-zinc-800">
        {/* Coin Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Coins className="w-3.5 h-3.5 text-zinc-400 ml-1 mr-0.5" />
          <span className="text-[11px] text-zinc-400 font-mono mr-1">Coin:</span>
          {availableCoins.map((coin) => (
            <button
              key={coin}
              onClick={() => setSelectedCoin(coin)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                selectedCoin === coin
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {coin}
            </button>
          ))}
        </div>

        {/* Expiry Horizon Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <Clock className="w-3.5 h-3.5 text-zinc-400 ml-1 mr-0.5" />
          <span className="text-[11px] text-zinc-400 font-mono mr-1">Expiry:</span>
          {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((horizon) => (
            <button
              key={horizon}
              onClick={() => setSelectedHorizon(horizon)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                selectedHorizon === horizon
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {horizon === 'ALL'
                ? 'All Expiries'
                : horizon === 'DAILY'
                ? 'Daily (0DTE)'
                : horizon === 'WEEKLY'
                ? 'Weekly (Fri)'
                : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Feedback Notification */}
      {executionFeedback && (
        <div
          className={`p-3 rounded-lg border font-mono text-xs flex items-center justify-between ${
            executionFeedback.success
              ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600'
              : 'bg-rose-950/80 text-rose-200 border-rose-600'
          }`}
        >
          <div className="flex items-center gap-2">
            {executionFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{executionFeedback.text}</span>
          </div>
          <button
            onClick={() => setExecutionFeedback(null)}
            className="text-zinc-400 hover:text-zinc-200 text-[11px]"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Arbitrage Opportunities Cards */}
      <div className="space-y-3">
        {filteredSetups.length === 0 ? (
          <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-12 text-center text-zinc-400 font-mono">
            <Shuffle className="w-8 h-8 text-zinc-600 mx-auto mb-3 animate-spin" />
            <p className="text-sm font-bold text-zinc-300 mb-1">Scanning Delta Exchange Options & Futures...</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              No live arbitrage spreads exceed your current net edge filter for {selectedCoin} ({selectedHorizon}). Click
              "Scan Parity Now" or adjust the filters above.
            </p>
          </div>
        ) : (
          filteredSetups.map((s) => {
            const isExpanded = expandedSetupId === s.id;
            const totalDeductions = s.fees + s.slippage + s.funding + (s.carry || 0.5) + (s.safetyBuffer || 1.0);

            return (
              <div
                key={s.id}
                className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-md transition hover:border-zinc-700"
              >
                {/* Main Card Header */}
                <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-zinc-800/60">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold font-mono ${
                        s.type === 'CONVERSION'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      }`}
                    >
                      {s.type} ARBITRAGE
                    </span>

                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {s.coin}
                    </span>

                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
                      Strike ${s.strike.toLocaleString()}
                    </span>

                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
                      {s.expiryType || 'EXPIRY'}: {s.expiry}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        s.isCandidate
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500 animate-pulse'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>

                  {/* Net Profit Callout & Action */}
                  <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-zinc-400">NET REALIZED PROFIT</div>
                      <div className="text-base font-black font-mono text-emerald-400">
                        {s.netProfit >= 0 ? '+' : ''}${s.netProfit.toFixed(2)}{' '}
                        <span className="text-xs font-medium text-emerald-300">({s.netEdgePercent}%)</span>
                      </div>
                    </div>

                    <button
                      disabled={isExecuting === s.id}
                      onClick={() => handleExecute(s)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-mono text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isExecuting === s.id ? 'Placing...' : 'Place Multi-Leg Order'}
                    </button>

                    <button
                      onClick={() => setExpandedSetupId(isExpanded ? null : s.id)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 transition rounded hover:bg-zinc-800"
                      title="Toggle Leg Details"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Clear Multi-Leg Blueprint: Exactly Where to BUY / SELL */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#0d121c]">
                  {/* Leg 1: Future */}
                  <div className="p-3 rounded-lg border border-zinc-800 bg-[#101622] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400">LEG 1 (PERPETUAL FUTURE)</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          s.futureLeg.side === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {s.futureLeg.side}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-200 truncate">{s.futureLeg.symbol}</div>
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-zinc-400">Exec Price:</span>
                      <LivePriceTicker price={s.futureLeg.price} size="sm" />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">Size: {s.futureLeg.size} contracts</div>
                  </div>

                  {/* Leg 2: Call Option */}
                  <div className="p-3 rounded-lg border border-zinc-800 bg-[#101622] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400">LEG 2 (CALL OPTION)</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          s.callLeg.side === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {s.callLeg.side}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-200 truncate">{s.callLeg.symbol}</div>
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-zinc-400">Exec Price:</span>
                      <LivePriceTicker price={s.callLeg.price} size="sm" />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">Size: {s.callLeg.size} contracts</div>
                  </div>

                  {/* Leg 3: Put Option */}
                  <div className="p-3 rounded-lg border border-zinc-800 bg-[#101622] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400">LEG 3 (PUT OPTION)</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          s.putLeg.side === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {s.putLeg.side}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-200 truncate">{s.putLeg.symbol}</div>
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-zinc-400">Exec Price:</span>
                      <LivePriceTicker price={s.putLeg.price} size="sm" />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">Size: {s.putLeg.size} contracts</div>
                  </div>
                </div>

                {/* Transparent Profit Ledger & "Kab Setup Banega" Info Box */}
                <div className="p-4 bg-[#101622] border-t border-zinc-800/80 grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs font-mono">
                  {/* Ledger Breakdown */}
                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 space-y-1.5">
                    <div className="text-[11px] font-bold text-zinc-300 uppercase flex items-center justify-between">
                      <span>Full Profit & Deduction Ledger</span>
                      <span className="text-emerald-400 font-bold">100% Net Cleared</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Gross Spread / Edge:</span>
                      <span className="text-zinc-200 font-semibold">+${s.grossEdge.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>- Delta Exchange Commission:</span>
                      <span className="text-rose-400">-${s.fees.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>- Modeled Orderbook Slippage:</span>
                      <span className="text-rose-400">-${s.slippage.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>- Funding & Margin Carry Cost:</span>
                      <span className="text-rose-400">-${(s.funding + (s.carry || 0.5)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>- Safety Buffer Allowance:</span>
                      <span className="text-rose-400">-${(s.safetyBuffer || 1.0).toFixed(2)}</span>
                    </div>
                    <div className="pt-1.5 border-t border-zinc-700 flex justify-between font-bold">
                      <span className="text-zinc-100">Net Clean Profit:</span>
                      <span className="text-emerald-400 text-sm font-black">+${s.netProfit.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Kab Setup Banega Forecasting Box */}
                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>KAB SETUP BANEGA & EXPIRY HORIZON</span>
                    </div>
                    <div className="text-zinc-300 text-[11px] leading-relaxed">
                      {s.kabSetupBanega ||
                        `Trigger timing: ${s.expiryType} settlement window (${s.expiry}). Fills during option volatility dislocation or funding fee divergence.`}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-zinc-800/80 p-2 rounded text-[10px]">
                        <span className="text-zinc-400 block">Capital Required:</span>
                        <span className="text-zinc-200 font-bold font-mono">${s.capitalRequired.toLocaleString()}</span>
                      </div>
                      <div className="bg-zinc-800/80 p-2 rounded text-[10px]">
                        <span className="text-zinc-400 block">Orderbook Liquidity:</span>
                        <span className="text-emerald-400 font-bold font-mono">{s.liquidityScore}% Depth</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Detailed Leg Breakdown */}
                {isExpanded && s.executionLegsBreakdown && (
                  <div className="p-4 bg-zinc-950/90 border-t border-zinc-800 space-y-2 font-mono text-xs">
                    <div className="text-[11px] font-bold text-zinc-300 uppercase">
                      Detailed Execution Routing Steps:
                    </div>
                    <div className="space-y-1.5">
                      {s.executionLegsBreakdown.map((leg) => (
                        <div
                          key={leg.legNumber}
                          className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-start gap-2 text-zinc-300 text-[11px]"
                        >
                          <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-400 shrink-0">
                            {leg.legNumber}
                          </span>
                          <div className="flex-1">
                            <span className={leg.action === 'BUY' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {leg.action} {leg.instrument}:
                            </span>{' '}
                            <span className="text-zinc-100 font-semibold">{leg.symbol}</span> @ ${leg.price} (Qty: {leg.size})
                            <div className="text-[10px] text-zinc-400 mt-0.5">{leg.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
