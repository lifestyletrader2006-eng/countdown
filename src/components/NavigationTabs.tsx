import React from 'react';
import {
  LayoutDashboard,
  Sliders,
  TrendingUp,
  Layers,
  Crosshair,
  Shuffle,
  History,
  ShoppingCart,
  FileText,
  AlertOctagon,
  Terminal,
  LineChart,
  Archive,
  BarChart3,
} from 'lucide-react';

export const TABS = [
  { id: 'status', label: 'Status Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Exchange Settings', icon: Sliders },
  { id: 'scanner', label: 'Future 24H Coins', icon: TrendingUp },
  { id: 'distribution', label: 'Price Change Distribution', icon: BarChart3 },
  { id: 'optionChain', label: 'Option Chain & Future', icon: Layers },
  { id: 'setups', label: 'Future Setup', icon: Crosshair },
  { id: 'history', label: 'Trade & Setup History', icon: Archive },
  { id: 'arbitrage', label: 'Arbitrage Setup', icon: Shuffle },
  { id: 'backtest', label: 'Backtest', icon: LineChart },
  { id: 'orders', label: 'Live Orders', icon: ShoppingCart },
  { id: 'reports', label: 'Reports & Learning', icon: FileText },
  { id: 'errors', label: 'Error Center', icon: AlertOctagon },
  { id: 'command', label: 'Command Center', icon: Terminal },
];

interface NavigationTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  errorCount?: number;
  openSetupsCount?: number;
  openOrdersCount?: number;
  historyCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  setActiveTab,
  errorCount = 0,
  openSetupsCount = 0,
  openOrdersCount = 0,
  historyCount = 0,
}) => {
  return (
    <div className="bg-[#0e131d] border-b border-zinc-800/80 px-2 overflow-x-auto scrollbar-none">
      <div className="max-w-7xl mx-auto flex items-center gap-1 min-w-max py-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>

              {tab.id === 'setups' && openSetupsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {openSetupsCount}
                </span>
              )}

              {tab.id === 'history' && historyCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 text-purple-400 border border-purple-800">
                  {historyCount}
                </span>
              )}

              {tab.id === 'orders' && openOrdersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-950 text-blue-400 border border-blue-800">
                  {openOrdersCount}
                </span>
              )}

              {tab.id === 'errors' && errorCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-950 text-rose-400 border border-rose-800 font-bold">
                  {errorCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
