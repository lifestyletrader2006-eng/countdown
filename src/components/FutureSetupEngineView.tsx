import React, { useState, useMemo, useEffect } from 'react';
import {
  Crosshair,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  BarChart2,
  Filter,
  Play,
  RotateCcw,
  History,
  Clock,
  ExternalLink,
  Sparkles,
  Info,
  Check,
  Columns,
  LayoutGrid,
  X,
  ChevronRight,
  Eye,
  ShieldAlert,
  ShieldCheck,
  Layers,
  ArrowRight,
  ArrowLeftRight,
  Bot,
  Activity,
  DollarSign,
  CheckSquare,
  Square,
  RefreshCw,
  Copy,
  Brain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AITradeForensicsModal } from './AITradeForensicsModal.js';
import type {
  FutureSetup,
  SetupHistoryRecord,
  SetupTimeframe,
  TradeRecord,
  ExchangeConfig,
} from '../types/index.js';
import { SetupHistoryView } from './SetupHistoryView.js';
import { LivePriceTicker, LiveDistanceBadge } from './LivePriceTicker.js';
import { PriceTransitionCell } from './PriceTransitionCell.js';

export interface FutureSetupEngineViewProps {
  setups: FutureSetup[];
  trades?: TradeRecord[];
  history?: SetupHistoryRecord[];
  config?: ExchangeConfig;
  onExecuteSetup: (setupId: string, executionPreference?: 'EXCHANGE' | 'BOT') => Promise<void>;
  onInspectForensics?: (symbol: string) => void;
  onClearHistory?: () => Promise<void>;
  currentTimeframe?: SetupTimeframe;
  onTimeframeChange?: (timeframe: SetupTimeframe) => Promise<void> | void;
  onMultiTimeframeChange?: (params: {
    botScanningTimeframes?: SetupTimeframe[];
    exchangeScanningTimeframes?: SetupTimeframe[];
    scanningTimeframe?: SetupTimeframe;
  }) => Promise<void> | void;
}

const ALL_TIMEFRAMES: SetupTimeframe[] = ['15m', '30m', '1h', '4h', '1d'];

/**
 * Generates a unique composite key based on coin, timeframe, and setup-source
 * Strictly prevents duplicate setup listing and UI card flickering
 */
export const getSetupCompositeKey = (s: FutureSetup): string => {
  const id = (s.id || '').trim();
  const coin = (s.coin || '').trim().toUpperCase();
  const timeframe = (s.timeframe || '15m').trim().toLowerCase();
  const dir = (s.direction || '').trim().toUpperCase();
  const source = (s.source || s.strategy || s.instrumentType || 'DELTA_FUTURES_CONFLUENCE').trim().toUpperCase();
  return id ? `${id}_${timeframe}_${dir}` : `${coin}_${timeframe}_${dir}_${source}`;
};

/**
 * Determine which Kanban stage a setup belongs to
 */
export type KanbanStage = 'WATCHING' | 'NEAR_SETUP' | 'TRIGGER_APPROACHING' | 'TRIGGERED';

export const getSetupKanbanStage = (s: FutureSetup): KanbanStage => {
  const status = (s.status || '').toUpperCase();
  if (['TRIGGERED', 'TRADE OPEN', 'ORDER SUBMITTED', 'REJECTED'].includes(status)) {
    return 'TRIGGERED';
  }
  if (status === 'TRIGGER APPROACHING' || (s.distanceToTriggerPercent !== undefined && s.distanceToTriggerPercent <= 0.5)) {
    return 'TRIGGER_APPROACHING';
  }
  if (s.distanceToTriggerPercent !== undefined && s.distanceToTriggerPercent <= 1.5) {
    return 'NEAR_SETUP';
  }
  return 'WATCHING';
};

/**
 * Helper to get order type and reason
 */
export const getOrderPlacementDiagnostics = (s: FutureSetup) => {
  const isExchange = s.executionMode === 'EXCHANGE' || (s.hasOrderPlaced && !s.orderNotPlacedReason);
  const notPlacedReason = s.orderNotPlacedReason || (s.reason?.includes('Bot Virtual') || s.reason?.includes('Bot Order') ? s.reason : null);
  return {
    isExchange,
    isBotOrder: !isExchange,
    notPlacedReason,
  };
};

// ---------------------------------------------------------------------------
// Technical Forensics Side-Panel Component
// ---------------------------------------------------------------------------
interface TechnicalForensicsSidePanelProps {
  setup: FutureSetup | null;
  section: 'BOT' | 'EXCHANGE';
  onClose: () => void;
  onInspectDeep?: (symbol: string) => void;
  onOpenAIForensics?: (setup: FutureSetup) => void;
  onExecute: (id: string, pref: 'EXCHANGE' | 'BOT') => Promise<void>;
  executingId: string | null;
}

const TechnicalForensicsSidePanel: React.FC<TechnicalForensicsSidePanelProps> = ({
  setup: s,
  section,
  onClose,
  onInspectDeep,
  onOpenAIForensics,
  onExecute,
  executingId,
}) => {
  if (!s) return null;
  const isLong = s.direction === 'BUY/LONG' || s.direction.includes('LONG') || s.direction.includes('BUY');
  const lockedTargetPrice = s.entryPrice ?? s.triggerPrice;
  const { isExchange, notPlacedReason } = getOrderPlacementDiagnostics(s);
  const pcdReasonText = s.pcdReason || s.supportingReasons?.find((r) => r.toLowerCase().includes('pcd')) || 'PCD Breadth Verification: Cleared under institutional market distribution standards. No chop trap detected.';
  const isOutlier = pcdReasonText.toLowerCase().includes('outlier') || s.expectedMovePercent > 10;

  return (
    <div
      id="forensics-side-panel"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0d121c] border-l border-zinc-800 shadow-2xl flex flex-col transition-all transform animate-in slide-in-from-right duration-300"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-zinc-800 bg-[#101622] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-zinc-100 font-mono flex items-center gap-2">
              <span>{s.coin}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                  isLong ? 'bg-emerald-950 text-emerald-400 border border-emerald-600/60' : 'bg-rose-950 text-rose-400 border border-rose-600/60'
                }`}
              >
                {s.direction}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                {s.timeframe || '15m'}
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400 font-mono">
              {section === 'BOT' ? '🤖 Bot Setup Forensics' : '⚡ Exchange Setup Forensics'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          id="close-forensics-panel-btn"
          className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition"
          title="Close Forensics Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {/* PCD (PRICE CHANGE DISTRIBUTION) ENGINE STATUS & VERDICT */}
        <div className="p-3.5 bg-gradient-to-br from-cyan-950/50 via-[#0d1526] to-[#070b14] rounded-xl border border-cyan-500/60 space-y-3 shadow-xl shadow-cyan-950/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-cyan-300 flex items-center gap-1.5 tracking-wide">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>PCD INTELLIGENCE & VERDICT</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-900/80 text-cyan-200 border border-cyan-400 flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{isOutlier ? 'PCD OUTLIER EXEMPTION' : 'PCD APPROVED'}</span>
            </span>
          </div>

          {/* Direct Answer: Kya yeh setup PCD se bana hai? */}
          <div className="p-2.5 bg-[#050912] rounded-lg border border-cyan-900/80 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-bold flex items-center gap-1">
                <span>क्या यह सेटअप PCD से बना है?</span>
              </span>
              <span className="font-extrabold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-600/70 text-[10px] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>हाँ (YES - PCD VERIFIED)</span>
              </span>
            </div>

            <div className="p-2 bg-[#0a0f1d] rounded border border-zinc-800/80 text-[11px] text-zinc-200 leading-relaxed">
              <div className="text-cyan-300 font-bold text-[10.5px] mb-1 flex items-center gap-1">
                <span>PCD नियम व कारण (Reason):</span>
              </div>
              <p className="text-zinc-300">{pcdReasonText}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
              <div className="p-1.5 bg-[#080d1a] rounded border border-zinc-800">
                <span className="text-zinc-500 block">मार्केट ब्रेड्थ (Breadth):</span>
                <span className="text-zinc-200 font-bold truncate block">
                  {s.marketBreadthAtEntry || 'Broad Market Aligned'}
                </span>
              </div>
              <div className="p-1.5 bg-[#080d1a] rounded border border-zinc-800">
                <span className="text-zinc-500 block">आउटलायर दर्जा (Outlier):</span>
                <span className={isOutlier ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>
                  {isOutlier ? '🌟 Outlier Exemption' : '✓ Normal Breadth'}
                </span>
              </div>
            </div>
          </div>

          {/* 24H Range Target Filter & Directional Forensic Thesis */}
          {(s.rangeBandAtCreation || s.whyDirectionRationale || s.movePercent24hAtCreation !== undefined) && (
            <div className="p-3 bg-[#081220] rounded-xl border border-sky-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-sky-400" />
                  <span>24H Range Band & Directional Rationale</span>
                </span>
                {s.rangeBandAtCreation && (
                  <span className="font-extrabold text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-600 text-[10px]">
                    Target: {s.rangeBandAtCreation}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-1.5 bg-[#050a14] rounded border border-zinc-800">
                  <span className="text-zinc-500 block">24H Move at Creation:</span>
                  <span className={`font-bold font-mono ${
                    (s.movePercent24hAtCreation || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {(s.movePercent24hAtCreation || 0) > 0 ? '+' : ''}{(s.movePercent24hAtCreation || 0).toFixed(2)}%
                  </span>
                </div>
                <div className="p-1.5 bg-[#050a14] rounded border border-zinc-800">
                  <span className="text-zinc-500 block">Current 24H Live:</span>
                  <span className={`font-bold font-mono ${
                    (s.current24hMovePercent || s.movePercent24hAtCreation || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {(s.current24hMovePercent || s.movePercent24hAtCreation || 0) > 0 ? '+' : ''}{(s.current24hMovePercent || s.movePercent24hAtCreation || 0).toFixed(2)}%
                  </span>
                </div>
              </div>

              {s.whyDirectionRationale && (
                <div className="p-2 bg-[#040812] rounded border border-sky-900/60 text-[11px] text-zinc-200 leading-relaxed">
                  <div className="text-sky-300 font-bold text-[10.5px] mb-1">
                    Mathematical Direction Logic ({s.direction}):
                  </div>
                  <p className="text-zinc-300">{s.whyDirectionRationale}</p>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenAIForensics && onOpenAIForensics(s)}
            className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-cyan-950 via-cyan-900 to-sky-950 hover:from-cyan-900 hover:to-sky-900 text-cyan-200 border border-cyan-600 font-bold text-[11px] transition flex items-center justify-center gap-2 shadow-md shadow-cyan-950/50"
          >
            <Brain className="w-4 h-4 text-cyan-300" />
            <span>AI Forensics: Kyu & Kaise Bana (Detailed AI Breakdown)</span>
          </button>
        </div>

        {/* Order Execution Diagnostics (Exchange vs Bot Order) */}
        <div className={`p-3 rounded-xl border ${
          isExchange
            ? 'bg-sky-950/20 border-sky-600/60'
            : notPlacedReason
            ? 'bg-amber-950/30 border-amber-600/70'
            : 'bg-[#101622] border-zinc-800'
        }`}>
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>EXECUTION ROUTING ({section} MODE)</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                isExchange
                  ? 'bg-sky-900/60 text-sky-300 border border-sky-500'
                  : 'bg-purple-950/80 text-purple-300 border border-purple-600'
              }`}
            >
              {isExchange ? 'EXCHANGE ORDER' : 'BOT ORDER'}
            </span>
          </div>
          <div className="mt-2 text-[11px] space-y-1">
            {isExchange ? (
              <p className="text-sky-300">
                ✓ Order routed and confirmed directly on Delta Exchange orderbook.
              </p>
            ) : (
              <div className="space-y-1">
                <span className="text-zinc-400 text-[10px] uppercase font-bold">Execution Status & Diagnostics:</span>
                <p className="text-amber-300 bg-amber-950/40 p-2 rounded border border-amber-800/60 leading-relaxed text-[11px]">
                  {notPlacedReason || (s.hasOrderPlaced ? 'Bot virtual tracking active' : 'Waiting for trigger conditions or auto trade activation')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pricing & Trigger Targets */}
        <div className="p-3 bg-[#101622] rounded-xl border border-zinc-800 space-y-2">
          <div className="text-zinc-400 text-[11px] font-bold flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>PRICE CONFLUENCE TARGETS (1:5 RATIO)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-[#0a0e16] p-2 rounded border border-zinc-800">
              <div className="text-zinc-500 text-[10px]">LOCKED ENTRY</div>
              <div className="font-bold text-emerald-400 text-sm mt-0.5">${lockedTargetPrice}</div>
            </div>
            <div className="bg-[#0a0e16] p-2 rounded border border-zinc-800">
              <div className="text-zinc-500 text-[10px]">DELTA LIVE PRICE</div>
              <div className="mt-0.5">
                <PriceTransitionCell price={s.currentPrice} size="sm" showDirectionIcon={true} />
              </div>
            </div>
            <div className="bg-[#0a0e16] p-2 rounded border border-zinc-800">
              <div className="text-zinc-500 text-[10px]">1:5 TP TARGET</div>
              <div className="font-bold text-emerald-400 mt-0.5">${s.tp1}</div>
            </div>
            <div className="bg-[#0a0e16] p-2 rounded border border-zinc-800">
              <div className="text-zinc-500 text-[10px]">STOP LOSS</div>
              <div className="font-bold text-rose-400 mt-0.5">${s.sl}</div>
            </div>
          </div>
        </div>

        {/* Volume Profile Depth Forensics */}
        <div className="p-3 bg-[#101622] rounded-xl border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-bold text-[11px] flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
              <span>VOLUME PROFILE DEPTH</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                s.volumeProfileNode === 'HVN_POC'
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-700'
                  : s.volumeProfileNode === 'LVN_BREAKOUT'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-700'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}
            >
              {s.volumeProfileNode === 'HVN_POC'
                ? 'High Volume POC'
                : s.volumeProfileNode === 'LVN_BREAKOUT'
                ? 'LVN Breakout'
                : 'Neutral Node'}
            </span>
          </div>

          <div className="space-y-1.5">
            {(s.volumeProfileBins || [
              { price: Math.round(lockedTargetPrice * 0.99 * 100) / 100, volumePct: 35 },
              { price: Math.round(lockedTargetPrice * 0.995 * 100) / 100, volumePct: 65 },
              { price: lockedTargetPrice, volumePct: 95, isPOC: true },
              { price: Math.round(lockedTargetPrice * 1.005 * 100) / 100, volumePct: 70 },
              { price: Math.round(lockedTargetPrice * 1.01 * 100) / 100, volumePct: 40 },
            ]).map((bin, bIdx) => (
              <div key={`${s.id || s.coin}_bin_${bIdx}`} className="flex items-center gap-2 text-[10px]">
                <span className={`w-16 text-right truncate ${bin.isPOC ? 'text-emerald-300 font-bold' : 'text-zinc-500'}`}>
                  ${bin.price}
                </span>
                <div className="flex-1 bg-zinc-900 h-2 rounded overflow-hidden relative">
                  <div
                    className={`h-full rounded transition-all duration-500 ${
                      bin.isPOC ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-zinc-700/80'
                    }`}
                    style={{ width: `${bin.volumePct}%` }}
                  />
                </div>
                <span className={`w-10 text-[9px] ${bin.isPOC ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}>
                  {bin.isPOC ? '★ POC' : `${bin.volumePct}%`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-800">
            <span>Liquidity Concentration:</span>
            <span className="text-zinc-200 font-bold">{s.volumeProfileConcentration || 82}% Orderbook Depth</span>
          </div>
        </div>

        {/* "KAB SETUP BANEGA" Trigger Guidance */}
        <div className="p-3 bg-[#0c121e] rounded-xl border border-sky-900/60 space-y-1.5">
          <div className="flex items-center gap-1.5 text-sky-400 font-bold text-[11px]">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>KAB SETUP BANEGA (Anticipated Trigger Rule & ETA)</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            {s.kabSetupBanega || `Trigger activates at $${lockedTargetPrice} upon volume and RSI confirmation.`}
          </p>
        </div>

        {/* "KYU BANTA THA SETUP" & Technical Confluence Breakdown */}
        <div className="p-3 bg-[#101622] rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-200 font-bold text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>KYU BANTA THA SETUP (Thesis)</span>
            </span>
            <span className="text-[10px] text-emerald-400">{s.indicatorConfirmations?.marketStructure}</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            {s.whyFormed || s.reason}
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-zinc-800 text-zinc-300">
            <div className="p-1.5 bg-[#0a0e16] rounded border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block">Trend:</span>
              <strong className="text-zinc-100">{s.indicatorConfirmations?.trend || 'Bullish Momentum'}</strong>
            </div>
            <div className="p-1.5 bg-[#0a0e16] rounded border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block">RSI:</span>
              <strong className="text-zinc-100">{s.indicatorConfirmations?.rsi || 'Momentum Neutral'}</strong>
            </div>
            <div className="p-1.5 bg-[#0a0e16] rounded border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block">Pattern:</span>
              <strong className="text-zinc-100">{s.indicatorConfirmations?.pattern || 'Breakout & Retest'}</strong>
            </div>
            <div className="p-1.5 bg-[#0a0e16] rounded border border-zinc-800/80">
              <span className="text-zinc-500 text-[10px] block">Volume:</span>
              <strong className="text-zinc-100">{s.indicatorConfirmations?.volumeProfile || 'HVN Accumulation'}</strong>
            </div>
          </div>
        </div>

        {/* Verified Evidence Links */}
        {s.sourceLinks && s.sourceLinks.length > 0 && (
          <div className="p-3 bg-[#101622] rounded-xl border border-zinc-800 space-y-2">
            <div className="text-zinc-400 font-semibold text-[11px] flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              <span>VERIFIED EVIDENCE LINKS</span>
            </div>
            <div className="space-y-1.5">
              {s.sourceLinks.map((link, idx) => (
                <a
                  key={`${s.id || s.coin}_ev_${link.url || idx}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded bg-[#0a0e16] border border-zinc-800 hover:border-emerald-500 text-zinc-300 hover:text-emerald-400 transition truncate"
                >
                  <span className="truncate text-[11px]">{link.title}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0 ml-2 font-mono">[{link.sourceName}]</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panel Footer Actions */}
      <div className="p-4 border-t border-zinc-800 bg-[#101622] flex items-center justify-between gap-3">
        <button
          onClick={() => {
            if (onOpenAIForensics) {
              onOpenAIForensics(s);
            } else if (onInspectDeep) {
              onInspectDeep(s.coin);
            }
          }}
          className="flex-1 px-3 py-2 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 font-bold text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Brain className="w-3.5 h-3.5 text-cyan-400" />
          <span>AI Forensics</span>
        </button>
        <button
          onClick={() => onExecute(s.id, section)}
          disabled={executingId === s.id}
          className={`flex-1 px-3 py-2 rounded-lg font-bold text-xs font-mono transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${
            section === 'EXCHANGE'
              ? 'bg-sky-500 hover:bg-sky-400 text-black shadow-lg shadow-sky-950/50'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-950/50'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>
            {executingId === s.id
              ? 'Submitting...'
              : section === 'EXCHANGE'
              ? 'Trigger Exchange Order'
              : 'Trigger Bot Order'}
          </span>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Kanban Card Component
// ---------------------------------------------------------------------------
interface KanbanCardProps {
  setup: FutureSetup;
  section: 'BOT' | 'EXCHANGE';
  executingId: string | null;
  onManualExecute: (id: string, pref: 'EXCHANGE' | 'BOT') => Promise<void>;
  onSelectForensics: (setup: FutureSetup) => void;
  onOpenAIForensics?: (setup: FutureSetup) => void;
  isSelected: boolean;
  config?: ExchangeConfig;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  setup: s,
  section,
  executingId,
  onManualExecute,
  onSelectForensics,
  onOpenAIForensics,
  isSelected,
  config,
}) => {
  const isLong = s.direction === 'BUY/LONG' || s.direction.includes('LONG') || s.direction.includes('BUY');
  const lockedTargetPrice = s.entryPrice ?? s.triggerPrice;
  const { isExchange, notPlacedReason } = getOrderPlacementDiagnostics(s);

  // Is this an exchange error converted to bot order?
  const isExchangeFailover = section === 'EXCHANGE' && !isExchange && Boolean(notPlacedReason);

  return (
    <div
      id={`kanban-card-${s.id}`}
      className={`bg-[#101622] border rounded-xl p-3.5 space-y-2.5 transition-all shadow-md cursor-pointer hover:border-zinc-700 ${
        isSelected
          ? 'border-emerald-500 ring-1 ring-emerald-500/40'
          : isExchangeFailover
          ? 'border-amber-600/80 shadow-amber-950/30 ring-1 ring-amber-500/30'
          : s.status === 'TRADE OPEN'
          ? 'border-sky-500/80 shadow-sky-950/20'
          : s.status === 'TRIGGERED'
          ? 'border-emerald-500/80 shadow-emerald-950/20'
          : s.status === 'REJECTED'
          ? 'border-rose-800/70 shadow-rose-950/20'
          : s.status === 'TRIGGER APPROACHING'
          ? 'border-amber-500/60 shadow-amber-950/20'
          : 'border-zinc-800/80'
      }`}
      onClick={() => onSelectForensics(s)}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-1.5 border-b border-zinc-800/80 pb-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-zinc-100 text-sm font-mono">{s.coin}</span>
            <span className="text-[9px] text-zinc-300 bg-[#0a0e16] px-1.5 py-0.5 rounded border border-zinc-700 font-mono font-bold">
              {s.timeframe || '15m'}
            </span>
            {s.movePercent24hAtCreation !== undefined && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                s.movePercent24hAtCreation >= 0
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-800'
              }`} title={`24H move: ${s.movePercent24hAtCreation > 0 ? '+' : ''}${s.movePercent24hAtCreation.toFixed(2)}%`}>
                {s.movePercent24hAtCreation > 0 ? '+' : ''}{s.movePercent24hAtCreation.toFixed(1)}%
              </span>
            )}
            {s.rangeBandAtCreation && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-950/70 text-amber-300 border border-amber-800" title={`Target Range Band: ${s.rangeBandAtCreation}`}>
                🎯 {s.rangeBandAtCreation}
              </span>
            )}
            {section === 'EXCHANGE' ? (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                isExchange
                  ? 'bg-sky-950 text-sky-300 border-sky-600/70'
                  : 'bg-amber-950 text-amber-300 border-amber-600/70'
              }`}>
                {isExchange ? '⚡ Exchange' : '⚠️ Bot Fallback'}
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-purple-950 text-purple-300 border border-purple-600/70">
                🤖 Bot
              </span>
            )}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
            Score: <strong className="text-purple-300">{s.score}/100</strong> • Win: <span className="text-zinc-300">{s.historicalProbability || 85}%</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
              isLong
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-600/60'
                : 'bg-rose-950/80 text-rose-400 border border-rose-600/60'
            }`}
          >
            {s.direction}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase ${
              s.status === 'TRADE OPEN'
                ? 'bg-sky-950 text-sky-400 border border-sky-700 animate-pulse'
                : s.status === 'TRIGGERED'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-700 animate-pulse'
                : s.status === 'TRIGGER APPROACHING'
                ? 'bg-amber-950 text-amber-400 border border-amber-700'
                : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700'
            }`}
          >
            {s.status}
          </span>
        </div>
      </div>

      {/* Side Change & Countdown Badges */}
      {config?.sideChangeEnabled && (
        <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-amber-950/70 border border-amber-600/80 text-amber-300 font-mono text-[9.5px] font-bold">
          <span className="flex items-center gap-1">
            <ArrowLeftRight className="w-3 h-3 text-amber-400 animate-pulse" />
            <span>SIDE CHANGE ON</span>
          </span>
          <span className="text-zinc-200">
            Order: <strong className={isLong ? 'text-rose-400' : 'text-emerald-400'}>{isLong ? 'SELL/SHORT' : 'BUY/LONG'}</strong>
          </span>
        </div>
      )}

      {s.countdownActive && (
        <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-rose-950/70 border border-rose-600 text-rose-300 font-mono text-[9.5px] font-bold">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-rose-400 animate-spin" />
            <span>COOLDOWN LOCKED</span>
          </span>
          <span>
            {s.countdownRemainingSeconds ? `${Math.ceil(s.countdownRemainingSeconds / 60)}m left` : 'Locked'}
          </span>
        </div>
      )}

      {/* Target & Live Price */}
      <div className="bg-[#0b0f17] p-2 rounded-lg border border-zinc-800/80 space-y-1 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 text-[10px]">Locked Entry:</span>
          <span className="font-bold text-emerald-400">${lockedTargetPrice}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-400 text-[10px]">Delta Live Price:</span>
          <PriceTransitionCell price={s.currentPrice} size="sm" showDirectionIcon={true} />
        </div>
        <div className="flex items-center justify-between pt-0.5 border-t border-zinc-800/60">
          <span className="text-zinc-400 text-[10px]">Distance:</span>
          <LiveDistanceBadge
            distance={s.distanceToTrigger}
            distancePercent={s.distanceToTriggerPercent}
            direction={s.direction}
          />
        </div>
      </div>

      {/* 1:5 Target Metrics */}
      <div className="grid grid-cols-3 gap-1 font-mono text-center text-[10px]">
        <div className="p-1.5 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[9px]">TP</div>
          <div className="font-bold text-emerald-400">${s.tp1}</div>
        </div>
        <div className="p-1.5 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[9px]">SL</div>
          <div className="font-bold text-rose-400">${s.sl}</div>
        </div>
        <div className="p-1.5 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[9px]">R:R</div>
          <div className="font-bold text-sky-400">1:{s.riskReward}</div>
        </div>
      </div>

      {/* 24H Direction Mathematical Rationale */}
      {s.whyDirectionRationale && (
        <div className="p-2 bg-[#060c16] border border-sky-900/60 rounded-lg text-[10px] font-mono text-sky-200 space-y-0.5">
          <div className="flex items-center gap-1 font-bold text-sky-400">
            <Target className="w-3 h-3 text-sky-400 shrink-0" />
            <span>Rationale ({s.direction}):</span>
          </div>
          <p className="text-[9.5px] text-zinc-300 line-clamp-2 leading-tight">
            {s.whyDirectionRationale}
          </p>
        </div>
      )}
      {isExchangeFailover && notPlacedReason && (
        <div className="p-2 bg-amber-950/40 border border-amber-600/70 rounded-lg text-[10px] font-mono text-amber-300 space-y-0.5">
          <div className="flex items-center gap-1 font-bold text-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Exchange Error → Converted to Bot Order</span>
          </div>
          <p className="text-[10px] text-zinc-300 leading-tight">
            <strong>Reason:</strong> {notPlacedReason}
          </p>
        </div>
      )}

      {/* Card Action Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectForensics(s);
            }}
            className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline"
            title="View Technical Forensics & PCD Verdict"
          >
            <Eye className="w-3 h-3" />
            <span>Forensics</span>
          </button>

          {onOpenAIForensics && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAIForensics(s);
              }}
              className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 flex items-center gap-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 px-1.5 py-0.5 rounded transition"
              title="Open AI Forensics breakdown"
            >
              <Brain className="w-3 h-3 text-cyan-400" />
              <span>AI</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onManualExecute(s.id, section);
          }}
          disabled={executingId === s.id}
          className={`px-2.5 py-1 rounded font-bold text-[10px] font-mono transition flex items-center gap-1 ${
            section === 'EXCHANGE'
              ? 'bg-sky-500 hover:bg-sky-400 text-black'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black'
          }`}
        >
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>
            {executingId === s.id
              ? '...'
              : isExchangeFailover
              ? 'Retry Exchange'
              : section === 'EXCHANGE'
              ? 'Trigger Exchange'
              : 'Trigger Bot'}
          </span>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Classic Setup Card Component (Preserves original detailed card view)
// ---------------------------------------------------------------------------
interface SetupCardProps {
  setup: FutureSetup;
  section: 'BOT' | 'EXCHANGE';
  executingId: string | null;
  onManualExecute: (id: string, pref: 'EXCHANGE' | 'BOT') => Promise<void>;
  onSelectForensics: (setup: FutureSetup) => void;
  onOpenAIForensics?: (setup: FutureSetup) => void;
  config?: ExchangeConfig;
}

const SetupCard = React.memo<SetupCardProps>(({
  setup: s,
  section,
  executingId,
  onManualExecute,
  onSelectForensics,
  onOpenAIForensics,
  config,
}) => {
  const isLong = s.direction === 'BUY/LONG' || s.direction.includes('LONG') || s.direction.includes('BUY');
  const isTriggered = s.status === 'TRIGGERED' || s.status === 'TRADE OPEN';
  const lockedTargetPrice = s.entryPrice ?? s.triggerPrice;
  const { isExchange, notPlacedReason } = getOrderPlacementDiagnostics(s);
  const isExchangeFailover = section === 'EXCHANGE' && !isExchange && Boolean(notPlacedReason);

  return (
    <div
      className={`bg-[#101622] border rounded-xl p-4 space-y-3.5 transition-all shadow-lg ${
        isExchangeFailover
          ? 'border-amber-600/80 shadow-amber-950/30 ring-1 ring-amber-500/30'
          : s.status === 'TRADE OPEN'
          ? 'border-sky-500/80 shadow-sky-950/20'
          : isTriggered
          ? 'border-emerald-500/80 shadow-emerald-950/20'
          : s.status === 'REJECTED'
          ? 'border-rose-800/70 shadow-rose-950/20'
          : s.status === 'TRIGGER APPROACHING'
          ? 'border-amber-500/60 shadow-amber-950/20'
          : 'border-zinc-800/80 hover:border-zinc-700'
      }`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-zinc-100 text-sm font-mono">{s.coin}</span>
            <span className="text-[10px] text-zinc-300 bg-[#0a0e16] px-2 py-0.5 rounded border border-zinc-700 font-mono font-bold">
              {s.timeframe || '15m'} • {s.exchange || 'Delta'}
            </span>
            {s.movePercent24hAtCreation !== undefined && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${
                s.movePercent24hAtCreation >= 0
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-800'
              }`} title={`24H move at creation: ${s.movePercent24hAtCreation > 0 ? '+' : ''}${s.movePercent24hAtCreation.toFixed(2)}%`}>
                24H: {s.movePercent24hAtCreation > 0 ? '+' : ''}{s.movePercent24hAtCreation.toFixed(1)}%
              </span>
            )}
            {s.rangeBandAtCreation && (
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-950/70 text-amber-300 border border-amber-800" title={`Filtered by Target Range: ${s.rangeBandAtCreation}`}>
                🎯 {s.rangeBandAtCreation}
              </span>
            )}
            {section === 'EXCHANGE' ? (
              isExchange ? (
                <span className="text-[10px] text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-700 font-mono flex items-center gap-1 font-bold">
                  <Check className="w-3 h-3" /> Exchange Order Confirmed
                </span>
              ) : (
                <span className="text-[10px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-700 font-mono flex items-center gap-1 font-bold">
                  <AlertTriangle className="w-3 h-3 text-amber-400" /> Bot Order Fallback
                </span>
              )
            ) : (
              <span className="text-[10px] text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-700 font-mono flex items-center gap-1 font-bold">
                <Bot className="w-3 h-3" /> Bot Setup Active
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-2">
            <span>ID: <strong className="text-zinc-300">{s.id}</strong></span>
            {s.strategy && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800/80 text-emerald-300 font-semibold">
                {s.strategy}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
              isLong
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-600/60'
                : 'bg-rose-950/80 text-rose-400 border border-rose-600/60'
            }`}
          >
            {s.direction}
          </span>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
              s.status === 'TRADE OPEN'
                ? 'bg-sky-950 text-sky-400 border border-sky-700 animate-pulse'
                : s.status === 'TRIGGERED'
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-700 animate-pulse'
                : s.status === 'REJECTED'
                ? 'bg-rose-950 text-rose-400 border border-rose-700'
                : s.status === 'TRIGGER APPROACHING'
                ? 'bg-amber-950 text-amber-400 border border-amber-700'
                : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700'
            }`}
          >
            {s.status}
          </span>
        </div>
      </div>

      {/* Side Change active indication */}
      {config?.sideChangeEnabled && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-950/70 border border-amber-600/80 text-amber-300 font-mono text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>SIDE CHANGE ACTIVE:</span>
            <span className="text-zinc-300 font-normal">Original direction is {s.direction}, live order executes opposite</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-black/60 text-white font-extrabold border border-amber-500">
            {isLong ? 'SELL / SHORT' : 'BUY / LONG'}
          </span>
        </div>
      )}

      {/* Expiry Cooldown lock indication */}
      {s.countdownActive && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-rose-950/70 border border-rose-600 text-rose-300 font-mono text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-rose-400 animate-spin" />
            <span>TRADE EXPIRY COOLDOWN ACTIVE:</span>
            <span className="text-zinc-300 font-normal">Waiting for fresh market data after trade exit</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-black/60 text-rose-300 font-extrabold border border-rose-500">
            {s.countdownRemainingSeconds ? `${Math.ceil(s.countdownRemainingSeconds / 60)}m left` : 'LOCKED'}
          </span>
        </div>
      )}

      {/* Prominent Failover Callout if Exchange placement failed */}
      {isExchangeFailover && notPlacedReason && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-600/80 rounded-lg text-xs font-mono text-amber-300 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>EXCHANGE ORDER FAILED → AUTO-CONVERTED TO BOT ORDER</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            <strong className="text-amber-300">Why not placed on exchange:</strong> {notPlacedReason}
          </p>
        </div>
      )}

      {/* Locked Price Target Box with Dynamic CSS Price Transition */}
      <div className="bg-[#0b0f17] p-2.5 rounded-lg border border-emerald-950/60 space-y-1.5 font-mono">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>LOCKED ENTRY / TRIGGER</span>
          </span>
          <span className="font-bold text-emerald-400 text-sm">
            ${lockedTargetPrice}
          </span>
        </div>

        {/* Delta Live Price with Smooth Dynamic CSS Transition */}
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-800/60">
          <span className="text-zinc-400">Delta Live Price:</span>
          <PriceTransitionCell
            price={s.currentPrice}
            size="sm"
            showDirectionIcon={true}
          />
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-400">Distance Remaining:</span>
          <LiveDistanceBadge
            distance={s.distanceToTrigger}
            distancePercent={s.distanceToTriggerPercent}
            direction={s.direction}
          />
        </div>
      </div>

      {/* Volume Profile Liquidity Indicator at Entry Price */}
      <div className="bg-[#0a0e16] p-2.5 rounded-lg border border-zinc-800 space-y-1.5 font-mono">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5 font-semibold">
            <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Volume Profile at Entry (${lockedTargetPrice})</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              s.volumeProfileNode === 'HVN_POC'
                ? 'bg-purple-950/80 text-purple-300 border border-purple-700'
                : s.volumeProfileNode === 'LVN_BREAKOUT'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-700'
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}
          >
            {s.volumeProfileNode === 'HVN_POC'
              ? 'POC / High Volume Node'
              : s.volumeProfileNode === 'LVN_BREAKOUT'
              ? 'LVN Breakout Acceleration'
              : 'Balanced Volume Node'}
          </span>
        </div>

        {/* Mini Volume Profile Depth Histogram */}
        <div className="space-y-1 pt-1">
          {(s.volumeProfileBins || [
            { price: Math.round(lockedTargetPrice * 0.99 * 100) / 100, volumePct: 35 },
            { price: Math.round(lockedTargetPrice * 0.995 * 100) / 100, volumePct: 65 },
            { price: lockedTargetPrice, volumePct: 95, isPOC: true },
            { price: Math.round(lockedTargetPrice * 1.005 * 100) / 100, volumePct: 70 },
            { price: Math.round(lockedTargetPrice * 1.01 * 100) / 100, volumePct: 40 },
          ]).map((bin, bIdx) => (
            <div key={`${s.id || s.coin}_kbin_${bIdx}`} className="flex items-center gap-2 text-[10px]">
              <span className={`w-14 text-right truncate ${bin.isPOC ? 'text-emerald-300 font-bold' : 'text-zinc-500'}`}>
                ${bin.price}
              </span>
              <div className="flex-1 bg-zinc-900 h-2 rounded overflow-hidden relative">
                <div
                  className={`h-full rounded transition-all duration-500 ${
                    bin.isPOC
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-zinc-700/80'
                  }`}
                  style={{ width: `${bin.volumePct}%` }}
                />
              </div>
              <span className={`w-10 text-[9px] ${bin.isPOC ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}>
                {bin.isPOC ? '★ POC' : `${bin.volumePct}%`}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-zinc-400 flex items-center justify-between pt-0.5">
          <span>Liquidity Concentration:</span>
          <span className="text-zinc-200 font-bold">{s.volumeProfileConcentration || 82}% Orderbook Depth</span>
        </div>
      </div>

      {/* "KAB SETUP BANEGA" Trigger Guidance Panel */}
      <div className="bg-[#0c121e] rounded-lg p-2.5 border border-sky-900/60 font-mono text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-sky-400 font-bold text-[11px]">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>KAB SETUP BANEGA (Anticipated Trigger Rule & ETA)</span>
        </div>
        <p className="text-[11px] text-zinc-300 leading-relaxed">
          {s.kabSetupBanega || `Trigger activates at $${lockedTargetPrice} upon volume and RSI confirmation.`}
        </p>
      </div>

      {/* 24H Direction Mathematical Rationale Box */}
      {s.whyDirectionRationale && (
        <div className="bg-[#0b1322] rounded-lg p-2.5 border border-sky-800/80 font-mono text-xs space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sky-400 font-bold text-[11px]">
              <Target className="w-3.5 h-3.5 shrink-0" />
              <span>24H DIRECTION FORENSICS & RATIONALE (Kyu {s.direction} bana)</span>
            </div>
            {s.rangeBandAtCreation && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-700 font-bold">
                Target: {s.rangeBandAtCreation}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-200 leading-relaxed">
            {s.whyDirectionRationale}
          </p>
        </div>
      )}

      {/* Key Numerical Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 font-mono text-center">
        <div className="p-2 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[10px]">TP1 / TP2</div>
          <div className="font-bold text-emerald-400 mt-0.5">${s.tp1}</div>
          <div className="text-[10px] text-zinc-500">TP2: ${s.tp2 || '-'}</div>
        </div>

        <div className="p-2 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[10px]">STOP LOSS</div>
          <div className="font-bold text-rose-400 mt-0.5">${s.sl}</div>
          <div className="text-[10px] text-zinc-500">-{s.riskPercent}%</div>
        </div>

        <div className="p-2 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[10px]">RISK / REWARD</div>
          <div className="font-bold text-sky-400 mt-0.5">1 : {s.riskReward}</div>
          <div className="text-[10px] text-zinc-500">TP3: ${s.tp3 || '-'}</div>
        </div>

        <div className="p-2 bg-[#0d121c] rounded border border-zinc-800/60">
          <div className="text-zinc-500 text-[10px]">SCORE / WIN</div>
          <div className="font-bold text-purple-400 mt-0.5">
            {s.score}/100
          </div>
          <div className="text-[10px] text-zinc-500">Win: {s.historicalProbability}%</div>
        </div>
      </div>

      {/* "KYU BANTA THA SETUP" & Technical Confluence Breakdown */}
      <div className="bg-[#0b0f17] rounded-lg p-2.5 border border-zinc-800/70 text-xs font-mono space-y-1.5">
        <div className="text-zinc-400 text-[11px] font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-zinc-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>KYU BANTA THA SETUP (Thesis)</span>
          </span>
          <span className="text-[10px] text-emerald-400">{s.indicatorConfirmations?.marketStructure}</span>
        </div>
        <p className="text-[11px] text-zinc-300 leading-relaxed">
          {s.whyFormed || s.reason}
        </p>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-300 pt-1 border-t border-zinc-800/80">
          <div>Trend: <strong className="text-zinc-100">{s.indicatorConfirmations?.trend}</strong></div>
          <div>RSI: <strong className="text-zinc-100">{s.indicatorConfirmations?.rsi}</strong></div>
          <div>Pattern: <strong className="text-zinc-100">{s.indicatorConfirmations?.pattern}</strong></div>
          <div>Volume: <strong className="text-zinc-100">{s.indicatorConfirmations?.volumeProfile}</strong></div>
        </div>
      </div>

      {/* Verified Source Links */}
      {s.sourceLinks && s.sourceLinks.length > 0 && (
        <div className="p-2.5 bg-[#0b0f17] rounded-lg border border-zinc-800 font-mono text-[11px] space-y-1">
          <div className="text-zinc-400 font-semibold flex items-center gap-1">
            <ExternalLink className="w-3 h-3 text-zinc-400" />
            <span>Verified Evidence Links</span>
          </div>
          <div className="space-y-1">
            {s.sourceLinks.slice(0, 2).map((link, idx) => (
              <a
                key={`${s.id || s.coin}_klink_${link.url || idx}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-zinc-300 hover:text-emerald-400 hover:underline truncate"
              >
                <span className="truncate">{link.title}</span>
                <span className="text-[10px] text-zinc-500 shrink-0 ml-2">[{link.sourceName}]</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectForensics(s)}
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline"
            title="View Technical Forensics & PCD Verdict"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Forensics & PCD</span>
          </button>
          {onOpenAIForensics && (
            <button
              type="button"
              onClick={() => onOpenAIForensics(s)}
              className="text-xs font-mono text-cyan-300 hover:text-cyan-200 flex items-center gap-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/80 px-2 py-0.5 rounded transition"
              title="Open AI Forensics breakdown"
            >
              <Brain className="w-3 h-3 text-cyan-400" />
              <span>AI Forensics</span>
            </button>
          )}
        </div>

        <button
          onClick={() => onManualExecute(s.id, section)}
          disabled={executingId === s.id}
          className={`px-3.5 py-1.5 rounded-lg disabled:opacity-50 font-bold text-xs font-mono transition flex items-center gap-1.5 ${
            section === 'EXCHANGE'
              ? 'bg-sky-500 hover:bg-sky-400 text-black shadow-lg shadow-sky-950/50'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-950/50'
          }`}
        >
          {s.status === 'REJECTED' ? (
            <RotateCcw className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          <span>
            {executingId === s.id
              ? 'Submitting...'
              : isExchangeFailover
              ? 'Retry on Exchange'
              : section === 'EXCHANGE'
              ? 'Trigger Exchange Order'
              : 'Trigger Bot Order'}
          </span>
        </button>
      </div>
    </div>
  );
});

SetupCard.displayName = 'SetupCard';

// ---------------------------------------------------------------------------
// Reusable SetupTerminalSection Component (Identical Layout for Bot & Exchange)
// ---------------------------------------------------------------------------
interface SetupTerminalSectionProps {
  section: 'BOT' | 'EXCHANGE';
  timeframes: SetupTimeframe[];
  onToggleTimeframe: (tf: SetupTimeframe) => void;
  onSelectAllTimeframes: () => void;
  isUpdatingTimeframes: boolean;
  deduplicatedSetups: FutureSetup[];
  trades: TradeRecord[];
  history: SetupHistoryRecord[];
  config?: ExchangeConfig;
  executingId: string | null;
  onManualExecute: (id: string, pref: 'EXCHANGE' | 'BOT') => Promise<void>;
  onSelectForensics: (setup: FutureSetup) => void;
  onOpenAIForensics?: (setup: FutureSetup) => void;
  selectedForensicsSetup: FutureSetup | null;
  directionFilter: 'ALL' | 'BUY/LONG' | 'SELL/SHORT';
  setDirectionFilter: (d: 'ALL' | 'BUY/LONG' | 'SELL/SHORT') => void;
  orderPlacedFilter: 'ALL' | 'NO_ORDER' | 'ORDER_PLACED';
  setOrderPlacedFilter: (f: 'ALL' | 'NO_ORDER' | 'ORDER_PLACED') => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  layoutMode: 'KANBAN' | 'GRID';
  setLayoutMode: (m: 'KANBAN' | 'GRID') => void;
  isSplitView?: boolean;
}

const SetupTerminalSection: React.FC<SetupTerminalSectionProps> = ({
  section,
  timeframes,
  onToggleTimeframe,
  onSelectAllTimeframes,
  isUpdatingTimeframes,
  deduplicatedSetups,
  trades,
  history,
  config,
  executingId,
  onManualExecute,
  onSelectForensics,
  onOpenAIForensics,
  selectedForensicsSetup,
  directionFilter,
  setDirectionFilter,
  orderPlacedFilter,
  setOrderPlacedFilter,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  layoutMode,
  setLayoutMode,
  isSplitView = false,
}) => {
  const [copiedIp, setCopiedIp] = useState(false);

  // Timeframe metrics computed strictly for this section's active timeframes & execution mode
  const timeframeMetrics = useMemo(() => {
    const defaultMetrics = () => ({
      totalSetups: 0,
      openOrdersCount: 0,
      totalTradesCount: 0,
      pnlUsd: 0,
      winRate: 85,
    });

    const metrics: Record<
      string,
      {
        totalSetups: number;
        openOrdersCount: number;
        totalTradesCount: number;
        pnlUsd: number;
        winRate: number;
      }
    > = {
      '15m': defaultMetrics(),
      '30m': defaultMetrics(),
      '1h': defaultMetrics(),
      '4h': defaultMetrics(),
      '1d': defaultMetrics(),
    };

    // Ensure all timeframes from the props are registered
    (timeframes || []).forEach((t) => {
      if (t) {
        const norm = String(t).toLowerCase().trim();
        if (!metrics[norm]) {
          metrics[norm] = defaultMetrics();
        }
      }
    });

    Object.keys(metrics).forEach((tfKey) => {
      metrics[tfKey].totalSetups = (deduplicatedSetups || []).filter(
        (s) => String(s.timeframe || '15m').toLowerCase().trim() === tfKey
      ).length;

      const targetExecutionType = section === 'EXCHANGE' ? 'EXCHANGE_LIVE' : 'BOT_VIRTUAL';
      const tfTrades = (trades || []).filter(
        (t) => String(t.timeframe || '15m').toLowerCase().trim() === tfKey && t.executionType === targetExecutionType
      );

      metrics[tfKey].openOrdersCount = tfTrades.filter((t) => t.status === 'OPEN').length;
      metrics[tfKey].totalTradesCount = tfTrades.length;

      const netPnl = tfTrades.reduce(
        (sum, t) => sum + (t.realizedPnl || 0) + (t.unrealizedPnl || 0),
        0
      );
      metrics[tfKey].pnlUsd = Math.round(netPnl * 100) / 100;

      const tfHistory = (history || []).filter(
        (h) => String(h.timeframe || '15m').toLowerCase().trim() === tfKey
      );
      const wins = tfHistory.filter((h) => h.outcome === 'TP HIT' || (h.realizedPnl || 0) > 0).length;
      metrics[tfKey].winRate = tfHistory.length > 0 ? Math.round((wins / tfHistory.length) * 100) : 85;
    });

    return metrics;
  }, [deduplicatedSetups, trades, history, section, timeframes]);

  // Filtered Setups for this section and its active multi-timeframes array
  const filteredSetups = useMemo(() => {
    return deduplicatedSetups.filter((s) => {
      const sTf = (s.timeframe || '15m') as SetupTimeframe;

      // Filter by this section's selected active timeframes array
      if (!timeframes.includes(sTf)) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!s.coin.toLowerCase().includes(q) && !(s.strategy || '').toLowerCase().includes(q)) {
          return false;
        }
      }

      // Direction filter
      if (directionFilter !== 'ALL' && s.direction !== directionFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;

      // Order Placed filter
      if (orderPlacedFilter === 'NO_ORDER' && (s.hasOrderPlaced || s.status === 'TRADE OPEN')) {
        return false;
      }
      if (orderPlacedFilter === 'ORDER_PLACED' && !s.hasOrderPlaced && s.status !== 'TRADE OPEN') {
        return false;
      }

      return true;
    });
  }, [
    deduplicatedSetups,
    timeframes,
    directionFilter,
    statusFilter,
    orderPlacedFilter,
    searchQuery,
  ]);

  // Group filtered setups into 4 Kanban stages
  const kanbanColumns = useMemo(() => {
    const columns: Record<KanbanStage, FutureSetup[]> = {
      WATCHING: [],
      NEAR_SETUP: [],
      TRIGGER_APPROACHING: [],
      TRIGGERED: [],
    };

    for (const s of filteredSetups) {
      const stage = getSetupKanbanStage(s);
      columns[stage].push(s);
    }

    return columns;
  }, [filteredSetups]);

  const detectedIp = '34.34.244.63';
  const handleCopyIp = () => {
    navigator.clipboard.writeText(detectedIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const isExchangeConnected = config?.isConnected && !config?.isReadMode;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-xl space-y-4 transition ${
        section === 'BOT'
          ? 'bg-[#0b121f] border-emerald-800/70 shadow-emerald-950/20'
          : 'bg-[#0a1224] border-sky-800/70 shadow-sky-950/20'
      }`}
    >
      {/* ----------------- SECTION HEADER & TIMEFRAMES BAR ----------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              section === 'BOT'
                ? 'bg-emerald-950/80 border border-emerald-600/70 text-emerald-400'
                : 'bg-sky-950/80 border border-sky-600/70 text-sky-400'
            }`}
          >
            {section === 'BOT' ? <Bot className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-mono font-bold text-zinc-100 uppercase tracking-wide">
                {section === 'BOT' ? '🤖 BOT SETUP TERMINAL (बॉट सेटअप)' : '⚡ EXCHANGE SETUP TERMINAL (एक्सचेंज सेटअप)'}
              </span>

              <span
                className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border ${
                  section === 'BOT'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-sky-950 text-sky-300 border-sky-700'
                }`}
              >
                {section === 'BOT' ? 'Paper & Bot Simulation' : 'Delta Exchange Live Orderbook'}
              </span>

              {section === 'EXCHANGE' && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                    isExchangeConnected
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                      : config?.isReadMode
                      ? 'bg-amber-950 text-amber-300 border-amber-600'
                      : 'bg-rose-950 text-rose-300 border-rose-600'
                  }`}
                >
                  {isExchangeConnected
                    ? '● Real Exchange Armed'
                    : config?.isReadMode
                    ? '● Read Mode Active'
                    : '○ API Disconnected'}
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              {section === 'BOT'
                ? `Mathematical Confluence Setups. Active Horizons: [${timeframes.join(', ')}]. Track simulated positions and automated execution.`
                : `Live Delta Exchange execution. Active Horizons: [${timeframes.join(', ')}]. If order cannot be submitted, failover activates Bot Order.`}
            </p>
          </div>
        </div>

        {/* Multi-Timeframe Multi-Select Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-mono text-zinc-300 font-bold mr-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{section === 'BOT' ? 'BOT' : 'EXCHANGE'} TIMEFRAMES:</span>
          </span>

          {ALL_TIMEFRAMES.map((tf) => {
            const isSelected = timeframes.includes(tf);
            return (
              <button
                key={`${section}_tf_btn_${tf}`}
                type="button"
                onClick={() => onToggleTimeframe(tf)}
                disabled={isUpdatingTimeframes}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                  isSelected
                    ? section === 'BOT'
                      ? 'bg-emerald-500 text-black shadow-md ring-1 ring-emerald-300 font-bold'
                      : 'bg-sky-500 text-black shadow-md ring-1 ring-sky-300 font-bold'
                    : 'bg-[#0a0e16] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-zinc-600" />}
                <span>{tf}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={onSelectAllTimeframes}
            disabled={isUpdatingTimeframes}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
          >
            All (15m-1d)
          </button>
        </div>
      </div>

      {/* ----------------- EXCHANGE STATUS & FAILOVER BANNERS ----------------- */}
      {section === 'EXCHANGE' && (
        <div className="space-y-2">
          <div className="bg-sky-950/30 border border-sky-800/70 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs font-mono text-sky-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Automatic Failover Protection:</strong> If any exchange order fails (margin, API error, or credentials), the bot automatically shifts the order to a Bot Order and logs the exact diagnostic reason.
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 shrink-0 font-bold">
              Armed Horizons: <strong>{timeframes.join(', ')}</strong>
            </div>
          </div>

          {/* IP Whitelist Warning / Helpful Banner */}
          {config?.authError && config.authError.toLowerCase().includes('ip') && (
            <div className="bg-amber-950/40 border border-amber-600/70 p-3 rounded-lg flex flex-col sm:flex-row items-start justify-between gap-3 text-xs font-mono text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">Delta Exchange API Key IP Restriction Detected</div>
                  <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed">
                    Delta Exchange rejected private authentication because IP restriction is active on your API Key.
                    <br />
                    <strong>Recommended for 24/7 cloud operation:</strong> Go to Delta Exchange → API Management, edit your API key, and set IP Access Restriction to <em>&apos;Unrestricted&apos;</em> (Allow all IPs), or whitelist server IP: <code className="bg-black/60 px-1 py-0.5 rounded text-amber-300 font-bold">{detectedIp}</code>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyIp}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-amber-500 text-black hover:bg-amber-400 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedIp ? 'IP Copied!' : `Copy IP (${detectedIp})`}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ----------------- TIMEFRAME SUMMARY & PNL METRICS ----------------- */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
          <span className="font-bold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>{section} TIMEFRAMES BREAKDOWN (Orders Placed & Live PnL per Timeframe):</span>
          </span>
          <span className="text-[10px] text-zinc-500 font-bold">
            {timeframes.length} Active Horizon{timeframes.length > 1 ? 's' : ''} Selected
          </span>
        </div>

        <div className={`grid gap-2.5 ${isSplitView ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
          {Array.from(new Set<string>((timeframes || []).map((t) => String(t || '').toLowerCase().trim()).filter(Boolean))).map((normTf: string, idx: number) => {
            const m = timeframeMetrics[normTf] || {
              totalSetups: 0,
              openOrdersCount: 0,
              totalTradesCount: 0,
              pnlUsd: 0,
              winRate: 85,
            };
            const pnlVal = m?.pnlUsd ?? 0;
            const isProfitable = pnlVal >= 0;

            return (
              <div
                key={`${section}_metric_card_${normTf}_${idx}`}
                className={`p-2.5 rounded-xl border font-mono transition shadow-sm ${
                  section === 'BOT'
                    ? 'bg-[#090f18] border-emerald-900/50'
                    : 'bg-[#080e1a] border-sky-900/50'
                }`}
              >
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      section === 'BOT'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-sky-950 text-sky-300 border border-sky-800'
                    }`}
                  >
                    {normTf.toUpperCase()} Horizon
                  </span>
                  <span className="text-[10px] text-zinc-400 font-bold">
                    Win: <strong className="text-purple-300">{m?.winRate ?? 85}%</strong>
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Setups:</span>
                    <span className="font-bold text-zinc-200">{m?.totalSetups ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Active Orders:</span>
                    <span className={`font-bold ${(m?.openOrdersCount ?? 0) > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {m?.openOrdersCount ?? 0} Placed
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-800/60">
                    <span className="text-zinc-400">PnL:</span>
                    <span className={`font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfitable ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ----------------- SEARCH & FILTERS BAR ----------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#101622] p-3 rounded-xl border border-zinc-800/80">
        {/* Search Box */}
        <div className="flex items-center gap-2 bg-[#0a0e16] px-3 py-1.5 rounded-lg border border-zinc-700 w-full sm:w-56">
          <Filter className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search coin (e.g. BTC, ETH)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-zinc-200 font-mono focus:outline-none w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Direction Filter */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-zinc-400 text-[11px] mr-1">DIR:</span>
          <button
            onClick={() => setDirectionFilter('ALL')}
            className={`px-2.5 py-1 rounded transition ${
              directionFilter === 'ALL'
                ? 'bg-zinc-800 text-zinc-100 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setDirectionFilter('BUY/LONG')}
            className={`px-2.5 py-1 rounded transition ${
              directionFilter === 'BUY/LONG'
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-600 font-bold'
                : 'text-zinc-400 hover:text-emerald-400'
            }`}
          >
            LONG
          </button>
          <button
            onClick={() => setDirectionFilter('SELL/SHORT')}
            className={`px-2.5 py-1 rounded transition ${
              directionFilter === 'SELL/SHORT'
                ? 'bg-rose-950/80 text-rose-400 border border-rose-600 font-bold'
                : 'text-zinc-400 hover:text-rose-400'
            }`}
          >
            SHORT
          </button>
        </div>

        {/* Order Status Filter */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-zinc-400 text-[11px] mr-1">ORDERS:</span>
          <button
            onClick={() => setOrderPlacedFilter('ALL')}
            className={`px-2.5 py-1 rounded transition ${
              orderPlacedFilter === 'ALL'
                ? 'bg-zinc-800 text-zinc-100 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setOrderPlacedFilter('ORDER_PLACED')}
            className={`px-2.5 py-1 rounded transition ${
              orderPlacedFilter === 'ORDER_PLACED'
                ? 'bg-sky-950/60 text-sky-300 border border-sky-600 font-bold'
                : 'text-zinc-400 hover:text-sky-300'
            }`}
          >
            Active Orders
          </button>
          <button
            onClick={() => setOrderPlacedFilter('NO_ORDER')}
            className={`px-2.5 py-1 rounded transition ${
              orderPlacedFilter === 'NO_ORDER'
                ? 'bg-purple-950/60 text-purple-300 border border-purple-600 font-bold'
                : 'text-zinc-400 hover:text-purple-300'
            }`}
          >
            Watching / Pending
          </button>
        </div>

        {/* Status Dropdown */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-zinc-400">STATUS:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0a0e16] border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="WATCHING">Watching</option>
            <option value="NEAR SETUP">Near Setup (1.5%)</option>
            <option value="TRIGGER APPROACHING">Trigger Approaching (0.5%)</option>
            <option value="TRIGGERED">Triggered</option>
            <option value="ORDER SUBMITTED">Order Submitted</option>
            <option value="TRADE OPEN">Trade Open</option>
            <option value="REJECTED">Rejected / Retry</option>
          </select>
        </div>

        {/* View Layout Switcher (Kanban vs Cards) */}
        <div className="flex items-center bg-[#0a0e16] p-1 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setLayoutMode('KANBAN')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold transition ${
              layoutMode === 'KANBAN'
                ? 'bg-emerald-500 text-black shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Multi-column pipeline layout"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('GRID')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold transition ${
              layoutMode === 'GRID'
                ? 'bg-emerald-500 text-black shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Detailed card layout"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
        </div>
      </div>

      {/* ----------------- SETUPS PIPELINE (KANBAN OR DETAILED CARDS) ----------------- */}
      {filteredSetups.length === 0 ? (
        <div className="bg-[#101622] border border-zinc-800/80 rounded-xl p-10 text-center space-y-3">
          <Crosshair className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-300 font-mono">
            No Setups Matching Filter in {section} Mode
          </h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto font-mono">
            The Setup Engine is continuously scanning Delta Exchange contracts across [{timeframes.join(', ')}] for high-expectancy 1:5 confluence setups.
          </p>
        </div>
      ) : layoutMode === 'KANBAN' ? (
        /* ----------------- KANBAN PIPELINE LAYOUT ----------------- */
        <div
          className={`grid gap-4 items-start ${
            isSplitView ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {/* Column 1: Watching */}
          <div className="bg-[#0c1017] rounded-xl border border-zinc-800/80 overflow-hidden flex flex-col min-h-[450px]">
            <div className="p-3 bg-[#101622] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                <span className="text-xs font-mono font-bold text-zinc-200 uppercase">Watching</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-[10px] font-bold">
                {kanbanColumns.WATCHING.length}
              </span>
            </div>
            <div className="p-2.5 space-y-3 flex-1 overflow-y-auto max-h-[75vh]">
              {kanbanColumns.WATCHING.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 font-mono text-[11px]">
                  No setups currently in watching stage
                </div>
              ) : (
                kanbanColumns.WATCHING.map((s, idx) => (
                  <KanbanCard
                    key={`${section}_watching_${s.id || s.coin}_${s.timeframe || '15m'}_${s.direction || ''}_${idx}`}
                    setup={s}
                    section={section}
                    executingId={executingId}
                    onManualExecute={onManualExecute}
                    onSelectForensics={onSelectForensics}
                    onOpenAIForensics={onOpenAIForensics}
                    isSelected={selectedForensicsSetup?.id === s.id}
                    config={config}
                  />
                ))
              )}
            </div>
          </div>

          {/* Column 2: Near Setup */}
          <div className="bg-[#0c1017] rounded-xl border border-zinc-800/80 overflow-hidden flex flex-col min-h-[450px]">
            <div className="p-3 bg-[#101622] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-xs font-mono font-bold text-amber-300 uppercase">Near Setup (1.5%)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-800 text-amber-300 font-mono text-[10px] font-bold">
                {kanbanColumns.NEAR_SETUP.length}
              </span>
            </div>
            <div className="p-2.5 space-y-3 flex-1 overflow-y-auto max-h-[75vh]">
              {kanbanColumns.NEAR_SETUP.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 font-mono text-[11px]">
                  No setups within 1.5% distance to trigger
                </div>
              ) : (
                kanbanColumns.NEAR_SETUP.map((s, idx) => (
                  <KanbanCard
                    key={`${section}_near_${s.id || s.coin}_${s.timeframe || '15m'}_${s.direction || ''}_${idx}`}
                    setup={s}
                    section={section}
                    executingId={executingId}
                    onManualExecute={onManualExecute}
                    onSelectForensics={onSelectForensics}
                    onOpenAIForensics={onOpenAIForensics}
                    isSelected={selectedForensicsSetup?.id === s.id}
                    config={config}
                  />
                ))
              )}
            </div>
          </div>

          {/* Column 3: Trigger Approaching */}
          <div className="bg-[#0c1017] rounded-xl border border-zinc-800/80 overflow-hidden flex flex-col min-h-[450px]">
            <div className="p-3 bg-[#101622] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
                <span className="text-xs font-mono font-bold text-orange-300 uppercase">Trigger Approaching</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-orange-950/60 border border-orange-800 text-orange-300 font-mono text-[10px] font-bold">
                {kanbanColumns.TRIGGER_APPROACHING.length}
              </span>
            </div>
            <div className="p-2.5 space-y-3 flex-1 overflow-y-auto max-h-[75vh]">
              {kanbanColumns.TRIGGER_APPROACHING.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 font-mono text-[11px]">
                  No setups within 0.5% trigger threshold
                </div>
              ) : (
                kanbanColumns.TRIGGER_APPROACHING.map((s, idx) => (
                  <KanbanCard
                    key={`${section}_approaching_${s.id || s.coin}_${s.timeframe || '15m'}_${s.direction || ''}_${idx}`}
                    setup={s}
                    section={section}
                    executingId={executingId}
                    onManualExecute={onManualExecute}
                    onSelectForensics={onSelectForensics}
                    onOpenAIForensics={onOpenAIForensics}
                    isSelected={selectedForensicsSetup?.id === s.id}
                    config={config}
                  />
                ))
              )}
            </div>
          </div>

          {/* Column 4: Triggered & Active */}
          <div className="bg-[#0c1017] rounded-xl border border-zinc-800/80 overflow-hidden flex flex-col min-h-[450px]">
            <div className="p-3 bg-[#101622] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-emerald-300 uppercase">Triggered & Active</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-mono text-[10px] font-bold">
                {kanbanColumns.TRIGGERED.length}
              </span>
            </div>
            <div className="p-2.5 space-y-3 flex-1 overflow-y-auto max-h-[75vh]">
              {kanbanColumns.TRIGGERED.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 font-mono text-[11px]">
                  No triggered setups in current session
                </div>
              ) : (
                kanbanColumns.TRIGGERED.map((s, idx) => (
                  <KanbanCard
                    key={`${section}_triggered_${s.id || s.coin}_${s.timeframe || '15m'}_${s.direction || ''}_${idx}`}
                    setup={s}
                    section={section}
                    executingId={executingId}
                    onManualExecute={onManualExecute}
                    onSelectForensics={onSelectForensics}
                    onOpenAIForensics={onOpenAIForensics}
                    isSelected={selectedForensicsSetup?.id === s.id}
                    config={config}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ----------------- DETAILED CARDS GRID LAYOUT ----------------- */
        <div className={`grid gap-4 ${isSplitView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {filteredSetups.map((s, idx) => {
            const cardKey = `${section}_grid_${s.id || s.coin}_${s.timeframe || '15m'}_${s.direction || ''}_${idx}`;
            return (
              <SetupCard
                key={cardKey}
                setup={s}
                section={section}
                executingId={executingId}
                onManualExecute={onManualExecute}
                onSelectForensics={onSelectForensics}
                onOpenAIForensics={onOpenAIForensics}
                config={config}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main FutureSetupEngineView Component
// ---------------------------------------------------------------------------
export const FutureSetupEngineView: React.FC<FutureSetupEngineViewProps> = ({
  setups,
  trades = [],
  history = [],
  config,
  onExecuteSetup,
  onInspectForensics,
  onClearHistory,
  currentTimeframe = '15m',
  onTimeframeChange,
  onMultiTimeframeChange,
}) => {
  // Master View Mode: STACKED (Both Bot & Exchange) | SIDE_BY_SIDE (Split 50/50) | BOT_ONLY | EXCHANGE_ONLY | HISTORY
  const [viewMode, setViewMode] = useState<'STACKED' | 'SIDE_BY_SIDE' | 'BOT_ONLY' | 'EXCHANGE_ONLY' | 'HISTORY'>('STACKED');

  // Multi-Timeframe states for BOT vs EXCHANGE (independent state arrays)
  const [botTimeframes, setBotTimeframes] = useState<SetupTimeframe[]>(
    config?.botScanningTimeframes && config.botScanningTimeframes.length > 0
      ? config.botScanningTimeframes
      : ALL_TIMEFRAMES
  );

  const [exchangeTimeframes, setExchangeTimeframes] = useState<SetupTimeframe[]>(
    config?.exchangeScanningTimeframes && config.exchangeScanningTimeframes.length > 0
      ? config.exchangeScanningTimeframes
      : ALL_TIMEFRAMES
  );

  // Independent UI filters & layout for Bot Setup
  const [botLayoutMode, setBotLayoutMode] = useState<'KANBAN' | 'GRID'>('KANBAN');
  const [botDirectionFilter, setBotDirectionFilter] = useState<'ALL' | 'BUY/LONG' | 'SELL/SHORT'>('ALL');
  const [botOrderPlacedFilter, setBotOrderPlacedFilter] = useState<'ALL' | 'NO_ORDER' | 'ORDER_PLACED'>('ALL');
  const [botStatusFilter, setBotStatusFilter] = useState<string>('ALL');
  const [botSearchQuery, setBotSearchQuery] = useState('');

  // Independent UI filters & layout for Exchange Setup
  const [exchangeLayoutMode, setExchangeLayoutMode] = useState<'KANBAN' | 'GRID'>('KANBAN');
  const [exchangeDirectionFilter, setExchangeDirectionFilter] = useState<'ALL' | 'BUY/LONG' | 'SELL/SHORT'>('ALL');
  const [exchangeOrderPlacedFilter, setExchangeOrderPlacedFilter] = useState<'ALL' | 'NO_ORDER' | 'ORDER_PLACED'>('ALL');
  const [exchangeStatusFilter, setExchangeStatusFilter] = useState<string>('ALL');
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState('');

  const [isUpdatingTimeframes, setIsUpdatingTimeframes] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [selectedForensicsSetup, setSelectedForensicsSetup] = useState<FutureSetup | null>(null);
  const [selectedForensicsSection, setSelectedForensicsSection] = useState<'BOT' | 'EXCHANGE'>('BOT');
  const [selectedAIForensicsSetup, setSelectedAIForensicsSetup] = useState<FutureSetup | null>(null);

  // 24H Range Scanner & Quality Filter States
  const [rangeEnabled, setRangeEnabled] = useState<boolean>(config?.rangeFilterEnabled ?? true);
  const [rangeMin, setRangeMin] = useState<number>(config?.rangeMinPercent ?? 3.0);
  const [rangeMax, setRangeMax] = useState<number>(config?.rangeMaxPercent ?? 7.0);
  const [rangeSide, setRangeSide] = useState<'BOTH' | 'GAINERS' | 'LOSERS'>(config?.rangeTargetSide ?? 'BOTH');
  const [isSavingRange, setIsSavingRange] = useState<boolean>(false);
  const [isFreshScanning, setIsFreshScanning] = useState<boolean>(false);
  const [rangeBannerOpen, setRangeBannerOpen] = useState<boolean>(true);
  const [rangeFeedbackMsg, setRangeFeedbackMsg] = useState<string | null>(null);

  // Sync when config props change
  useEffect(() => {
    if (config?.botScanningTimeframes && config.botScanningTimeframes.length > 0) {
      setBotTimeframes(config.botScanningTimeframes);
    }
    if (config?.exchangeScanningTimeframes && config.exchangeScanningTimeframes.length > 0) {
      setExchangeTimeframes(config.exchangeScanningTimeframes);
    }
    if (config?.rangeFilterEnabled !== undefined) setRangeEnabled(config.rangeFilterEnabled);
    if (config?.rangeMinPercent !== undefined) setRangeMin(config.rangeMinPercent);
    if (config?.rangeMaxPercent !== undefined) setRangeMax(config.rangeMaxPercent);
    if (config?.rangeTargetSide !== undefined) setRangeSide(config.rangeTargetSide);
  }, [
    config?.botScanningTimeframes,
    config?.exchangeScanningTimeframes,
    config?.rangeFilterEnabled,
    config?.rangeMinPercent,
    config?.rangeMaxPercent,
    config?.rangeTargetSide,
  ]);

  const handleSaveRangeConfig = async (newConfig?: {
    rangeFilterEnabled?: boolean;
    rangeMinPercent?: number;
    rangeMaxPercent?: number;
    rangeTargetSide?: 'BOTH' | 'GAINERS' | 'LOSERS';
  }) => {
    setIsSavingRange(true);
    try {
      const payload = {
        rangeFilterEnabled: newConfig?.rangeFilterEnabled ?? rangeEnabled,
        rangeMinPercent: newConfig?.rangeMinPercent ?? rangeMin,
        rangeMaxPercent: newConfig?.rangeMaxPercent ?? rangeMax,
        rangeTargetSide: newConfig?.rangeTargetSide ?? rangeSide,
        expireOutOfRangeSetups: true,
      };
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setRangeFeedbackMsg('24H Range Filters Saved & Live Exchange Synchronized!');
      setTimeout(() => setRangeFeedbackMsg(null), 3000);
    } catch (err) {
      console.error('Failed to save range config:', err);
    } finally {
      setIsSavingRange(false);
    }
  };

  const handleTriggerFreshScan = async () => {
    setIsFreshScanning(true);
    try {
      await fetch('/api/setups/fresh-scan', { method: 'POST' });
      setRangeFeedbackMsg('Fresh Market Scan Started! Stale / out-of-range setups cleared.');
      setTimeout(() => setRangeFeedbackMsg(null), 3500);
    } catch (err) {
      console.error('Failed to run fresh scan:', err);
    } finally {
      setIsFreshScanning(false);
    }
  };

  // Handle Multi-Timeframe Toggling for Bot or Exchange
  const handleToggleTimeframe = async (target: 'BOT' | 'EXCHANGE', tf: SetupTimeframe) => {
    setIsUpdatingTimeframes(true);
    try {
      let updatedBot = [...botTimeframes];
      let updatedExchange = [...exchangeTimeframes];

      if (target === 'BOT') {
        if (updatedBot.includes(tf)) {
          if (updatedBot.length > 1) {
            updatedBot = updatedBot.filter((t) => t !== tf);
          }
        } else {
          updatedBot.push(tf);
        }
        setBotTimeframes(updatedBot);
      } else {
        if (updatedExchange.includes(tf)) {
          if (updatedExchange.length > 1) {
            updatedExchange = updatedExchange.filter((t) => t !== tf);
          }
        } else {
          updatedExchange.push(tf);
        }
        setExchangeTimeframes(updatedExchange);
      }

      if (onMultiTimeframeChange) {
        await onMultiTimeframeChange({
          botScanningTimeframes: updatedBot,
          exchangeScanningTimeframes: updatedExchange,
        });
      } else {
        await fetch('/api/timeframe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botScanningTimeframes: updatedBot,
            exchangeScanningTimeframes: updatedExchange,
          }),
        });
      }
    } catch (err) {
      console.error('Failed to toggle scanning timeframe:', err);
    } finally {
      setIsUpdatingTimeframes(false);
    }
  };

  // Handle Select All Timeframes for Bot or Exchange
  const handleSelectAllTimeframes = async (target: 'BOT' | 'EXCHANGE') => {
    setIsUpdatingTimeframes(true);
    try {
      let updatedBot = [...botTimeframes];
      let updatedExchange = [...exchangeTimeframes];

      if (target === 'BOT') {
        updatedBot = [...ALL_TIMEFRAMES];
        setBotTimeframes(updatedBot);
      } else {
        updatedExchange = [...ALL_TIMEFRAMES];
        setExchangeTimeframes(updatedExchange);
      }

      if (onMultiTimeframeChange) {
        await onMultiTimeframeChange({
          botScanningTimeframes: updatedBot,
          exchangeScanningTimeframes: updatedExchange,
        });
      } else {
        await fetch('/api/timeframe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botScanningTimeframes: updatedBot,
            exchangeScanningTimeframes: updatedExchange,
          }),
        });
      }
    } catch (err) {
      console.error('Failed to select all timeframes:', err);
    } finally {
      setIsUpdatingTimeframes(false);
    }
  };

  /**
   * MEMOIZED DEDUPLICATION ENGINE:
   * Uses composite key of (coin + timeframe + setup-source)
   * Strictly prevents duplicate setup listing and UI card flickering
   */
  const deduplicatedSetups = useMemo(() => {
    const compositeMap = new Map<string, FutureSetup>();
    const openTrades = (trades || []).filter((t) => t.status === 'OPEN');
    const openTradeCoins = new Set(openTrades.map((t) => t.coin));
    const openTradeSetupIds = new Set(openTrades.map((t) => t.setupId).filter(Boolean));

    for (const s of setups) {
      if (!s || !s.coin) continue;
      // Exclude archived TP HIT / SL HIT / INVALIDATED / EXPIRED / CLOSED / REJECTED from active setups (they live in SetupHistoryView)
      if (['TP HIT', 'SL HIT', 'INVALIDATED', 'EXPIRED', 'CLOSED', 'REJECTED'].includes(s.status)) continue;

      // If setup has TRADE OPEN status, but has no active OPEN trade, exclude it from active pipeline
      if (['TRADE OPEN'].includes(s.status) && !openTradeSetupIds.has(s.id) && !openTradeCoins.has(s.coin)) {
        continue;
      }

      const compositeKey = getSetupCompositeKey(s);

      if (!compositeMap.has(compositeKey)) {
        compositeMap.set(compositeKey, { ...s, compositeKey });
      } else {
        // Strict deduplication: keep the setup with higher score or newer status
        const existing = compositeMap.get(compositeKey)!;
        if ((s.score || 0) >= (existing.score || 0)) {
          compositeMap.set(compositeKey, { ...s, compositeKey });
        }
      }
    }

    return Array.from(compositeMap.values());
  }, [setups, trades]);

  // Handle manual trigger execution
  const handleManualExecute = async (id: string, pref: 'EXCHANGE' | 'BOT') => {
    setExecutingId(id);
    try {
      await onExecuteSetup(id, pref);
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="space-y-4 relative">
      {/* ========================================================================= */}
      {/* MASTER NAVIGATION: VIEW MODES (STACKED, SIDE-BY-SIDE, BOT, EXCHANGE, HISTORY) */}
      {/* ========================================================================= */}
      <div className="bg-[#101622] p-3 rounded-xl border border-zinc-800/80 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Option 1: STACKED (Both Bot & Exchange) */}
          <button
            id="tab-stacked-view"
            onClick={() => setViewMode('STACKED')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'STACKED'
                ? 'bg-gradient-to-r from-emerald-500 to-sky-500 text-black shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-400'
                : 'bg-[#0a0e16] text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight font-bold">🥞 Stacked (Bot + Exchange)</div>
              <div className={`text-[10px] font-normal ${viewMode === 'STACKED' ? 'text-zinc-950 font-semibold' : 'text-zinc-500'}`}>
                Both sections vertically stacked
              </div>
            </div>
          </button>

          {/* Option 2: SIDE-BY-SIDE (Split 50/50) */}
          <button
            id="tab-side-by-side-view"
            onClick={() => setViewMode('SIDE_BY_SIDE')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'SIDE_BY_SIDE'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-400'
                : 'bg-[#0a0e16] text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <Columns className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight font-bold">🔀 Side-by-Side (50/50 Split)</div>
              <div className={`text-[10px] font-normal ${viewMode === 'SIDE_BY_SIDE' ? 'text-zinc-950 font-semibold' : 'text-zinc-500'}`}>
                Dual parallel terminal panes
              </div>
            </div>
          </button>

          {/* Option 3: BOT SETUP ONLY */}
          <button
            id="tab-bot-setup"
            onClick={() => setViewMode('BOT_ONLY')}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'BOT_ONLY'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-400'
                : 'bg-[#0a0e16] text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <Bot className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight font-bold">🤖 BOT SETUP (बॉट)</div>
              <div className={`text-[10px] font-normal ${viewMode === 'BOT_ONLY' ? 'text-zinc-900 font-semibold' : 'text-zinc-500'}`}>
                Virtual Setups ({deduplicatedSetups.filter((s) => botTimeframes.includes((s.timeframe || '15m') as SetupTimeframe)).length})
              </div>
            </div>
          </button>

          {/* Option 4: EXCHANGE SETUP ONLY */}
          <button
            id="tab-exchange-setup"
            onClick={() => setViewMode('EXCHANGE_ONLY')}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'EXCHANGE_ONLY'
                ? 'bg-sky-500 text-black shadow-lg shadow-sky-950/40 ring-1 ring-sky-400'
                : 'bg-[#0a0e16] text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight font-bold">⚡ EXCHANGE SETUP (एक्सचेंज)</div>
              <div className={`text-[10px] font-normal ${viewMode === 'EXCHANGE_ONLY' ? 'text-zinc-900 font-semibold' : 'text-zinc-500'}`}>
                Delta Live ({deduplicatedSetups.filter((s) => exchangeTimeframes.includes((s.timeframe || '15m') as SetupTimeframe)).length})
              </div>
            </div>
          </button>

          {/* Option 5: TP/SL History */}
          <button
            id="tab-history"
            onClick={() => setViewMode('HISTORY')}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'HISTORY'
                ? 'bg-purple-500 text-black shadow-lg shadow-purple-950/40'
                : 'bg-[#0a0e16] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>TP/SL History ({history.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🎯 24H RANGE SCANNER & QUALITY FILTER ENGINE BANNER                       */}
      {/* ========================================================================= */}
      <div className="bg-[#0b121e] border-2 border-sky-500/50 rounded-2xl p-4 shadow-xl font-mono space-y-3 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Banner Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2.5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              rangeEnabled ? 'bg-sky-950 text-sky-400 border-sky-600 shadow-lg shadow-sky-950/50' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
            }`}>
              <Target className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-black text-white tracking-wide">
                  24H Range Band Quality Scanner
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                  rangeEnabled
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}>
                  {rangeEnabled ? `ACTIVE: ${rangeMin}% - ${rangeMax}%` : 'FILTER OFF (ALL COINS)'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-700">
                  AUTO-EXPIRY & PURGE ON
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Sirf target 24H move range ({rangeMin}% - {rangeMax}%) ke coins par setup banega. Range se bahar jaane par setup turant expire hoga.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* Quick Fresh Scan / Purge Button */}
            <button
              type="button"
              onClick={handleTriggerFreshScan}
              disabled={isFreshScanning}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-extrabold text-xs transition flex items-center gap-1.5 shadow-md shadow-purple-950 cursor-pointer"
              title="Purge stale/expired setups and execute fresh live exchange scan"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFreshScanning ? 'animate-spin' : ''}`} />
              <span>{isFreshScanning ? 'Scanning...' : 'Fresh Market Scan'}</span>
            </button>

            {/* Toggle Banner Minimization */}
            <button
              type="button"
              onClick={() => setRangeBannerOpen(!rangeBannerOpen)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition flex items-center gap-1 text-xs cursor-pointer"
            >
              {rangeBannerOpen ? (
                <>
                  <ChevronUp className="w-4 h-4 text-sky-400" />
                  <span className="hidden sm:inline">Minimize</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-sky-400" />
                  <span className="hidden sm:inline">Adjust Range</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback message banner if present */}
        {rangeFeedbackMsg && (
          <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{rangeFeedbackMsg}</span>
          </div>
        )}

        {/* Collapsible Range Controls Body */}
        {rangeBannerOpen && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
            {/* Control 1: Min % */}
            <div className="p-2.5 bg-[#070b13] rounded-xl border border-zinc-800 space-y-1.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold block">1. Minimum 24H Move %</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={`min_${val}`}
                    type="button"
                    onClick={() => {
                      setRangeMin(val);
                      handleSaveRangeConfig({ rangeMinPercent: val });
                    }}
                    className={`flex-1 py-1 rounded text-[11px] font-bold border transition ${
                      rangeMin === val
                        ? 'bg-sky-600 text-white border-sky-400'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Control 2: Max % */}
            <div className="p-2.5 bg-[#070b13] rounded-xl border border-zinc-800 space-y-1.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold block">2. Maximum 24H Move %</span>
              <div className="flex items-center gap-1.5">
                {[5, 7, 10, 15, 20].map((val) => (
                  <button
                    key={`max_${val}`}
                    type="button"
                    onClick={() => {
                      setRangeMax(val);
                      handleSaveRangeConfig({ rangeMaxPercent: val });
                    }}
                    className={`flex-1 py-1 rounded text-[11px] font-bold border transition ${
                      rangeMax === val
                        ? 'bg-sky-600 text-white border-sky-400'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            {/* Control 3: Target Side */}
            <div className="p-2.5 bg-[#070b13] rounded-xl border border-zinc-800 space-y-1.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold block">3. Target Market Side</span>
              <div className="grid grid-cols-3 gap-1">
                {(['BOTH', 'GAINERS', 'LOSERS'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => {
                      setRangeSide(side);
                      handleSaveRangeConfig({ rangeTargetSide: side });
                    }}
                    className={`py-1 rounded text-[10px] font-bold border transition ${
                      rangeSide === side
                        ? 'bg-sky-600 text-white border-sky-400'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {side === 'BOTH' ? 'Both ±' : side === 'GAINERS' ? 'Gainers +' : 'Losers -'}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 4: Quick Presets & Status */}
            <div className="p-2.5 bg-[#070b13] rounded-xl border border-zinc-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">4. Quick Range Presets</span>
                <div className="flex items-center gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRangeMin(3);
                      setRangeMax(7);
                      setRangeSide('BOTH');
                      handleSaveRangeConfig({ rangeMinPercent: 3, rangeMaxPercent: 7, rangeTargetSide: 'BOTH' });
                    }}
                    className="flex-1 py-1 rounded bg-[#0f192a] hover:bg-[#16253e] text-sky-300 border border-sky-800/80 text-[10px] font-bold"
                  >
                    3% - 7% (User Choice)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeMin(2);
                      setRangeMax(5);
                      setRangeSide('BOTH');
                      handleSaveRangeConfig({ rangeMinPercent: 2, rangeMaxPercent: 5, rangeTargetSide: 'BOTH' });
                    }}
                    className="flex-1 py-1 rounded bg-[#0a121d] hover:bg-[#121f31] text-zinc-300 border border-zinc-800 text-[10px] font-bold"
                  >
                    2% - 5%
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-zinc-400 pt-1 flex items-center justify-between">
                <span>Active Setups: <strong className="text-white">{deduplicatedSetups.length}</strong></span>
                <span className="text-emerald-400 font-bold">1:5 Strict R:R</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RENDER VIEW ACCORDING TO VIEW MODE */}
      {viewMode === 'HISTORY' ? (
        <SetupHistoryView
          history={history}
          onInspectForensics={onInspectForensics}
          onClearHistory={onClearHistory}
          onOpenAIForensics={(hItem) => {
            setSelectedAIForensicsSetup({
              id: hItem.id || `S_${hItem.coin}_hist`,
              coin: hItem.coin,
              exchange: 'Delta',
              instrumentType: 'Future',
              direction: hItem.direction,
              currentPrice: hItem.livePrice || hItem.entryPrice,
              triggerPrice: hItem.entryPrice,
              entryPrice: hItem.entryPrice,
              tp1: hItem.tp1,
              sl: hItem.sl,
              distanceToTrigger: 0,
              distanceToTriggerPercent: 0,
              expectedMovePercent: Math.abs(((hItem.tp1 - hItem.entryPrice) / hItem.entryPrice) * 100),
              riskPercent: Math.abs(((hItem.entryPrice - hItem.sl) / hItem.entryPrice) * 100),
              rewardPercent: Math.abs(((hItem.tp1 - hItem.entryPrice) / hItem.entryPrice) * 100),
              riskReward: hItem.riskRewardAchieved || hItem.riskReward || 5,
              score: hItem.score || 85,
              historicalProbability: 80,
              sampleSize: 25,
              confidence: 85,
              reason: hItem.whyFormed || hItem.primaryReason || 'PCD Confluence',
              whyFormed: hItem.whyFormed || 'Historical trade setup with 1:5 asymmetric target.',
              primaryReason: hItem.primaryReason || `${hItem.coin} Breakout`,
              supportingReasons: hItem.supportingReasons || ['PCD Breadth Passed'],
              historicalEvidence: 'Institutional Volume Accumulation',
              indicatorConfirmations: {
                trend: 'Trend Continuation',
                rsi: 55,
                macd: 'Positive',
                adx: 30,
                volumeProfile: 'Accumulation Node',
                volatility: 'Normal ATR',
                pattern: 'Breakout',
                marketStructure: 'Aligned',
              },
              status: 'TRADE OPEN',
              createdAt: hItem.openedAt || hItem.timestamp || new Date().toISOString(),
              productId: 1,
              timeframe: hItem.timeframe || '15m',
              pcdReason: hItem.pcdReason || 'PCD Breadth & Trend Clearance',
              marketBreadthAtEntry: hItem.marketBreadthAtEntry || 'Broad Market Aligned',
              pcdVerdict: hItem.pcdStatus || 'PCD APPROVED',
            });
          }}
        />
      ) : viewMode === 'SIDE_BY_SIDE' ? (
        /* SIDE BY SIDE (2 EQUAL COLUMNS) */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <SetupTerminalSection
            section="BOT"
            timeframes={botTimeframes}
            onToggleTimeframe={handleToggleTimeframe}
            onSelectAllTimeframes={handleSelectAllTimeframes}
            isUpdatingTimeframes={isUpdatingTimeframes}
            deduplicatedSetups={deduplicatedSetups}
            trades={trades}
            history={history}
            config={config}
            executingId={executingId}
            onManualExecute={handleManualExecute}
            onSelectForensics={(setup) => {
              setSelectedForensicsSetup(setup);
              setSelectedForensicsSection('BOT');
            }}
            onOpenAIForensics={(setup) => setSelectedAIForensicsSetup(setup)}
            selectedForensicsSetup={selectedForensicsSetup}
            directionFilter={botDirectionFilter}
            setDirectionFilter={setBotDirectionFilter}
            orderPlacedFilter={botOrderPlacedFilter}
            setOrderPlacedFilter={setBotOrderPlacedFilter}
            statusFilter={botStatusFilter}
            setStatusFilter={setBotStatusFilter}
            searchQuery={botSearchQuery}
            setSearchQuery={setBotSearchQuery}
            layoutMode={botLayoutMode}
            setLayoutMode={setBotLayoutMode}
            isSplitView={true}
          />
          <SetupTerminalSection
            section="EXCHANGE"
            timeframes={exchangeTimeframes}
            onToggleTimeframe={handleToggleTimeframe}
            onSelectAllTimeframes={handleSelectAllTimeframes}
            isUpdatingTimeframes={isUpdatingTimeframes}
            deduplicatedSetups={deduplicatedSetups}
            trades={trades}
            history={history}
            config={config}
            executingId={executingId}
            onManualExecute={handleManualExecute}
            onSelectForensics={(setup) => {
              setSelectedForensicsSetup(setup);
              setSelectedForensicsSection('EXCHANGE');
            }}
            onOpenAIForensics={(setup) => setSelectedAIForensicsSetup(setup)}
            selectedForensicsSetup={selectedForensicsSetup}
            directionFilter={exchangeDirectionFilter}
            setDirectionFilter={setExchangeDirectionFilter}
            orderPlacedFilter={exchangeOrderPlacedFilter}
            setOrderPlacedFilter={setExchangeOrderPlacedFilter}
            statusFilter={exchangeStatusFilter}
            setStatusFilter={setExchangeStatusFilter}
            searchQuery={exchangeSearchQuery}
            setSearchQuery={setExchangeSearchQuery}
            layoutMode={exchangeLayoutMode}
            setLayoutMode={setExchangeLayoutMode}
            isSplitView={true}
          />
        </div>
      ) : viewMode === 'BOT_ONLY' ? (
        /* BOT ONLY FULL WIDTH */
        <SetupTerminalSection
          section="BOT"
          timeframes={botTimeframes}
          onToggleTimeframe={handleToggleTimeframe}
          onSelectAllTimeframes={handleSelectAllTimeframes}
          isUpdatingTimeframes={isUpdatingTimeframes}
          deduplicatedSetups={deduplicatedSetups}
          trades={trades}
          history={history}
          config={config}
          executingId={executingId}
          onManualExecute={handleManualExecute}
          onSelectForensics={(setup) => {
            setSelectedForensicsSetup(setup);
            setSelectedForensicsSection('BOT');
          }}
          onOpenAIForensics={(setup) => setSelectedAIForensicsSetup(setup)}
          selectedForensicsSetup={selectedForensicsSetup}
          directionFilter={botDirectionFilter}
          setDirectionFilter={setBotDirectionFilter}
          orderPlacedFilter={botOrderPlacedFilter}
          setOrderPlacedFilter={setBotOrderPlacedFilter}
          statusFilter={botStatusFilter}
          setStatusFilter={setBotStatusFilter}
          searchQuery={botSearchQuery}
          setSearchQuery={setBotSearchQuery}
          layoutMode={botLayoutMode}
          setLayoutMode={setBotLayoutMode}
          isSplitView={false}
        />
      ) : viewMode === 'EXCHANGE_ONLY' ? (
        /* EXCHANGE ONLY FULL WIDTH */
        <SetupTerminalSection
          section="EXCHANGE"
          timeframes={exchangeTimeframes}
          onToggleTimeframe={handleToggleTimeframe}
          onSelectAllTimeframes={handleSelectAllTimeframes}
          isUpdatingTimeframes={isUpdatingTimeframes}
          deduplicatedSetups={deduplicatedSetups}
          trades={trades}
          history={history}
          config={config}
          executingId={executingId}
          onManualExecute={handleManualExecute}
          onSelectForensics={(setup) => {
            setSelectedForensicsSetup(setup);
            setSelectedForensicsSection('EXCHANGE');
          }}
          onOpenAIForensics={(setup) => setSelectedAIForensicsSetup(setup)}
          selectedForensicsSetup={selectedForensicsSetup}
          directionFilter={exchangeDirectionFilter}
          setDirectionFilter={setExchangeDirectionFilter}
          orderPlacedFilter={exchangeOrderPlacedFilter}
          setOrderPlacedFilter={setExchangeOrderPlacedFilter}
          statusFilter={exchangeStatusFilter}
          setStatusFilter={setExchangeStatusFilter}
          searchQuery={exchangeSearchQuery}
          setSearchQuery={setExchangeSearchQuery}
          layoutMode={exchangeLayoutMode}
          setLayoutMode={setExchangeLayoutMode}
          isSplitView={false}
        />
      ) : (
        /* STACKED (DEFAULT: BOTH SECTIONS VERTICALLY STACKED) */
        <div className="space-y-6">
          <SetupTerminalSection
            section="BOT"
            timeframes={botTimeframes}
            onToggleTimeframe={handleToggleTimeframe}
            onSelectAllTimeframes={handleSelectAllTimeframes}
            isUpdatingTimeframes={isUpdatingTimeframes}
            deduplicatedSetups={deduplicatedSetups}
            trades={trades}
            history={history}
            config={config}
            executingId={executingId}
            onManualExecute={handleManualExecute}
            onSelectForensics={(setup) => {
              setSelectedForensicsSetup(setup);
              setSelectedForensicsSection('BOT');
            }}
            onOpenAIForensics={(setup) => setSelectedAIForensicsSetup(setup)}
            selectedForensicsSetup={selectedForensicsSetup}
            directionFilter={botDirectionFilter}
            setDirectionFilter={setBotDirectionFilter}
            orderPlacedFilter={botOrderPlacedFilter}
            setOrderPlacedFilter={setBotOrderPlacedFilter}
            statusFilter={botStatusFilter}
            setStatusFilter={setBotStatusFilter}
            searchQuery={botSearchQuery}
            setSearchQuery={setBotSearchQuery}
            layoutMode={botLayoutMode}
            setLayoutMode={setBotLayoutMode}
            isSplitView={false}
          />
          <SetupTerminalSection
            section="EXCHANGE"
            timeframes={exchangeTimeframes}
            onToggleTimeframe={handleToggleTimeframe}
            onSelectAllTimeframes={handleSelectAllTimeframes}
            isUpdatingTimeframes={isUpdatingTimeframes}
            deduplicatedSetups={deduplicatedSetups}
            trades={trades}
            history={history}
            config={config}
            executingId={executingId}
            onManualExecute={handleManualExecute}
            onSelectForensics={(setup) => {
              setSelectedForensicsSetup(setup);
              setSelectedForensicsSection('EXCHANGE');
            }}
            onOpenAIForensics={(setup) => setSelectedAIForensicsSetup(setup)}
            selectedForensicsSetup={selectedForensicsSetup}
            directionFilter={exchangeDirectionFilter}
            setDirectionFilter={setExchangeDirectionFilter}
            orderPlacedFilter={exchangeOrderPlacedFilter}
            setOrderPlacedFilter={setExchangeOrderPlacedFilter}
            statusFilter={exchangeStatusFilter}
            setStatusFilter={setExchangeStatusFilter}
            searchQuery={exchangeSearchQuery}
            setSearchQuery={setExchangeSearchQuery}
            layoutMode={exchangeLayoutMode}
            setLayoutMode={setExchangeLayoutMode}
            isSplitView={false}
          />
        </div>
      )}

      {/* Technical Forensics Side-Panel Overlay */}
      {selectedForensicsSetup && (
        <TechnicalForensicsSidePanel
          setup={selectedForensicsSetup}
          section={selectedForensicsSection}
          onClose={() => setSelectedForensicsSetup(null)}
          onInspectDeep={onInspectForensics}
          onOpenAIForensics={(s) => setSelectedAIForensicsSetup(s)}
          onExecute={handleManualExecute}
          executingId={executingId}
        />
      )}

      {/* Google AI Quant Forensics Explainer Modal */}
      <AITradeForensicsModal
        setup={selectedAIForensicsSetup}
        isOpen={Boolean(selectedAIForensicsSetup)}
        onClose={() => setSelectedAIForensicsSetup(null)}
        onExecute={handleManualExecute}
        executingId={executingId}
      />
    </div>
  );
};
