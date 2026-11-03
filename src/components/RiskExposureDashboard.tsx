import React from 'react';
import { Shield, ShieldAlert, AlertTriangle, TrendingDown, DollarSign, PieChart, Activity } from 'lucide-react';
import type { SetupHistoryRecord, TradeRecord, ExchangeConfig } from '../types/index.js';

interface RiskExposureDashboardProps {
  history: SetupHistoryRecord[];
  trades?: TradeRecord[];
  config?: ExchangeConfig;
}

export const RiskExposureDashboard: React.FC<RiskExposureDashboardProps> = ({
  history,
  trades = [],
  config,
}) => {
  const tradingCapital = config?.tradingCapital || 10000;
  const capitalLimit = config?.capitalLimit || 8000;
  const maxDailyLoss = config?.maxDailyLoss || 500;

  // Calculate active open positions risk
  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const activeCapitalUsed = openTrades.reduce((sum, t) => sum + (t.capitalUsed || 0), 0);
  const activeSlRiskUsd = openTrades.reduce((sum, t) => {
    const riskDiff = Math.abs(t.entryPrice - t.sl);
    const riskTotal = (riskDiff / t.entryPrice) * (t.capitalUsed || 500);
    return sum + riskTotal;
  }, 0);

  const availableCapital = Math.max(0, tradingCapital - activeCapitalUsed);
  const capitalUtilizationPct = Math.min(100, Math.round((activeCapitalUsed / tradingCapital) * 100));
  const openRiskPct = (activeSlRiskUsd / tradingCapital) * 100;

  // Drawdown evolution curve calculation
  let peakEquity = tradingCapital;
  let currentEquity = tradingCapital;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  const drawdownPoints: { date: string; equity: number; drawdownPct: number }[] = [];

  // Seed baseline
  drawdownPoints.push({
    date: 'Start',
    equity: tradingCapital,
    drawdownPct: 0,
  });

  history.forEach((h, idx) => {
    const pnl = h.realizedPnl || 0;
    currentEquity += pnl;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDd = peakEquity - currentEquity;
    const currentDdPct = (currentDd / peakEquity) * 100;

    if (currentDd > maxDrawdownUsd) {
      maxDrawdownUsd = currentDd;
      maxDrawdownPct = currentDdPct;
    }

    if (idx % Math.max(1, Math.floor(history.length / 8)) === 0 || idx === history.length - 1) {
      drawdownPoints.push({
        date: new Date(h.createdAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
        equity: Math.round(currentEquity),
        drawdownPct: Math.round(currentDdPct * 10) / 10,
      });
    }
  });

  const isRiskSafe = openRiskPct <= 2.0;

  return (
    <div className="bg-[#101622] p-5 rounded-xl border border-zinc-800/80 space-y-5 font-mono">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-zinc-100">Risk Exposure & Capital Drawdown Engine</h3>
            <p className="text-xs text-zinc-400">
              Live portfolio risk vs available margin, position leverage limits, and historical drawdown curve
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
            isRiskSafe
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
              : 'bg-rose-950 text-rose-300 border border-rose-700 animate-pulse'
          }`}
        >
          {isRiskSafe ? <Shield className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          <span>{isRiskSafe ? 'RISK LEVEL: SAFE (<2% CAP)' : 'WARNING: HIGH RISK'}</span>
        </div>
      </div>

      {/* 4 Core Exposure Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0b0f17] p-3.5 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Total Portfolio Capital</span>
          <span className="text-lg font-bold text-zinc-100 mt-0.5 block">
            ${tradingCapital.toLocaleString()}
          </span>
          <span className="text-[10px] text-zinc-500">Configured account balance</span>
        </div>

        <div className="bg-[#0b0f17] p-3.5 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Active Capital In Margin</span>
          <span className="text-lg font-bold text-blue-400 mt-0.5 block">
            ${activeCapitalUsed.toFixed(0)}{' '}
            <span className="text-xs text-zinc-400 font-normal">({capitalUtilizationPct}%)</span>
          </span>
          <span className="text-[10px] text-zinc-500">Available: ${availableCapital.toLocaleString()}</span>
        </div>

        <div className="bg-[#0b0f17] p-3.5 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Max Open Stop-Loss Risk</span>
          <span className="text-lg font-bold text-amber-400 mt-0.5 block">
            ${activeSlRiskUsd.toFixed(2)}{' '}
            <span className="text-xs text-zinc-400 font-normal">({openRiskPct.toFixed(2)}%)</span>
          </span>
          <span className="text-[10px] text-zinc-500">Total potential SL drawdown</span>
        </div>

        <div className="bg-[#0b0f17] p-3.5 rounded-lg border border-zinc-800">
          <span className="text-[10px] text-zinc-400 block uppercase">Max Historical Drawdown</span>
          <span className="text-lg font-bold text-rose-400 mt-0.5 block">
            -{maxDrawdownPct.toFixed(1)}%
          </span>
          <span className="text-[10px] text-zinc-500">-${maxDrawdownUsd.toFixed(0)} peak-to-trough</span>
        </div>
      </div>

      {/* Capital Allocation & Margin Utilization Bar */}
      <div className="bg-[#0b0f17] p-4 rounded-lg border border-zinc-800 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-300 font-bold">Capital Allocation & Exposure Safeguard</span>
          <span className="text-zinc-400">
            {activeCapitalUsed.toFixed(0)} / ${capitalLimit.toLocaleString()} Max Allocation Cap
          </span>
        </div>
        <div className="h-3 bg-zinc-900 rounded-full overflow-hidden flex">
          <div
            className="bg-blue-500 h-full transition-all duration-500"
            style={{ width: `${capitalUtilizationPct}%` }}
            title="Capital In Use"
          />
          <div
            className="bg-emerald-500/20 h-full flex-1"
            title="Available Capital Buffer"
          />
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Allocated Margin: ${activeCapitalUsed.toFixed(0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Free Liquidity Buffer: ${availableCapital.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Drawdown Evolution Curve Visualization */}
      <div className="bg-[#0b0f17] p-4 rounded-lg border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-200 font-bold flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-rose-400" />
            <span>Drawdown Evolution History Curve</span>
          </span>
          <span className="text-zinc-500 text-[11px]">
            Max Allowed Daily Loss Guard: ${maxDailyLoss}
          </span>
        </div>

        {/* Drawdown Points Step Chart */}
        <div className="h-28 flex items-end justify-between gap-1 pt-4 px-2 border-b border-zinc-800/80">
          {drawdownPoints.map((pt, pIdx) => {
            const barHeight = Math.max(10, Math.min(100, (pt.drawdownPct / Math.max(1, maxDrawdownPct * 1.2)) * 100));
            return (
              <div key={pIdx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                <span className="text-[9px] text-zinc-500 opacity-0 group-hover:opacity-100 transition">
                  {pt.drawdownPct}%
                </span>
                <div
                  className={`w-full max-w-[28px] rounded-t transition-all ${
                    pt.drawdownPct > 5
                      ? 'bg-rose-500'
                      : pt.drawdownPct > 2
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ height: `${barHeight}%` }}
                />
                <span className="text-[9px] text-zinc-500 truncate max-w-[40px]">{pt.date}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
