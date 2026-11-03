import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Activity,
  Cpu,
  Zap,
  Radio,
  ArrowUpRight,
  Crosshair,
  Shuffle,
  ShieldAlert,
  Bot,
  Flame,
} from 'lucide-react';
import type { BotStatusState, TradeRecord, FutureSetup, SetupHistoryRecord } from '../types/index.js';
import { LivePriceTicker, LiveDistanceBadge } from './LivePriceTicker.js';
import { DailyPnlProgressionChart } from './DailyPnlProgressionChart.js';

interface StatusDashboardProps {
  status: BotStatusState;
  trades: TradeRecord[];
  history?: SetupHistoryRecord[];
  setups?: FutureSetup[];
  onNavigateTab: (tab: string) => void;
  onOpenTradeModal?: (trade: TradeRecord) => void;
}

export const StatusDashboard: React.FC<StatusDashboardProps> = ({
  status,
  trades,
  history = [],
  setups = [],
  onNavigateTab,
  onOpenTradeModal,
}) => {
  const isPnlPositive = status.runningPnl >= 0;

  // Setups nearing trigger (under 1.5% distance)
  const approachingSetups = setups
    .filter((s) => s.status === 'TRIGGER APPROACHING' || s.distanceToTriggerPercent < 1.5)
    .slice(0, 3);

  return (
    <div className="space-y-5">
      {/* 1. Smart Engine Health & Architecture Telemetry Bar */}
      <div className="bg-[#101622] p-4 rounded-xl border border-zinc-800/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100 font-mono">Delta Bot Engine Status</h2>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <Radio className="w-2.5 h-2.5 text-emerald-400 animate-ping" />
                SYSTEM ONLINE
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Continuous 10s research, setup validation, arbitrage parity scan & risk guard active
            </p>
          </div>
        </div>

        {/* Engine Pipeline Status Pills */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <div className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Research: Scanning Delta</span>
          </div>
          <div className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>Parity: Multi-Coin Live</span>
          </div>
          <div className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <span>Guard: 2% Max Risk Enforced</span>
          </div>
          <div
            onClick={() => onNavigateTab('distribution')}
            className="px-2.5 py-1 rounded bg-cyan-950/40 border border-cyan-800 flex items-center gap-1.5 text-cyan-300 hover:border-cyan-500 cursor-pointer transition"
            title="View live 24H Price Change Distribution & Market Breadth"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>Breadth: PCD Gating Active →</span>
          </div>
        </div>
      </div>

      {/* 2. Top Core Telemetry Grid (Clickable interactive cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Futures */}
        <div
          onClick={() => onNavigateTab('scanner')}
          className="bg-[#101622] hover:bg-[#151c2c] border border-zinc-800/80 rounded-xl p-3.5 cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Futures</span>
            <Layers className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100 mt-2">
            {status.totalFuturesCoins}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">Delta perpetual contracts</div>
        </div>

        {/* Setups (Open / Total) */}
        <div
          onClick={() => onNavigateTab('setups')}
          className="bg-[#101622] hover:bg-[#151c2c] border border-zinc-800/80 rounded-xl p-3.5 cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Active Setups</span>
            <Crosshair className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-2">
            {status.openSetups} <span className="text-xs text-zinc-400 font-normal">/ {status.totalSetups}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">Trigger = Entry Condition</div>
        </div>

        {/* Open Trades */}
        <div
          onClick={() => onNavigateTab('orders')}
          className="bg-[#101622] hover:bg-[#151c2c] border border-zinc-800/80 rounded-xl p-3.5 cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Open Trades</span>
            <Clock className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-bold font-mono text-sky-400 mt-2">
            {status.openTrades} <span className="text-xs text-zinc-400 font-normal">pos</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">Total Orders: {status.totalOrders}</div>
        </div>

        {/* TP Hit vs SL Hit */}
        <div
          onClick={() => onNavigateTab('history')}
          className="bg-[#101622] hover:bg-[#151c2c] border border-zinc-800/80 rounded-xl p-3.5 cursor-pointer transition flex flex-col justify-between group"
        >
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>TP / SL Performance</span>
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition" />
          </div>
          <div className="text-xl font-bold font-mono mt-2 flex items-center gap-2">
            <span className="text-emerald-400">{status.tpHitCount} TP</span>
            <span className="text-zinc-600">/</span>
            <span className="text-rose-400">{status.slHitCount} SL</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">
            Win Ratio:{' '}
            {status.tpHitCount + status.slHitCount > 0
              ? `${Math.round((status.tpHitCount / (status.tpHitCount + status.slHitCount)) * 100)}%`
              : '0%'}
          </div>
        </div>

        {/* Running Live PnL */}
        <div
          onClick={() => onNavigateTab('orders')}
          className={`border rounded-xl p-3.5 cursor-pointer transition flex flex-col justify-between ${
            isPnlPositive
              ? 'bg-emerald-950/20 hover:bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-950/20 hover:bg-rose-950/30 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="text-[11px] font-mono uppercase tracking-wider flex items-center justify-between">
            <span>Running PnL</span>
            {isPnlPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
          <div className="text-xl font-bold font-mono mt-2">
            <LivePriceTicker price={status.runningPnl} prefix={isPnlPositive ? '+$' : '$'} size="xl" />
          </div>
          <div className="text-[10px] text-zinc-400 mt-1 font-mono">
            Unrealized: ${status.unrealizedPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* 3. Today's Performance & Trade Tracker (Auto-resets at 12:00 AM Midnight) */}
      <DailyPnlProgressionChart trades={trades} history={history} status={status} />

      {/* 4. Imminent Trigger Approaching Radar (Live movement & distance) */}
      {approachingSetups.length > 0 && (
        <div className="bg-[#101622] border border-amber-500/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 animate-bounce" />
              <h3 className="text-xs font-bold font-mono text-amber-300 uppercase tracking-wide">
                Live Trigger Approaching Radar (Next Potential Orders)
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('setups')}
              className="text-xs text-amber-400 hover:underline font-mono"
            >
              View All Active Setups →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {approachingSetups.map((s) => (
              <div
                key={s.id}
                onClick={() => onNavigateTab('setups')}
                className="bg-[#0b0f17] p-3 rounded-lg border border-zinc-800 hover:border-amber-500/60 cursor-pointer transition space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs font-mono text-zinc-100">{s.coin}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      s.direction === 'BUY/LONG'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        : 'bg-rose-950 text-rose-300 border border-rose-700'
                    }`}
                  >
                    {s.direction}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">Target Entry:</span>
                  <span className="text-zinc-100 font-bold">${s.entryPrice ?? s.triggerPrice}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">Current Spot:</span>
                  <LivePriceTicker price={s.currentPrice} size="sm" />
                </div>
                <div className="pt-1 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-mono">Distance:</span>
                  <LiveDistanceBadge
                    distance={s.distanceToTrigger}
                    distancePercent={s.distanceToTriggerPercent}
                    direction={s.direction}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Active Positions Risk Heatmap */}
      {(() => {
        const openPositions = trades.filter((t) => t.status === 'OPEN');
        return (
          <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-200 font-mono">
                  Open Positions Risk Heatmap
                </h3>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {openPositions.length} Active Positions
                </span>
              </div>
              <button
                onClick={() => onNavigateTab('orders')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 transition"
              >
                <span>Live Orders View</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            {openPositions.length === 0 ? (
              <div className="bg-[#0b0f17] border border-zinc-800/60 rounded-lg p-5 text-center text-xs font-mono text-zinc-500">
                No active positions open. Capital is 100% protected and idle until the next confirmed 1:5 trigger.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {openPositions.map((t) => {
                  const pnlPct = t.pnlPercent || 0;
                  const isProfit = pnlPct >= 0;
                  const isBot = t.executionType === 'BOT_VIRTUAL';

                  // Calculate 1:5 RR distance progress (0 to 100%)
                  const entry = t.actualFillPrice || t.entryPrice;
                  const tp = t.tp;
                  const sl = t.sl;
                  const current = t.currentPrice || entry;
                  const totalTargetRange = Math.abs(tp - entry);
                  const progressToTp =
                    totalTargetRange > 0
                      ? Math.min(100, Math.max(0, (Math.abs(current - entry) / totalTargetRange) * 100))
                      : 0;

                  // Color gradient based on PnL intensity
                  let bgCardClass = 'bg-zinc-900 border-zinc-800';
                  if (pnlPct >= 10) bgCardClass = 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/30';
                  else if (pnlPct >= 3) bgCardClass = 'bg-emerald-950/25 border-emerald-600/40';
                  else if (pnlPct >= 0) bgCardClass = 'bg-emerald-950/15 border-emerald-700/30';
                  else if (pnlPct > -3) bgCardClass = 'bg-rose-950/20 border-rose-700/30';
                  else bgCardClass = 'bg-rose-950/40 border-rose-500/50 shadow-md shadow-rose-950/30';

                  return (
                    <div
                      key={t.tradeId}
                      onClick={() => onNavigateTab('orders')}
                      className={`p-3.5 rounded-xl border cursor-pointer hover:scale-[1.02] transition font-mono ${bgCardClass}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-zinc-100">{t.coin}</span>
                          <span
                            className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${
                              t.side === 'BUY'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {t.side}
                          </span>
                        </div>

                        {isBot ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                            <Bot className="w-2.5 h-2.5 text-purple-400" />
                            BOT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            <Zap className="w-2.5 h-2.5 text-emerald-400" />
                            LIVE
                          </span>
                        )}
                      </div>

                      {/* Current PnL & Spot */}
                      <div className="flex items-baseline justify-between mb-2">
                        <div>
                          <div className="text-[10px] text-zinc-500">UNREALIZED PNL</div>
                          <div className={`text-base font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}${(t.unrealizedPnl || 0).toFixed(2)} ({pnlPct}%)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-zinc-500">LIVE SPOT</div>
                          <div className="text-xs font-bold text-zinc-200">${current}</div>
                        </div>
                      </div>

                      {/* 1:5 Target Progress Bar */}
                      <div className="space-y-1 pt-1.5 border-t border-zinc-800/80">
                        <div className="flex justify-between text-[10px] text-zinc-400">
                          <span>1:5 RR Progress:</span>
                          <span className="font-bold text-zinc-300">{progressToTp.toFixed(0)}% to TP</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isProfit ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                            style={{ width: `${Math.max(4, progressToTp)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-zinc-500 pt-0.5">
                          <span>SL: ${sl}</span>
                          <span>TP: ${tp}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 5. Trade History Table with Live Price Tickers */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Execution & Trade History</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              {trades.length} Records
            </span>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 transition"
          >
            <span>Manage Orders</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-zinc-300">
            <thead className="bg-[#0b0f17] text-[11px] text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3">DATE / TIME</th>
                <th className="py-2.5 px-3">MODE</th>
                <th className="py-2.5 px-3">SYMBOL</th>
                <th className="py-2.5 px-3">SIDE</th>
                <th className="py-2.5 px-3">ENTRY</th>
                <th className="py-2.5 px-3">CURRENT / EXIT</th>
                <th className="py-2.5 px-3">TP / SL</th>
                <th className="py-2.5 px-3">QTY / CAPITAL</th>
                <th className="py-2.5 px-3">LEV</th>
                <th className="py-2.5 px-3">FEES</th>
                <th className="py-2.5 px-3">PNL</th>
                <th className="py-2.5 px-3">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-zinc-500">
                    No trades executed yet. Waiting for confirmed triggers.
                  </td>
                </tr>
              ) : (
                trades.map((t) => {
                  const isWin = (t.realizedPnl || t.unrealizedPnl) >= 0;
                  const currentVal = t.exitPrice || t.currentPrice;
                  const isBot = t.executionType === 'BOT_VIRTUAL';

                  return (
                    <tr key={t.tradeId} className="hover:bg-zinc-800/30 transition">
                      <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                        {new Date(t.createdAt).toLocaleTimeString()}
                      </td>

                      <td className="py-2.5 px-3">
                        {isBot ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                            <Bot className="w-2.5 h-2.5 text-purple-400" />
                            BOT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            <Zap className="w-2.5 h-2.5 text-emerald-400" />
                            LIVE
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-bold text-zinc-100">{t.coin}</td>
                      <td className="py-2.5 px-3">
                        {t.isSideChangedOrder ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1 text-[10px] font-bold">
                              <span className="line-through text-zinc-500">{t.originalSetupSide?.includes('BUY') ? 'BUY' : 'SELL'}</span>
                              <span className="text-amber-400">&rarr;</span>
                              <span className={t.side === 'BUY' ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold'}>{t.side}</span>
                            </span>
                            <span className="px-1 py-0.2 rounded text-[8.5px] font-bold bg-amber-950 text-amber-300 border border-amber-700/60 inline-block w-fit">
                              SIDE CHANGED
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.side === 'BUY'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {t.side}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">${t.actualFillPrice || t.entryPrice}</td>
                      <td className="py-2.5 px-3">
                        <LivePriceTicker price={currentVal} size="sm" />
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        <span className="text-emerald-400">${t.tp}</span> /{' '}
                        <span className="text-rose-400">${t.sl}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {t.quantity} (${t.capitalUsed?.toFixed(1) || '0'})
                      </td>
                      <td className="py-2.5 px-3">{t.leverage}x</td>
                      <td className="py-2.5 px-3 text-zinc-400">${t.fees.toFixed(2)}</td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          isWin ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isWin ? '+' : ''}${((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.status === 'OPEN'
                              ? 'bg-sky-950 text-sky-400 border border-sky-800'
                              : t.status === 'TP HIT'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : t.status === 'SL HIT'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {t.status}
                        </span>
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
