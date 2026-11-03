import React, { useState } from 'react';
import { History, Play, TrendingUp, TrendingDown, Award, AlertCircle, BarChart3 } from 'lucide-react';
import type { BacktestParams, BacktestResult } from '../types/index.js';

interface BacktestViewProps {
  onRunBacktest: (params: BacktestParams) => Promise<BacktestResult>;
}

export const BacktestView: React.FC<BacktestViewProps> = ({ onRunBacktest }) => {
  const [backtestType, setBacktestType] = useState<BacktestParams['backtestType']>('FUTURE');
  const [symbol, setSymbol] = useState('BTCUSD');
  const [timeRange, setTimeRange] = useState<BacktestParams['timeRange']>('3m');
  const [initialCapital, setInitialCapital] = useState(10000);
  const [riskRewardMin, setRiskRewardMin] = useState(1.8);
  const [useSmartBotScanData, setUseSmartBotScanData] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const handleRun = async () => {
    setIsLoading(true);
    try {
      const res = await onRunBacktest({
        backtestType,
        symbol,
        timeRange,
        initialCapital,
        riskRewardMin,
        useSmartBotScanData,
      });
      setResult(res);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Parameters Panel */}
      <div className="bg-[#101622] p-5 rounded-xl border border-zinc-800/80 shadow-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
          <History className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Delta Historical Backtest Engine</h2>
            <p className="text-xs text-zinc-400">
              Deterministic backtesting on real historical Delta candles without look-ahead bias
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          <div>
            <label className="block text-zinc-400 mb-1">BACKTEST TYPE</label>
            <select
              value={backtestType}
              onChange={(e) => setBacktestType(e.target.value as any)}
              className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-emerald-500"
            >
              <option value="FUTURE">Future Only</option>
              <option value="OPTION">Option Only</option>
              <option value="FUTURE_AND_OPTION">Future + Option</option>
              <option value="ARBITRAGE">Arbitrage Parity</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">COIN / SYMBOL</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-emerald-500"
            >
              <option value="BTCUSD">BTCUSD (Delta)</option>
              <option value="ETHUSD">ETHUSD (Delta)</option>
              <option value="SOLUSD">SOLUSD (Delta)</option>
              <option value="ALL">ALL COINS</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">TIME PERIOD</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-emerald-500"
            >
              <option value="1m">1 Month</option>
              <option value="2m">2 Months</option>
              <option value="3m">3 Months</option>
              <option value="6m">6 Months</option>
              <option value="1y">1 Year</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">CAPITAL ($)</label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">MIN R:R</label>
            <input
              type="number"
              step="0.1"
              value={riskRewardMin}
              onChange={(e) => setRiskRewardMin(Number(e.target.value))}
              className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-col justify-end">
            <button
              onClick={handleRun}
              disabled={isLoading}
              className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isLoading ? 'Simulating...' : 'Run Backtest'}</span>
            </button>
          </div>
        </div>

        {/* Smart Bot Scan Data Toggle */}
        <div className="pt-2 flex items-center gap-2 text-xs font-mono text-zinc-400">
          <input
            type="checkbox"
            id="smartData"
            checked={useSmartBotScanData}
            onChange={(e) => setUseSmartBotScanData(e.target.checked)}
            className="accent-emerald-500 rounded"
          />
          <label htmlFor="smartData" className="cursor-pointer">
            Use Smart Bot Historical Scan Data (incorporate 24H move forensics similarity weights)
          </label>
        </div>
      </div>

      {/* Results Presentation */}
      {result && (
        <div className="space-y-4">
          {/* Top Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono">
            <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-400">WIN RATE</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{result.winRate}%</div>
              <div className="text-[10px] text-zinc-500">
                {result.wins}W / {result.losses}L ({result.totalSetups} Total)
              </div>
            </div>

            <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-400">NET PNL</div>
              <div
                className={`text-xl font-bold mt-1 ${
                  result.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {result.netPnl >= 0 ? '+' : ''}${result.netPnl}
              </div>
              <div className="text-[10px] text-zinc-500">Gross: ${result.grossPnl}</div>
            </div>

            <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-400">PROFIT FACTOR</div>
              <div className="text-xl font-bold text-sky-400 mt-1">{result.profitFactor}</div>
              <div className="text-[10px] text-zinc-500">Expectancy: ${result.expectancy}</div>
            </div>

            <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-400">MAX DRAWDOWN</div>
              <div className="text-xl font-bold text-rose-400 mt-1">-{result.maxDrawdownPercent}%</div>
              <div className="text-[10px] text-zinc-500">-${result.maxDrawdown}</div>
            </div>

            <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-400">AVG WIN / LOSS</div>
              <div className="text-sm font-bold text-zinc-200 mt-1">
                +${result.averageWin} / -${result.averageLoss}
              </div>
              <div className="text-[10px] text-zinc-500">Hold: {result.averageHoldingTimeMinutes}m</div>
            </div>

            <div className="bg-[#101622] p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-400">MAX STREAKS</div>
              <div className="text-sm font-bold text-zinc-200 mt-1">
                <span className="text-emerald-400">{result.consecutiveWinsMax}W</span> /{' '}
                <span className="text-rose-400">{result.consecutiveLossesMax}L</span>
              </div>
              <div className="text-[10px] text-zinc-500">Sample: {result.sampleSize} setups</div>
            </div>
          </div>

          {/* Individual Trades Log */}
          <div className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-300">
              <span>Historical Simulated Trade Sequence (Last 50)</span>
              <span className="text-zinc-500">Zero look-ahead forward evaluation</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs text-zinc-300">
                <thead className="bg-[#0b0f17] text-[10px] text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-2 px-3">DATE</th>
                    <th className="py-2 px-3">SYMBOL</th>
                    <th className="py-2 px-3">SIDE</th>
                    <th className="py-2 px-3">ENTRY</th>
                    <th className="py-2 px-3">EXIT</th>
                    <th className="py-2 px-3">PNL ($)</th>
                    <th className="py-2 px-3">PNL (%)</th>
                    <th className="py-2 px-3">OUTCOME</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {result.trades.map((t, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/30">
                      <td className="py-2 px-3 text-zinc-400 text-[11px]">{t.date}</td>
                      <td className="py-2 px-3 font-bold text-zinc-100">{t.symbol}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            t.side === 'BUY'
                              ? 'bg-emerald-950 text-emerald-400'
                              : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2 px-3">${t.entry}</td>
                      <td className="py-2 px-3">${t.exit}</td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.pnl >= 0 ? '+' : ''}${t.pnl}
                      </td>
                      <td className="py-2 px-3">{t.pnlPercent}%</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.result === 'WIN'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {t.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
