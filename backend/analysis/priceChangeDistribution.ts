import type { DeltaTicker, PriceChangeDistributionState, DistributionBucket, ExchangeConfig } from '../../src/types/index.js';

export class PriceChangeDistributionEngine {
  private lastState: PriceChangeDistributionState | null = null;
  private lastComputeTime = 0;

  /**
   * Computes the full 7-bracket Price Change Distribution from live market tickers.
   */
  public computeDistribution(tickers: DeltaTicker[]): PriceChangeDistributionState {
    // Filter valid tickers with non-zero trading activity
    const validTickers = tickers.filter((t) => t && t.symbol && (t.price_change_percent_24h !== undefined || t.close));

    const totalCoins = validTickers.length;
    if (totalCoins === 0) {
      return this.getEmptyState();
    }

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    // Define 7 institutional buckets
    const bucketDefs = [
      { range: '< -10%', min: -Infinity, max: -10, color: '#ef4444' },     // Deep Dump
      { range: '-10% to -5%', min: -10, max: -5, color: '#f87171' },       // Strong Bearish
      { range: '-5% to -2%', min: -5, max: -2, color: '#fb923c' },         // Mild Bearish
      { range: '-2% to +2%', min: -2, max: 2, color: '#94a3b8' },          // Neutral / Compression Chop
      { range: '+2% to +5%', min: 2, max: 5, color: '#38bdf8' },           // Mild Bullish
      { range: '+5% to +10%', min: 5, max: 10, color: '#4ade80' },         // Strong Bullish
      { range: '> +10%', min: 10, max: Infinity, color: '#10b981' },       // Explosive Pump / Leaders
    ];

    const bucketCoins: Record<number, Array<{ symbol: string; change24h: number; volume: number }>> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    for (const t of validTickers) {
      const change = Number(t.price_change_percent_24h ?? 0);
      const vol = Number(t.volume ?? t.turnover ?? 0);

      if (change > 0.05) positiveCount++;
      else if (change < -0.05) negativeCount++;
      else neutralCount++;

      // Assign to bucket
      let assigned = false;
      for (let i = 0; i < bucketDefs.length; i++) {
        const b = bucketDefs[i];
        if (change >= b.min && change < b.max) {
          bucketCoins[i].push({ symbol: t.symbol, change24h: change, volume: vol });
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        if (change >= 10) bucketCoins[6].push({ symbol: t.symbol, change24h: change, volume: vol });
        else if (change <= -10) bucketCoins[0].push({ symbol: t.symbol, change24h: change, volume: vol });
      }
    }

    const buckets: DistributionBucket[] = bucketDefs.map((def, idx) => {
      const coins = bucketCoins[idx].sort((a, b) => b.volume - a.volume);
      const count = coins.length;
      const percent = totalCoins > 0 ? Math.round((count / totalCoins) * 1000) / 10 : 0;
      return {
        range: def.range,
        min: def.min,
        max: def.max,
        count,
        percent,
        color: def.color,
        coins,
      };
    });

    const bullishRatio = totalCoins > 0 ? Math.round((positiveCount / totalCoins) * 1000) / 10 : 50;
    const bearishRatio = totalCoins > 0 ? Math.round((negativeCount / totalCoins) * 1000) / 10 : 50;

    // Determine Market Breadth Regime
    let marketRegime: PriceChangeDistributionState['marketRegime'] = 'NEUTRAL_CHOP';
    let regimeLabel = 'Neutral Compression / Market Chop';
    let regimeAdvice = 'Market breadth is balanced. High selective gating active to prevent chop stop-outs.';

    const chopBucketPercent = buckets[3].percent; // [-2%, +2%]

    if (chopBucketPercent >= 60) {
      marketRegime = 'NEUTRAL_CHOP';
      regimeLabel = `Extreme Chop Compression (${chopBucketPercent}% in [-2%, +2%])`;
      regimeAdvice = 'High risk of fake wicks. Setup engine requires ADX > 25 & RVOL > 1.5x.';
    } else if (bullishRatio >= 65) {
      marketRegime = 'STRONG_BULLISH';
      regimeLabel = `Strong Bullish Breadth (${bullishRatio}% Green)`;
      regimeAdvice = 'Broad institutional risk-on rally. Long 1:5 setups favored with high follow-through.';
    } else if (bullishRatio >= 55) {
      marketRegime = 'MODERATE_BULLISH';
      regimeLabel = `Moderate Bullish Drift (${bullishRatio}% Green)`;
      regimeAdvice = 'Mild upward breadth. Longs have positive statistical edge.';
    } else if (bearishRatio >= 65) {
      marketRegime = 'STRONG_BEARISH';
      regimeLabel = `Strong Bearish Breadth (${bearishRatio}% Red)`;
      regimeAdvice = 'Market-wide liquidity drain. Longs restricted to extreme Relative Strength outliers only.';
    } else if (bearishRatio >= 55) {
      marketRegime = 'MODERATE_BEARISH';
      regimeLabel = `Moderate Bearish Drift (${bearishRatio}% Red)`;
      regimeAdvice = 'Short momentum favored. High scrutiny on long breakouts.';
    }

    // Relative Strength Outliers (Green leaders during red/neutral market or top > +5% movers)
    const relativeStrengthCoins: Array<{ symbol: string; change24h: number; reason: string }> = [];
    const minOutlierGain = 4.0;

    for (const t of validTickers) {
      const change = Number(t.price_change_percent_24h ?? 0);
      if (change >= minOutlierGain) {
        if (bearishRatio >= 55) {
          relativeStrengthCoins.push({
            symbol: t.symbol,
            change24h: change,
            reason: `Defying Bearish Breadth (${change.toFixed(1)}% vs market ${bearishRatio}% Red) — Strong Institutional Divergence`,
          });
        } else {
          relativeStrengthCoins.push({
            symbol: t.symbol,
            change24h: change,
            reason: `Top Momentum Leader (+${change.toFixed(1)}%) in Right-Tail Distribution`,
          });
        }
      }
    }

    // Relative Weakness Outliers (Lagging coins during green market or top < -4% losers)
    const relativeWeaknessCoins: Array<{ symbol: string; change24h: number; reason: string }> = [];
    for (const t of validTickers) {
      const change = Number(t.price_change_percent_24h ?? 0);
      if (change <= -4.0) {
        relativeWeaknessCoins.push({
          symbol: t.symbol,
          change24h: change,
          reason: `Extreme Downside Laggard (${change.toFixed(1)}%) — Vulnerable to cascade sell-off`,
        });
      }
    }

    const state: PriceChangeDistributionState = {
      totalCoins,
      positiveCoins: positiveCount,
      negativeCoins: negativeCount,
      neutralCoins: neutralCount,
      bullishRatio,
      bearishRatio,
      marketRegime,
      regimeLabel,
      regimeAdvice,
      buckets,
      relativeStrengthCoins: relativeStrengthCoins.slice(0, 15),
      relativeWeaknessCoins: relativeWeaknessCoins.slice(0, 15),
      updatedAt: new Date().toISOString(),
    };

    this.lastState = state;
    this.lastComputeTime = Date.now();
    return state;
  }

  public getCachedState(): PriceChangeDistributionState {
    if (this.lastState) return this.lastState;
    return this.getEmptyState();
  }

  /**
   * Evaluates whether a proposed setup is permissible under current Price Change Distribution breadth rules.
   */
  public evaluateBreadthPermission(
    direction: 'BUY/LONG' | 'SELL/SHORT',
    symbol: string,
    change24h: number,
    config: ExchangeConfig
  ): { allowed: boolean; reason: string; scoreBonus: number } {
    if (!config.pcdEnabled) {
      return { allowed: true, reason: 'PCD Intelligence disabled', scoreBonus: 0 };
    }

    const state = this.getCachedState();
    const isLong = direction.includes('BUY') || direction.includes('LONG');
    const isOutlier = change24h >= (config.pcdMinOutlierGainPercent ?? 5.0);
    const bonus = config.pcdConfluenceScoreBonus ?? 10;

    // 1. Check Chop Protection
    if (config.pcdChopProtectionEnabled && state.marketRegime === 'NEUTRAL_CHOP') {
      const isStrongLeader = Math.abs(change24h) >= 4.0;
      if (!isStrongLeader) {
        return {
          allowed: false,
          reason: `PCD Chop Protection: Market is compressed in neutral chop (${state.buckets[3]?.percent || 0}% in [-2%, +2%]). Only high-volatility breakout leaders allowed.`,
          scoreBonus: 0,
        };
      }
    }

    // 2. Check Breadth Directional Gating
    if (config.pcdBreadthFilterEnabled) {
      const minBullishRatio = config.pcdMinBullishRatioForLongs ?? 40;
      const minBearishRatio = config.pcdMaxBearishRatioForShorts ?? 40;

      const minOutlierThreshold = config.pcdMinOutlierGainPercent ?? 5.0;

      if (isLong) {
        // Market is heavily bearish (e.g. bullishRatio < 40%)
        if (state.bullishRatio < minBullishRatio) {
          // Allow only if user permits Relative Strength outliers and coin qualifies
          if (config.pcdAllowOutliersInOppositeMarket && isOutlier) {
            return {
              allowed: true,
              reason: `PCD Relative Strength Exemption: Market is bearish (${state.bullishRatio}% Green), but ${symbol} is a confirmed outlier (+${change24h.toFixed(1)}%) with independent capital inflow.`,
              scoreBonus: Math.round(bonus * 1.5),
            };
          }
          return {
            allowed: false,
            reason: `PCD Breadth Gate Block: Market is heavily bearish (${state.bearishRatio}% Red, threshold ${minBullishRatio}% Green required). Long blocked to prevent bull trap.`,
            scoreBonus: 0,
          };
        }

        // Long aligns with bullish breadth -> Award bonus
        if (state.bullishRatio >= 60) {
          return {
            allowed: true,
            reason: `PCD Bullish Alignment: Long aligns with ${state.bullishRatio}% green market breadth (+${bonus} pts).`,
            scoreBonus: bonus,
          };
        }
      } else {
        // Short setup
        if (state.bearishRatio < minBearishRatio) {
          if (config.pcdAllowOutliersInOppositeMarket && change24h <= -minOutlierThreshold) {
            return {
              allowed: true,
              reason: `PCD Relative Weakness Exemption: Market is bullish, but ${symbol} has heavy downside divergence (${change24h.toFixed(1)}%).`,
              scoreBonus: Math.round(bonus * 1.5),
            };
          }
          return {
            allowed: false,
            reason: `PCD Breadth Gate Block: Market is heavily bullish (${state.bullishRatio}% Green, threshold ${minBearishRatio}% Red required). Short blocked to prevent bear squeeze.`,
            scoreBonus: 0,
          };
        }

        // Short aligns with bearish breadth -> Award bonus
        if (state.bearishRatio >= 60) {
          return {
            allowed: true,
            reason: `PCD Bearish Alignment: Short aligns with ${state.bearishRatio}% red market breadth (+${bonus} pts).`,
            scoreBonus: bonus,
          };
        }
      }
    }

    return { allowed: true, reason: 'PCD Neutral clearance', scoreBonus: 0 };
  }

  private getEmptyState(): PriceChangeDistributionState {
    return {
      totalCoins: 0,
      positiveCoins: 0,
      negativeCoins: 0,
      neutralCoins: 0,
      bullishRatio: 50,
      bearishRatio: 50,
      marketRegime: 'NEUTRAL_CHOP',
      regimeLabel: 'Calibrating Delta Market Breadth...',
      regimeAdvice: 'Computing 24H price change distribution across listed contracts.',
      buckets: [],
      relativeStrengthCoins: [],
      relativeWeaknessCoins: [],
      updatedAt: new Date().toISOString(),
    };
  }
}
