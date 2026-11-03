import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface LivePriceTickerProps {
  price: number | string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  showArrow?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const LivePriceTicker: React.FC<LivePriceTickerProps> = ({
  price,
  decimals,
  prefix = '$',
  suffix = '',
  className = '',
  showArrow = true,
  size = 'md',
}) => {
  const numPrice = typeof price === 'number' ? price : parseFloat(String(price || 0)) || 0;
  const [flash, setFlash] = useState<'UP' | 'DOWN' | null>(null);
  const prevPriceRef = useRef<number>(numPrice);

  useEffect(() => {
    if (numPrice === 0) return;
    const prev = prevPriceRef.current;
    if (prev > 0 && Math.abs(numPrice - prev) > 0.00000001) {
      if (numPrice > prev) {
        setFlash('UP');
      } else if (numPrice < prev) {
        setFlash('DOWN');
      }
      const timer = setTimeout(() => {
        setFlash(null);
      }, 900);
      prevPriceRef.current = numPrice;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = numPrice;
  }, [numPrice]);

  // Compute smart decimal precision based on price magnitude if not explicitly provided
  const effectiveDecimals =
    decimals !== undefined
      ? decimals
      : numPrice === 0
      ? 2
      : Math.abs(numPrice) < 0.0001
      ? 8
      : Math.abs(numPrice) < 0.01
      ? 6
      : Math.abs(numPrice) < 1
      ? 4
      : Math.abs(numPrice) < 10
      ? 3
      : 2;

  const formattedPrice =
    effectiveDecimals >= 0
      ? numPrice.toLocaleString(undefined, {
          minimumFractionDigits: effectiveDecimals,
          maximumFractionDigits: effectiveDecimals,
        })
      : numPrice.toString();

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-0.5',
    lg: 'text-base font-bold px-2.5 py-1',
    xl: 'text-xl font-black px-3 py-1.5',
  }[size];

  let flashClasses = 'text-slate-200 bg-slate-900/50 border border-transparent';
  if (flash === 'UP') {
    flashClasses = 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/30 scale-[1.02]';
  } else if (flash === 'DOWN') {
    flashClasses = 'bg-rose-500/25 text-rose-300 border-rose-500/50 shadow-sm shadow-rose-500/30 scale-[0.98]';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono rounded transition-all duration-300 ${sizeClasses} ${flashClasses} ${className}`}
    >
      {prefix}
      <span>{formattedPrice}</span>
      {suffix}
      {showArrow && (
        <span className="transition-transform duration-200">
          {flash === 'UP' ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
          ) : flash === 'DOWN' ? (
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
          ) : (
            <Minus className="w-2.5 h-2.5 text-slate-500 opacity-60" />
          )}
        </span>
      )}
    </span>
  );
};

interface LiveDistanceBadgeProps {
  distance: number | string;
  distancePercent: number | string;
  direction: 'BUY/LONG' | 'SELL/SHORT';
  className?: string;
}

export const LiveDistanceBadge: React.FC<LiveDistanceBadgeProps> = ({
  distance,
  distancePercent,
  direction,
  className = '',
}) => {
  const numDist = Number(distance) || 0;
  const numDistPct = Number(distancePercent) || 0;
  const isClose = numDistPct <= 0.35;
  const isTriggered = numDistPct <= 0.05 || numDist <= 0;

  let colorStyle = 'bg-slate-800/80 text-slate-300 border-slate-700';
  if (isTriggered) {
    colorStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 animate-pulse';
  } else if (isClose) {
    colorStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse';
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono font-medium rounded border transition-colors ${colorStyle} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      <span>
        {isTriggered ? 'AT ENTRY' : `${numDistPct.toFixed(2)}% away`}
      </span>
      <span className="text-[10px] text-slate-400">
        ($
        {numDist >= 10
          ? numDist.toFixed(2)
          : numDist >= 1
          ? numDist.toFixed(3)
          : numDist >= 0.01
          ? numDist.toFixed(4)
          : numDist >= 0.0001
          ? numDist.toFixed(6)
          : numDist.toFixed(8)}
        )
      </span>
    </div>
  );
};
