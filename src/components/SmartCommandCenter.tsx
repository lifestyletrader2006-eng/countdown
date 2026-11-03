import React, { useState } from 'react';
import { Terminal, Send, Zap, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface SmartCommandCenterProps {
  onExecuteCommand: (cmd: string) => Promise<{ success: boolean; message: string; data?: any }>;
  logs: Array<{ id: string; timestamp: string; command: string; output: string; status: 'SUCCESS' | 'ERROR' }>;
}

const QUICK_COMMANDS = [
  'Scan all Delta futures',
  'Scan top 24H coins',
  "Analyze today's movers",
  'Find future setups',
  'Scan option chain',
  'Scan future-option arbitrage',
  'Show open trades',
  'Show errors',
  'Update all data',
];

export const SmartCommandCenter: React.FC<SmartCommandCenterProps> = ({
  onExecuteCommand,
  logs,
}) => {
  const [inputCommand, setInputCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  const handleSend = async (cmdToSend?: string) => {
    const cmd = cmdToSend || inputCommand;
    if (!cmd.trim() || isExecuting) return;

    setIsExecuting(true);
    try {
      await onExecuteCommand(cmd);
      if (!cmdToSend) setInputCommand('');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-mono text-xs">
      {/* Command Input Box */}
      <div className="bg-[#101622] p-4 rounded-xl border border-zinc-800/80 shadow-lg space-y-3">
        <div className="flex items-center gap-2 text-zinc-100 font-bold">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Autonomous Command & Dispatch Console</span>
        </div>
        <p className="text-zinc-400 text-[11px]">
          Type an instruction or click a quick command below. The backend executes real market-data scans, setups evaluation, parity discovery, or system diagnostics.
        </p>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-emerald-400 font-bold">&gt;</span>
            <input
              type="text"
              value={inputCommand}
              onChange={(e) => setInputCommand(e.target.value)}
              placeholder="e.g. Scan all Delta futures or Find future setups..."
              className="w-full bg-[#0a0e16] border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={isExecuting || !inputCommand.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isExecuting ? 'Running...' : 'Execute'}</span>
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] text-zinc-500 mr-1">QUICK ACTIONS:</span>
          {QUICK_COMMANDS.map((qc) => (
            <button
              key={qc}
              type="button"
              onClick={() => handleSend(qc)}
              disabled={isExecuting}
              className="px-2.5 py-1 rounded bg-[#090d14] hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border border-zinc-800/80 text-[11px] transition flex items-center gap-1"
            >
              <Zap className="w-2.5 h-2.5 text-emerald-400" />
              <span>{qc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Output Log */}
      <div className="bg-[#0b0f17] border border-zinc-800 rounded-xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-800/80 pb-2 text-[11px] text-zinc-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-zinc-200">Execution Output Stream</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              🌙 Auto-resets daily at 12:00 AM Midnight
            </span>
          </div>
          <span className="text-zinc-500 font-mono">{logs.length} Today's Transactions</span>
        </div>

        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="text-zinc-500 py-6 text-center space-y-1">
              <p className="font-semibold">Execution stream idle for today.</p>
              <p className="text-[10px] text-zinc-600">
                Issue a command or trigger a quick action. The output stream automatically resets each night at 12:00 AM.
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded bg-[#0d121c] border border-zinc-800/70 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-emerald-400 font-bold">&gt; {log.command}</span>
                  <span className="text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-zinc-300 leading-relaxed pl-3 border-l border-zinc-700">
                  {log.output}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
