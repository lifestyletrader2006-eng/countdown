import React, { useState, useMemo } from 'react';
import {
  History,
  TrendingUp,
  TrendingDown,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Shield,
  Target,
  Clock,
  Sparkles,
  Info,
  Download,
  Calendar,
  Zap,
  Bot,
  Layers,
  X,
  ChevronRight,
  ChevronDown,
  DollarSign,
  Activity,
  AlertCircle,
  Brain,
  ArrowLeftRight,
  Check,
  Award,
  PieChart,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import type { SetupHistoryRecord } from '../types/index.js';

interface SetupHistoryViewProps {
  history: SetupHistoryRecord[];
  onClearHistory: () => Promise<void>;
  onInspectForensics?: (symbol: string) => void;
  onOpenAIForensics?: (record: SetupHistoryRecord) => void;
}

export const SetupHistoryView: React.FC<SetupHistoryViewProps> = ({
  history,
  onClearHistory,
  onInspectForensics,
  onOpenAIForensics,
}) => {
  // Filters State
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | '7DAYS' | '30DAYS'>('ALL');
  const [selectedCoin, setSelectedCoin] = useState<string>('ALL');
  const [tradeTypeFilter, setTradeTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sideChangeFilter, setSideChangeFilter] = useState<'ALL' | 'ON' | 'OFF'>('ALL');
  const [executionModeFilter, setExecutionModeFilter] = useState<'ALL' | 'EXCHANGE_LIVE' | 'BOT_VIRTUAL'>('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState<string>('ALL');
  const [currencySymbol, setCurrencySymbol] = useState<'₹' | '$'>('₹');
  const [usdToInrRate] = useState<number>(86.5); // standard conversion multiplier

  // Right sidebar view mode
  const [timeframeOverview, setTimeframeOverview] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');

  // Interactive selected trade for Expanded View
  const [selectedTrade, setSelectedTrade] = useState<SetupHistoryRecord | null>(null);
  const [expandedViewOpen, setExpandedViewOpen] = useState(true);
  const [expandedActiveTab, setExpandedActiveTab] = useState<'LOGS' | 'SETUP' | 'RESPONSE'>('LOGS');

  // Confirmation modal
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  // Available coins from history
  const uniqueCoins = useMemo(() => {
    const set = new Set<string>();
    history.forEach((h) => {
      if (h.coin) set.add(h.coin);
    });
    return Array.from(set).sort();
  }, [history]);

  // Date filtering logic
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  // Deduplicated and filtered list
  const filteredHistory = useMemo(() => {
    const seen = new Set<string>();
    const deduplicated: SetupHistoryRecord[] = [];

    // Prioritize richer records
    const sorted = [...history].sort((a, b) => {
      const aReal = Boolean(a.tradeId || a.orderId);
      const bReal = Boolean(b.tradeId || b.orderId);
      if (aReal && !bReal) return -1;
      if (!aReal && bReal) return 1;
      return new Date(b.openedAt || b.timestamp).getTime() - new Date(a.openedAt || a.timestamp).getTime();
    });

    for (const h of sorted) {
      const tf = h.timeframe || '15m';
      const openTimeKey = (h.openedAt || h.timestamp || '').slice(0, 16);
      const key = h.tradeId
        ? `TR_${h.tradeId}`
        : h.orderId
        ? `ORD_${h.orderId}`
        : `${h.coin}_${tf}_${openTimeKey}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push({
          ...h,
          timeframe: tf,
        });
      }
    }

    return deduplicated.filter((h) => {
      // Coin Filter
      if (selectedCoin !== 'ALL' && h.coin !== selectedCoin) return false;

      // Status Filter
      if (statusFilter !== 'ALL') {
        const itemOutcome = h.closeReason || h.outcome;
        if (statusFilter === 'TP HIT' && itemOutcome !== 'TP HIT') return false;
        if (statusFilter === 'SL HIT' && itemOutcome !== 'SL HIT') return false;
        if (statusFilter === 'MANUAL CLOSE' && itemOutcome !== 'MANUAL CLOSE' && itemOutcome !== 'CLOSED') return false;
        if (statusFilter === 'LIQUIDATED' && itemOutcome !== 'LIQUIDATED') return false;
      }

      // Side Change Filter
      const isSideChanged = Boolean(h.sideChangeEnabled || h.isSideChangedOrder);
      if (sideChangeFilter === 'ON' && !isSideChanged) return false;
      if (sideChangeFilter === 'OFF' && isSideChanged) return false;

      // Execution Mode Filter (Exchange Live vs Bot Virtual)
      if (executionModeFilter !== 'ALL') {
        const isBot = h.executionType === 'BOT_VIRTUAL' || h.orderType === 'BOT' || h.executionMode === 'BOT_SIMULATED' || String(h.orderId || '').startsWith('BOT_VIRTUAL');
        if (executionModeFilter === 'BOT_VIRTUAL' && !isBot) return false;
        if (executionModeFilter === 'EXCHANGE_LIVE' && isBot) return false;
      }

      // Timeframe Filter
      if (timeframeFilter !== 'ALL') {
        if ((h.timeframe || '15m') !== timeframeFilter) return false;
      }

      // Date Range Filter
      if (dateRangeFilter !== 'ALL') {
        const itemDate = (h.closedAt || h.openedAt || h.timestamp || '').split('T')[0];
        if (dateRangeFilter === 'TODAY' && itemDate !== todayStr) return false;
        if (dateRangeFilter === 'YESTERDAY' && itemDate !== yesterdayStr) return false;
        if (dateRangeFilter === '7DAYS') {
          const itemTime = new Date(h.openedAt || h.timestamp).getTime();
          if (Date.now() - itemTime > 7 * 86400000) return false;
        }
        if (dateRangeFilter === '30DAYS') {
          const itemTime = new Date(h.openedAt || h.timestamp).getTime();
          if (Date.now() - itemTime > 30 * 86400000) return false;
        }
      }

      return true;
    });
  }, [history, selectedCoin, statusFilter, sideChangeFilter, executionModeFilter, timeframeFilter, dateRangeFilter, todayStr, yesterdayStr]);

  // Aggregate Metrics
  const stats = useMemo(() => {
    const total = filteredHistory.length;
    const wins = filteredHistory.filter((h) => (h.realizedPnl || 0) > 0);
    const losses = filteredHistory.filter((h) => (h.realizedPnl || 0) < 0);
    const breakevens = filteredHistory.filter((h) => (h.realizedPnl || 0) === 0);

    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = total > 0 ? Math.round((winCount / total) * 100) : 0;

    const totalPnlUsd = filteredHistory.reduce((sum, h) => sum + (h.realizedPnl || 0), 0);
    const totalPnl = currencySymbol === '₹' ? totalPnlUsd * usdToInrRate : totalPnlUsd;

    const totalWinPnlUsd = wins.reduce((sum, h) => sum + (h.realizedPnl || 0), 0);
    const avgWinUsd = winCount > 0 ? totalWinPnlUsd / winCount : 0;
    const avgWin = currencySymbol === '₹' ? avgWinUsd * usdToInrRate : avgWinUsd;

    const totalLossPnlUsd = Math.abs(losses.reduce((sum, h) => sum + (h.realizedPnl || 0), 0));
    const avgLossUsd = lossCount > 0 ? totalLossPnlUsd / lossCount : 0;
    const avgLoss = currencySymbol === '₹' ? avgLossUsd * usdToInrRate : avgLossUsd;

    return {
      total,
      winCount,
      lossCount,
      breakevenCount: breakevens.length,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
    };
  }, [filteredHistory, currencySymbol, usdToInrRate]);

  // Coin performance breakdown for right sidebar
  const coinBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; wins: number; pnl: number }>();
    filteredHistory.forEach((h) => {
      const cur = map.get(h.coin) || { total: 0, wins: 0, pnl: 0 };
      cur.total += 1;
      if ((h.realizedPnl || 0) > 0) cur.wins += 1;
      cur.pnl += h.realizedPnl || 0;
      map.set(h.coin, cur);
    });
    return Array.from(map.entries())
      .map(([coin, data]) => ({
        coin,
        total: data.total,
        winRate: Math.round((data.wins / data.total) * 100),
        pnl: currencySymbol === '₹' ? data.pnl * usdToInrRate : data.pnl,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filteredHistory, currencySymbol, usdToInrRate]);

  // Format currency helper
  const formatMoney = (amount: number, showSign = true) => {
    const isPos = amount >= 0;
    const sign = showSign ? (isPos ? '+' : '') : '';
    const formatted = Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}${currencySymbol}${formatted}`;
  };

  // 1-Click Clear History Handler
  const handleClear = async () => {
    setIsClearing(true);
    try {
      await onClearHistory();
      setShowConfirmClear(false);
      setSelectedTrade(null);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 3000);
    } finally {
      setIsClearing(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredHistory.length === 0) return;
    const headers = [
      '#',
      'Coin',
      'Setup Side',
      'Side Change',
      'Order Side',
      'Entry Price',
      'Exit Price',
      'TP',
      'SL',
      'Lot Size',
      'PNL ($)',
      'PNL (Converted)',
      'Status',
      'Close Reason',
      'Date & Time',
      'Why Formed',
      'PCD Reason',
    ];

    const rows = filteredHistory.map((h, i) => {
      const isSideChanged = Boolean(h.sideChangeEnabled || h.isSideChangedOrder);
      const orderSide = h.isSideChangedOrder
        ? (h.direction === 'BUY/LONG' ? 'SELL' : 'BUY')
        : (h.direction === 'BUY/LONG' ? 'BUY' : 'SELL');
      const convPnl = currencySymbol === '₹' ? (h.realizedPnl || 0) * usdToInrRate : (h.realizedPnl || 0);

      return [
        i + 1,
        `"${h.coin}"`,
        `"${h.direction}"`,
        `"${isSideChanged ? 'ON' : 'OFF'}"`,
        `"${orderSide}"`,
        h.entryPrice,
        h.exitPrice || h.tp1,
        h.tp1,
        h.sl,
        h.capitalUsed || 1,
        h.realizedPnl || 0,
        convPnl.toFixed(2),
        `"${h.outcome}"`,
        `"${h.closeReason || h.outcome}"`,
        `"${h.openedAt || h.timestamp}"`,
        `"${(h.whyFormed || h.primaryReason || '').replace(/"/g, '""')}"`,
        `"${(h.pcdReason || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Trade_History_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0d131f] p-4 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">Trade History</h1>
            <p className="text-xs text-zinc-400">
              View your complete trade history with advanced analytics and detailed records
            </p>
          </div>
        </div>

        {/* Currency Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-mono">Currency:</span>
          <div className="flex items-center bg-[#090d16] p-1 rounded-lg border border-zinc-800 text-xs font-mono font-bold">
            <button
              onClick={() => setCurrencySymbol('₹')}
              className={`px-2.5 py-1 rounded transition ${
                currencySymbol === '₹' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ₹ INR
            </button>
            <button
              onClick={() => setCurrencySymbol('$')}
              className={`px-2.5 py-1 rounded transition ${
                currencySymbol === '$' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              $ USD
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar (Matching screenshot controls) */}
      <div className="bg-[#0d131f] p-3 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range filter */}
          <select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value as any)}
            className="bg-[#111928] border border-zinc-700/80 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Time Dates</option>
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="7DAYS">Last 7 Days</option>
            <option value="30DAYS">Last 30 Days</option>
          </select>

          {/* All Coins */}
          <select
            value={selectedCoin}
            onChange={(e) => setSelectedCoin(e.target.value)}
            className="bg-[#111928] border border-zinc-700/80 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Coins</option>
            {uniqueCoins.map((coin) => (
              <option key={coin} value={coin}>
                {coin}
              </option>
            ))}
          </select>

          {/* All Trade Types */}
          <select
            value={tradeTypeFilter}
            onChange={(e) => setTradeTypeFilter(e.target.value)}
            className="bg-[#111928] border border-zinc-700/80 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Trade Types</option>
            <option value="FUTURES">Futures</option>
            <option value="OPTIONS">Options</option>
            <option value="ARBITRAGE">Arbitrage</option>
          </select>

          {/* All Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#111928] border border-zinc-700/80 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Status</option>
            <option value="TP HIT">TP Hit</option>
            <option value="SL HIT">SL Hit</option>
            <option value="MANUAL CLOSE">Manual Close</option>
            <option value="LIQUIDATED">Liquidated</option>
          </select>

          {/* Timeframe Filter */}
          <select
            value={timeframeFilter}
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className="bg-[#111928] border border-zinc-700/80 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-bold"
          >
            <option value="ALL">All Timeframes</option>
            <option value="15m">15m Timeframe</option>
            <option value="30m">30m Timeframe</option>
            <option value="1h">1h Timeframe</option>
            <option value="4h">4h Timeframe</option>
            <option value="1d">1d Timeframe</option>
          </select>

          {/* Execution Mode Filter */}
          <select
            value={executionModeFilter}
            onChange={(e) => setExecutionModeFilter(e.target.value as any)}
            className="bg-[#111928] border border-zinc-700/80 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-bold"
          >
            <option value="ALL">All Execution Modes</option>
            <option value="EXCHANGE_LIVE">Exchange Live (Delta Real)</option>
            <option value="BOT_VIRTUAL">Bot Order (Virtual/Paper)</option>
          </select>

          {/* All Side Change */}
          <select
            value={sideChangeFilter}
            onChange={(e) => setSideChangeFilter(e.target.value as any)}
            className="bg-[#111928] border border-amber-600/60 text-amber-300 font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400"
          >
            <option value="ALL">All Side Change</option>
            <option value="ON">Side Change: ON (Inverted)</option>
            <option value="OFF">Side Change: OFF (Normal)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Export to CSV */}
          <button
            onClick={handleExportCsv}
            disabled={filteredHistory.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold transition disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>

          {/* 1-Click Clear All History Button */}
          <button
            onClick={() => setShowConfirmClear(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-lg shadow-rose-950/40"
            title="1-Click Clear All History from database and dashboard"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All History</span>
          </button>
        </div>
      </div>

      {clearSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-600 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>All saved trade history cleared successfully from database and Status Dashboard!</span>
        </div>
      )}

      {/* Top 5 Stat Metric Cards (Matching screenshot style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono">
        {/* Card 1: Total Trades */}
        <div className="bg-[#0d131f] p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Total Trades</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
              <ArrowUpRight className="w-3 h-3" />
              <span>{stats.total > 0 ? '100%' : '0%'}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Profit / Loss */}
        <div className="bg-[#0d131f] p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Total Profit / Loss</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatMoney(stats.totalPnl)}
            </div>
            <div className={`text-[11px] flex items-center gap-1 mt-0.5 ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{stats.totalPnl >= 0 ? 'Profitable' : 'Drawdown'}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Win Rate */}
        <div className="bg-[#0d131f] p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Win Rate</span>
            <div className="w-7 h-7 rounded-lg bg-purple-950/60 border border-purple-800/80 flex items-center justify-center text-purple-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-white">{stats.winRate}%</div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
              <span>{stats.winCount}W / {stats.lossCount}L</span>
            </div>
          </div>
        </div>

        {/* Card 4: Avg. Profit (Winning) */}
        <div className="bg-[#0d131f] p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Avg. Profit (Winning)</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-emerald-400">{formatMoney(stats.avgWin, false)}</div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
              <ArrowUpRight className="w-3 h-3" />
              <span>Target 1:5 Hit</span>
            </div>
          </div>
        </div>

        {/* Card 5: Avg. Loss (Losing) */}
        <div className="bg-[#0d131f] p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Avg. Loss (Losing)</span>
            <div className="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-rose-400">{formatMoney(stats.avgLoss, false)}</div>
            <div className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5">
              <ArrowDownRight className="w-3 h-3" />
              <span>Capital Preserved</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Left Main Table (72%) + Right Sidebar (28%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (Table & Expanded View) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Complete Trade History Table */}
          <div className="bg-[#0d131f] border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-zinc-100 text-sm">Complete Trade History</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {filteredHistory.length} Trades
                </span>
              </div>
              <span className="text-zinc-500 text-xs font-mono">Click any row to view expanded details</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs text-zinc-300">
                <thead className="bg-[#090e18] text-[10.5px] uppercase text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Coin & Timeframe</th>
                    <th className="py-2.5 px-3">Execution Mode</th>
                    <th className="py-2.5 px-3">Side Change</th>
                    <th className="py-2.5 px-3">Direction</th>
                    <th className="py-2.5 px-3">Entry / Fill</th>
                    <th className="py-2.5 px-3">Exit Price</th>
                    <th className="py-2.5 px-3">Target TP</th>
                    <th className="py-2.5 px-3">Stop Loss</th>
                    <th className="py-2.5 px-3">PNL ($ / %)</th>
                    <th className="py-2.5 px-3">Outcome</th>
                    <th className="py-2.5 px-3 text-right">Closed At</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-16 text-center text-zinc-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <History className="w-8 h-8 text-zinc-600" />
                          <p className="font-semibold text-zinc-400">No trade history available</p>
                          <p className="text-xs text-zinc-600">Your completed trades will appear here once you start trading.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((h, idx) => {
                      const isSelected = selectedTrade?.id === h.id;
                      const isWin = (h.realizedPnl || 0) >= 0;
                      const isSideChanged = Boolean(h.sideChangeEnabled || h.isSideChangedOrder);
                      const isLongSetup = h.direction === 'BUY/LONG' || h.direction.includes('BUY');
                      const orderSide = isSideChanged ? (isLongSetup ? 'SELL' : 'BUY') : (isLongSetup ? 'BUY' : 'SELL');
                      const convPnl = currencySymbol === '₹' ? (h.realizedPnl || 0) * usdToInrRate : (h.realizedPnl || 0);
                      const isVirtual = h.executionType === 'BOT_VIRTUAL' || h.orderType === 'BOT' || h.executionMode === 'BOT_SIMULATED' || String(h.orderId || '').startsWith('BOT_VIRTUAL');

                      return (
                        <tr
                          key={h.id}
                          onClick={() => {
                            setSelectedTrade(h);
                            setExpandedViewOpen(true);
                          }}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-blue-950/40 border-l-4 border-l-blue-500'
                              : 'hover:bg-zinc-800/30'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-white text-xs">{h.coin}</span>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-extrabold bg-amber-950 text-amber-300 border border-amber-700/80 shadow-sm">
                                <Clock className="w-2.5 h-2.5 text-amber-400" />
                                {h.timeframe || '15m'}
                              </span>
                            </div>
                            <div className="text-[9.5px] text-zinc-500 font-mono truncate max-w-[130px]">
                              {h.orderId || h.tradeId}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {isVirtual ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                  <Bot className="w-3 h-3 text-purple-400" />
                                  BOT ORDER
                                </span>
                                {h.orderNotPlacedReason ? (
                                  <div className="text-[9px] text-rose-400 truncate max-w-[130px] font-sans" title={h.orderNotPlacedReason}>
                                    {h.orderNotPlacedReason}
                                  </div>
                                ) : (
                                  <span className="text-[9px] text-purple-400/80 block">Paper Simulated</span>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  <Zap className="w-3 h-3 text-emerald-400" />
                                  EXCHANGE LIVE
                                </span>
                                <span className="text-[9px] text-emerald-400/80 block font-semibold">Active on Delta</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isSideChanged ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600">
                                  <ArrowLeftRight className="w-2.5 h-2.5 text-amber-400" />
                                  <span>ON ({h.sideChangeSlSetting || 'SL'})</span>
                                </span>
                                <div className="text-[9.5px] text-zinc-400">
                                  <span className="line-through text-zinc-500">{isLongSetup ? 'BUY' : 'SELL'}</span> &rarr; <strong className="text-amber-300">{orderSide}</strong>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                                  OFF (Normal)
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                orderSide === 'BUY'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {orderSide} {h.leverage ? `${h.leverage}x` : '10x'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-200">${h.actualFillPrice || h.entryPrice}</td>
                          <td className="py-2.5 px-3 text-zinc-200">${h.exitPrice || h.tp1}</td>
                          <td className="py-2.5 px-3 text-emerald-400 font-bold">${h.tp1}</td>
                          <td className="py-2.5 px-3 text-rose-400 font-bold">${h.sl}</td>
                          <td className="py-2.5 px-3">
                            <span className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatMoney(convPnl)}
                            </span>
                            <span className="text-[10px] text-zinc-400 block font-normal">
                              {h.pnlPercent ? `${h.pnlPercent >= 0 ? '+' : ''}${h.pnlPercent}%` : ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="space-y-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                  h.outcome === 'TP HIT'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : h.outcome === 'SL HIT'
                                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                    : 'bg-zinc-800 text-zinc-300'
                                }`}
                              >
                                {h.outcome === 'TP HIT' && <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />}
                                {h.outcome === 'SL HIT' && <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                                <span>{h.closeReason || h.outcome}</span>
                              </span>
                              <div className="text-[9.5px] text-zinc-400">
                                {h.exitPrice ? `@ $${h.exitPrice}` : ''}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="text-zinc-300 font-bold text-[11px]">{h.durationFormatted || `${h.durationMinutes || 1}m`}</div>
                            <div className="text-zinc-500 text-[10px]">
                              {new Date(h.closedAt || h.timestamp).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTrade(h);
                                setExpandedViewOpen(true);
                              }}
                              className="px-2.5 py-1 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/80 text-[10.5px] font-mono transition inline-flex items-center gap-1 shadow-sm"
                              title="Inspect full forensic breakdown, side change contrast, and logs"
                            >
                              <Info className="w-3 h-3 text-blue-400" />
                              <span>Details</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trade Details (Expanded View) - Exact 5 cards + 3 tabs from image */}
          <div className="bg-[#0d131f] border border-zinc-800 rounded-xl overflow-hidden shadow-xl font-mono text-xs">
            <div
              onClick={() => setExpandedViewOpen(!expandedViewOpen)}
              className="p-4 border-b border-zinc-800 flex items-center justify-between cursor-pointer hover:bg-zinc-800/30 transition select-none"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-zinc-100 text-sm">Trade Details (Expanded View)</h3>
                {selectedTrade && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-700 font-bold">
                    {selectedTrade.coin} &bull; {selectedTrade.outcome}
                  </span>
                )}
              </div>
              <button className="text-zinc-400 hover:text-white">
                {expandedViewOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>

            {expandedViewOpen && (
              <div className="p-5 space-y-5">
                {!selectedTrade ? (
                  <div className="py-12 text-center text-zinc-500 space-y-2">
                    <Info className="w-8 h-8 mx-auto text-zinc-600" />
                    <p className="font-bold text-zinc-400">No trade selected</p>
                    <p className="text-xs text-zinc-600 max-w-md mx-auto">
                      Click any row in the Complete Trade History table above to inspect the complete trade details, price movement, and side change breakdown.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 5 Cards Row (Matching image layout) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {/* Card 1: Trade Information */}
                      <div className="p-3.5 bg-[#090e18] rounded-xl border border-zinc-800 space-y-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold pb-1 border-b border-zinc-800">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          <span>Trade Information</span>
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-zinc-500">Coin</span><strong className="text-white">{selectedTrade.coin}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Timeframe</span><strong className="text-amber-300 font-bold">{selectedTrade.timeframe || '15m'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Setup Side</span><strong className="text-emerald-400">{selectedTrade.direction}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Side Change</span><strong className={selectedTrade.isSideChangedOrder ? 'text-amber-400' : 'text-zinc-400'}>{selectedTrade.isSideChangedOrder ? 'ON' : 'OFF'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Order Side</span><strong className="text-white">{selectedTrade.isSideChangedOrder ? (selectedTrade.direction.includes('BUY') ? 'SELL' : 'BUY') : selectedTrade.direction}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Execution</span><strong className={selectedTrade.executionType === 'BOT_VIRTUAL' ? 'text-purple-400' : 'text-emerald-400'}>{selectedTrade.executionType === 'BOT_VIRTUAL' ? 'BOT ORDER' : 'EXCHANGE LIVE'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Trade Type</span><strong className="text-zinc-300">Futures</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Leverage</span><strong className="text-zinc-300">{selectedTrade.leverage || 10}x</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">SL Setting</span><strong className="text-amber-300">{selectedTrade.sideChangeSlSetting || 'SL'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Exchange Fill</span><strong className="text-zinc-200">${selectedTrade.actualFillPrice || selectedTrade.entryPrice}</strong></div>
                        </div>
                      </div>

                      {/* Card 2: Price Details */}
                      <div className="p-3.5 bg-[#090e18] rounded-xl border border-zinc-800 space-y-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold pb-1 border-b border-zinc-800">
                          <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Price Details</span>
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-zinc-500">Entry Price</span><strong className="text-white">${selectedTrade.actualFillPrice || selectedTrade.entryPrice}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Exit Price</span><strong className="text-white">${selectedTrade.exitPrice || selectedTrade.tp1}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Original TP</span><strong className="text-emerald-400">${selectedTrade.tp1}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Original SL</span><strong className="text-rose-400">${selectedTrade.sl}</strong></div>
                          {selectedTrade.isSideChangedOrder && (
                            <>
                              <div className="flex justify-between"><span className="text-zinc-500">Changed TP</span><strong className="text-emerald-400">${selectedTrade.sl}</strong></div>
                              <div className="flex justify-between"><span className="text-zinc-500">Changed SL</span><strong className="text-rose-400">${selectedTrade.tp1}</strong></div>
                            </>
                          )}
                          <div className="flex justify-between"><span className="text-zinc-500">Highest Price</span><strong className="text-zinc-300">${selectedTrade.highestPrice || Math.max(selectedTrade.entryPrice, selectedTrade.exitPrice || selectedTrade.entryPrice)}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Lowest Price</span><strong className="text-zinc-300">${selectedTrade.lowestPrice || Math.min(selectedTrade.entryPrice, selectedTrade.exitPrice || selectedTrade.entryPrice)}</strong></div>
                        </div>
                        <div className="p-2 rounded bg-[#050810] border border-zinc-800 text-[10px] text-zinc-400">
                          <div className="flex items-center justify-between text-zinc-300 font-semibold mb-0.5">
                            <span>Price Movement:</span>
                            <span className={((selectedTrade.exitPrice || selectedTrade.tp1) >= selectedTrade.entryPrice) ? 'text-emerald-400' : 'text-rose-400'}>
                              {Math.abs(Math.round((((selectedTrade.exitPrice || selectedTrade.tp1) - selectedTrade.entryPrice) / selectedTrade.entryPrice) * 10000) / 100)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card 3: Result & Performance */}
                      <div className="p-3.5 bg-[#090e18] rounded-xl border border-zinc-800 space-y-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold pb-1 border-b border-zinc-800">
                          <Award className="w-3.5 h-3.5 text-purple-400" />
                          <span>Result & Performance</span>
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">PNL</span>
                            <strong className={(selectedTrade.realizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {formatMoney(currencySymbol === '₹' ? (selectedTrade.realizedPnl || 0) * usdToInrRate : (selectedTrade.realizedPnl || 0))}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">PNL %</span>
                            <strong className={(selectedTrade.pnlPercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {selectedTrade.pnlPercent ? `${selectedTrade.pnlPercent}%` : '0%'}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Status</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              selectedTrade.outcome === 'TP HIT' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                            }`}>
                              {selectedTrade.outcome}
                            </span>
                          </div>
                          <div className="flex justify-between"><span className="text-zinc-500">Close Reason</span><strong className="text-zinc-300">{selectedTrade.closeReason || selectedTrade.outcome}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Duration</span><strong className="text-zinc-300">{selectedTrade.durationFormatted || '15m'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Commission</span><strong className="text-zinc-300">${selectedTrade.commission || 0.05}</strong></div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Net PNL</span>
                            <strong className={(selectedTrade.realizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {formatMoney(currencySymbol === '₹' ? (selectedTrade.realizedPnl || 0) * usdToInrRate : (selectedTrade.realizedPnl || 0))}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Card 4: Side Change Details */}
                      <div className="p-3.5 bg-[#090e18] rounded-xl border border-zinc-800 space-y-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold pb-1 border-b border-zinc-800">
                          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                          <span>Side Change Details</span>
                        </div>
                        {selectedTrade.isSideChangedOrder ? (
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between"><span className="text-zinc-500">Original Side</span><strong className="text-zinc-300">{selectedTrade.originalSide || selectedTrade.direction}</strong></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Changed Side</span><strong className="text-amber-400">{selectedTrade.changedSide || (selectedTrade.direction.includes('BUY') ? 'SELL/SHORT' : 'BUY/LONG')}</strong></div>
                            <div className="flex justify-between"><span className="text-zinc-500">New TP</span><strong className="text-emerald-400">${selectedTrade.sl}</strong></div>
                            <div className="flex justify-between"><span className="text-zinc-500">New SL</span><strong className="text-rose-400">${selectedTrade.tp1}</strong></div>
                            <div className="flex justify-between"><span className="text-zinc-500">SL Setting</span><strong className="text-amber-300">{selectedTrade.sideChangeSlSetting || 'SL'}</strong></div>

                            {selectedTrade.normalSetupSnapshot && (
                              <div className="p-2 rounded bg-[#070b13] border border-zinc-800 text-[10px] space-y-1">
                                <span className="text-zinc-400 font-bold block">Benchmark PnL Contrast:</span>
                                <div className="flex justify-between">
                                  <span>Exchange Order:</span>
                                  <strong className={(selectedTrade.realizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    ${(selectedTrade.realizedPnl || 0).toFixed(2)}
                                  </strong>
                                </div>
                                <div className="flex justify-between">
                                  <span>Normal Setup:</span>
                                  <strong className={(selectedTrade.normalSetupSnapshot.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    ${(selectedTrade.normalSetupSnapshot.pnl || 0).toFixed(2)}
                                  </strong>
                                </div>
                              </div>
                            )}

                            <div className="p-2 rounded bg-amber-950/30 border border-amber-800/60 mt-1">
                              <span className="text-amber-300 font-bold text-[10px] block">Side Change: ACTIVE</span>
                              <span className="text-zinc-400 text-[9.5px]">Both orders closed simultaneously upon exchange order completion.</span>
                            </div>
                          </div>
                        ) : (
                          <div className="py-6 text-center text-zinc-500 space-y-1">
                            <span className="text-zinc-400 font-bold block">Side Change: OFF</span>
                            <span className="text-[10px] text-zinc-500 block">This trade was executed directly on the original setup side.</span>
                          </div>
                        )}
                      </div>

                      {/* Card 5: Order Status */}
                      <div className="p-3.5 bg-[#090e18] rounded-xl border border-zinc-800 space-y-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold pb-1 border-b border-zinc-800">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Order Status</span>
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-zinc-500">Exchange Order</span><strong className="text-zinc-300 truncate max-w-[90px]">{selectedTrade.orderId || 'ORD_DELTA'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Bot Trade ID</span><strong className="text-zinc-300 truncate max-w-[90px]">{selectedTrade.tradeId || 'BOT_VIRTUAL'}</strong></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Status</span><span className="text-emerald-400 font-bold">{selectedTrade.outcome}</span></div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Execution</span>
                            <span className={selectedTrade.executionType === 'BOT_VIRTUAL' ? 'text-purple-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {selectedTrade.executionType === 'BOT_VIRTUAL' ? 'BOT ORDER (Paper)' : 'EXCHANGE LIVE'}
                            </span>
                          </div>
                        </div>

                        {selectedTrade.orderNotPlacedReason ? (
                          <div className="p-2 rounded bg-rose-950/40 border border-rose-800 text-[10px] text-rose-300 space-y-0.5">
                            <strong className="text-rose-400 block flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              <span>Exchange Order Not Placed:</span>
                            </strong>
                            <div className="line-clamp-3 leading-tight">{selectedTrade.orderNotPlacedReason}</div>
                          </div>
                        ) : (
                          <div className="p-2 rounded bg-[#050810] border border-zinc-800 text-[10px] text-zinc-400">
                            Order filled without errors on Delta Exchange.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom 3 Tabs: Trade Logs / Setup Details / Exchange Response */}
                    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-[#090e18]">
                      <div className="flex items-center gap-1 border-b border-zinc-800 bg-[#060a12] px-4 pt-2">
                        <button
                          onClick={() => setExpandedActiveTab('LOGS')}
                          className={`px-3 py-2 border-b-2 font-bold text-xs transition ${
                            expandedActiveTab === 'LOGS'
                              ? 'border-blue-500 text-blue-400'
                              : 'border-transparent text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Trade Logs
                        </button>
                        <button
                          onClick={() => setExpandedActiveTab('SETUP')}
                          className={`px-3 py-2 border-b-2 font-bold text-xs transition ${
                            expandedActiveTab === 'SETUP'
                              ? 'border-blue-500 text-blue-400'
                              : 'border-transparent text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Setup Details
                        </button>
                        <button
                          onClick={() => setExpandedActiveTab('RESPONSE')}
                          className={`px-3 py-2 border-b-2 font-bold text-xs transition ${
                            expandedActiveTab === 'RESPONSE'
                              ? 'border-blue-500 text-blue-400'
                              : 'border-transparent text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Exchange Response
                        </button>
                      </div>

                      <div className="p-4">
                        {expandedActiveTab === 'LOGS' && (
                          <div className="space-y-2">
                            {(selectedTrade.tradeLogs && selectedTrade.tradeLogs.length > 0 ? selectedTrade.tradeLogs : [
                              { time: selectedTrade.openedAt || selectedTrade.timestamp, event: 'Setup Created', details: `Setup formed for ${selectedTrade.coin} on ${selectedTrade.timeframe || '15m'}` },
                              { time: selectedTrade.openedAt || selectedTrade.timestamp, event: 'Trigger Detected', details: `Trigger level reached at $${selectedTrade.entryPrice}` },
                              { time: selectedTrade.openedAt || selectedTrade.timestamp, event: 'Order Submitted', details: `Submitted order to Delta Exchange` },
                              { time: selectedTrade.openedAt || selectedTrade.timestamp, event: 'Order Filled', details: `Order confirmed & filled at $${selectedTrade.actualFillPrice || selectedTrade.entryPrice}` },
                              { time: selectedTrade.closedAt || selectedTrade.timestamp, event: 'Position Closed', details: `Trade concluded: ${selectedTrade.outcome} at $${selectedTrade.exitPrice || selectedTrade.tp1}` },
                            ]).map((log, lIdx) => (
                              <div key={lIdx} className="flex items-start gap-2.5 text-[11px] p-2 rounded bg-[#0a0f1c] border border-zinc-800/80">
                                <span className="text-zinc-500 text-[10px] w-28 shrink-0">{new Date(log.time).toLocaleTimeString()}</span>
                                <span className="font-bold text-blue-400 w-36 shrink-0">{log.event}</span>
                                <span className="text-zinc-300">{log.details}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {expandedActiveTab === 'SETUP' && (
                          <div className="space-y-2 text-[11px]">
                            <div className="p-3 bg-[#0a0f1c] rounded border border-zinc-800">
                              <span className="text-zinc-400 font-bold block mb-1">Why Formed (Thesis):</span>
                              <p className="text-zinc-200 leading-relaxed">{selectedTrade.whyFormed || `${selectedTrade.coin} 1:5 Confluence Setup`}</p>
                            </div>
                            <div className="p-3 bg-[#0a0f1c] rounded border border-zinc-800">
                              <span className="text-zinc-400 font-bold block mb-1">PCD Reason:</span>
                              <p className="text-zinc-200 leading-relaxed">{selectedTrade.pcdReason || 'Passed Price Change Distribution breadth and relative strength filters.'}</p>
                            </div>
                          </div>
                        )}

                        {expandedActiveTab === 'RESPONSE' && (
                          <div className="p-3 bg-[#050810] rounded border border-zinc-800 text-[10.5px] font-mono text-zinc-300 overflow-x-auto">
                            <pre>{JSON.stringify(selectedTrade.exchangeResponse || {
                              status: 'FILLED',
                              order_id: selectedTrade.orderId,
                              coin: selectedTrade.coin,
                              direction: selectedTrade.direction,
                              side_change_active: Boolean(selectedTrade.isSideChangedOrder),
                              executed_at: selectedTrade.openedAt || selectedTrade.timestamp,
                              fill_price: selectedTrade.actualFillPrice || selectedTrade.entryPrice,
                              exit_price: selectedTrade.exitPrice || selectedTrade.tp1,
                              realized_pnl: selectedTrade.realizedPnl,
                            }, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Performance Overview & Analytics (Matching screenshot right sidebar) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Performance Overview Card */}
          <div className="bg-[#0d131f] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-zinc-100 text-sm">Performance Overview</h3>
              </div>

              {/* Daily / Weekly / Monthly Switch */}
              <div className="flex items-center bg-[#090d16] p-0.5 rounded-lg border border-zinc-800 text-[10px]">
                {(['Daily', 'Weekly', 'Monthly'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setTimeframeOverview(period)}
                    className={`px-2.5 py-1 rounded transition ${
                      timeframeOverview === period
                        ? 'bg-blue-600 text-white font-bold shadow'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {/* Circular Win Rate Indicator */}
            <div className="flex flex-col items-center justify-center p-4 bg-[#090e18] rounded-xl border border-zinc-800">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-zinc-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-blue-500"
                    strokeDasharray={`${stats.winRate}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-bold text-white">{stats.winRate}%</span>
                  <span className="text-[9px] text-zinc-400">Win Rate</span>
                </div>
              </div>

              {/* Status Breakdown Legend */}
              <div className="grid grid-cols-2 gap-3 w-full mt-4 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-zinc-400">Total Trades:</span>
                  <strong className="text-white ml-auto">{stats.total}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-zinc-400">Profitable:</span>
                  <strong className="text-emerald-400 ml-auto">{stats.winCount}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span className="text-zinc-400">Losses:</span>
                  <strong className="text-rose-400 ml-auto">{stats.lossCount}</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                  <span className="text-zinc-400">Breakeven:</span>
                  <strong className="text-zinc-300 ml-auto">{stats.breakevenCount}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Trade Type Distribution Card */}
          <div className="bg-[#0d131f] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
              <PieChart className="w-4 h-4 text-purple-400" />
              <h3 className="font-bold text-zinc-100 text-sm">Trade Type Distribution</h3>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Futures Trades</span>
                <span className="text-white font-bold">{stats.total}</span>
              </div>
              <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: '100%' }}></div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <span className="text-zinc-400">Side Changed (Opposite)</span>
                <span className="text-amber-400 font-bold">{filteredHistory.filter((h) => h.isSideChangedOrder).length}</span>
              </div>
              <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full"
                  style={{
                    width: stats.total > 0
                      ? `${(filteredHistory.filter((h) => h.isSideChangedOrder).length / stats.total) * 100}%`
                      : '0%',
                  }}
                ></div>
              </div>
            </div>
          </div>

          {/* Coin Performance Card */}
          <div className="bg-[#0d131f] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-zinc-100 text-sm">Coin Performance</h3>
            </div>

            {coinBreakdown.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs">No coin performance data available yet.</div>
            ) : (
              <div className="space-y-2">
                {coinBreakdown.map((c) => (
                  <div key={c.coin} className="p-2.5 rounded-lg bg-[#090e18] border border-zinc-800 flex items-center justify-between text-[11px]">
                    <div>
                      <strong className="text-white block">{c.coin}</strong>
                      <span className="text-zinc-500 text-[10px]">{c.total} trade(s) &bull; {c.winRate}% win</span>
                    </div>
                    <div className={`font-bold ${c.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatMoney(c.pnl)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal to Clear All History */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101622] border border-rose-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl font-mono">
            <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
              <Trash2 className="w-5 h-5" />
              <span>1-Click Clear All History Confirmation</span>
            </div>
            <div className="text-xs text-zinc-300 leading-relaxed space-y-2">
              <p>Kya aap sach me saara Trade History aur Setup History record delete karna chahte hain?</p>
              <div>
                <strong className="text-rose-400">Yeh action:</strong>
                <ul className="list-disc pl-5 mt-1 text-zinc-400 space-y-0.5">
                  <li>Trade History table ko turant clean kar dega.</li>
                  <li>Status Dashboard ke "Execution & Trade History" se bhi saara record wipe kar dega.</li>
                  <li>Database storage se bhi permanently delete kar dega.</li>
                </ul>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isClearing ? 'Clearing...' : 'Yes, Delete All History'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
