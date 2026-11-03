import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Zap,
  Radio,
  Power,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Sliders,
  Terminal,
  Server,
  Copy,
  Check,
} from 'lucide-react';
import type { BotStatusState, ExchangeConfig } from '../types/index.js';

interface HeaderProps {
  status: BotStatusState;
  config: ExchangeConfig;
  onOpenSettings: () => void;
  onOpenCommandCenter: () => void;
  onToggleBot: (action: 'start' | 'pause' | 'resume' | 'halt') => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  wsStatus?: string;
  wsLatency?: number;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  config,
  onOpenSettings,
  onOpenCommandCenter,
  onToggleBot,
  activeTab,
  setActiveTab,
  wsStatus = 'CONNECTED',
  wsLatency = 0,
}) => {
  const isConnected = status.isConnected;
  const isLive = !config.isReadMode;
  const autoTrade = config.autoTradeEnabled;
  const [copiedIp, setCopiedIp] = useState(false);
  const serverIp = config.serverIp || '34.34.244.50';

  const handleCopyIp = () => {
    navigator.clipboard.writeText(serverIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0c1017]/95 backdrop-blur border-b border-zinc-800/80 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Brand & Connection Status */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
              Δ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-wide text-zinc-100">DELTA SMART BOT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase">
                  {config.environment}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-mono">
                <span>Autonomous Quantitative Derivatives Engine</span>
              </div>
            </div>
          </div>

          {/* Connection Badge */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
                isConnected
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                  : 'bg-rose-950/40 text-rose-400 border-rose-500/40 animate-pulse'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {isConnected ? 'DELTA CONNECTED' : 'PLEASE CONNECT DELTA'}
            </div>
          </div>
        </div>

        {/* Center: System Telemetry & Status Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* Delta Server IP Whitelist Button */}
          <button
            type="button"
            onClick={handleCopyIp}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-950/40 hover:bg-blue-900/50 border border-blue-500/40 text-blue-300 text-[11px] transition"
            title="Click to copy Server IP for Delta API Whitelist"
          >
            <Server className="w-3 h-3 text-blue-400" />
            <span>IP: <strong className="text-white">{serverIp}</strong></span>
            {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-blue-400" />}
          </button>

          {/* Delta Dedicated WebSocket Stream Status */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 text-[11px]">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-zinc-400">DELTA WS:</span>
            <span
              className={`font-semibold ${
                wsStatus === 'CONNECTED'
                  ? 'text-emerald-400'
                  : wsStatus === 'CONNECTING' || wsStatus === 'RECONNECTING'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {wsStatus === 'CONNECTED' ? `LIVE (${wsLatency || 45}ms)` : wsStatus}
            </span>
          </div>

          {/* Bot State */}
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-zinc-400">BOT:</span>
            <span
              className={`font-semibold ${
                status.botStatus === 'RUNNING'
                  ? 'text-emerald-400'
                  : status.botStatus === 'PAUSED'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {status.botStatus}
            </span>
          </div>

          {/* Execution Mode */}
          <div
            className={`px-2 py-1 rounded border font-semibold ${
              isLive
                ? 'bg-rose-950/30 text-rose-400 border-rose-800'
                : 'bg-sky-950/30 text-sky-400 border-sky-800'
            }`}
          >
            {isLive ? 'LIVE ORDER MODE' : 'READ-ONLY MODE'}
          </div>

          {/* Real Exchange Balance & Capital Ceiling */}
          {isConnected && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
              <span className="text-zinc-500">EXCHANGE BAL:</span>
              <span className="text-emerald-400 font-bold">
                ${(status.liveExchangeBalance ?? 0) > 0 ? status.liveExchangeBalance?.toFixed(2) : status.totalCapital?.toFixed(2)}
              </span>
              {status.totalCapital > 0 && (
                <span className="text-[10px] text-zinc-400 border-l border-zinc-700 pl-1.5">
                  Limit: ${status.totalCapital.toFixed(0)}
                </span>
              )}
            </div>
          )}

          {/* Auto Trade */}
          <div
            className={`px-2 py-1 rounded border font-semibold ${
              autoTrade
                ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800'
            }`}
          >
            AUTO TRADE: {autoTrade ? 'ACTIVE' : 'OFF'}
          </div>

          {/* Latency & Freshness */}
          {isConnected && (
            <div className="hidden lg:flex items-center gap-2 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-400" /> {status.lastPingMs}ms
              </span>
              <span>•</span>
              <span>Fresh: {status.dataFreshnessSeconds}s</span>
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Command Terminal Trigger */}
          <button
            onClick={onOpenCommandCenter}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs transition"
            title="Open Smart Command Terminal"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Commands</span>
          </button>

          {/* Bot Start/Pause */}
          {status.botStatus === 'RUNNING' ? (
            <button
              onClick={() => onToggleBot('pause')}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/30 hover:bg-amber-900/40 text-amber-400 border border-amber-700/50 text-xs transition"
              title="Pause Bot"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={() => onToggleBot('resume')}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 text-xs transition"
              title="Resume Bot"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Start</span>
            </button>
          )}

          {/* Emergency Halt */}
          <button
            onClick={() => onToggleBot('halt')}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-700/60 text-xs transition"
            title="Emergency Halt: Stop All Trading"
          >
            <Power className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">HALT</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition"
            title="Exchange Settings"
          >
            <Sliders className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      </div>
    </header>
  );
};
