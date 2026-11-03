import React, { useState } from 'react';
import { ShieldAlert, KeyRound, ExternalLink, Zap, Lock, Copy, Check, Server } from 'lucide-react';

interface UnconnectedBannerProps {
  onOpenSettings: () => void;
  serverIp?: string;
}

export const UnconnectedBanner: React.FC<UnconnectedBannerProps> = ({ onOpenSettings, serverIp = '34.34.244.50' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(serverIp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[500px] flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-8 shadow-2xl backdrop-blur text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 uppercase">
            PLEASE CONNECT DELTA EXCHANGE
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            In accordance with strict production safety rules, no market data, simulated prices, or trading actions are displayed until an authenticated Delta Exchange API connection is verified.
          </p>
        </div>

        {/* IP Whitelist Card */}
        <div className="bg-[#0b101b] border border-blue-500/30 rounded-lg p-3.5 text-left text-xs font-mono space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-blue-400 font-bold flex items-center gap-1.5">
              <Server className="w-4 h-4" />
              24/7 Cloud Bot Outbound IP Address
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center gap-1 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'IP Copied!' : 'Copy IP'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-bold text-emerald-400 bg-black/60 px-2.5 py-1 rounded border border-blue-500/30 tracking-wider">
              {serverIp}
            </code>
            <span className="text-[11px] text-amber-300">
              (RECOMMENDED: Delta API settings me 'Unrestricted' rakhein for 24x7 bot)
            </span>
          </div>
        </div>

        {/* Instructions Box */}
        <div className="bg-[#090d14] border border-zinc-800 rounded-lg p-4 text-left space-y-2 text-xs text-zinc-300 font-mono">
          <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Where to get your Delta Exchange API credentials:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-zinc-400 pl-1 leading-relaxed">
            <li>Log into your Delta Exchange account (<a href="https://india.delta.exchange" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">india.delta.exchange</a> or <a href="https://www.delta.exchange" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">delta.exchange</a>).</li>
            <li>Navigate to <strong>Account Settings &rarr; API Management</strong>.</li>
            <li>Click <strong>Create API Key</strong> with permissions for Futures & Options trading.</li>
            <li>Under IP restriction, whitelist <code className="text-white bg-black/50 px-1 rounded">{serverIp}</code> (or leave unrestricted).</li>
            <li>Paste your <strong>API Key</strong> and <strong>API Secret</strong>, select Delta India or Global, and connect.</li>
          </ol>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onOpenSettings}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>Connect Delta Exchange API</span>
          </button>

          <a
            href="https://india.delta.exchange"
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition border border-zinc-700 flex items-center justify-center gap-1.5"
          >
            <span>Delta India</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <a
            href="https://www.delta.exchange"
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition border border-zinc-700 flex items-center justify-center gap-1.5"
          >
            <span>Delta Global</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
