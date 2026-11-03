import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  RefreshCw,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import type { PriceChangeDistributionState, DistributionBucket, ExchangeConfig } from '../types/index.js';

interface PriceChangeDistributionViewProps {
  distribution: PriceChangeDistributionState | null;
  config: ExchangeConfig;
  onRefresh: () => Promise<void>;
  onNavigateToSettings: () => void;
}

export const PriceChangeDistributionView: React.FC<PriceChangeDistributionViewProps> = ({
  distribution,
  config,
  onRefresh,
  onNavigateToSettings,
}) => {
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!distribution) {
    return (
      <div className="bg-[#101622] border border-zinc-800 rounded-2xl p-8 text-center space-y-3 font-mono text-xs max-w-5xl mx-auto">
        <Activity className="w-8 h-8 text-cyan-400 mx-auto animate-spin" />
        <h3 className="text-zinc-200 font-bold">Connecting to Delta Exchange Market Distribution...</h3>
        <p className="text-zinc-500">Calculating 24-hour price change distribution across listed futures contracts.</p>
      </div>
    );
  }

  const {
    totalCoins,
    positiveCoins,
    negativeCoins,
    neutralCoins,
    bullishRatio,
    bearishRatio,
    marketRegime,
    regimeLabel,
    regimeAdvice,
    buckets = [],
    relativeStrengthCoins = [],
    relativeWeaknessCoins = [],
    updatedAt,
  } = distribution;

  const activeBucket = selectedBucketIndex !== null ? buckets[selectedBucketIndex] : null;

  // Bot Breadth Clearance Status
  const isPcdEnabled = config.pcdEnabled ?? true;
  const isBreadthFilter = config.pcdBreadthFilterEnabled ?? true;
  const isChopProtection = config.pcdChopProtectionEnabled ?? true;

  const longAllowed = !isBreadthFilter || bullishRatio >= (config.pcdMinBullishRatioForLongs ?? 40);
  const shortAllowed = !isBreadthFilter || bearishRatio >= (config.pcdMaxBearishRatioForShorts ?? 40);

  return (
    <div className="space-y-5 max-w-6xl mx-auto font-mono text-xs">
      {/* 1. Header Banner */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <BarChart3 className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-zinc-100 tracking-wide">
              Price Change Distribution & Market Breadth Intelligence
            </h2>
            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
              isPcdEnabled
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              {isPcdEnabled ? '🤖 PCD BOT GATING ACTIVE' : 'PCD PAUSED'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Real-time statistical breadth across {totalCoins} Delta Exchange contracts. Filters out fake pump traps and gates high-conviction 1:5 setups.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition font-bold text-[11px]"
            title="Refresh market distribution"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Scanning...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToSettings}
            className="px-3 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 flex items-center gap-1.5 transition font-bold text-[11px]"
            title="Open PCD settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>PCD Settings</span>
          </button>
        </div>
      </div>

      {/* 2. Key Market Breadth Indicators Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Listed Coins */}
        <div className="bg-[#0b0f17] p-3.5 rounded-xl border border-zinc-800/80 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Total Universe</span>
          <div className="text-xl font-bold text-zinc-100 flex items-baseline gap-1.5">
            <span>{totalCoins}</span>
            <span className="text-[11px] text-zinc-500 font-normal">Contracts</span>
          </div>
          <span className="text-[10px] text-zinc-400">Delta perpetual & futures</span>
        </div>

        {/* Green Coins / Bullish Ratio */}
        <div className="bg-[#0b0f17] p-3.5 rounded-xl border border-emerald-950/60 space-y-1">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider block">Green Coins (Bullish)</span>
          <div className="text-xl font-bold text-emerald-400 flex items-baseline gap-1.5">
            <span>{positiveCoins}</span>
            <span className="text-sm font-semibold">({bullishRatio}%)</span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-400 h-full rounded-full transition-all" style={{ width: `${bullishRatio}%` }} />
          </div>
        </div>

        {/* Red Coins / Bearish Ratio */}
        <div className="bg-[#0b0f17] p-3.5 rounded-xl border border-rose-950/60 space-y-1">
          <span className="text-[10px] text-rose-400 uppercase tracking-wider block">Red Coins (Bearish)</span>
          <div className="text-xl font-bold text-rose-400 flex items-baseline gap-1.5">
            <span>{negativeCoins}</span>
            <span className="text-sm font-semibold">({bearishRatio}%)</span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-rose-400 h-full rounded-full transition-all" style={{ width: `${bearishRatio}%` }} />
          </div>
        </div>

        {/* Current Regime */}
        <div className="bg-[#0b0f17] p-3.5 rounded-xl border border-zinc-800/80 space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Market Regime</span>
          <div className="text-xs font-bold text-cyan-300 truncate" title={regimeLabel}>
            {regimeLabel}
          </div>
          <span className="text-[10px] text-zinc-400 block truncate" title={regimeAdvice}>
            {regimeAdvice}
          </span>
        </div>
      </div>

      {/* 3. Bot Gating Clearance Status Bar */}
      <div className="bg-[#0b0f17] p-3.5 rounded-xl border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span className="text-zinc-200 font-bold">Bot Gating Enforcement:</span>
          <span className="text-zinc-400">
            {isPcdEnabled ? 'Active Confluence Layer' : 'Disabled (Trades not filtered by breadth)'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Long Permission */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Longs (BUY):</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              longAllowed ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}>
              {longAllowed ? '✓ Cleared' : '⛔ Gated (Breadth < 40%)'}
            </span>
          </div>

          {/* Short Permission */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Shorts (SELL):</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              shortAllowed ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}>
              {shortAllowed ? '✓ Cleared' : '⛔ Gated (Breadth < 40%)'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Interactive 7-Bracket Distribution Histogram */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-zinc-100">
              24-Hour Price Change Distribution (7 Institutional Brackets)
            </h3>
          </div>
          <span className="text-[10px] text-zinc-500">
            Click any bar to inspect constituent coins & volumes
          </span>
        </div>

        {/* Visual Histogram Bars */}
        <div className="space-y-3 pt-2">
          {buckets.map((bucket, idx) => {
            const isSelected = selectedBucketIndex === idx;
            const maxPercent = Math.max(...buckets.map((b) => b.percent), 1);
            const relativeBarWidth = Math.max(8, (bucket.percent / maxPercent) * 100);

            return (
              <div
                key={bucket.range}
                onClick={() => setSelectedBucketIndex(isSelected ? null : idx)}
                className={`p-2.5 rounded-xl border transition cursor-pointer space-y-1.5 ${
                  isSelected
                    ? 'bg-zinc-800/80 border-cyan-500 shadow-md'
                    : 'bg-[#0b0f17] border-zinc-800 hover:border-zinc-700 hover:bg-[#0e1420]'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: bucket.color }}
                    />
                    <span className="font-bold text-zinc-200">{bucket.range}</span>
                    <span className="text-[10px] text-zinc-500">
                      ({bucket.count} coins)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-zinc-100">{bucket.percent}%</span>
                    <span className="text-[10px] text-zinc-400">
                      {isSelected ? '▲ Hide' : '▼ View Coins'}
                    </span>
                  </div>
                </div>

                {/* Bar representation */}
                <div className="w-full bg-zinc-900/80 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${relativeBarWidth}%`,
                      backgroundColor: bucket.color,
                    }}
                  />
                </div>

                {/* Expanded Coin List if selected */}
                {isSelected && (
                  <div className="pt-2 border-t border-zinc-800/80 mt-2 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold">
                      <span>COIN & 24H CHANGE</span>
                      <span>24H VOLUME</span>
                    </div>
                    {bucket.coins.length === 0 ? (
                      <div className="text-zinc-500 text-[11px] py-1 text-center">No coins currently in this range.</div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {bucket.coins.map((c) => (
                          <div
                            key={c.symbol}
                            className="p-1.5 rounded bg-[#070a10] border border-zinc-800 flex items-center justify-between text-[11px]"
                          >
                            <span className="font-bold text-zinc-200 truncate">{c.symbol}</span>
                            <span
                              className={`font-mono font-bold ${
                                c.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {c.change24h >= 0 ? `+${c.change24h.toFixed(1)}%` : `${c.change24h.toFixed(1)}%`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Relative Strength & Relative Weakness Leaders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Relative Strength Leaders Radar */}
        <div className="bg-[#101622] border border-emerald-950/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-emerald-300">
                Relative Strength Leaders (Long Outliers)
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
              {relativeStrengthCoins.length} Leaders
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Coins exhibiting institutional accumulation that defy general market pressure. Highest probability for 1:5 asymmetric long targets.
          </p>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {relativeStrengthCoins.length === 0 ? (
              <div className="text-zinc-500 py-4 text-center text-xs">
                No strong relative strength outliers currently detected.
              </div>
            ) : (
              relativeStrengthCoins.map((coin) => (
                <div
                  key={coin.symbol}
                  className="p-2.5 rounded-xl bg-[#0b0f17] border border-emerald-900/50 space-y-1 hover:border-emerald-600 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-100">{coin.symbol}</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">
                      +{coin.change24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-300/80 leading-relaxed font-mono">
                    {coin.reason}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Relative Weakness Laggards Radar */}
        <div className="bg-[#101622] border border-rose-950/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold text-rose-300">
                Relative Weakness Laggards (Short Outliers)
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
              {relativeWeaknessCoins.length} Laggards
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Coins showing severe institutional distribution. High risk for long wicks; favored for 1:5 short setups.
          </p>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {relativeWeaknessCoins.length === 0 ? (
              <div className="text-zinc-500 py-4 text-center text-xs">
                No extreme downside laggards currently detected.
              </div>
            ) : (
              relativeWeaknessCoins.map((coin) => (
                <div
                  key={coin.symbol}
                  className="p-2.5 rounded-xl bg-[#0b0f17] border border-rose-900/50 space-y-1 hover:border-rose-600 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-100">{coin.symbol}</span>
                    <span className="font-mono font-bold text-rose-400 text-xs">
                      {coin.change24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-rose-300/80 leading-relaxed font-mono">
                    {coin.reason}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
