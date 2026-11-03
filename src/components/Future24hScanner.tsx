import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Search,
  Activity,
  Microscope,
  Zap,
  Flame,
  Radio,
  ExternalLink,
  Info,
  Target,
} from 'lucide-react';
import type { DeltaProduct, DeltaTicker, ExchangeConfig } from '../types/index.js';
import { PriceTransitionCell } from './PriceTransitionCell.js';

interface Future24hScannerProps {
  tickers: DeltaTicker[];
  gainers: DeltaTicker[];
  losers: DeltaTicker[];
  products: DeltaProduct[];
  config?: ExchangeConfig;
  onTriggerForensics: (symbol: string) => void;
  onSelectCoinForSetup: (symbol: string) => void;
  isWsConnected?: boolean;
}

export const Future24hScanner: React.FC<Future24hScannerProps> = ({
  tickers,
  gainers,
  losers,
  products,
  config,
  onTriggerForensics,
  onSelectCoinForSetup,
  isWsConnected = true,
}) => {
  const [activeTab, setActiveTab] = useState<'GAINERS' | 'LOSERS' | 'TARGET_RANGE' | 'ALL'>('GAINERS');
  const [search, setSearch] = useState('');

  const productMap = new Map<string, DeltaProduct>();
  for (const p of products) {
    productMap.set(p.symbol, p);
  }

  // Dynamic movement reason generator fallback
  const getMoveExplanation = (t: DeltaTicker) => {
    if (t.whyMoved && t.whyMoved.reason) {
      return t.whyMoved;
    }

    const chg = Number(t.price_change_percent_24h) || 0;
    const funding = Number(t.funding_rate) || 0;
    const turnover = Number(t.turnover) || (Number(t.volume || 0) * Number(t.close || 1));
    const high = Number(t.high) || 0;
    const low = Number(t.low) || 0;
    const close = Number(t.close || t.mark_price || 0);
    const volFormatted = turnover >= 1e6 ? `$${(turnover / 1e6).toFixed(2)}M` : `$${Math.round(turnover / 1e3)}k`;
    const fundingPercent = (funding * 100).toFixed(4);

    let catalyst = 'Momentum';
    let signal = 'Active';
    let reason = '';

    if (chg >= 15) {
      catalyst = 'Massive Surge Breakout';
      signal = 'Extreme Bullish';
      reason = `Explosive +${chg.toFixed(1)}% breakout. Aggressive buy volume & high turnover (${volFormatted}) pushing past 24h resistance.`;
    } else if (chg <= -15) {
      catalyst = 'Heavy Capitulation Flush';
      signal = 'Extreme Bearish';
      reason = `Severe -${Math.abs(chg).toFixed(1)}% drop. Forced liquidation cascade breaking through daily support levels.`;
    } else if (funding < -0.008 && chg > 3) {
      catalyst = 'Short Squeeze Trap';
      signal = 'Short Squeeze';
      reason = `Short Squeeze: Negative funding (${fundingPercent}%) trapped short sellers, sparking forced market buybacks.`;
    } else if (funding > 0.015 && chg < -3) {
      catalyst = 'Long Liquidation Flush';
      signal = 'Long Squeeze';
      reason = `Long Flush: High positive funding (${fundingPercent}%) triggered cascades of long margin closures.`;
    } else if (high > 0 && close >= high * 0.985) {
      catalyst = '24H High Breakout';
      signal = 'Range Breakout';
      reason = `Testing / breaking 24h high resistance at $${high}. Sustained accumulation holding near top of range.`;
    } else if (low > 0 && close <= low * 1.015) {
      catalyst = '24H Low Breakdown';
      signal = 'Range Breakdown';
      reason = `Testing 24h low support at $${low}. Intense sell pressure with bids failing to hold lower threshold.`;
    } else if (chg > 0) {
      catalyst = 'Bullish Expansion';
      signal = 'Bullish Trend';
      reason = `Steady upside price momentum (+${chg.toFixed(1)}%) supported by positive orderflow on Delta Exchange.`;
    } else {
      catalyst = 'Bearish Pullback';
      signal = 'Bearish Pressure';
      reason = `Downward retracement (${chg.toFixed(1)}%) driven by supply absorption and profit-taking on futures.`;
    }

    return {
      reason,
      catalyst,
      signal,
      volumeSurge: `Turnover: ${volFormatted}`,
      fundingSignal: `Funding: ${fundingPercent}%`,
    };
  };

  // Target Range Calculation
  const rangeMin = config?.rangeMinPercent ?? 3.0;
  const rangeMax = config?.rangeMaxPercent ?? 7.0;
  const rangeSide = config?.rangeTargetSide ?? 'BOTH';

  const isCoinInRange = (t: DeltaTicker) => {
    const chg = Number(t.price_change_percent_24h) || 0;
    const absChg = Math.abs(chg);
    if (absChg < rangeMin || absChg > rangeMax) return false;
    if (rangeSide === 'GAINERS' && chg < 0) return false;
    if (rangeSide === 'LOSERS' && chg > 0) return false;
    return true;
  };

  // Base lists
  const effectiveGainers = gainers.length > 0 ? gainers : tickers.filter((t) => (t.price_change_percent_24h || 0) > 0);
  const effectiveLosers = losers.length > 0 ? losers : tickers.filter((t) => (t.price_change_percent_24h || 0) < 0);
  const targetRangeMovers = tickers.filter(isCoinInRange);

  let listToDisplay =
    activeTab === 'GAINERS'
      ? effectiveGainers
      : activeTab === 'LOSERS'
      ? effectiveLosers
      : activeTab === 'TARGET_RANGE'
      ? targetRangeMovers
      : tickers;

  if (search.trim()) {
    const q = search.toLowerCase();
    listToDisplay = listToDisplay.filter((t) => t.symbol.toLowerCase().includes(q));
  }

  return (
    <div className="space-y-4">
      {/* Top Filter Bar & Live Stream Badge */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#101622] p-3 rounded-xl border border-zinc-800/80 shadow-md">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <button
            onClick={() => setActiveTab('TARGET_RANGE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              activeTab === 'TARGET_RANGE'
                ? 'bg-sky-950/60 border-sky-500 text-sky-300 font-bold ring-1 ring-sky-400'
                : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-sky-400" />
            <span>🎯 Target Band ({rangeMin}% - {rangeMax}%)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-900/80 text-sky-200 font-bold">
              {targetRangeMovers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('GAINERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              activeTab === 'GAINERS'
                ? 'bg-emerald-950/50 border-emerald-500 text-emerald-400 font-bold'
                : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Top Gainers (+)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 font-bold">
              {effectiveGainers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('LOSERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              activeTab === 'LOSERS'
                ? 'bg-rose-950/50 border-rose-500 text-rose-400 font-bold'
                : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Top Losers (-)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-900/60 text-rose-300 font-bold">
              {effectiveLosers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ALL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              activeTab === 'ALL'
                ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-bold'
                : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>All 24H Movers</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
              {tickers.length}
            </span>
          </button>
        </div>

        {/* Live WS Status & Search */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0a0e16] border border-zinc-800 font-mono text-[11px] text-zinc-400">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Delta WS:</span>
            <span className="text-emerald-400 font-bold">Live Millisecond Ticker</span>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search coin (BTC, SOL, DOGE)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0a0e16] border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Main Forensic Movement Table */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-zinc-300">
            <thead className="bg-[#0b0f17] text-[11px] text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-3 px-3">COIN / SYMBOL</th>
                <th className="py-3 px-3">24H CHANGE</th>
                <th className="py-3 px-3">LIVE PRICE</th>
                <th className="py-3 px-3 min-w-[280px]">KYU MOVE HUA? (WHY IT MOVED / FORENSIC CATALYST)</th>
                <th className="py-3 px-3">24H HIGH / LOW</th>
                <th className="py-3 px-3">24H TURNOVER</th>
                <th className="py-3 px-3">FUNDING RATE</th>
                <th className="py-3 px-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {listToDisplay.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono text-xs">
                    No coins found matching the search filter. Delta Exchange tickers are streaming live.
                  </td>
                </tr>
              ) : (
                listToDisplay.map((t) => {
                  const chg = Number(t.price_change_percent_24h) || 0;
                  const isPos = chg >= 0;
                  const moveInfo = getMoveExplanation(t);
                  const turnover = Number(t.turnover) || (Number(t.volume || 0) * Number(t.close || 1));
                  const turnoverStr =
                    turnover >= 1e6 ? `$${(turnover / 1e6).toFixed(2)}M` : `$${Math.round(turnover / 1e3)}k`;

                  const markPrice = Number(t.mark_price || t.close || 0);
                  const high = Number(t.high || 0);
                  const low = Number(t.low || 0);

                  // High-low progress percentage
                  const rangePct =
                    high > low && markPrice >= low
                      ? Math.min(100, Math.max(0, ((markPrice - low) / (high - low)) * 100))
                      : 50;

                  return (
                    <tr key={t.symbol} className="hover:bg-zinc-800/30 transition group">
                      {/* Symbol */}
                      <td className="py-3 px-3 font-bold text-zinc-100">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-100 text-sm font-semibold">{t.symbol}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
                            FUTURES
                          </span>
                        </div>
                      </td>

                      {/* 24h Change */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs ${
                              isPos
                                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/80'
                                : 'bg-rose-950/70 text-rose-400 border border-rose-800/80'
                            }`}
                          >
                            {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {isPos ? '+' : ''}
                            {chg.toFixed(2)}%
                          </span>
                          {isCoinInRange(t) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-sky-950 text-sky-300 border border-sky-600" title={`In Active Target Range (${rangeMin}% - ${rangeMax}%)`}>
                              <Target className="w-2.5 h-2.5 text-sky-400" />
                              <span>Target Band</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Live Price with Exchange CSS Dynamic Green/Red Class Transition */}
                      <td className="py-3 px-3 font-semibold text-zinc-100 text-sm">
                        <PriceTransitionCell
                          price={markPrice}
                          size="md"
                          showDirectionIcon={true}
                        />
                      </td>

                      {/* WHY IT MOVED (KYU MOVE HUA) */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                                isPos
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/60'
                                  : 'bg-rose-950/50 text-rose-300 border-rose-700/60'
                              }`}
                            >
                              <Flame className="w-2.5 h-2.5 text-amber-400" />
                              <span>{moveInfo.catalyst}</span>
                            </span>

                            <span className="text-[10px] text-zinc-400 font-medium">
                              [{moveInfo.signal}]
                            </span>
                          </div>

                          <p className="text-[11px] text-zinc-300 leading-snug font-sans">
                            {moveInfo.reason}
                          </p>
                        </div>
                      </td>

                      {/* 24h High / Low */}
                      <td className="py-3 px-3 text-zinc-400 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-rose-400">${low}</span>
                            <span className="text-emerald-400">${high}</span>
                          </div>
                          <div className="w-24 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-400 transition-all duration-300"
                              style={{ width: `${rangePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 24h Turnover */}
                      <td className="py-3 px-3 text-zinc-300 font-medium">
                        <div>{turnoverStr}</div>
                        <div className="text-[10px] text-zinc-500">
                          OI: {t.open_interest ? t.open_interest.toLocaleString() : '-'}
                        </div>
                      </td>

                      {/* Funding Rate */}
                      <td className="py-3 px-3">
                        <span
                          className={`text-xs font-semibold ${
                            (Number(t.funding_rate) || 0) < 0
                              ? 'text-amber-400'
                              : (Number(t.funding_rate) || 0) > 0.01
                              ? 'text-rose-400'
                              : 'text-zinc-300'
                          }`}
                        >
                          {((Number(t.funding_rate) || 0) * 100).toFixed(4)}%
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onTriggerForensics(t.symbol)}
                            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-400 border border-zinc-700 text-xs transition flex items-center gap-1.5"
                            title="Run Move Forensics: pre-move breakout condition analysis"
                          >
                            <Microscope className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Forensics</span>
                          </button>

                          <button
                            onClick={() => onSelectCoinForSetup(t.symbol)}
                            className="px-2.5 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-xs font-bold transition flex items-center gap-1"
                            title="Open Future Setup Engine for this coin"
                          >
                            <Zap className="w-3 h-3 text-emerald-400" />
                            <span>Setup</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
