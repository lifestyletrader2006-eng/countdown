import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ShoppingCart,
  Edit3,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Check,
  X,
  AlertOctagon,
  LogOut,
  Download,
  Bot,
  Zap,
  Calendar,
  Filter,
  Clock,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRight,
  ArrowLeftRight,
  Trash2,
  Info,
  Sparkles,
  ExternalLink,
  HelpCircle,
  Sliders,
  Percent,
  Coins,
  Settings,
  Flame,
  ChevronDown,
  ChevronUp,
  Target,
} from 'lucide-react';
import type { TradeRecord, ExchangeConfig } from '../types/index.js';
import { PriceTransitionCell } from './PriceTransitionCell.js';

interface LiveOrdersViewProps {
  trades: TradeRecord[];
  config?: ExchangeConfig;
  onUpdateTpSl: (tradeId: string, newTp?: number, newSl?: number) => Promise<{ success: boolean; error?: string }>;
  onCloseTrade?: (tradeId: string, closeQuantity?: number, reason?: string) => Promise<{ success: boolean; isPartial?: boolean; trade?: TradeRecord; error?: string }>;
  onCloseAllTrades?: (filter?: 'ALL' | 'BOT_VIRTUAL' | 'EXCHANGE_LIVE') => Promise<{
    success: boolean;
    totalClosed?: number;
    exchangeClosed?: number;
    botClosed?: number;
    failed?: number;
    error?: string;
  }>;
  onClearTrades?: (options?: { date?: string; status?: 'ALL' | 'CLOSED_ONLY' }) => Promise<{ success: boolean; removed?: number; error?: string }>;
  onClearDay?: (date: string) => Promise<{ success: boolean; removedTrades?: number; removedHistory?: number; error?: string }>;
  onClearAllTrades?: (options?: { onlyClosed?: boolean }) => Promise<{ success: boolean; error?: string }>;
  onUpdateAutoCloseSettings?: (newSettings: {
    enabled?: boolean;
    profitPnlPercent?: number | null;
    lossPnlPercent?: number | null;
    lotMode?: 'ALL' | 'CUSTOM';
    lotSize?: number;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const LiveOrdersView: React.FC<LiveOrdersViewProps> = ({
  trades,
  config,
  onUpdateTpSl,
  onCloseTrade,
  onCloseAllTrades,
  onClearTrades,
  onClearDay,
  onClearAllTrades,
  onUpdateAutoCloseSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'OPEN' | 'TP HIT' | 'SL HIT' | 'CLOSED' | 'ALL'>('OPEN');
  const [executionFilter, setExecutionFilter] = useState<'ALL' | 'BOT_VIRTUAL' | 'EXCHANGE_LIVE' | 'SIDE_CHANGED'>('ALL');
  const [subView, setSubView] = useState<'ORDERS_TABLE' | 'SIDE_BY_SIDE' | 'DAY_BY_DAY'>(
    config?.sideChangeEnabled ? 'SIDE_BY_SIDE' : 'ORDERS_TABLE'
  );
  const [selectedDay, setSelectedDay] = useState<string>('ALL');

  // Reliable helper to identify if an order belongs to the Side Change feature
  const isTradeSideChanged = useCallback(
    (t: TradeRecord) => {
      if (t.isSideChangedOrder || t.sideChangeEnabled) return true;
      if (config?.sideChangeEnabled && t.status === 'OPEN') return true;
      return false;
    },
    [config?.sideChangeEnabled]
  );

  // Automatically switch view to Side Change terminal if Side Change is enabled in settings
  useEffect(() => {
    if (config?.sideChangeEnabled && subView === 'ORDERS_TABLE') {
      setSubView('SIDE_BY_SIDE');
    }
  }, [config?.sideChangeEnabled]);

  const [editingTrade, setEditingTrade] = useState<TradeRecord | null>(null);
  const [selectedTradeForDetails, setSelectedTradeForDetails] = useState<TradeRecord | null>(null);
  const [tradeToClose, setTradeToClose] = useState<TradeRecord | null>(null);
  const [showBulkCloseModal, setShowBulkCloseModal] = useState(false);
  const [bulkCloseFilter, setBulkCloseFilter] = useState<'ALL' | 'BOT_VIRTUAL' | 'EXCHANGE_LIVE'>('ALL');
  const [isBulkClosing, setIsBulkClosing] = useState(false);
  const [editTp, setEditTp] = useState('');
  const [editSl, setEditSl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [closeStatusMsg, setCloseStatusMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto Close Order on Exchange States
  const [autoCloseEnabled, setAutoCloseEnabled] = useState<boolean>(
    Boolean(config?.autoCloseOnExchangeEnabled)
  );
  const [autoCloseProfit, setAutoCloseProfit] = useState<number | null>(
    config?.autoCloseProfitPnlPercent ?? null
  );
  const [autoCloseLoss, setAutoCloseLoss] = useState<number | null>(
    config?.autoCloseLossPnlPercent ?? null
  );
  const [autoCloseLotMode, setAutoCloseLotMode] = useState<'ALL' | 'CUSTOM'>(
    config?.autoCloseLotMode || 'ALL'
  );
  const [autoCloseLotSize, setAutoCloseLotSize] = useState<number>(
    config?.autoCloseLotSize || 1
  );
  const [customProfitInput, setCustomProfitInput] = useState<string>('');
  const [customLossInput, setCustomLossInput] = useState<string>('');
  const [customLotInput, setCustomLotInput] = useState<string>('');
  const [isSavingAutoClose, setIsSavingAutoClose] = useState(false);
  const [autoCloseSaveSuccess, setAutoCloseSaveSuccess] = useState(false);
  const [isAutoClosePanelOpen, setIsAutoClosePanelOpen] = useState(true);
  const [manualCloseLot, setManualCloseLot] = useState<string>('ALL');

  React.useEffect(() => {
    if (config) {
      setAutoCloseEnabled(Boolean(config.autoCloseOnExchangeEnabled));
      setAutoCloseProfit(config.autoCloseProfitPnlPercent ?? null);
      setAutoCloseLoss(config.autoCloseLossPnlPercent ?? null);
      setAutoCloseLotMode(config.autoCloseLotMode || 'ALL');
      setAutoCloseLotSize(config.autoCloseLotSize || 1);
    }
  }, [config]);

  const handleSaveAutoClose = async (updates?: {
    enabled?: boolean;
    profit?: number | null;
    loss?: number | null;
    lotMode?: 'ALL' | 'CUSTOM';
    lotSize?: number;
  }) => {
    setIsSavingAutoClose(true);
    setAutoCloseSaveSuccess(false);

    const newEnabled = updates?.enabled !== undefined ? updates.enabled : autoCloseEnabled;
    const newProfit = updates?.profit !== undefined ? updates.profit : autoCloseProfit;
    const newLoss = updates?.loss !== undefined ? updates.loss : autoCloseLoss;
    const newLotMode = updates?.lotMode !== undefined ? updates.lotMode : autoCloseLotMode;
    const newLotSize = updates?.lotSize !== undefined ? updates.lotSize : autoCloseLotSize;

    try {
      if (onUpdateAutoCloseSettings) {
        await onUpdateAutoCloseSettings({
          enabled: newEnabled,
          profitPnlPercent: newProfit,
          lossPnlPercent: newLoss,
          lotMode: newLotMode,
          lotSize: newLotSize,
        });
      } else {
        await fetch('/api/trades/auto-close-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: newEnabled,
            profitPnlPercent: newProfit,
            lossPnlPercent: newLoss,
            lotMode: newLotMode,
            lotSize: newLotSize,
          }),
        });
      }
      setAutoCloseSaveSuccess(true);
      setTimeout(() => setAutoCloseSaveSuccess(false), 2500);
    } catch (err: any) {
      setCloseStatusMsg({
        type: 'error',
        message: err.message || 'Failed to save auto close settings',
      });
    } finally {
      setIsSavingAutoClose(false);
    }
  };

  // 1-Click Clear States
  const [showClearOrdersModal, setShowClearOrdersModal] = useState(false);
  const [clearOrdersType, setClearOrdersType] = useState<'CLOSED_ONLY' | 'ALL'>('CLOSED_ONLY');
  const [dayToClear, setDayToClear] = useState<string | null>(null); // 'ALL' or 'YYYY-MM-DD'
  const [isClearing, setIsClearing] = useState(false);

  // 1-Click Clear Day (Removes trades & history for specific day or all days)
  const handleConfirmClearDay = async () => {
    if (!dayToClear) return;
    setIsClearing(true);
    setCloseStatusMsg(null);
    try {
      if (dayToClear === 'ALL') {
        if (onClearAllTrades) {
          const res = await onClearAllTrades({ onlyClosed: false });
          if (res.success) {
            setCloseStatusMsg({
              type: 'success',
              message: 'Successfully cleared all day-by-day history and orders!',
            });
          } else {
            setCloseStatusMsg({ type: 'error', message: res.error || 'Failed to clear all days' });
          }
        } else {
          const res = await fetch('/api/trades/clear-all', { method: 'POST' });
          if (res.ok) {
            setCloseStatusMsg({ type: 'success', message: 'Successfully cleared all day-by-day history!' });
          }
        }
      } else {
        if (onClearDay) {
          const res = await onClearDay(dayToClear);
          if (res.success) {
            setCloseStatusMsg({
              type: 'success',
              message: `Cleared all history & orders for ${dayToClear} (${res.removedTrades || 0} trades removed)!`,
            });
          } else {
            setCloseStatusMsg({ type: 'error', message: res.error || `Failed to clear ${dayToClear}` });
          }
        } else {
          const res = await fetch('/api/trades/clear-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dayToClear }),
          });
          if (res.ok) {
            setCloseStatusMsg({ type: 'success', message: `Cleared records for ${dayToClear}!` });
          }
        }
      }
      setDayToClear(null);
    } catch (err: any) {
      setCloseStatusMsg({ type: 'error', message: err.message || 'Error occurred while clearing records' });
    } finally {
      setIsClearing(false);
    }
  };

  // 1-Click Clear Orders Table (Closed only or all orders)
  const handleConfirmClearOrders = async () => {
    setIsClearing(true);
    setCloseStatusMsg(null);
    try {
      if (onClearTrades) {
        const res = await onClearTrades({
          date: selectedDay !== 'ALL' ? selectedDay : undefined,
          status: clearOrdersType,
        });
        if (res.success) {
          setCloseStatusMsg({
            type: 'success',
            message: `Orders table cleared: ${res.removed || 0} ${clearOrdersType === 'CLOSED_ONLY' ? 'closed' : ''} order(s) removed!`,
          });
        } else {
          setCloseStatusMsg({ type: 'error', message: res.error || 'Failed to clear orders table' });
        }
      } else {
        const res = await fetch('/api/trades/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: selectedDay !== 'ALL' ? selectedDay : undefined,
            status: clearOrdersType,
          }),
        });
        if (res.ok) {
          setCloseStatusMsg({ type: 'success', message: 'Orders table cleared!' });
        }
      }
      setShowClearOrdersModal(false);
    } catch (err: any) {
      setCloseStatusMsg({ type: 'error', message: err.message || 'Error occurred while clearing orders' });
    } finally {
      setIsClearing(false);
    }
  };

  // Filter trades based on status tab, execution type filter, and day selection
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // Part 1: Normal Orders (Side Change OFF)
      if (subView === 'ORDERS_TABLE') {
        if (isTradeSideChanged(t)) return false;
      }

      // Part 2: Side Change Terminal (Side Change ON)
      if (subView === 'SIDE_BY_SIDE') {
        if (!isTradeSideChanged(t)) return false;
      }

      // 1. Status Tab
      if (activeTab === 'CLOSED') {
        if (!['CLOSED', 'TP HIT', 'SL HIT'].includes(t.status)) return false;
      } else if (activeTab !== 'ALL') {
        if (t.status !== activeTab) return false;
      }

      // 2. Execution Type Filter (Bot Order vs Exchange vs Side Changed)
      if (executionFilter !== 'ALL') {
        if (executionFilter === 'SIDE_CHANGED') {
          if (!isTradeSideChanged(t)) return false;
        } else {
          const type = t.executionType || 'EXCHANGE_LIVE';
          if (type !== executionFilter) return false;
        }
      }

      // 3. Selected Day Filter
      if (selectedDay !== 'ALL') {
        const tradeDate = new Date(t.createdAt).toISOString().split('T')[0];
        if (tradeDate !== selectedDay) return false;
      }

      return true;
    });
  }, [trades, activeTab, executionFilter, selectedDay, subView]);

  // Unique list of dates for Day-by-Day view
  const availableDays = useMemo(() => {
    const days = new Set<string>();
    for (const t of trades) {
      if (t.createdAt) {
        const d = new Date(t.createdAt).toISOString().split('T')[0];
        days.add(d);
      }
    }
    return Array.from(days).sort().reverse();
  }, [trades]);

  // Grouped trades for Day-by-Day view
  const dayGroupedTrades = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        trades: TradeRecord[];
        totalTrades: number;
        wins: number;
        losses: number;
        netPnl: number;
        botOrdersCount: number;
        liveOrdersCount: number;
      }
    >();

    for (const d of availableDays) {
      map.set(d, {
        date: d,
        trades: [],
        totalTrades: 0,
        wins: 0,
        losses: 0,
        netPnl: 0,
        botOrdersCount: 0,
        liveOrdersCount: 0,
      });
    }

    for (const t of trades) {
      if (!t.createdAt) continue;
      const d = new Date(t.createdAt).toISOString().split('T')[0];
      let group = map.get(d);
      if (!group) {
        group = {
          date: d,
          trades: [],
          totalTrades: 0,
          wins: 0,
          losses: 0,
          netPnl: 0,
          botOrdersCount: 0,
          liveOrdersCount: 0,
        };
        map.set(d, group);
      }

      group.trades.push(t);
      group.totalTrades++;
      const pnl = (t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0;
      group.netPnl += pnl;

      if (t.status === 'TP HIT' || pnl > 0) {
        group.wins++;
      } else if (t.status === 'SL HIT' || pnl < 0) {
        group.losses++;
      }

      if (t.executionType === 'BOT_VIRTUAL') {
        group.botOrdersCount++;
      } else {
        group.liveOrdersCount++;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [trades, availableDays]);

  // CSV Export
  const handleExportCsv = () => {
    const headers = [
      'Trade ID',
      'Order ID',
      'Date',
      'Time',
      'Symbol',
      'Timeframe',
      'Type',
      'Side',
      'Strategy',
      'Entry Price',
      'Fill Price',
      'Take Profit (1:5)',
      'Stop Loss',
      'Exit/Current Price',
      'Quantity',
      'Leverage',
      'Capital ($)',
      'Realized PnL ($)',
      'Unrealized PnL ($)',
      'PnL %',
      'Status',
      'Execution Note',
    ];

    const rows = trades.map((t) => [
      t.tradeId,
      t.orderId,
      new Date(t.createdAt).toISOString().split('T')[0],
      new Date(t.createdAt).toLocaleTimeString(),
      t.coin,
      t.timeframe || '15m',
      t.executionType || 'EXCHANGE_LIVE',
      t.side,
      t.strategy || '1:5 Mathematical Confluence',
      t.entryPrice,
      t.actualFillPrice || t.entryPrice,
      t.tp,
      t.sl,
      t.exitPrice || t.currentPrice || '',
      t.quantity,
      t.leverage,
      t.capitalUsed,
      t.realizedPnl || 0,
      t.unrealizedPnl || 0,
      t.pnlPercent || 0,
      t.status,
      `"${(t.executionNote || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Delta_Trades_History_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenEdit = (t: TradeRecord) => {
    setEditingTrade(t);
    setEditTp(String(t.tp));
    setEditSl(String(t.sl));
    setUpdateError(null);
    setUpdateSuccess(null);
  };

  const handleSaveTpSl = async () => {
    if (!editingTrade) return;
    setIsUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const res = await onUpdateTpSl(editingTrade.tradeId, Number(editTp), Number(editSl));
      if (res.success) {
        setUpdateSuccess('Delta Exchange confirmed TP/SL update!');
        setTimeout(() => {
          setEditingTrade(null);
        }, 1200);
      } else {
        setUpdateError(res.error || 'Delta rejected update');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!tradeToClose || !onCloseTrade) return;
    setIsClosing(true);
    setCloseStatusMsg(null);

    try {
      const closeQty = manualCloseLot === 'ALL' ? undefined : Math.max(1, Number(manualCloseLot));
      const res = await onCloseTrade(tradeToClose.tradeId, closeQty, 'MANUAL CLOSE');
      if (res.success) {
        setCloseStatusMsg({
          type: 'success',
          message: res.isPartial
            ? `Partial exit: ${closeQty} lots closed for ${tradeToClose.coin} on Delta Exchange!`
            : `Order for ${tradeToClose.coin} successfully closed at market price on Delta Exchange!`,
        });
        setTimeout(() => {
          setTradeToClose(null);
          setCloseStatusMsg(null);
          setManualCloseLot('ALL');
        }, 1500);
      } else {
        setCloseStatusMsg({
          type: 'error',
          message: res.error || 'Failed to close order',
        });
      }
    } catch (err: any) {
      setCloseStatusMsg({
        type: 'error',
        message: err.message || 'Error occurred while closing order',
      });
    } finally {
      setIsClosing(false);
    }
  };

  const openTrades = useMemo(() => trades.filter((t) => t.status === 'OPEN'), [trades]);
  const openBotTrades = useMemo(() => openTrades.filter((t) => t.executionType === 'BOT_VIRTUAL'), [openTrades]);
  const openExchangeTrades = useMemo(() => openTrades.filter((t) => t.executionType !== 'BOT_VIRTUAL'), [openTrades]);

  const handleConfirmBulkClose = async () => {
    if (!onCloseAllTrades) return;
    setIsBulkClosing(true);
    setCloseStatusMsg(null);

    try {
      const res = await onCloseAllTrades(bulkCloseFilter);
      if (res.success) {
        setCloseStatusMsg({
          type: 'success',
          message: `Successfully closed ${res.totalClosed || 0} order(s) (${res.exchangeClosed || 0} Exchange, ${res.botClosed || 0} Bot)!`,
        });
        setShowBulkCloseModal(false);
      } else {
        setCloseStatusMsg({
          type: 'error',
          message: res.error || 'Failed to complete bulk close',
        });
      }
    } catch (err: any) {
      setCloseStatusMsg({
        type: 'error',
        message: err.message || 'Error occurred during bulk close',
      });
    } finally {
      setIsBulkClosing(false);
    }
  };

  const botOrdersCount = trades.filter((t) => t.executionType === 'BOT_VIRTUAL').length;
  const liveOrdersCount = trades.filter((t) => t.executionType !== 'BOT_VIRTUAL').length;
  const normalTradesCount = useMemo(
    () => trades.filter((t) => !isTradeSideChanged(t)).length,
    [trades, isTradeSideChanged]
  );
  const openNormalTradesCount = useMemo(
    () => trades.filter((t) => t.status === 'OPEN' && !isTradeSideChanged(t)).length,
    [trades, isTradeSideChanged]
  );
  const openSideChangedTrades = useMemo(
    () => trades.filter((t) => t.status === 'OPEN' && isTradeSideChanged(t)),
    [trades, isTradeSideChanged]
  );
  const sideChangedOrdersCount = useMemo(
    () => trades.filter((t) => isTradeSideChanged(t)).length,
    [trades, isTradeSideChanged]
  );

  // Dedicated Side-by-Side Dual Card Renderer
  const renderSideBySideDualCard = (t: TradeRecord) => {
    const isWin = ((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0) >= 0;
    const isExchangeBuy = t.side === 'BUY';
    const normalDirection =
      t.normalSetupSnapshot?.direction ||
      t.originalSetupSide ||
      (isExchangeBuy ? 'SELL/SHORT' : 'BUY/LONG');
    const isNormalLong = normalDirection.includes('BUY') || normalDirection === 'BUY/LONG';

    const normalEntry = t.normalSetupSnapshot?.entry || t.entryPrice;
    const normalTp = t.normalSetupSnapshot?.tp1 || t.sl;
    const normalSl = t.normalSetupSnapshot?.sl || t.tp;
    const normalPnl = t.normalSetupSnapshot?.pnl ?? 0;
    const normalPnlPercent = t.normalSetupSnapshot?.pnlPercent ?? 0;

    const exchangeStatus = t.exchangeOrderStatus || (t.status === 'OPEN' ? 'OPEN' : t.status);
    const normalStatus = t.normalSetupSnapshot?.status || (t.status === 'OPEN' ? 'OPEN' : t.status);
    const exchangePnl = (t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0;
    const isExchangeWin = exchangePnl >= 0;
    const isNormalWin = normalPnl >= 0;
    const netDifference = exchangePnl - normalPnl;
    const isSideChangeAhead = netDifference >= 0;

    return (
      <div
        key={`dual_${t.tradeId}`}
        className="bg-[#101622] border-2 border-amber-500/60 rounded-2xl overflow-hidden shadow-2xl font-mono text-xs"
      >
        {/* Top Banner Header */}
        <div className="bg-[#0b0f18] px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-base font-black text-white tracking-wide">{t.coin}</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-950 text-amber-300 border border-amber-600 shadow-sm animate-pulse">
              <ArrowLeftRight className="w-3 h-3 text-amber-400" />
              <span>SIDE CHANGE ACTIVE</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-amber-950/80 text-amber-300 border border-amber-700">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{t.timeframe || '15m'}</span>
            </span>
            <span className="text-[11px] text-zinc-400">
              SL Option: <strong className="text-amber-300 font-bold">{t.sideChangeSlSetting || 'SL (TP=SL)'}</strong>
            </span>
            <span className="text-[10px] text-zinc-500">
              Opened: {new Date(t.createdAt).toLocaleTimeString()}
            </span>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedTradeForDetails(t)}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 text-xs font-bold transition flex items-center gap-1 shadow-sm"
            >
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Diagnostics</span>
            </button>
            {(t.status === 'OPEN' || exchangeStatus === 'OPEN' || normalStatus === 'OPEN') && (
              <button
                onClick={() => setTradeToClose(t)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
                title="Closes the active Exchange position on Delta and finalizes both orders simultaneously"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Close Position (Both)</span>
              </button>
            )}
          </div>
        </div>

        {/* Real-time Comparative Profit / Loss Contrast Bar */}
        <div className="bg-[#0b101c] px-4 py-2.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-400 font-bold uppercase text-[10px]">Comparative Performance:</span>
            <span className="px-2 py-0.5 rounded bg-[#070b13] border border-zinc-800 font-bold">
              Exchange Order: <strong className={isExchangeWin ? 'text-emerald-400' : 'text-rose-400'}>
                {isExchangeWin ? '+' : ''}${exchangePnl.toFixed(2)} ({t.pnlPercent || 0}%)
              </strong>
            </span>
            <span className="text-zinc-500 font-bold">vs</span>
            <span className="px-2 py-0.5 rounded bg-[#070b13] border border-zinc-800 font-bold">
              Normal Setup: <strong className={isNormalWin ? 'text-emerald-400' : 'text-rose-400'}>
                {isNormalWin ? '+' : ''}${normalPnl.toFixed(2)} ({normalPnlPercent}%)
              </strong>
            </span>
          </div>

          <div className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold border shadow-sm flex items-center gap-1.5 ${
            isSideChangeAhead
              ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
              : 'bg-amber-950 text-amber-300 border-amber-600'
          }`}>
            <span>
              {isSideChangeAhead
                ? `⚡ Side Change Leading: +$${netDifference.toFixed(2)} More Profit`
                : `⚠️ Normal Setup Leading: +$${Math.abs(netDifference).toFixed(2)} More Profit`}
            </span>
          </div>
        </div>

        {/* Side-by-Side Dual Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800/80 bg-[#090e17]">
          {/* LEFT CARD: EXCHANGE ORDER (SIDE CHANGED) */}
          <div className="p-4 space-y-3 bg-[#0a101b]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${exchangeStatus === 'OPEN' ? 'bg-emerald-400 animate-ping' : exchangeStatus === 'TP HIT' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <h4 className="font-extrabold text-emerald-400 text-xs tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>EXCHANGE ORDER (SIDE CHANGED)</span>
                </h4>
              </div>
              <div className="flex items-center gap-1.5">
                {exchangeStatus === 'OPEN' ? (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse">
                    🟢 ACTIVE / OPEN ON DELTA
                  </span>
                ) : exchangeStatus === 'TP HIT' ? (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-emerald-900 text-emerald-200 border border-emerald-500">
                    🎯 TP HIT (${t.tp})
                  </span>
                ) : exchangeStatus === 'SL HIT' ? (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-rose-950 text-rose-300 border border-rose-600">
                    🛑 SL HIT (${t.sl})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                    ⏹️ {exchangeStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Error Rejection Callout if Order could not be placed on Delta */}
            {t.orderNotPlacedReason && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-300 text-[10.5px] space-y-1">
                <div className="font-bold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Exchange Order Not Placed (Bot Virtual Fallback):</span>
                </div>
                <div className="leading-tight text-zinc-300 font-sans">{t.orderNotPlacedReason}</div>
              </div>
            )}

            {/* Metric Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Exchange Side</span>
                <span className={`text-sm font-extrabold ${isExchangeBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {t.side} ({t.leverage}x)
                </span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Exchange Entry Price</span>
                <span className="text-sm font-bold text-white">${t.entryPrice || t.actualFillPrice}</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Live Market Price</span>
                <span className="text-sm font-bold text-cyan-300">${t.currentPrice}</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Size / Margin</span>
                <span className="text-sm font-bold text-zinc-200">{t.quantity} (${t.capitalUsed?.toFixed(1) || '0'})</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Changed TP Target</span>
                <span className="text-sm font-bold text-emerald-400">${t.tp}</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Changed Stop Loss</span>
                <span className="text-sm font-bold text-rose-400">${t.sl}</span>
              </div>
            </div>

            {/* Real-time Exchange Live PnL Card */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              isWin ? 'bg-emerald-950/40 border-emerald-500/60' : 'bg-rose-950/40 border-rose-500/60'
            }`}>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Live Exchange PnL</span>
                <span className={`text-lg font-black ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isWin ? '+' : ''}${((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Current Return</span>
                <span className={`text-base font-extrabold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isWin ? '+' : ''}{t.pnlPercent || 0}%
                </span>
              </div>
            </div>

            <div className="text-[10.5px] text-zinc-400 flex items-center justify-between pt-1">
              <span>Order ID: <code className="text-zinc-200">{t.orderId}</code></span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{t.executionType === 'BOT_VIRTUAL' ? 'Bot Virtual' : 'Active on Delta'}</span>
              </span>
            </div>
          </div>

          {/* RIGHT CARD: NORMAL SETUP (ORIGINAL SIDE) */}
          <div className="p-4 space-y-3 bg-[#0a0e18]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${normalStatus === 'OPEN' ? 'bg-sky-400 animate-ping' : normalStatus === 'TP HIT' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <h4 className="font-extrabold text-amber-300 text-xs tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>NORMAL SETUP (ORIGINAL SIDE)</span>
                </h4>
              </div>
              <div className="flex items-center gap-1.5">
                {normalStatus === 'OPEN' ? (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-sky-950 text-sky-300 border border-sky-800 animate-pulse">
                    🔵 TRACKING LIVE (OPEN)
                  </span>
                ) : normalStatus === 'TP HIT' ? (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-emerald-900 text-emerald-200 border border-emerald-500">
                    🎯 TP HIT (${normalTp})
                  </span>
                ) : normalStatus === 'SL HIT' ? (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-rose-950 text-rose-300 border border-rose-600">
                    🛑 SL HIT (${normalSl})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                    ⏹️ {normalStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Metric Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Setup Direction</span>
                <span className={`text-sm font-extrabold ${isNormalLong ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {normalDirection} ({t.leverage}x)
                </span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Setup Entry Price</span>
                <span className="text-sm font-bold text-white">${t.entryPrice || normalEntry}</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Live Market Price</span>
                <span className="text-sm font-bold text-cyan-300">${t.currentPrice}</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Reference Size</span>
                <span className="text-sm font-bold text-zinc-400">{t.quantity} (${t.capitalUsed?.toFixed(1) || '0'})</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Original 1:5 TP</span>
                <span className="text-sm font-bold text-emerald-400">${normalTp}</span>
              </div>
              <div className="p-2.5 bg-[#070b13] rounded-lg border border-zinc-800/80">
                <span className="text-[10px] text-zinc-500 block uppercase font-bold">Original Stop Loss</span>
                <span className="text-sm font-bold text-rose-400">${normalSl}</span>
              </div>
            </div>

            {/* Virtual Benchmark PnL Card */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              normalPnl >= 0 ? 'bg-emerald-950/20 border-emerald-700/40' : 'bg-rose-950/20 border-rose-700/40'
            }`}>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Virtual Benchmark PnL</span>
                <span className={`text-lg font-black ${normalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {normalPnl >= 0 ? '+' : ''}${normalPnl.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Virtual Return</span>
                <span className={`text-base font-extrabold ${normalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {normalPnl >= 0 ? '+' : ''}{normalPnlPercent}%
                </span>
              </div>
            </div>

            <div className="text-[10.5px] text-zinc-400 flex items-center justify-between pt-1">
              <span>Setup Status: <strong className="text-amber-300">Tracking Reference</strong></span>
              <span className="text-zinc-500">Virtual 1:5 Benchmark</span>
            </div>
          </div>
        </div>

        {/* Bottom Footer Notice with Simultaneous Close Trigger */}
        <div className="bg-[#080d16] px-4 py-3 border-t border-zinc-800 text-[11px] text-zinc-400 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 max-w-2xl">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {exchangeStatus === 'OPEN' && normalStatus === 'OPEN' ? (
                <span>
                  <strong>Dual Tracking (Side Change Active):</strong> Exchange Order Delta par LIVE open hai aur Normal Setup reference track ho raha hai. Delta Exchange par TP, SL ya manual close hit hone par dono orders ek sath live order se close hokar history me timeframe ke sath save ho jate hain.
                </span>
              ) : exchangeStatus !== 'OPEN' ? (
                <span className="text-emerald-300 font-bold">
                  ✅ Exchange Order close ho chuka hai ({exchangeStatus}). Dono orders conclude hokar Trade & Setup History me timeframe ke sath archive ho chuke hain.
                </span>
              ) : (
                <span className="text-zinc-300">
                  ✅ Both orders have concluded ({exchangeStatus}) and are recorded in History.
                </span>
              )}
            </span>
          </div>

          {(t.status === 'OPEN' || exchangeStatus === 'OPEN' || normalStatus === 'OPEN') && (
            <button
              onClick={() => setTradeToClose(t)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50 ml-auto"
              title="Closes both orders simultaneously at market price"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Close Position (Both Orders)</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Top Notification Banner */}
      {closeStatusMsg && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between font-mono text-xs ${
            closeStatusMsg.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-300'
              : 'bg-rose-950/70 border-rose-500/80 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {closeStatusMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{closeStatusMsg.message}</span>
          </div>
          <button onClick={() => setCloseStatusMsg(null)} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ⚡ NEW SETTINGS PANEL: AUTO CLOSE ORDER ON EXCHANGE                        */}
      {/* ========================================================================= */}
      <div className="bg-[#0b101c] border-2 border-amber-500/60 rounded-2xl p-4 shadow-2xl relative overflow-hidden font-mono space-y-4">
        {/* Glow ambient accent */}
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Panel Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${autoCloseEnabled ? 'bg-amber-950/80 text-amber-400 border-amber-500 shadow-lg shadow-amber-950/50' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}>
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white tracking-wide flex items-center gap-1.5">
                  <span>Auto Close Order on Exchange</span>
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-sky-950 text-sky-300 border border-sky-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                  <span>DELTA EXCHANGE LIVE PnL SYNC</span>
                </span>
                {autoCloseEnabled ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-950 text-emerald-300 border border-emerald-500">
                    STATUS: ACTIVE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-zinc-800 text-zinc-400 border border-zinc-700">
                    STATUS: OFF (NORMAL MODE)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Delta Exchange live position PnL % sync &bull; Jab configured Profit ya Loss % hit hoga tab order fast market execute hoga.
              </p>
            </div>
          </div>

          {/* Master Enable/Disable Switch & Minimize Toggle */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => handleSaveAutoClose({ enabled: !autoCloseEnabled })}
              disabled={isSavingAutoClose}
              className={`px-3.5 py-2 rounded-xl font-black text-xs transition flex items-center gap-2 shadow-lg cursor-pointer ${
                autoCloseEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-2 ring-emerald-400'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
              }`}
            >
              {autoCloseEnabled ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-200" />
                  <span>AUTO CLOSE: ON</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-zinc-400" />
                  <span>AUTO CLOSE: OFF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsAutoClosePanelOpen(!isAutoClosePanelOpen)}
              className="px-3 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title={isAutoClosePanelOpen ? "Minimize Auto Close Settings" : "Expand Auto Close Settings"}
            >
              {isAutoClosePanelOpen ? (
                <>
                  <ChevronUp className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Minimize</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Expand</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsed Compact Preview Bar */}
        {!isAutoClosePanelOpen && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-400 font-bold text-[11px] uppercase tracking-wider">Active Rule:</span>
              <span className="px-2.5 py-1 rounded-lg bg-[#070b13] border border-zinc-800 text-zinc-200 font-bold flex items-center gap-2">
                <span>Profit: <strong className="text-emerald-400">{autoCloseProfit ? `+${autoCloseProfit}%` : 'OFF'}</strong></span>
                <span className="text-zinc-600">&bull;</span>
                <span>Loss: <strong className="text-rose-400">{autoCloseLoss ? `-${autoCloseLoss}%` : 'OFF'}</strong></span>
                <span className="text-zinc-600">&bull;</span>
                <span>Lots: <strong className="text-amber-400">{autoCloseLotMode === 'ALL' ? 'ALL LOTS' : `${autoCloseLotSize} Lots`}</strong></span>
              </span>
              <span className="text-[11px] text-zinc-400">
                (Delta Exchange Live Fast Close Active &bull; Click Expand to adjust)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsAutoClosePanelOpen(true)}
              className="text-amber-400 hover:text-amber-300 text-xs font-bold underline cursor-pointer flex items-center gap-1"
            >
              <span>Settings Adjust karein</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Configuration Sections Grid & Save Bar (Collapsible) */}
        {isAutoClosePanelOpen && (
          <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* SECTION 1: PROFIT PNL THRESHOLD */}
          <div className="bg-[#0f1523] border border-emerald-900/60 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="font-extrabold text-xs text-emerald-300 uppercase tracking-wide">
                  1. Profit Target (PnL %)
                </span>
              </div>
              <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${
                autoCloseProfit ? 'bg-emerald-950 text-emerald-300 border-emerald-600' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}>
                {autoCloseProfit ? `+${autoCloseProfit}%` : 'OFF'}
              </span>
            </div>

            {/* Quick Profit Presets */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAutoCloseProfit(null);
                  handleSaveAutoClose({ profit: null });
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
                  autoCloseProfit === null
                    ? 'bg-zinc-800 text-white border-zinc-500 ring-1 ring-zinc-400'
                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                OFF
              </button>
              {[100, 120, 150, 200, 300, 500].map((pct) => (
                <button
                  key={`prof_${pct}`}
                  type="button"
                  onClick={() => {
                    setAutoCloseProfit(pct);
                    handleSaveAutoClose({ profit: pct });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition cursor-pointer ${
                    autoCloseProfit === pct
                      ? 'bg-emerald-600 text-white border-emerald-400 ring-1 ring-emerald-300 shadow-md shadow-emerald-950'
                      : 'bg-[#091219] text-emerald-400 border-emerald-900/70 hover:bg-emerald-950/60 hover:border-emerald-600'
                  }`}
                >
                  +{pct}%
                </button>
              ))}
            </div>

            {/* Custom Profit Input */}
            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customProfitInput}
                  onChange={(e) => setCustomProfitInput(e.target.value)}
                  placeholder="Custom Profit % (e.g. 250)"
                  className="w-full bg-[#080d16] border border-emerald-900 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-600 font-bold focus:border-emerald-500 focus:outline-none"
                />
                <span className="absolute right-2.5 top-1 text-xs text-zinc-500 font-bold">%</span>
              </div>
              <button
                type="button"
                disabled={!customProfitInput || isNaN(Number(customProfitInput))}
                onClick={() => {
                  const val = Number(customProfitInput);
                  if (val > 0) {
                    setAutoCloseProfit(val);
                    handleSaveAutoClose({ profit: val });
                    setCustomProfitInput('');
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
              >
                Set
              </button>
            </div>
          </div>

          {/* SECTION 2: LOSS PNL THRESHOLD */}
          <div className="bg-[#0f1523] border border-rose-900/60 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span className="font-extrabold text-xs text-rose-300 uppercase tracking-wide">
                  2. Loss Limit (PnL %)
                </span>
              </div>
              <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${
                autoCloseLoss ? 'bg-rose-950 text-rose-300 border-rose-600' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}>
                {autoCloseLoss ? `-${autoCloseLoss}%` : 'OFF'}
              </span>
            </div>

            {/* Quick Loss Presets */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAutoCloseLoss(null);
                  handleSaveAutoClose({ loss: null });
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
                  autoCloseLoss === null
                    ? 'bg-zinc-800 text-white border-zinc-500 ring-1 ring-zinc-400'
                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                OFF
              </button>
              {[20, 50, 80, 100].map((pct) => (
                <button
                  key={`loss_${pct}`}
                  type="button"
                  onClick={() => {
                    setAutoCloseLoss(pct);
                    handleSaveAutoClose({ loss: pct });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition cursor-pointer ${
                    autoCloseLoss === pct
                      ? 'bg-rose-600 text-white border-rose-400 ring-1 ring-rose-300 shadow-md shadow-rose-950'
                      : 'bg-[#150a10] text-rose-400 border-rose-900/70 hover:bg-rose-950/60 hover:border-rose-600'
                  }`}
                >
                  -{pct}%
                </button>
              ))}
            </div>

            {/* Custom Loss Input */}
            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customLossInput}
                  onChange={(e) => setCustomLossInput(e.target.value)}
                  placeholder="Custom Loss % (e.g. 35)"
                  className="w-full bg-[#080d16] border border-rose-900 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-600 font-bold focus:border-rose-500 focus:outline-none"
                />
                <span className="absolute right-2.5 top-1 text-xs text-zinc-500 font-bold">%</span>
              </div>
              <button
                type="button"
                disabled={!customLossInput || isNaN(Number(customLossInput))}
                onClick={() => {
                  const val = Number(customLossInput);
                  if (val > 0) {
                    setAutoCloseLoss(val);
                    handleSaveAutoClose({ loss: val });
                    setCustomLossInput('');
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
              >
                Set
              </button>
            </div>
          </div>

          {/* SECTION 3: LOT SIZE RESTRICTION */}
          <div className="bg-[#0f1523] border border-amber-900/60 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="font-extrabold text-xs text-amber-300 uppercase tracking-wide">
                  3. Lot Size Restriction
                </span>
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-600">
                {autoCloseLotMode === 'ALL' ? 'ALL LOTS' : `${autoCloseLotSize} LOTS`}
              </span>
            </div>

            {/* Lot Mode Toggle */}
            <div className="grid grid-cols-2 gap-1.5 bg-[#080d16] p-1 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setAutoCloseLotMode('ALL');
                  handleSaveAutoClose({ lotMode: 'ALL' });
                }}
                className={`py-1 text-center rounded-md font-bold text-[11px] transition cursor-pointer ${
                  autoCloseLotMode === 'ALL'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                ALL LOTS (100%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoCloseLotMode('CUSTOM');
                  handleSaveAutoClose({ lotMode: 'CUSTOM' });
                }}
                className={`py-1 text-center rounded-md font-bold text-[11px] transition cursor-pointer ${
                  autoCloseLotMode === 'CUSTOM'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                NUMBER LOTS
              </button>
            </div>

            {/* Quick Lot Presets */}
            {autoCloseLotMode === 'CUSTOM' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 5, 10, 50, 100, 500, 1000, 10000, 50000, 1000000000].map((lots) => (
                    <button
                      key={`lot_${lots}`}
                      type="button"
                      onClick={() => {
                        setAutoCloseLotSize(lots);
                        handleSaveAutoClose({ lotSize: lots });
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-black border transition cursor-pointer ${
                        autoCloseLotSize === lots
                          ? 'bg-amber-600 text-white border-amber-400 ring-1 ring-amber-300'
                          : 'bg-[#141008] text-amber-400 border-amber-900/60 hover:bg-amber-950'
                      }`}
                    >
                      {lots >= 1e9 ? '1B' : lots >= 1e3 ? `${lots / 1e3}k` : lots}
                    </button>
                  ))}
                </div>

                {/* Custom Lot Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={customLotInput}
                    onChange={(e) => setCustomLotInput(e.target.value)}
                    placeholder="Custom Lots..."
                    className="w-full bg-[#080d16] border border-amber-900 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-600 font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!customLotInput || Number(customLotInput) <= 0}
                    onClick={() => {
                      const val = Number(customLotInput);
                      if (val > 0) {
                        setAutoCloseLotSize(val);
                        handleSaveAutoClose({ lotSize: val });
                        setCustomLotInput('');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-900/40 text-[10.5px] text-amber-200/90 leading-tight">
                <strong>All Lots Mode Active:</strong> Target hit hone par us coin ki puri open position Delta Exchange par 1-click fast close ho jayegi.
              </div>
            )}
          </div>
        </div>

        {/* Status / Live Summary & Save Action */}
        <div className="bg-[#070b13] p-3 rounded-xl border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 font-bold text-[10.5px] uppercase">Active Rule:</span>
            <span className="px-2.5 py-1 rounded bg-[#0b101c] border border-zinc-800 text-zinc-200 font-bold">
              Profit: <strong className="text-emerald-400">{autoCloseProfit ? `+${autoCloseProfit}%` : 'OFF'}</strong>
              {' '}&bull;{' '}
              Loss: <strong className="text-rose-400">{autoCloseLoss ? `-${autoCloseLoss}%` : 'OFF'}</strong>
              {' '}&bull;{' '}
              Lots: <strong className="text-amber-400">{autoCloseLotMode === 'ALL' ? 'All Lots' : `${autoCloseLotSize} Lots`}</strong>
            </span>
            <span className="text-[11px] text-zinc-400">
              {autoCloseLotMode === 'ALL'
                ? '(Pura order close hoga)'
                : `(Sirf ${autoCloseLotSize} lot close hoga, baaki open rahega apne TP tak)`}
            </span>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {autoCloseSaveSuccess && (
              <span className="text-emerald-400 text-xs font-bold flex items-center gap-1 animate-pulse">
                <Check className="w-3.5 h-3.5" /> Saved & Active on Delta!
              </span>
            )}
            <button
              onClick={() => handleSaveAutoClose()}
              disabled={isSavingAutoClose}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-950 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isSavingAutoClose ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>
        </>
        )}
      </div>

      {/* 2-PART PRIMARY SELECTION TABS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-[#0b0f17] p-2 rounded-xl border border-zinc-800 font-mono">
        {/* Part 1: Normal Setups & Orders */}
        <button
          onClick={() => {
            setSubView('ORDERS_TABLE');
            setExecutionFilter('ALL');
          }}
          className={`p-3 rounded-lg border text-left transition flex items-center justify-between group ${
            subView === 'ORDERS_TABLE'
              ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500'
              : 'bg-[#101622] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg transition ${subView === 'ORDERS_TABLE' ? 'bg-emerald-500 text-black font-black' : 'bg-[#0a0e16] text-emerald-400 border border-zinc-800'}`}>
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-zinc-100">1: Normal Orders</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                  Side Change OFF
                </span>
              </div>
              <div className="text-[10.5px] text-zinc-400 mt-0.5">
                Jaisa setup vaisa order &bull; Live Exchange PnL Match
              </div>
            </div>
          </div>
          <div className="text-right pl-2">
            <span className="text-base font-black text-emerald-400">{normalTradesCount}</span>
            <span className="text-[9.5px] text-zinc-500 block uppercase">Orders</span>
          </div>
        </button>

        {/* Part 2: Side Change Terminal (Dual Orders in 1 Card) */}
        <button
          onClick={() => {
            setSubView('SIDE_BY_SIDE');
            setExecutionFilter('ALL');
          }}
          className={`p-3 rounded-lg border text-left transition flex items-center justify-between group ${
            subView === 'SIDE_BY_SIDE'
              ? 'bg-amber-950/70 border-amber-500 text-white shadow-lg shadow-amber-950/40 ring-1 ring-amber-500'
              : 'bg-[#101622] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg transition ${subView === 'SIDE_BY_SIDE' ? 'bg-amber-500 text-black font-black' : 'bg-[#0a0e16] text-amber-400 border border-zinc-800'}`}>
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-zinc-100">2: Side Change</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-600 font-bold animate-pulse">
                  2 Orders in 1 Card
                </span>
              </div>
              <div className="text-[10.5px] text-zinc-400 mt-0.5">
                Exchange Order vs Normal Setup &bull; Dual Live Tracking
              </div>
            </div>
          </div>
          <div className="text-right pl-2">
            <span className="text-base font-black text-amber-400">{openSideChangedTrades.length}</span>
            <span className="text-[9.5px] text-zinc-500 block uppercase">Active Cards</span>
          </div>
        </button>

        {/* Part 3: Day-by-Day Historical View */}
        <button
          onClick={() => setSubView('DAY_BY_DAY')}
          className={`p-3 rounded-lg border text-left transition flex items-center justify-between group ${
            subView === 'DAY_BY_DAY'
              ? 'bg-sky-950/70 border-sky-500 text-white shadow-lg shadow-sky-950/40 ring-1 ring-sky-500'
              : 'bg-[#101622] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg transition ${subView === 'DAY_BY_DAY' ? 'bg-sky-500 text-black font-black' : 'bg-[#0a0e16] text-sky-400 border border-zinc-800'}`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-zinc-100">Day-by-Day History</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800 font-bold">
                  Archive
                </span>
              </div>
              <div className="text-[10.5px] text-zinc-400 mt-0.5">
                Daily win rates, net profit & 1-click day clear
              </div>
            </div>
          </div>
          <div className="text-right pl-2">
            <span className="text-base font-black text-sky-400">{availableDays.length}</span>
            <span className="text-[9.5px] text-zinc-500 block uppercase">Days</span>
          </div>
        </button>
      </div>

      {/* Control Header: Tabs, Execution Mode Filter, Day-by-Day Switcher, and CSV Export */}
      <div className="bg-[#101622] p-3 rounded-xl border border-zinc-800/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs">
        {/* Left: View Mode Quick Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 font-bold text-[11px] uppercase tracking-wider mr-1">
            Active Mode:
          </span>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
            subView === 'ORDERS_TABLE'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
              : subView === 'SIDE_BY_SIDE'
              ? 'bg-amber-950 text-amber-300 border-amber-600'
              : 'bg-sky-950 text-sky-300 border-sky-600'
          }`}>
            {subView === 'ORDERS_TABLE'
              ? 'Part 1: Normal Orders (Side Change OFF)'
              : subView === 'SIDE_BY_SIDE'
              ? 'Part 2: Side Change Terminal (2 Orders in 1 Card)'
              : 'Day-by-Day Historical View'}
          </span>
        </div>

        {/* Right: Execution Filters & CSV Export */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
          {/* Execution Filter */}
          <div className="flex items-center gap-1 bg-[#0a0e16] p-1 rounded-lg border border-zinc-800 flex-wrap">
            <button
              onClick={() => setExecutionFilter('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                executionFilter === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({trades.length})
            </button>

            <button
              onClick={() => setExecutionFilter('BOT_VIRTUAL')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition ${
                executionFilter === 'BOT_VIRTUAL'
                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Orders executed by Bot in Virtual / Tracking mode"
            >
              <Bot className="w-3 h-3 text-purple-400" />
              <span>Bot ({botOrdersCount})</span>
            </button>

            <button
              onClick={() => setExecutionFilter('EXCHANGE_LIVE')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition ${
                executionFilter === 'EXCHANGE_LIVE'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Live Orders sent and confirmed directly on Delta Exchange"
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Exchange ({liveOrdersCount})</span>
            </button>

            <button
              onClick={() => setExecutionFilter('SIDE_CHANGED')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition ${
                executionFilter === 'SIDE_CHANGED'
                  ? 'bg-amber-950 text-amber-300 border border-amber-600'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Orders where Side Change is enabled (Exchange Order vs Normal Setup)"
            >
              <ArrowLeftRight className="w-3 h-3 text-amber-400" />
              <span>Side Change ({sideChangedOrdersCount})</span>
            </button>
          </div>

          {/* Export to CSV Button */}
          <button
            onClick={handleExportCsv}
            disabled={trades.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] font-bold transition disabled:opacity-40"
            title="Export all orders and day-by-day history to CSV spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {/* 1-Click Clear All Days in Day-by-Day View */}
          {subView === 'DAY_BY_DAY' && availableDays.length > 0 && (
            <button
              onClick={() => setDayToClear('ALL')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-bold transition shadow-sm"
              title="1-Click Clear All Day-by-Day History & Records"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear All Days</span>
            </button>
          )}

          {/* 1-Click Clear Orders Table in Orders Table View */}
          {subView === 'ORDERS_TABLE' && trades.length > 0 && (
            <button
              onClick={() => {
                setClearOrdersType('CLOSED_ONLY');
                setShowClearOrdersModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-bold transition shadow-sm"
              title="1-Click Clear Orders Table (Choose Closed only or all orders)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear Orders Table</span>
            </button>
          )}

          {/* Bulk Close All Open Orders Button */}
          {onCloseAllTrades && openTrades.length > 0 && (
            <button
              onClick={() => {
                setBulkCloseFilter('ALL');
                setShowBulkCloseModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shadow-lg shadow-rose-950/40"
              title="Close all open orders at market price (Both Exchange Live and Bot orders)"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Close All Open ({openTrades.length})</span>
            </button>
          )}
        </div>
      </div>

      {subView === 'DAY_BY_DAY' ? (
        /* DAY-BY-DAY HISTORY VIEW */
        <div className="space-y-4">
          {dayGroupedTrades.length === 0 ? (
            <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-12 text-center text-zinc-500">
              No historical trade records found.
            </div>
          ) : (
            dayGroupedTrades.map((dayGroup) => {
              const isProfit = dayGroup.netPnl >= 0;
              const winRate =
                dayGroup.totalTrades > 0
                  ? Math.round((dayGroup.wins / dayGroup.totalTrades) * 100)
                  : 0;

              return (
                <div
                  key={dayGroup.date}
                  className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg"
                >
                  {/* Day Summary Header */}
                  <div className="bg-[#0b0f17] p-3.5 border-b border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          <span>{dayGroup.date}</span>
                          {new Date().toISOString().split('T')[0] === dayGroup.date && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700">
                              TODAY
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {dayGroup.totalTrades} Trades ({dayGroup.botOrdersCount} Bot Virtual, {dayGroup.liveOrdersCount} Exchange Live)
                        </div>
                      </div>
                    </div>

                    {/* Performance Chips & 1-Click Clear Day Button */}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="bg-[#0e131d] px-3 py-1.5 rounded-lg border border-zinc-800">
                        <span className="text-zinc-400 text-[10px] block">WIN RATE</span>
                        <span className="font-bold text-zinc-100">{winRate}%</span>
                        <span className="text-zinc-500 text-[10px] ml-1">({dayGroup.wins}W / {dayGroup.losses}L)</span>
                      </div>

                      <div className="bg-[#0e131d] px-3 py-1.5 rounded-lg border border-zinc-800">
                        <span className="text-zinc-400 text-[10px] block">DAY NET PNL</span>
                        <span
                          className={`font-bold text-sm ${
                            isProfit ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isProfit ? '+' : ''}${dayGroup.netPnl.toFixed(2)}
                        </span>
                      </div>

                      {/* 1-Click Clear Day Button */}
                      <button
                        onClick={() => setDayToClear(dayGroup.date)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold transition shadow-sm hover:shadow-rose-950/50"
                        title={`Clear all ${dayGroup.totalTrades} order(s) and history for ${dayGroup.date} in 1 click`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Clear Day ({dayGroup.totalTrades})</span>
                      </button>
                    </div>
                  </div>

                  {/* Day Trade Breakdown Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs text-zinc-300">
                      <thead className="bg-[#0d121b] text-[10px] uppercase text-zinc-400 border-b border-zinc-800/80">
                        <tr>
                          <th className="py-2 px-3">TIME</th>
                          <th className="py-2 px-3">TIMEFRAME</th>
                          <th className="py-2 px-3">COIN & STRATEGY</th>
                          <th className="py-2 px-3">EXECUTION MODE</th>
                          <th className="py-2 px-3">SIDE / LEV</th>
                          <th className="py-2 px-3">ENTRY / FILL</th>
                          <th className="py-2 px-3">1:5 TP TARGET</th>
                          <th className="py-2 px-3">STOP LOSS</th>
                          <th className="py-2 px-3">EXIT / CURRENT</th>
                          <th className="py-2 px-3">PNL ($ / %)</th>
                          <th className="py-2 px-3">STATUS</th>
                          <th className="py-2 px-3 text-right">DETAILS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {dayGroup.trades.map((t) => {
                          const isWin = ((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0) >= 0;
                          const isBot = t.executionType === 'BOT_VIRTUAL';

                          return (
                            <tr key={t.tradeId} className="hover:bg-zinc-800/30 transition text-xs">
                              <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                                {new Date(t.createdAt).toLocaleTimeString()}
                              </td>

                              <td className="py-2.5 px-3">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-950/70 text-amber-300 border border-amber-700/80">
                                  <Clock className="w-2.5 h-2.5 text-amber-400" />
                                  {t.timeframe || '15m'}
                                </span>
                              </td>

                              <td className="py-2.5 px-3">
                                <div
                                  onClick={() => setSelectedTradeForDetails(t)}
                                  className="font-bold text-zinc-100 cursor-pointer hover:text-cyan-400 hover:underline transition flex items-center gap-1.5 flex-wrap"
                                  title="Click to view full order diagnostics & 24H rationale"
                                >
                                  <span>{t.coin}</span>
                                  {t.movePercent24hAtCreation !== undefined && (
                                    <span className={`px-1.5 py-0.2 text-[9px] rounded font-mono font-bold ${
                                      t.movePercent24hAtCreation >= 0
                                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                        : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                                    }`} title={`24H move at order setup: ${t.movePercent24hAtCreation > 0 ? '+' : ''}${t.movePercent24hAtCreation.toFixed(2)}%`}>
                                      {t.movePercent24hAtCreation > 0 ? '+' : ''}{t.movePercent24hAtCreation.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-zinc-500 flex-wrap mt-0.5">
                                  <span>{t.strategy || '1:5 Confluence'}</span>
                                  {t.rangeBandAtCreation && (
                                    <span className="px-1 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-900/80 text-[8.5px] font-bold" title={`Generated in Range: ${t.rangeBandAtCreation}`}>
                                      🎯 {t.rangeBandAtCreation}
                                    </span>
                                  )}
                                </div>
                                {t.whyDirectionRationale && (
                                  <div className="text-[9px] text-sky-400/80 truncate max-w-[170px]" title={t.whyDirectionRationale}>
                                    {t.whyDirectionRationale}
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                {isBot ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                      <Bot className="w-3 h-3 text-purple-400" />
                                      BOT ORDER
                                    </span>
                                    {t.orderNotPlacedReason ? (
                                      <div className="p-1 rounded bg-rose-950/50 border border-rose-800 text-[9px] text-rose-300 max-w-[170px]" title={t.orderNotPlacedReason}>
                                        <span className="font-bold text-rose-400 block flex items-center gap-1">
                                          <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                          <span>Rejection:</span>
                                        </span>
                                        <span className="line-clamp-2 leading-tight font-sans text-zinc-200">{t.orderNotPlacedReason}</span>
                                      </div>
                                    ) : t.executionNote ? (
                                      <div className="text-[9px] text-zinc-500 truncate max-w-[150px]" title={t.executionNote}>
                                        {t.executionNote}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                      <Zap className="w-3 h-3 text-emerald-400" />
                                      EXCHANGE LIVE
                                    </span>
                                    <span className="text-[9px] text-emerald-400/90 block font-semibold">Active on Delta</span>
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold mr-1.5 ${
                                    t.side === 'BUY'
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                                  }`}
                                >
                                  {t.side}
                                </span>
                                <span className="text-zinc-400">{t.leverage}x</span>
                              </td>

                              <td className="py-2.5 px-3 font-medium text-zinc-200">
                                ${t.actualFillPrice || t.entryPrice}
                              </td>

                              <td className="py-2.5 px-3 text-emerald-400 font-bold">
                                ${t.tp}
                              </td>

                              <td className="py-2.5 px-3 text-rose-400 font-bold">
                                ${t.sl}
                              </td>

                              <td className="py-2.5 px-3 text-zinc-200">
                                ${t.exitPrice || t.currentPrice || '-'}
                              </td>

                              <td className="py-2.5 px-3">
                                <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isWin ? '+' : ''}${((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0).toFixed(2)}
                                </div>
                                <div className="text-[10px] text-zinc-400">{t.pnlPercent || 0}%</div>
                              </td>

                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
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

                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => setSelectedTradeForDetails(t)}
                                  className="px-2 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 text-[10.5px] font-mono transition inline-flex items-center gap-1 shadow-sm"
                                  title="Click to view why order formed, PCD reasons, and error diagnostics"
                                >
                                  <Info className="w-3 h-3 text-cyan-400" />
                                  <span>Details</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : subView === 'SIDE_BY_SIDE' ? (
        /* PART 2: DEDICATED SIDE-BY-SIDE DUAL VIEW FOR ALL SIDE-CHANGED TRADES */
        <div className="space-y-3">
          <div className="bg-[#101622] p-4 rounded-xl border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-zinc-100 text-sm">
                    Part 2: Side Change Terminal (Dual Orders in 1 Card)
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600 animate-pulse">
                    FEATURE ON
                  </span>
                </div>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  1 Card mai 2 Orders: [EXCHANGE ORDER (SIDE CHANGED)] vs [NORMAL SETUP ORDER (ORIGINAL SIDE)] &bull; Real-time comparison to see whether Normal or Side Change is yielding more profit!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-300 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-700">
                {sideChangedOrdersCount} Dual Card(s)
              </span>
            </div>
          </div>

          {/* Sub-status filter for Part 2 */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#101622] p-2.5 rounded-xl border border-zinc-800/80 font-mono text-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              {(['OPEN', 'TP HIT', 'SL HIT', 'CLOSED', 'ALL'] as const).map((tab) => {
                const count = trades
                  .filter((t) => isTradeSideChanged(t))
                  .filter((t) => {
                    if (tab === 'ALL') return true;
                    if (tab === 'CLOSED') return ['CLOSED', 'TP HIT', 'SL HIT'].includes(t.status);
                    return t.status === tab;
                  }).length;

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                      activeTab === tab
                        ? 'bg-amber-950 border-amber-600 text-amber-200 font-bold'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{tab}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {onCloseAllTrades && openSideChangedTrades.length > 0 && (
              <button
                onClick={() => {
                  setBulkCloseFilter('ALL');
                  setShowBulkCloseModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shadow-lg shadow-rose-950/40 ml-auto"
                title="Close all open side-change orders at market price"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>Close All Open ({openSideChangedTrades.length})</span>
              </button>
            )}
          </div>

          {sideChangedOrdersCount === 0 ? (
            <div className="bg-[#101622] border border-zinc-800 rounded-xl p-12 text-center text-zinc-500 space-y-3">
              <ArrowLeftRight className="w-10 h-10 mx-auto text-amber-500/60" />
              <p className="font-bold text-base text-zinc-200">No Side-Change trades recorded yet</p>
              <p className="text-xs text-zinc-400 max-w-lg mx-auto leading-relaxed">
                Exchange Settings me <strong>"Side Change / Opposite Order Mode"</strong> toggle ko <strong>ON</strong> karein. Jab koi setup trigger hoga toh Exchange par opposite order place hoga aur dono orders (Exchange Order vs Normal Setup) ek sath is card me live track honge.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setSubView('ORDERS_TABLE')}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition inline-flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Switch to Part 1: Normal Orders ({normalTradesCount})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTrades
                .filter((t) => isTradeSideChanged(t))
                .map((t) => renderSideBySideDualCard(t))}
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE & LIVE ORDERS TABLE VIEW */
        <div className="space-y-3">
          {/* Status Sub-Tabs & Bulk Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#101622] p-2.5 rounded-xl border border-zinc-800/80 font-mono text-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              {(['OPEN', 'TP HIT', 'SL HIT', 'CLOSED', 'ALL'] as const).map((tab) => {
                const count = trades.filter((t) => {
                  if (isTradeSideChanged(t)) return false;
                  if (tab === 'ALL') return true;
                  if (tab === 'CLOSED') return ['CLOSED', 'TP HIT', 'SL HIT'].includes(t.status);
                  return t.status === tab;
                }).length;

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                      activeTab === tab
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-bold'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{tab}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-700/60 text-zinc-300">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Actions: 1-Click Clear Orders Table & Bulk Close */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* 1-Click Clear Closed Orders */}
              {trades.some((t) => !isTradeSideChanged(t) && ['CLOSED', 'TP HIT', 'SL HIT'].includes(t.status)) && (
                <button
                  onClick={() => {
                    setClearOrdersType('CLOSED_ONLY');
                    setShowClearOrdersModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] font-bold transition shadow-sm"
                  title="1-Click Clear all finished/closed orders from the table"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>Clear Closed ({trades.filter((t) => !isTradeSideChanged(t) && ['CLOSED', 'TP HIT', 'SL HIT'].includes(t.status)).length})</span>
                </button>
              )}

              {/* 1-Click Clear Entire Table */}
              {normalTradesCount > 0 && (
                <button
                  onClick={() => {
                    setClearOrdersType('ALL');
                    setShowClearOrdersModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 text-[11px] font-bold transition shadow-sm"
                  title="1-Click Clear Entire Orders Table"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>Clear Table ({normalTradesCount})</span>
                </button>
              )}

              {/* Quick Bulk Close Action for Open Positions */}
              {onCloseAllTrades && openNormalTradesCount > 0 && (
                <button
                  onClick={() => {
                    setBulkCloseFilter('ALL');
                    setShowBulkCloseModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shadow-lg shadow-rose-950/40"
                  title="Close all open normal positions (Exchange and Bot)"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Close All Open ({openNormalTradesCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Side Change Notice Banner if Side Change is ON */}
          {config?.sideChangeEnabled && (
            <div className="bg-amber-950/30 border border-amber-600/70 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <ArrowLeftRight className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                <div>
                  <span className="font-black text-amber-300">Side Change Feature Active:</span>
                  <span className="text-zinc-300 ml-1.5">
                    Live orders are placing opposite sides on Delta Exchange and are exclusively isolated in the Side Change tab.
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSubView('SIDE_BY_SIDE')}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition flex items-center gap-1 shadow-md shadow-amber-950/50 cursor-pointer"
              >
                <span>View Side Change Orders ({sideChangedOrdersCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Part 1 Explanation Header */}
          <div className="bg-[#0b0f18] p-3 rounded-xl border border-emerald-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-bold text-zinc-100">
                Part 1: Normal Orders (Side Change OFF)
              </span>
              <span className="text-zinc-500">&bull;</span>
              <span className="text-zinc-400 text-[11px]">
                Jaisa setup banta hai vaise hi order place hota hai. Delta Exchange live PnL direct match hoti hai aur manual close / TP / SL sync hota hai.
              </span>
            </div>
            {sideChangedOrdersCount > 0 && (
              <button
                onClick={() => setSubView('SIDE_BY_SIDE')}
                className="text-amber-400 hover:text-amber-300 font-bold text-[11px] underline flex items-center gap-1 shrink-0"
              >
                <span>Switch to Part 2: Side Change ({sideChangedOrdersCount})</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Orders Table */}
          <div className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs text-zinc-300">
                <thead className="bg-[#0b0f17] text-[10px] uppercase text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3">DATE / COIN</th>
                    <th className="py-2.5 px-3">TIMEFRAME</th>
                    <th className="py-2.5 px-3">MODE</th>
                    <th className="py-2.5 px-3">SIDE / LEV</th>
                    <th className="py-2.5 px-3">ENTRY / FILL</th>
                    <th className="py-2.5 px-3">LIVE PRICE</th>
                    <th className="py-2.5 px-3">TAKE PROFIT (1:5)</th>
                    <th className="py-2.5 px-3">STOP LOSS</th>
                    <th className="py-2.5 px-3">MARGIN</th>
                    <th className="py-2.5 px-3">50% TP PROGRESS</th>
                    <th className="py-2.5 px-3">PNL ($ / %)</th>
                    <th className="py-2.5 px-3">STATUS</th>
                    <th className="py-2.5 px-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredTrades.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-zinc-500 space-y-2">
                        <div className="font-bold text-zinc-400">
                          No normal orders found in {activeTab} status
                          {executionFilter !== 'ALL' ? ` for filter ${executionFilter}` : ''}.
                        </div>
                        {sideChangedOrdersCount > 0 && (
                          <div className="pt-2">
                            <button
                              onClick={() => setSubView('SIDE_BY_SIDE')}
                              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition inline-flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <span>Switch to Part 2: Side Change Terminal ({sideChangedOrdersCount} Active)</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredTrades.map((t) => {
                      const isWin = ((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0) >= 0;
                      const isLong = t.side === 'BUY';
                      const isBot = t.executionType === 'BOT_VIRTUAL';

                      return (
                        <tr key={t.tradeId} className="hover:bg-zinc-800/30 transition">
                          <td className="py-2.5 px-3">
                            <div
                              onClick={() => setSelectedTradeForDetails(t)}
                              className="font-bold text-zinc-100 flex items-center gap-1.5 flex-wrap cursor-pointer group"
                              title="Click to view full order diagnostics & PCD thesis"
                            >
                              <span className="group-hover:text-cyan-400 group-hover:underline transition">{t.coin}</span>
                              {t.status === 'OPEN' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-sky-950 text-sky-300 border border-sky-700 shadow-sm animate-pulse">
                                  OPEN: {t.timeframe || '15m'}
                                </span>
                              )}
                              {t.isSideChangedOrder && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-950 text-amber-300 border border-amber-600">
                                  ⚡ SIDE CHANGED
                                </span>
                              )}
                              <span className="text-[10px] text-zinc-500 font-normal">
                                {new Date(t.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500">{t.orderId}</div>
                          </td>

                          {/* Dedicated Timeframe Column */}
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold tracking-wide bg-amber-950/80 text-amber-300 border border-amber-600/90 shadow-sm shadow-amber-950/60">
                              <Clock className="w-3 h-3 text-amber-400" />
                              {t.timeframe || '15m'}
                            </span>
                          </td>

                          {/* Execution Mode Badge */}
                          <td className="py-2.5 px-3">
                            {isBot ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                  <Bot className="w-3 h-3 text-purple-400" />
                                  BOT ORDER
                                </span>
                                {t.orderNotPlacedReason ? (
                                  <div className="p-1.5 rounded bg-rose-950/50 border border-rose-800 text-[9.5px] text-rose-300 max-w-[190px] space-y-0.5" title={t.orderNotPlacedReason}>
                                    <span className="font-bold text-rose-400 block flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                      <span>Rejection Reason:</span>
                                    </span>
                                    <span className="line-clamp-2 leading-tight font-sans text-zinc-200">{t.orderNotPlacedReason}</span>
                                  </div>
                                ) : t.executionNote ? (
                                  <div className="text-[9px] text-zinc-500 truncate max-w-[130px]" title={t.executionNote}>
                                    {t.executionNote}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  <Zap className="w-3 h-3 text-emerald-400" />
                                  EXCHANGE LIVE
                                </span>
                                <span className="text-[9px] text-emerald-400/90 block font-semibold">Active on Delta</span>
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            {t.isSideChangedOrder ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-zinc-500 line-through">
                                    {t.originalSetupSide?.includes('BUY') ? 'BUY' : 'SELL'}
                                  </span>
                                  <ArrowRight className="w-2.5 h-2.5 text-amber-400" />
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                      isLong
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                                    }`}
                                  >
                                    {t.side}
                                  </span>
                                  <span className="text-zinc-400 text-[10px]">{t.leverage}x</span>
                                </div>
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/70">
                                  <ArrowLeftRight className="w-2 h-2 text-amber-400" />
                                  <span>SIDE CHANGED</span>
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isLong
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                                  }`}
                                >
                                  {t.side}
                                </span>
                                <span className="text-zinc-400">{t.leverage}x</span>
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3">${t.actualFillPrice || t.entryPrice}</td>
                          <td className="py-2.5 px-3">
                            <PriceTransitionCell
                              price={t.currentPrice}
                              size="xs"
                              showDirectionIcon={true}
                            />
                          </td>

                          <td className="py-2.5 px-3 text-emerald-400 font-bold">${t.tp}</td>
                          <td className="py-2.5 px-3 text-rose-400 font-bold">${t.sl}</td>

                          <td className="py-2.5 px-3">
                            <div>{t.quantity}</div>
                            <div className="text-[10px] text-zinc-500">${t.capitalUsed?.toFixed(1)} margin</div>
                          </td>

                          {/* 50% TP Progress Tracking */}
                          <td className="py-2.5 px-3">
                            {t.partialProfitBooked ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-700 font-bold">
                                  <CheckCircle className="w-2.5 h-2.5 text-amber-400" />
                                  50% BOOKED (SL Trailed)
                                </span>
                                {t.partialProfitAmount ? (
                                  <div className="text-[9px] text-emerald-400 font-mono">
                                    +${t.partialProfitAmount.toFixed(2)} @ ${t.partialProfitPrice || ((t.entryPrice + t.tp) / 2).toFixed(2)}
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-zinc-400 font-mono">
                                    @{t.partialProfitPrice || ((t.entryPrice + t.tp) / 2).toFixed(2)}
                                  </div>
                                )}
                              </div>
                            ) : t.status === 'OPEN' ? (
                              <span className="text-[10px] text-zinc-400 font-mono">Tracking 50% TP</span>
                            ) : (
                              <span className="text-[10px] text-zinc-500 font-mono">-</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}${((t.status === 'OPEN' ? t.unrealizedPnl : t.realizedPnl) || 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-zinc-400">{t.pnlPercent || 0}%</div>
                          </td>

                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.status === 'OPEN'
                                  ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                  : t.status === 'TP HIT'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 ml-auto">
                              {/* Details & Diagnostics Button */}
                              <button
                                onClick={() => setSelectedTradeForDetails(t)}
                                className="px-2 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 text-[11px] font-mono transition flex items-center gap-1 shadow-sm"
                                title="Click to view why order formed, PCD reasons, and error diagnostics"
                              >
                                <Info className="w-3 h-3 text-cyan-400" />
                                <span>Details</span>
                              </button>

                              {t.status === 'OPEN' && (
                                <>
                                  {/* Edit TP/SL Button */}
                                  <button
                                    onClick={() => handleOpenEdit(t)}
                                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] font-mono transition flex items-center gap-1"
                                    title="Interactive TP/SL Edit"
                                  >
                                    <Edit3 className="w-3 h-3 text-emerald-400" />
                                    <span>Edit</span>
                                  </button>

                                  {/* Prominent Close Order Button */}
                                  <button
                                    onClick={() => setTradeToClose(t)}
                                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] font-mono transition flex items-center gap-1 shadow-sm shadow-rose-950/40"
                                    title="Close this order immediately at market price"
                                  >
                                    <LogOut className="w-3 h-3" />
                                    <span>Close</span>
                                  </button>
                                </>
                              )}
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
      )}

      {/* Confirmation Modal to Close Order */}
      {tradeToClose && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#101622] border border-rose-800/80 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-zinc-100 text-sm">
                  Confirm Close Order: {tradeToClose.coin}
                </h3>
              </div>
              <button
                onClick={() => setTradeToClose(null)}
                disabled={isClosing}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#0b0f17] p-3 rounded-lg border border-zinc-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-400">Timeframe:</span>
                <span className="text-amber-300 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {tradeToClose.timeframe || '15m'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Position Side:</span>
                <span className={`font-bold ${tradeToClose.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {tradeToClose.side} ({tradeToClose.leverage}x)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Execution Mode:</span>
                <span className="text-zinc-200 font-bold">
                  {tradeToClose.executionType === 'BOT_VIRTUAL' ? 'Bot Virtual Order' : 'Exchange Live Order'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Contract Quantity:</span>
                <span className="text-zinc-200 font-bold">{tradeToClose.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Fill / Entry Price:</span>
                <span className="text-zinc-200">${tradeToClose.actualFillPrice || tradeToClose.entryPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Current Market Price:</span>
                <span className="text-zinc-100 font-bold">${tradeToClose.currentPrice}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-zinc-800">
                <span className="text-zinc-400">Est. Unrealized PnL:</span>
                <span
                  className={`font-bold ${
                    (tradeToClose.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(tradeToClose.unrealizedPnl || 0) >= 0 ? '+' : ''}$
                  {(tradeToClose.unrealizedPnl || 0).toFixed(2)} ({tradeToClose.pnlPercent || 0}%)
                </span>
              </div>
            </div>

            {/* Lots to close selection */}
            <div className="bg-[#0b0f17] p-3 rounded-lg border border-zinc-800 space-y-2">
              <span className="text-zinc-400 font-bold block text-[11px] uppercase">Lots to Close on Delta Exchange:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setManualCloseLot('ALL')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    manualCloseLot === 'ALL'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>All Lots ({tradeToClose.quantity})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManualCloseLot('1')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    manualCloseLot !== 'ALL'
                      ? 'bg-amber-950 text-amber-300 border-amber-500 ring-1 ring-amber-500'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Custom Lots</span>
                </button>
              </div>
              {manualCloseLot !== 'ALL' && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    min="1"
                    max={tradeToClose.quantity}
                    value={manualCloseLot}
                    onChange={(e) => setManualCloseLot(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-white font-bold text-xs"
                    placeholder="Enter lots to close..."
                  />
                  <span className="text-[10px] text-zinc-400 whitespace-nowrap">of {tradeToClose.quantity} max</span>
                </div>
              )}
            </div>

            {tradeToClose.isSideChangedOrder && (
              <div className="p-3 bg-amber-950/30 border border-amber-600/70 rounded-lg text-amber-200 text-xs space-y-1">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-400">
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Simultaneous Dual Close Guarantee:</span>
                </div>
                <div className="text-[11px] text-zinc-300 leading-relaxed">
                  Closing this position will market exit the active <strong>{tradeToClose.side}</strong> Exchange order on Delta Exchange and simultaneously finalize the benchmark <strong>{tradeToClose.originalSetupSide || 'BUY/LONG'}</strong> Normal Setup into History.
                </div>
              </div>
            )}

            <p className="text-zinc-300 text-[11px] leading-relaxed">
              This will immediately close this position at current market price, realize PnL, and record the trade outcome to history.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setTradeToClose(null)}
                disabled={isClosing}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={isClosing}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isClosing ? (
                  <span>Closing Position...</span>
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Confirm Market Close</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK CLOSE ALL ORDERS MODAL */}
      {showBulkCloseModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#101622] border border-zinc-700 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-zinc-100 text-sm">
                  Close All Open Orders
                </h3>
              </div>
              <button
                onClick={() => setShowBulkCloseModal(false)}
                disabled={isBulkClosing}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed">
              Aap ek sath sabhi open orders close kar sakte hain. Market price par position close hogi aur realized profit/loss save hoga.
            </p>

            {/* Breakdown Card */}
            <div className="p-3.5 bg-[#0a0e16] border border-zinc-800 rounded-lg space-y-2 text-zinc-300">
              <div className="flex justify-between font-bold text-white">
                <span>Total Open Orders:</span>
                <span className="text-amber-400">{openTrades.length}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  Exchange Live Orders:
                </span>
                <span className="font-bold">{openExchangeTrades.length}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-purple-300">
                  <Bot className="w-3 h-3 text-purple-400" />
                  Bot Virtual Orders:
                </span>
                <span className="font-bold">{openBotTrades.length}</span>
              </div>
            </div>

            {/* Scope Selection */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-400">CHOOSE CLOSE SCOPE:</label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkCloseFilter('ALL')}
                  className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                    bulkCloseFilter === 'ALL'
                      ? 'bg-rose-950/40 border-rose-500 text-white'
                      : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div>
                    <span className="font-bold block">Close Both (Exchange + Bot)</span>
                    <span className="text-[10px] text-zinc-500">Closes all {openTrades.length} active positions</span>
                  </div>
                  {bulkCloseFilter === 'ALL' && <Check className="w-4 h-4 text-rose-400" />}
                </button>

                {openExchangeTrades.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkCloseFilter('EXCHANGE_LIVE')}
                    className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                      bulkCloseFilter === 'EXCHANGE_LIVE'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold block flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        Close Only Exchange Live Orders ({openExchangeTrades.length})
                      </span>
                      <span className="text-[10px] text-zinc-500">Keeps bot virtual orders open</span>
                    </div>
                    {bulkCloseFilter === 'EXCHANGE_LIVE' && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                )}

                {openBotTrades.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkCloseFilter('BOT_VIRTUAL')}
                    className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition ${
                      bulkCloseFilter === 'BOT_VIRTUAL'
                        ? 'bg-purple-950/40 border-purple-500 text-white'
                        : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold block flex items-center gap-1.5">
                        <Bot className="w-3 h-3 text-purple-400" />
                        Close Only Bot Orders ({openBotTrades.length})
                      </span>
                      <span className="text-[10px] text-zinc-500">Keeps exchange live orders open</span>
                    </div>
                    {bulkCloseFilter === 'BOT_VIRTUAL' && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowBulkCloseModal(false)}
                disabled={isBulkClosing}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkClose}
                disabled={isBulkClosing}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isBulkClosing ? (
                  <span>Closing Orders...</span>
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Confirm Bulk Close</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive TP/SL Edit Modal */}
      {editingTrade && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#101622] border border-zinc-700 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-zinc-100 text-sm">
                  Modify TP / SL — {editingTrade.coin}
                </h3>
              </div>
              <button
                onClick={() => setEditingTrade(null)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-[#0b0f17] p-2.5 rounded-lg border border-zinc-800 text-[11px]">
                <span className="text-zinc-400">Order Timeframe:</span>
                <span className="text-amber-300 font-extrabold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {editingTrade.timeframe || '15m'}
                </span>
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">
                  NEW TAKE PROFIT ($)
                </label>
                <input
                  type="number"
                  step="any"
                  value={editTp}
                  onChange={(e) => setEditTp(e.target.value)}
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-emerald-500"
                  placeholder="Enter target price"
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-[11px] mb-1">
                  NEW STOP LOSS ($)
                </label>
                <input
                  type="number"
                  step="any"
                  value={editSl}
                  onChange={(e) => setEditSl(e.target.value)}
                  className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-rose-500"
                  placeholder="Enter stop price"
                />
              </div>
            </div>

            {updateError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 flex items-center gap-2 text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{updateError}</span>
              </div>
            )}

            {updateSuccess && (
              <div className="p-2.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 flex items-center gap-2 text-[11px]">
                <Check className="w-4 h-4 shrink-0" />
                <span>{updateSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingTrade(null)}
                disabled={isUpdating}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTpSl}
                disabled={isUpdating}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/50"
              >
                {isUpdating ? 'Saving...' : 'Save TP/SL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-CLICK CLEAR DAY MODAL */}
      {dayToClear && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#101622] border border-rose-800/80 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-zinc-100 text-sm">
                  {dayToClear === 'ALL' ? 'Clear All Day-by-Day History' : `Clear History for ${dayToClear}`}
                </h3>
              </div>
              <button
                onClick={() => setDayToClear(null)}
                disabled={isClearing}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed">
              {dayToClear === 'ALL'
                ? 'Kya aap sabhi dino ki trade aur order history ko 1 click mai clear karna chahte hain? Sabhi historical records permanently delete ho jayenge.'
                : `Kya aap date ${dayToClear} ke sabhi trade records aur history ko 1 click mai clear karna chahte hain?`}
            </p>

            <div className="p-3 bg-[#0b0f17] border border-zinc-800 rounded-lg text-zinc-300 space-y-1.5">
              <div className="flex justify-between font-bold">
                <span className="text-zinc-400">Target Date:</span>
                <span className="text-amber-400">{dayToClear === 'ALL' ? 'ALL RECORDED DAYS' : dayToClear}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">Operation:</span>
                <span className="text-emerald-400 font-bold">1-Click Instant Removal</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setDayToClear(null)}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearDay}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isClearing ? (
                  <span>Clearing...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm 1-Click Clear</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-CLICK CLEAR ORDERS TABLE MODAL */}
      {showClearOrdersModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#101622] border border-zinc-700 rounded-xl p-5 shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-zinc-100 text-sm">
                  1-Click Clear Orders Table
                </h3>
              </div>
              <button
                onClick={() => setShowClearOrdersModal(false)}
                disabled={isClearing}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed">
              Aap orders table ko 1 click mai clear kar sakte hain. Chuniye ki aapko sirf closed orders delete karne hain ya pura table:
            </p>

            {/* Scope Selection */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setClearOrdersType('CLOSED_ONLY')}
                className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition ${
                  clearOrdersType === 'CLOSED_ONLY'
                    ? 'bg-emerald-950/40 border-emerald-500 text-white'
                    : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div>
                  <span className="font-bold block text-emerald-400">Clear Closed Orders Only</span>
                  <span className="text-[10px] text-zinc-400">Safe: Keeps active OPEN positions untouched, clears completed/TP/SL trades</span>
                </div>
                {clearOrdersType === 'CLOSED_ONLY' && <Check className="w-4 h-4 text-emerald-400" />}
              </button>

              <button
                type="button"
                onClick={() => setClearOrdersType('ALL')}
                className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition ${
                  clearOrdersType === 'ALL'
                    ? 'bg-rose-950/40 border-rose-500 text-white'
                    : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div>
                  <span className="font-bold block text-rose-400">Clear Entire Orders Table ({trades.length} Orders)</span>
                  <span className="text-[10px] text-zinc-400">Removes all entries from orders table</span>
                </div>
                {clearOrdersType === 'ALL' && <Check className="w-4 h-4 text-rose-400" />}
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowClearOrdersModal(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearOrders}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isClearing ? (
                  <span>Clearing...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER DIAGNOSTICS & PCD REASON MODAL */}
      {selectedTradeForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="max-w-2xl w-full bg-[#0d131f] border border-cyan-800/60 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 font-mono text-xs my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base font-extrabold text-white tracking-wide">
                  {selectedTradeForDetails.coin}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                    selectedTradeForDetails.side === 'BUY'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-rose-950 text-rose-300 border border-rose-700'
                  }`}
                >
                  {selectedTradeForDetails.side} {selectedTradeForDetails.leverage || 10}x
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-extrabold bg-amber-950/80 text-amber-300 border border-amber-600">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {selectedTradeForDetails.timeframe || '15m'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    selectedTradeForDetails.status === 'OPEN'
                      ? 'bg-sky-950 text-sky-400 border border-sky-800 animate-pulse'
                      : selectedTradeForDetails.status === 'TP HIT'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {selectedTradeForDetails.status}
                </span>
              </div>
              <button
                onClick={() => setSelectedTradeForDetails(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* PCD (Price Change Distribution) Status Banner */}
            <div className="p-3.5 rounded-xl border bg-cyan-950/30 border-cyan-800/70 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-[12px]">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>PCD (Price Change Distribution) Reason & Breadth</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-900/60 text-cyan-200 border border-cyan-700">
                  PCD ENGINE ACTIVE
                </span>
              </div>

              <div className="text-zinc-200 text-[11px] leading-relaxed">
                {selectedTradeForDetails.pcdReason ||
                  (selectedTradeForDetails.supportingReasons?.find((r) => r.toLowerCase().includes('pcd'))) ||
                  'PCD Breadth Verification: Cleared under institutional market distribution standards.'}
              </div>

              <div className="pt-2 border-t border-cyan-900/40 text-[10px] text-cyan-400 flex items-center justify-between flex-wrap gap-2">
                <span>Market Breadth at Entry: {selectedTradeForDetails.marketBreadthAtEntry || 'Broad Market Aligned'}</span>
                <span>Rule: 1:5 R:R High-Confluence Filter</span>
              </div>
            </div>

            {/* 24H Range Target Band & Directional Forensics Card */}
            {(selectedTradeForDetails.rangeBandAtCreation || selectedTradeForDetails.whyDirectionRationale || selectedTradeForDetails.movePercent24hAtCreation !== undefined) && (
              <div className="p-3.5 rounded-xl border bg-[#081220] border-sky-800/70 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-sky-900/50">
                  <div className="flex items-center gap-2 font-bold text-sky-300 text-xs">
                    <Target className="w-4 h-4 text-sky-400" />
                    <span>24H Range Target Filter & Direction Logic</span>
                  </div>
                  {selectedTradeForDetails.rangeBandAtCreation && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-200 border border-sky-600">
                      Target Band: {selectedTradeForDetails.rangeBandAtCreation}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <div className="p-2 bg-[#050a14] rounded-lg border border-zinc-800">
                    <span className="text-zinc-500 block text-[9.5px]">24H MOVE AT SETUP</span>
                    <span className={`font-mono font-bold ${
                      (selectedTradeForDetails.movePercent24hAtCreation || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {(selectedTradeForDetails.movePercent24hAtCreation || 0) > 0 ? '+' : ''}{(selectedTradeForDetails.movePercent24hAtCreation || 0).toFixed(2)}%
                    </span>
                  </div>
                  <div className="p-2 bg-[#050a14] rounded-lg border border-zinc-800">
                    <span className="text-zinc-500 block text-[9.5px]">CONTEXT</span>
                    <span className="font-mono font-bold text-zinc-200">
                      {selectedTradeForDetails.marketMoveContext || '24H Momentum Target Band'}
                    </span>
                  </div>
                </div>

                {selectedTradeForDetails.whyDirectionRationale && (
                  <div className="p-2.5 rounded-lg bg-[#040812] border border-sky-900/60 text-sky-200 text-[11px] leading-relaxed">
                    <div className="font-bold text-sky-400 flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider">
                      <span>Direction Mathematical Rationale ({selectedTradeForDetails.side} setup kyu bana):</span>
                    </div>
                    <div>{selectedTradeForDetails.whyDirectionRationale}</div>
                  </div>
                )}
              </div>
            )}

            {/* Execution Routing & Error Diagnostics Box */}
            <div className="p-3.5 rounded-xl border bg-[#090d16] border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-300 text-[11px] uppercase tracking-wider">
                  Order Routing & Exchange Status
                </span>
                {selectedTradeForDetails.executionType === 'BOT_VIRTUAL' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                    <Bot className="w-3 h-3 text-purple-400" />
                    BOT ORDER (SIMULATED / PAPER)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    DELTA EXCHANGE LIVE CONFIRMED
                  </span>
                )}
              </div>

              {selectedTradeForDetails.executionType === 'BOT_VIRTUAL' && (
                <div className="space-y-2">
                  <div className="p-3 bg-amber-950/20 border border-amber-800/60 rounded-lg text-amber-200 text-[11px] leading-relaxed">
                    <div className="font-bold text-amber-400 flex items-center gap-1.5 mb-1 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Reason order was routed as Bot Order (Not Real Exchange Order):</span>
                    </div>
                    <div>
                      {selectedTradeForDetails.orderNotPlacedReason ||
                        selectedTradeForDetails.executionNote ||
                        'Delta Exchange API credentials missing or disconnected.'}
                    </div>
                  </div>

                  {/* Dedicated IP Restriction Help Guide if detected */}
                  {(selectedTradeForDetails.orderNotPlacedReason?.includes('IP Restriction') ||
                    selectedTradeForDetails.executionNote?.includes('IP Restriction')) && (
                    <div className="p-3 bg-rose-950/20 border border-rose-800/50 rounded-lg text-[11px] text-zinc-300 space-y-1.5">
                      <div className="font-bold text-rose-400 flex items-center gap-1.5 text-[11px]">
                        <Shield className="w-3.5 h-3.5" />
                        <span>How to fix Delta IP Restriction in 1 Minute:</span>
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-zinc-300 text-[10.5px]">
                        <li>Delta Exchange account par login karein.</li>
                        <li><strong>Settings &rarr; API Management</strong> par jayein.</li>
                        <li>Apni API Key ko <strong>Edit</strong> karein aur <strong>IP Access Restriction</strong> ko <em>'Unrestricted' (Allow all IPs)</em> par set karein, ya server IP <code>34.34.244.142</code> ko whitelist karein.</li>
                        <li>Save karein. Iske baad real live orders direct Delta Exchange par bina block hue execute honge!</li>
                      </ol>
                    </div>
                  )}

                  <div className="text-[10px] text-zinc-400 italic">
                    ℹ️ Automatic Failover Protection: Setup miss na ho isliye bot ne turant is trade ko Bot Order bana diya taaki 1:5 target aur PnL track hota rahe.
                  </div>
                </div>
              )}

              {selectedTradeForDetails.executionType === 'EXCHANGE_LIVE' && (
                <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/60 rounded-lg text-emerald-300 text-[11px]">
                  Real order confirmed and placed on Delta Exchange. Order ID: <code className="text-white">{selectedTradeForDetails.orderId}</code>
                </div>
              )}
            </div>

            {/* Side Change Dual Tracking Card */}
            {selectedTradeForDetails.isSideChangedOrder && (
              <div className="p-3.5 rounded-xl border bg-amber-950/20 border-amber-600/70 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-amber-800/40">
                  <div className="flex items-center gap-2 font-bold text-amber-300 text-xs">
                    <ArrowLeftRight className="w-4 h-4 text-amber-400" />
                    <span>Side Change Feature Active (Dual Order Comparison)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600">
                    SL Setting: {selectedTradeForDetails.sideChangeSlSetting || 'SL'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  {/* Exchange Order (Side Changed) */}
                  <div className="p-3 bg-[#0a0f1d] rounded-lg border border-emerald-900/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" />
                        <span>EXCHANGE ORDER (SIDE CHANGED)</span>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                        REAL ORDER
                      </span>
                    </div>
                    <div className="text-zinc-300 text-[10.5px]">
                      Side: <strong className="text-white">{selectedTradeForDetails.side}</strong> &bull; Entry Price: <strong className="text-white">${selectedTradeForDetails.entryPrice || selectedTradeForDetails.actualFillPrice}</strong>
                    </div>
                    <div className="text-zinc-300 text-[10.5px]">
                      Target TP: <strong className="text-emerald-400">${selectedTradeForDetails.tp}</strong> &bull; Stop Loss: <strong className="text-rose-400">${selectedTradeForDetails.sl}</strong>
                    </div>
                    <div className="pt-1 border-t border-zinc-800 text-[10.5px]">
                      Live PnL: <strong className={(selectedTradeForDetails.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {(selectedTradeForDetails.unrealizedPnl || 0) >= 0 ? '+' : ''}${((selectedTradeForDetails.status === 'OPEN' ? selectedTradeForDetails.unrealizedPnl : selectedTradeForDetails.realizedPnl) || 0).toFixed(2)} ({selectedTradeForDetails.pnlPercent || 0}%)
                      </strong>
                    </div>
                  </div>

                  {/* Normal Setup Order (Original Side) */}
                  <div className="p-3 bg-[#0a0f1d] rounded-lg border border-amber-900/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-300 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>NORMAL SETUP (ORIGINAL SIDE)</span>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        BENCHMARK ONLY
                      </span>
                    </div>
                    <div className="text-zinc-300 text-[10.5px]">
                      Setup Side: <strong className="text-white">{selectedTradeForDetails.originalSetupSide || 'BUY/LONG'}</strong> &bull; Entry Price: <strong className="text-white">${selectedTradeForDetails.entryPrice || selectedTradeForDetails.normalSetupSnapshot?.entry}</strong>
                    </div>
                    <div className="text-zinc-300 text-[10.5px]">
                      Original TP: <strong className="text-emerald-400">${selectedTradeForDetails.normalSetupSnapshot?.tp1 || 'N/A'}</strong> &bull; Original SL: <strong className="text-rose-400">${selectedTradeForDetails.normalSetupSnapshot?.sl || 'N/A'}</strong>
                    </div>
                    <div className="pt-1 border-t border-zinc-800 text-[10.5px]">
                      Virtual PnL: <strong className={(selectedTradeForDetails.normalSetupSnapshot?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {(selectedTradeForDetails.normalSetupSnapshot?.pnl || 0) >= 0 ? '+' : ''}${selectedTradeForDetails.normalSetupSnapshot?.pnl || 0} ({selectedTradeForDetails.normalSetupSnapshot?.pnlPercent || 0}%)
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-zinc-400 italic">
                  ℹ️ Exchange par sirph Side Changed order execute hua hai. Original Setup order sirph comparison/benchmark ke liye dikhaya ja raha hai.
                </div>
              </div>
            )}

            {/* Financial Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2.5 bg-[#090d16] rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">ENTRY PRICE</span>
                <span className="text-white font-bold font-mono text-sm">${selectedTradeForDetails.entryPrice}</span>
              </div>
              <div className="p-2.5 bg-[#090d16] rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">1:5 TP TARGET</span>
                <span className="text-emerald-400 font-bold font-mono text-sm">${selectedTradeForDetails.tp}</span>
              </div>
              <div className="p-2.5 bg-[#090d16] rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">STOP LOSS</span>
                <span className="text-rose-400 font-bold font-mono text-sm">${selectedTradeForDetails.sl}</span>
              </div>
              <div className="p-2.5 bg-[#090d16] rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">LIVE P&L</span>
                <span className={`font-bold font-mono text-sm ${(selectedTradeForDetails.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(selectedTradeForDetails.unrealizedPnl || 0) >= 0 ? '+' : ''}${((selectedTradeForDetails.status === 'OPEN' ? selectedTradeForDetails.unrealizedPnl : selectedTradeForDetails.realizedPnl) || 0).toFixed(2)} ({selectedTradeForDetails.pnlPercent || 0}%)
                </span>
              </div>
            </div>

            {/* Technical Thesis ("Kyu Banta Tha Setup") */}
            <div className="p-3.5 bg-[#090d16] rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>KYU BANTA THA SETUP (Breakout Thesis & Indicators)</span>
              </div>
              <div className="text-zinc-300 text-[11px] leading-relaxed">
                {selectedTradeForDetails.whyFormed || selectedTradeForDetails.primaryReason || '1:5 Mathematical Confluence Trend Breakout'}
              </div>

              {selectedTradeForDetails.supportingReasons && selectedTradeForDetails.supportingReasons.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                  <span className="text-zinc-500 text-[10px]">Confluence Factors:</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-zinc-300 text-[10.5px]">
                    {selectedTradeForDetails.supportingReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Multi-Timeframe Protection Status Banner */}
            <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-center justify-between text-[11px] text-emerald-300 flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Multi-Timeframe Protection Active: Exactly 1 trade permitted per coin</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">No Overlapping Risk</span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedTradeForDetails(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
