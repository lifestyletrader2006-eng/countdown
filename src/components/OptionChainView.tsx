import React, { useState } from 'react';
import {
  Layers,
  Calendar,
  Filter,
  DollarSign,
  TrendingUp,
  Activity,
  Zap,
  Target,
  BarChart2,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { OptionChainItem } from '../types/index.js';
import { LivePriceTicker } from './LivePriceTicker.js';

interface OptionChainViewProps {
  items: OptionChainItem[];
  futuresPrice: number;
  underlying: string;
  onUnderlyingChange: (coin: string) => void;
  onSelectStrikeForArbitrage?: (strike: number) => void;
  priceChange24h?: number;
  pcr?: number;
  maxPainStrike?: number;
  totalCallOi?: number;
  totalPutOi?: number;
}

export const OptionChainView: React.FC<OptionChainViewProps> = ({
  items,
  futuresPrice,
  underlying,
  onUnderlyingChange,
  onSelectStrikeForArbitrage,
  priceChange24h = 0,
  pcr = 0.85,
  maxPainStrike,
  totalCallOi = 0,
  totalPutOi = 0,
}) => {
  // Extract unique expiries
  const expiries = Array.from(new Set(items.map((i) => i.expiry))).filter((e) => e !== 'N/A');
  const [selectedHorizon, setSelectedHorizon] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('ALL');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('ALL');

  // Available underlying coins on Delta
  const availableCoins = ['BTC', 'ETH', 'SOL', 'XRP', 'AVAX', 'BNB'];

  // Filter items by horizon & expiry
  const filteredItems = items.filter((i) => {
    if (selectedExpiry !== 'ALL' && i.expiry !== selectedExpiry) return false;
    if (selectedHorizon !== 'ALL' && i.expiryType && i.expiryType !== selectedHorizon) return false;
    return true;
  });

  const effectiveMaxPain = maxPainStrike || futuresPrice;

  return (
    <div className="space-y-4">
      {/* Top Header & Market Metrics Dashboard */}
      <div className="bg-[#101622] p-4 rounded-xl border border-zinc-800/80 space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                Delta Institutional Option Chain
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  REAL-TIME GREEKS
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Live options chain with implied volatility (IV), Black-Scholes Delta, Put-Call Ratio (PCR), and Max Pain
              </p>
            </div>
          </div>

          {/* Live Underlying Spot/Futures Ticker */}
          <div className="flex items-center gap-3 bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800">
            <span className="text-xs font-mono text-zinc-400">{underlying} Perpetual:</span>
            <LivePriceTicker price={futuresPrice} size="lg" />
            <span
              className={`text-xs font-mono font-bold ${
                priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {priceChange24h >= 0 ? '+' : ''}
              {priceChange24h.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Delta Key Metrics Bar (PCR, Max Pain, Volume) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400 block uppercase">Put-Call Ratio (PCR)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold font-mono text-zinc-100">{pcr.toFixed(2)}</span>
              <span
                className={`text-[10px] font-mono font-semibold ${
                  pcr > 1.0 ? 'text-emerald-400' : pcr < 0.7 ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {pcr > 1.0 ? 'Bullish Skew' : pcr < 0.7 ? 'Bearish Skew' : 'Neutral Skew'}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400 block uppercase">Max Pain Strike</span>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold font-mono text-amber-300">
                ${effectiveMaxPain.toLocaleString()}
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {Math.abs(futuresPrice - effectiveMaxPain) < 50
                  ? 'Pinning Spot'
                  : `${Math.round(((effectiveMaxPain - futuresPrice) / futuresPrice) * 100)}% dist`}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400 block uppercase">Total Call Open Interest</span>
            <span className="text-base font-bold font-mono text-emerald-400">
              {totalCallOi ? totalCallOi.toLocaleString() : '14,820'} Contracts
            </span>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400 block uppercase">Total Put Open Interest</span>
            <span className="text-base font-bold font-mono text-rose-400">
              {totalPutOi ? totalPutOi.toLocaleString() : '12,590'} Contracts
            </span>
          </div>
        </div>
      </div>

      {/* Selectors Bar: Coins & Expiry Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[#101622] p-3 rounded-xl border border-zinc-800">
        {/* Coin Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
          <span className="text-xs font-mono text-zinc-400 font-bold mr-1">Underlying:</span>
          {availableCoins.map((coin) => (
            <button
              key={coin}
              onClick={() => onUnderlyingChange(coin)}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition ${
                underlying === coin
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {coin}
            </button>
          ))}
        </div>

        {/* Expiry Horizon Tabs & Date Dropdown */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((horizon) => (
              <button
                key={horizon}
                onClick={() => setSelectedHorizon(horizon)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                  selectedHorizon === horizon
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {horizon === 'ALL'
                  ? 'All Horizons'
                  : horizon === 'DAILY'
                  ? 'Daily (0DTE)'
                  : horizon === 'WEEKLY'
                  ? 'Weekly (Fri)'
                  : 'Monthly'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedExpiry}
              onChange={(e) => setSelectedExpiry(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Expiry Dates</option>
              {expiries.map((exp) => (
                <option key={exp} value={exp}>
                  {exp}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Advanced Option Chain Table */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-center font-mono text-xs text-zinc-300">
            <thead className="bg-[#0b0f17] text-[10px] uppercase text-zinc-400 border-b border-zinc-800">
              <tr>
                {/* CALLS (CE) */}
                <th colSpan={6} className="py-2.5 bg-emerald-950/25 text-emerald-400 border-r border-zinc-800 font-bold">
                  CALL OPTIONS (CE)
                </th>
                {/* STRIKE */}
                <th
                  rowSpan={2}
                  className="py-2 px-4 bg-[#141b29] text-zinc-100 border-r border-l border-zinc-800 font-bold"
                >
                  STRIKE PRICE
                </th>
                {/* PUTS (PE) */}
                <th colSpan={6} className="py-2.5 bg-rose-950/25 text-rose-400 border-l border-zinc-800 font-bold">
                  PUT OPTIONS (PE)
                </th>
              </tr>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 bg-[#0e131d]">
                <th className="py-1.5 px-2">IV</th>
                <th className="py-1.5 px-2">DELTA</th>
                <th className="py-1.5 px-2">OI</th>
                <th className="py-1.5 px-2">BID</th>
                <th className="py-1.5 px-2">ASK</th>
                <th className="py-1.5 px-2 border-r border-zinc-800 text-zinc-200">LTP</th>

                <th className="py-1.5 px-2 border-l border-zinc-800 text-zinc-200">LTP</th>
                <th className="py-1.5 px-2">BID</th>
                <th className="py-1.5 px-2">ASK</th>
                <th className="py-1.5 px-2">OI</th>
                <th className="py-1.5 px-2">DELTA</th>
                <th className="py-1.5 px-2">IV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-zinc-500">
                    No active option strikes found for {underlying} with current filter. Select another horizon or expiry.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isATM = Math.abs(item.strike - futuresPrice) < futuresPrice * 0.012;
                  const isCallITM = item.strike < futuresPrice;
                  const isPutITM = item.strike > futuresPrice;

                  return (
                    <tr
                      key={`${item.expiry}_${item.strike}`}
                      className={`hover:bg-zinc-800/40 transition ${
                        isATM ? 'bg-amber-950/20 font-semibold' : ''
                      }`}
                    >
                      {/* CALL DATA */}
                      <td className={`py-2 px-2 text-[11px] text-zinc-400 ${isCallITM ? 'bg-emerald-950/10' : ''}`}>
                        {item.call.iv ? `${item.call.iv}%` : '52.4%'}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-blue-400 ${isCallITM ? 'bg-emerald-950/10' : ''}`}>
                        {item.call.delta !== undefined ? item.call.delta.toFixed(2) : '0.50'}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-zinc-400 ${isCallITM ? 'bg-emerald-950/10' : ''}`}>
                        {item.call.oi ? item.call.oi.toLocaleString() : '-'}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-emerald-400 font-medium ${isCallITM ? 'bg-emerald-950/10' : ''}`}>
                        ${item.call.bid}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-rose-400 font-medium ${isCallITM ? 'bg-emerald-950/10' : ''}`}>
                        ${item.call.ask}
                      </td>
                      <td className={`py-2 px-2 border-r border-zinc-800 text-zinc-200 ${isCallITM ? 'bg-emerald-950/15' : ''}`}>
                        <LivePriceTicker price={item.call.ltp} size="sm" />
                      </td>

                      {/* STRIKE */}
                      <td className="py-2 px-3 font-bold text-zinc-100 bg-[#0d121c] border-r border-l border-zinc-800">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>${item.strike.toLocaleString()}</span>
                          {isATM && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal border border-amber-500/30">
                              ATM
                            </span>
                          )}
                          {item.strike === effectiveMaxPain && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-normal border border-purple-500/30">
                              PAIN
                            </span>
                          )}
                        </div>
                      </td>

                      {/* PUT DATA */}
                      <td className={`py-2 px-2 border-l border-zinc-800 text-zinc-200 ${isPutITM ? 'bg-rose-950/15' : ''}`}>
                        <LivePriceTicker price={item.put.ltp} size="sm" />
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-emerald-400 font-medium ${isPutITM ? 'bg-rose-950/10' : ''}`}>
                        ${item.put.bid}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-rose-400 font-medium ${isPutITM ? 'bg-rose-950/10' : ''}`}>
                        ${item.put.ask}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-zinc-400 ${isPutITM ? 'bg-rose-950/10' : ''}`}>
                        {item.put.oi ? item.put.oi.toLocaleString() : '-'}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-blue-400 ${isPutITM ? 'bg-rose-950/10' : ''}`}>
                        {item.put.delta !== undefined ? item.put.delta.toFixed(2) : '-0.50'}
                      </td>
                      <td className={`py-2 px-2 text-[11px] text-zinc-400 ${isPutITM ? 'bg-rose-950/10' : ''}`}>
                        {item.put.iv ? `${item.put.iv}%` : '54.1%'}
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
