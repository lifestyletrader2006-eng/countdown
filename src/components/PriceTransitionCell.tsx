import React, { useEffect, useRef, useState } from 'react';

interface PriceTransitionCellProps {
  price: number | string;
  prevPrice?: number | string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  prefix?: string;
  suffix?: string;
  className?: string;
  showDirectionIcon?: boolean;
}

/**
 * High-performance price display with dynamic CSS transitions (green/red flash on tick)
 * Conforms to exchange visual standards (Delta / Bybit / Binance)
 */
export const PriceTransitionCell: React.FC<PriceTransitionCellProps> = ({
  price,
  prevPrice: explicitPrevPrice,
  size = 'md',
  prefix = '$',
  suffix = '',
  className = '',
  showDirectionIcon = false,
}) => {
  const [flashDirection, setFlashDirection] = useState<'up' | 'down' | 'neutral'>('neutral');

  const numPrice = typeof price === 'number' ? price : parseFloat(String(price || 0)) || 0;
  const numExplicitPrev = explicitPrevPrice !== undefined
    ? (typeof explicitPrevPrice === 'number' ? explicitPrevPrice : parseFloat(String(explicitPrevPrice || 0)) || 0)
    : undefined;

  const prevPriceRef = useRef<number>(numPrice);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    const comparePrice = numExplicitPrev !== undefined ? numExplicitPrev : prevPriceRef.current;

    if (numPrice > 0 && comparePrice > 0 && numPrice !== comparePrice) {
      if (numPrice > comparePrice) {
        setFlashDirection('up');
      } else {
        setFlashDirection('down');
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Settle back to neutral after 750ms with smooth CSS ease-out transition
      timeoutRef.current = setTimeout(() => {
        setFlashDirection('neutral');
      }, 750);
    }

    prevPriceRef.current = numPrice;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [numPrice, numExplicitPrev]);

  // Smart formatting for micro-coins vs high-value assets with strict safety guards
  const formatPrice = (raw: number | string | undefined | null): string => {
    if (raw === undefined || raw === null || raw === '') return '0.00';
    const p = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (isNaN(p) || p <= 0) return '0.00';
    if (p >= 1000) {
      return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (p >= 1) {
      return p.toFixed(2);
    }
    if (p >= 0.01) {
      return p.toFixed(4);
    }
    if (p >= 0.0001) {
      return p.toFixed(6);
    }
    return p.toFixed(8);
  };

  const formatted = formatPrice(price);

  const sizeClasses = {
    xs: 'text-[11px] py-0.5 px-1',
    sm: 'text-xs py-0.5 px-1.5',
    md: 'text-sm py-0.5 px-1.5',
    lg: 'text-base font-bold py-1 px-2',
  }[size];

  const flashClasses = {
    up: 'text-emerald-400 bg-emerald-500/20 ring-1 ring-emerald-500/40 rounded transition-colors duration-150',
    down: 'text-rose-400 bg-rose-500/20 ring-1 ring-rose-500/40 rounded transition-colors duration-150',
    neutral: 'text-zinc-100 bg-transparent ring-0 rounded transition-all duration-700 ease-out',
  }[flashDirection];

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono font-semibold tracking-tight ${sizeClasses} ${flashClasses} ${className}`}
    >
      {showDirectionIcon && flashDirection === 'up' && <span className="text-[10px] text-emerald-400">▲</span>}
      {showDirectionIcon && flashDirection === 'down' && <span className="text-[10px] text-rose-400">▼</span>}
      <span>
        {prefix}
        {formatted}
        {suffix}
      </span>
    </span>
  );
};
