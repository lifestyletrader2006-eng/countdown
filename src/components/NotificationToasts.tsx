import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Zap,
  AlertTriangle,
  X,
  Bot,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  Sliders,
  VolumeX,
  Volume2,
  Lock,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { ExchangeConfig } from '../types/index.js';

export interface InAppAlert {
  id: string;
  type: 'TRIGGERED' | 'TP_HIT' | 'SL_HIT' | 'DISCONNECT' | 'ERROR' | 'CONNECTED';
  title: string;
  message: string;
  coin?: string;
  source?: 'EXCHANGE LIVE' | 'BOT VIRTUAL';
  timestamp: string;
  pnl?: number;
  pnlPercent?: number;
  exitPrice?: number;
  entryPrice?: number;
  tp?: number;
  sl?: number;
  direction?: string;
}

interface NotificationToastsProps {
  alerts: InAppAlert[];
  config?: ExchangeConfig;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onUpdateConfig?: (updated: Partial<ExchangeConfig>) => void;
}

export const NotificationToasts: React.FC<NotificationToastsProps> = ({
  alerts,
  config,
  onDismiss,
  onClearAll,
  onUpdateConfig,
}) => {
  const [showConfigModal, setShowConfigModal] = useState(false);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none font-mono text-xs">
      {/* Action bar if alerts exist or to open category mute settings */}
      <div className="flex items-center justify-end gap-2 pointer-events-auto">
        {onUpdateConfig && (
          <button
            onClick={() => setShowConfigModal((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold shadow-lg backdrop-blur-md transition ${
              showConfigModal
                ? 'bg-emerald-500 text-black border-emerald-400'
                : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
            }`}
            title="Configure Category Notification Filters & Mute Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Alert Settings</span>
          </button>
        )}

        {alerts.length > 1 && (
          <button
            onClick={onClearAll}
            className="px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-[11px] font-bold shadow-lg backdrop-blur-md transition"
          >
            Dismiss All ({alerts.length})
          </button>
        )}
      </div>

      {/* Category Mute Configuration Dropdown Panel */}
      {showConfigModal && config && onUpdateConfig && (
        <div className="pointer-events-auto bg-[#101622] border border-zinc-700 rounded-xl p-4 shadow-2xl space-y-3 animate-in fade-in slide-in-from-top-2 text-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-xs text-white">Global Alert Filters & Mute Rules</span>
            </div>
            <button
              onClick={() => setShowConfigModal(false)}
              className="text-zinc-400 hover:text-white p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Selectively mute specific categories of notifications. Vital trading errors and critical safety alerts remain permanently locked active.
          </p>

          <div className="space-y-2 pt-1">
            {/* 1. Mute Trigger Alerts */}
            <label className="flex items-center justify-between p-2 rounded-lg bg-[#0a0e16] border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-zinc-200 block">Trigger & Entry Alerts</span>
                  <span className="text-[10px] text-zinc-500">Alerts when market crosses setup trigger</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.muteTriggerAlerts || false}
                onChange={(e) => onUpdateConfig({ muteTriggerAlerts: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* 2. Mute TP Hit Alerts */}
            <label className="flex items-center justify-between p-2 rounded-lg bg-[#0a0e16] border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-zinc-200 block">1:5 TP Hit Profit Alerts</span>
                  <span className="text-[10px] text-zinc-500">Target hit celebratory notifications</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.muteTpHitAlerts || false}
                onChange={(e) => onUpdateConfig({ muteTpHitAlerts: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* 3. Mute SL Hit Alerts */}
            <label className="flex items-center justify-between p-2 rounded-lg bg-[#0a0e16] border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-rose-400" />
                <div>
                  <span className="text-xs font-bold text-zinc-200 block">Stop-Loss (SL) Hit Alerts</span>
                  <span className="text-[10px] text-zinc-500">Risk guard position exit notifications</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.muteSlHitAlerts || false}
                onChange={(e) => onUpdateConfig({ muteSlHitAlerts: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-0 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* 4. Mute Reconnection Alerts */}
            <label className="flex items-center justify-between p-2 rounded-lg bg-[#0a0e16] border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <div>
                  <span className="text-xs font-bold text-zinc-200 block">Reconnection Info Alerts</span>
                  <span className="text-[10px] text-zinc-500">Network transition & sync alerts</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.muteReconnectAlerts || false}
                onChange={(e) => onUpdateConfig({ muteReconnectAlerts: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-sky-500 focus:ring-0 w-4 h-4 cursor-pointer"
              />
            </label>

            {/* 5. VITAL SYSTEM & BOT ERROR ALERTS (ALWAYS ACTIVE) */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/60">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-rose-300 block flex items-center gap-1.5">
                    <span>Vital Errors & Safety Alerts</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-900/60 text-rose-200 border border-rose-700 font-bold">
                      LOCKED ON
                    </span>
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Order rejections, margin errors, and critical API disconnections cannot be muted.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Toast Notifications */}
      {alerts.map((alert) => {
        const isTpHit = alert.type === 'TP_HIT';
        const isSlHit = alert.type === 'SL_HIT';
        const isTriggered = alert.type === 'TRIGGERED';
        const isDisconnect = alert.type === 'DISCONNECT';
        const isError = alert.type === 'ERROR';
        const isConnected = alert.type === 'CONNECTED';
        const isFinancial = isTpHit || isSlHit;

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 relative overflow-hidden animate-in fade-in slide-in-from-right-4 ${
              isTpHit || isConnected
                ? 'bg-[#061e14]/95 border-emerald-500/80 text-emerald-200 shadow-emerald-950/50'
                : isSlHit
                ? 'bg-[#200a0e]/95 border-rose-500/80 text-rose-200 shadow-rose-950/50'
                : isTriggered
                ? 'bg-[#1e1706]/95 border-amber-500/80 text-amber-200 shadow-amber-950/50'
                : isDisconnect
                ? 'bg-[#221504]/95 border-orange-500/80 text-orange-200 shadow-orange-950/50'
                : 'bg-[#180a0a]/95 border-red-500/80 text-red-200 shadow-red-950/50'
            }`}
          >
            {/* Top Accent Bar */}
            <div
              className={`absolute top-0 left-0 right-0 h-1.5 ${
                isTpHit || isConnected
                  ? 'bg-emerald-400'
                  : isSlHit
                  ? 'bg-rose-400'
                  : isTriggered
                  ? 'bg-amber-400'
                  : isDisconnect
                  ? 'bg-orange-400'
                  : 'bg-red-500'
              }`}
            />

            {/* Header: Title, Icon, Close */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {(isTpHit || isConnected) && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                {isSlHit && <Shield className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                {isTriggered && <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                {isDisconnect && <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />}
                {isError && <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}

                <span className="font-bold text-xs text-white tracking-wide">{alert.title}</span>
              </div>

              <button
                onClick={() => onDismiss(alert.id)}
                className="text-zinc-400 hover:text-white p-0.5 rounded transition"
                title="Dismiss alert"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Prominent Badges: Coin, Source (Exchange vs Bot), Direction */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {alert.coin && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-900 border border-zinc-700 text-amber-300">
                  {alert.coin}
                </span>
              )}

              {/* Source Label Badge (Exchange Live vs Bot Virtual) */}
              {alert.source && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 shadow-sm ${
                    alert.source === 'EXCHANGE LIVE'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/80 shadow-emerald-950/40'
                      : 'bg-purple-950 text-purple-300 border-purple-500/80 shadow-purple-950/40'
                  }`}
                >
                  {alert.source === 'EXCHANGE LIVE' ? (
                    <Zap className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Bot className="w-3 h-3 text-purple-400" />
                  )}
                  <span>{alert.source}</span>
                </span>
              )}

              {alert.direction && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-900 border border-zinc-700 text-zinc-300 flex items-center gap-1">
                  {alert.direction.includes('BUY') || alert.direction.includes('LONG') ? (
                    <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 text-rose-400" />
                  )}
                  {alert.direction}
                </span>
              )}
            </div>

            {/* Specific Financial Details Card for TP/SL Alerts */}
            {isFinancial && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-black/40 border border-zinc-800/80 space-y-1.5 text-zinc-300">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 text-[10px] uppercase font-bold">Realized PnL:</span>
                  <span
                    className={`font-bold text-xs ${
                      isTpHit ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isTpHit ? '+' : '-'}${Math.abs(alert.pnl || 0).toFixed(2)}{' '}
                    {alert.pnlPercent !== undefined && `(${alert.pnlPercent}%)`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-800/60">
                  {alert.exitPrice !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Exit Price:</span>
                      <span className="font-bold text-white">${alert.exitPrice}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Risk:Reward:</span>
                    <span className="font-bold text-emerald-400">1:5 Target</span>
                  </div>
                </div>
              </div>
            )}

            {/* Alert Narrative Message */}
            <p className="text-zinc-200 text-[11px] leading-relaxed mt-2">{alert.message}</p>

            {/* Timestamp & System Footer */}
            <div className="text-[10px] text-zinc-400 mt-2.5 flex items-center justify-between border-t border-zinc-800/60 pt-1.5">
              <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
              <span className="text-[9px] text-zinc-500 uppercase font-bold">Delta Autonomous Worker</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
