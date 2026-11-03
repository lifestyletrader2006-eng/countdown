import React, { useState } from 'react';
import { AlertOctagon, Trash2, Download, Filter, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { BotErrorRecord } from '../types/index.js';

interface ErrorCenterViewProps {
  errors: BotErrorRecord[];
  onClearErrors: () => Promise<void>;
}

export const ErrorCenterView: React.FC<ErrorCenterViewProps> = ({ errors, onClearErrors }) => {
  const [activeTab, setActiveTab] = useState<string>('ALL');

  const filteredErrors = errors.filter((e) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'CRITICAL' || activeTab === 'WARNING') return e.severity === activeTab;
    return e.module.toUpperCase() === activeTab.toUpperCase();
  });

  const exportDiagnostics = () => {
    const jsonStr = JSON.stringify(errors, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delta_bot_diagnostics_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Actions Bar */}
      <div className="bg-[#101622] p-3.5 rounded-xl border border-zinc-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {['ALL', 'CRITICAL', 'WARNING', 'API', 'MARKET DATA', 'ORDER', 'BOT', 'RISK', 'TP/SL'].map((tab) => {
            const count = errors.filter((e) => {
              if (tab === 'ALL') return true;
              if (tab === 'CRITICAL' || tab === 'WARNING') return e.severity === tab;
              return e.module.toUpperCase() === tab.toUpperCase();
            }).length;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 rounded-lg border transition ${
                  activeTab === tab
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-bold'
                    : 'bg-[#0a0e16] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{tab}</span>
                {count > 0 && (
                  <span
                    className={`ml-1 text-[10px] px-1 py-0.2 rounded-full ${
                      tab === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300'
                        : 'bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 font-mono text-xs ml-auto">
          <button
            onClick={exportDiagnostics}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Diagnostics</span>
          </button>

          <button
            onClick={onClearErrors}
            className="px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 text-rose-400 border border-rose-800/50 transition flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Errors Table */}
      <div className="bg-[#101622] border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-zinc-300">
            <thead className="bg-[#0b0f17] text-[10px] uppercase text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3">ERROR ID / TIME</th>
                <th className="py-2.5 px-3">SEVERITY</th>
                <th className="py-2.5 px-3">MODULE</th>
                <th className="py-2.5 px-3">COIN / TARGET</th>
                <th className="py-2.5 px-3">HTTP / CODE</th>
                <th className="py-2.5 px-3">SANITIZED ERROR MESSAGE</th>
                <th className="py-2.5 px-3">SYSTEM EXPLANATION</th>
                <th className="py-2.5 px-3">DATA STATUS</th>
                <th className="py-2.5 px-3">RECOVERY ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-500">
                    No active errors in category {activeTab}. System operations nominal.
                  </td>
                </tr>
              ) : (
                filteredErrors.map((e) => (
                  <tr key={e.errorId} className="hover:bg-zinc-800/30 transition">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-zinc-200">{e.errorId}</div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          e.severity === 'CRITICAL'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : e.severity === 'WARNING'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {e.severity}
                      </span>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-zinc-200">{e.module}</div>
                      <div className="text-[10px] text-zinc-500">{e.functionName}</div>
                    </td>

                    <td className="py-2.5 px-3 text-zinc-300 font-medium">
                      {e.coin || e.setupId || 'Delta'}
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      {e.httpStatus ? `HTTP ${e.httpStatus}` : '-'}
                      {e.deltaErrorCode ? ` (${e.deltaErrorCode})` : ''}
                    </td>

                    <td className="py-2.5 px-3 text-rose-300 max-w-xs truncate" title={e.errorMessage}>
                      {e.errorMessage}
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 max-w-xs truncate" title={e.systemMessage}>
                      {e.systemMessage}
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                        {e.dataStatus}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-emerald-400 text-[11px] font-medium max-w-xs truncate" title={e.recoveryAction}>
                      {e.recoveryAction}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
