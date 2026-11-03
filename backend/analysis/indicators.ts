export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSuite {
  // Trend
  ema9: number;
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  sma20: number;
  vwap: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  supertrend: { value: number; direction: 'BULLISH' | 'BEARISH' };

  // Momentum
  rsi: number;
  stochRsi: { k: number; d: number };
  macd: { macd: number; signal: number; histogram: number };
  roc: number;
  momentum: number;
  cci: number;
  williamsR: number;

  // Volatility
  atr: number;
  bollingerBands: { upper: number; middle: number; lower: number; widthPercent: number };
  realizedVolatility: number;
  rangeExpansion: number;

  // Volume
  volumeZScore: number;
  relativeVolume: number;
  obv: number;
  volumeSpike: boolean;
  volumePriceDivergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE';

  // Structure & Patterns
  structure: {
    swingHigh: number;
    swingLow: number;
    trendType: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    lastEvent: 'BOS_BULL' | 'BOS_BEAR' | 'CHOCH_BULL' | 'CHOCH_BEAR' | 'RANGE';
    support: number;
    resistance: number;
  };
  candlePattern: string;
  chartPattern: string;
}

// EMA Calculation
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = new Array(values.length);
  
  // Seed with SMA
  let sum = 0;
  const seedLength = Math.min(period, values.length);
  for (let i = 0; i < seedLength; i++) {
    sum += values[i];
  }
  let prevEma = sum / seedLength;
  for (let i = 0; i < seedLength; i++) {
    emaArray[i] = prevEma;
  }

  for (let i = seedLength; i < values.length; i++) {
    prevEma = values[i] * k + prevEma * (1 - k);
    emaArray[i] = prevEma;
  }
  return emaArray;
}

// SMA Calculation
export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      const slice = values.slice(0, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

// RSI Calculation
export function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length < 2) return closes.map(() => 50);
  const rsi: number[] = new Array(closes.length).fill(50);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= Math.min(period, closes.length - 1); i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (closes.length > period) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[period] = 100 - 100 / (1 + rs);

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      const currentRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + currentRs);
    }
  }

  return rsi;
}

// ATR Calculation
export function calculateATR(candles: Candle[], period = 14): number[] {
  if (candles.length === 0) return [];
  const tr: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const trueRange = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    tr.push(trueRange);
  }

  return calculateEMA(tr, period);
}

// ADX & Directional Movement
export function calculateADX(candles: Candle[], period = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length < period + 1) {
    return { adx: 20, plusDI: 20, minusDI: 20 };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const trueRange = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    tr.push(trueRange);

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    if (upMove > downMove && upMove > 0) plusDM.push(upMove);
    else plusDM.push(0);

    if (downMove > upMove && downMove > 0) minusDM.push(downMove);
    else minusDM.push(0);
  }

  const smoothedTR = calculateEMA(tr, period);
  const smoothedPlusDM = calculateEMA(plusDM, period);
  const smoothedMinusDM = calculateEMA(minusDM, period);

  const lastIdx = smoothedTR.length - 1;
  const currentTR = smoothedTR[lastIdx] || 1;
  const plusDI = ((smoothedPlusDM[lastIdx] || 0) / currentTR) * 100;
  const minusDI = ((smoothedMinusDM[lastIdx] || 0) / currentTR) * 100;

  const dx: number[] = [];
  for (let i = 0; i < smoothedTR.length; i++) {
    const pDI = ((smoothedPlusDM[i] || 0) / (smoothedTR[i] || 1)) * 100;
    const mDI = ((smoothedMinusDM[i] || 0) / (smoothedTR[i] || 1)) * 100;
    const sum = pDI + mDI;
    dx.push(sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100);
  }

  const smoothedADX = calculateEMA(dx, period);
  const adx = smoothedADX[smoothedADX.length - 1] || 25;

  return { adx, plusDI, minusDI };
}

// MACD (12, 26, 9)
export function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  const signalLine = calculateEMA(macdLine, 9);
  const lastIdx = closes.length - 1;
  const macd = macdLine[lastIdx] || 0;
  const signal = signalLine[lastIdx] || 0;
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

// Bollinger Bands (20, 2)
export function calculateBollingerBands(closes: number[], period = 20, multiplier = 2) {
  if (closes.length === 0) {
    return { upper: 0, middle: 0, lower: 0, widthPercent: 0 };
  }
  const sma = calculateSMA(closes, period);
  const lastIdx = closes.length - 1;
  const middle = sma[lastIdx] || closes[lastIdx];

  const slice = closes.slice(Math.max(0, closes.length - period));
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance);

  const upper = middle + multiplier * stdDev;
  const lower = Math.max(0, middle - multiplier * stdDev);
  const widthPercent = middle > 0 ? ((upper - lower) / middle) * 100 : 0;

  return { upper, middle, lower, widthPercent };
}

// Supertrend
export function calculateSupertrend(candles: Candle[], period = 10, multiplier = 3): { value: number; direction: 'BULLISH' | 'BEARISH' } {
  if (candles.length < period) {
    const lastClose = candles[candles.length - 1]?.close || 0;
    return { value: lastClose * 0.98, direction: 'BULLISH' };
  }

  const atrValues = calculateATR(candles, period);
  let direction: 'BULLISH' | 'BEARISH' = 'BULLISH';
  let supertrendValue = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const atr = atrValues[i] || (c.high - c.low);
    const basicUpper = (c.high + c.low) / 2 + multiplier * atr;
    const basicLower = (c.high + c.low) / 2 - multiplier * atr;

    if (c.close > (supertrendValue || basicUpper)) {
      direction = 'BULLISH';
      supertrendValue = basicLower;
    } else if (c.close < (supertrendValue || basicLower)) {
      direction = 'BEARISH';
      supertrendValue = basicUpper;
    }
  }

  return { value: supertrendValue, direction };
}

// VWAP
export function calculateVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let cumVolume = 0;
  let cumTypicalVolume = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumTypicalVolume += typicalPrice * c.volume;
    cumVolume += c.volume;
  }

  return cumVolume > 0 ? cumTypicalVolume / cumVolume : candles[candles.length - 1].close;
}

// Stochastic RSI
export function calculateStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsi = calculateRSI(closes, rsiPeriod);
  if (rsi.length < stochPeriod) return { k: 50, d: 50 };

  const stochRsiValues: number[] = [];
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const window = rsi.slice(i - stochPeriod + 1, i + 1);
    const minRsi = Math.min(...window);
    const maxRsi = Math.max(...window);
    const range = maxRsi - minRsi;
    stochRsiValues.push(range === 0 ? 50 : ((rsi[i] - minRsi) / range) * 100);
  }

  const kValues = calculateSMA(stochRsiValues, kPeriod);
  const dValues = calculateSMA(kValues, dPeriod);

  const k = kValues[kValues.length - 1] || 50;
  const d = dValues[dValues.length - 1] || 50;
  return { k, d };
}

// CCI (Commodity Channel Index)
export function calculateCCI(candles: Candle[], period = 20): number {
  if (candles.length < period) return 0;
  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);
  const sma = calculateSMA(typicalPrices, period);
  const lastTP = typicalPrices[typicalPrices.length - 1];
  const lastSMA = sma[sma.length - 1];

  const slice = typicalPrices.slice(-period);
  const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - lastSMA), 0) / period;

  return meanDev === 0 ? 0 : (lastTP - lastSMA) / (0.015 * meanDev);
}

// Williams %R
export function calculateWilliamsR(candles: Candle[], period = 14): number {
  if (candles.length < period) return -50;
  const slice = candles.slice(-period);
  const highestHigh = Math.max(...slice.map((c) => c.high));
  const lowestLow = Math.min(...slice.map((c) => c.low));
  const currentClose = candles[candles.length - 1].close;

  const range = highestHigh - lowestLow;
  return range === 0 ? -50 : ((highestHigh - currentClose) / range) * -100;
}

// Candlestick Pattern Recognition
export function detectCandlePattern(candles: Candle[]): string {
  if (candles.length < 3) return 'None';
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const body = Math.abs(last.close - last.open);
  const candleRange = last.high - last.low;
  if (candleRange === 0) return 'Doji';

  const upperShadow = last.high - Math.max(last.close, last.open);
  const lowerShadow = Math.min(last.close, last.open) - last.low;
  const isBullish = last.close > last.open;
  const isBearish = last.close < last.open;

  // Doji
  if (body <= candleRange * 0.1) return 'Doji';

  // Hammer / Pinbar Bullish
  if (lowerShadow >= body * 2 && upperShadow <= body * 0.4 && isBullish) {
    return 'Hammer (Bullish Reversal)';
  }

  // Inverted Hammer / Shooting Star
  if (upperShadow >= body * 2 && lowerShadow <= body * 0.4) {
    return isBullish ? 'Inverted Hammer' : 'Shooting Star (Bearish)';
  }

  // Bullish Engulfing
  if (
    prev.close < prev.open &&
    last.close > last.open &&
    last.open <= prev.close &&
    last.close >= prev.open
  ) {
    return 'Bullish Engulfing';
  }

  // Bearish Engulfing
  if (
    prev.close > prev.open &&
    last.close < last.open &&
    last.open >= prev.close &&
    last.close <= prev.open
  ) {
    return 'Bearish Engulfing';
  }

  // Morning Star
  const prev2Body = Math.abs(prev2.close - prev2.open);
  const prevBody = Math.abs(prev.close - prev.open);
  if (
    prev2.close < prev2.open &&
    prevBody < prev2Body * 0.4 &&
    last.close > last.open &&
    last.close >= (prev2.open + prev2.close) / 2
  ) {
    return 'Morning Star (Bullish)';
  }

  // Marubozu
  if (body >= candleRange * 0.9) {
    return isBullish ? 'Bullish Marubozu' : 'Bearish Marubozu';
  }

  return 'Normal Trend Bar';
}

// Structure & Key Level Analysis
export function analyzeMarketStructure(candles: Candle[]): {
  swingHigh: number;
  swingLow: number;
  trendType: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  lastEvent: 'BOS_BULL' | 'BOS_BEAR' | 'CHOCH_BULL' | 'CHOCH_BEAR' | 'RANGE';
  support: number;
  resistance: number;
} {
  if (candles.length < 10) {
    const last = candles[candles.length - 1];
    return {
      swingHigh: last?.high || 0,
      swingLow: last?.low || 0,
      trendType: 'SIDEWAYS',
      lastEvent: 'RANGE',
      support: (last?.low || 0) * 0.98,
      resistance: (last?.high || 0) * 1.02,
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const currentPrice = candles[candles.length - 1].close;

  // Recent 20-period swing high and low
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);
  const swingHigh = Math.max(...recentHighs);
  const swingLow = Math.min(...recentLows);

  // EMA50 vs EMA200 for macro trend
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const lastEma20 = ema20[ema20.length - 1] || currentPrice;
  const lastEma50 = ema50[ema50.length - 1] || currentPrice;

  let trendType: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
  if (currentPrice > lastEma20 && lastEma20 > lastEma50) trendType = 'UPTREND';
  else if (currentPrice < lastEma20 && lastEma20 < lastEma50) trendType = 'DOWNTREND';

  let lastEvent: 'BOS_BULL' | 'BOS_BEAR' | 'CHOCH_BULL' | 'CHOCH_BEAR' | 'RANGE' = 'RANGE';
  const prevHigh = Math.max(...highs.slice(-30, -5));
  const prevLow = Math.min(...lows.slice(-30, -5));

  if (currentPrice > prevHigh) {
    lastEvent = trendType === 'UPTREND' ? 'BOS_BULL' : 'CHOCH_BULL';
  } else if (currentPrice < prevLow) {
    lastEvent = trendType === 'DOWNTREND' ? 'BOS_BEAR' : 'CHOCH_BEAR';
  }

  return {
    swingHigh,
    swingLow,
    trendType,
    lastEvent,
    support: swingLow,
    resistance: swingHigh,
  };
}

// Complete indicator evaluation for a candle series
export function computeAllIndicators(candles: Candle[]): IndicatorSuite {
  if (!candles || candles.length === 0) {
    throw new Error('Candles series cannot be empty');
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const lastCandle = candles[candles.length - 1];

  const ema9Arr = calculateEMA(closes, 9);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema100Arr = calculateEMA(closes, 100);
  const ema200Arr = calculateEMA(closes, 200);
  const sma20Arr = calculateSMA(closes, 20);

  const rsiArr = calculateRSI(closes, 14);
  const atrArr = calculateATR(candles, 14);
  const adxResult = calculateADX(candles, 14);
  const macdResult = calculateMACD(closes);
  const bb = calculateBollingerBands(closes, 20, 2);
  const stochRsi = calculateStochRSI(closes);
  const supertrend = calculateSupertrend(candles, 10, 3);
  const vwap = calculateVWAP(candles);
  const cci = calculateCCI(candles, 20);
  const williamsR = calculateWilliamsR(candles, 14);

  // Volume calculations
  const recentVolumes = volumes.slice(-20);
  const avgVol = recentVolumes.reduce((a, b) => a + b, 0) / Math.max(1, recentVolumes.length);
  const volStdDev = Math.sqrt(
    recentVolumes.reduce((s, v) => s + Math.pow(v - avgVol, 2), 0) / Math.max(1, recentVolumes.length)
  );
  const volumeZScore = volStdDev > 0 ? (lastCandle.volume - avgVol) / volStdDev : 0;
  const relativeVolume = avgVol > 0 ? lastCandle.volume / avgVol : 1;
  const volumeSpike = relativeVolume >= 2.0;

  // On-Balance Volume (OBV)
  let obv = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
  }

  // ROC & Momentum
  const rocLookback = Math.min(10, closes.length - 1);
  const oldPrice = closes[closes.length - 1 - rocLookback] || lastCandle.close;
  const roc = oldPrice > 0 ? ((lastCandle.close - oldPrice) / oldPrice) * 100 : 0;
  const momentum = lastCandle.close - oldPrice;

  // Realized Volatility (annualized standard deviation of log returns)
  let sumLogSq = 0;
  for (let i = 1; i < closes.length; i++) {
    const ret = Math.log(closes[i] / (closes[i - 1] || 1));
    sumLogSq += ret * ret;
  }
  const realizedVolatility = Math.sqrt((sumLogSq / Math.max(1, closes.length - 1)) * 365 * 24) * 100;

  // Range expansion
  const lastRange = lastCandle.high - lastCandle.low;
  const avgRange = atrArr[atrArr.length - 1] || lastRange;
  const rangeExpansion = avgRange > 0 ? lastRange / avgRange : 1;

  // Divergence check
  let volumePriceDivergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE' = 'NONE';
  if (closes.length >= 10) {
    const priceMadeNewHigh = lastCandle.close > Math.max(...closes.slice(-10, -1));
    const rsiMadeNewHigh = (rsiArr[rsiArr.length - 1] || 50) > Math.max(...rsiArr.slice(-10, -1));
    if (priceMadeNewHigh && !rsiMadeNewHigh) {
      volumePriceDivergence = 'BEARISH_DIVERGENCE';
    } else {
      const priceMadeNewLow = lastCandle.close < Math.min(...closes.slice(-10, -1));
      const rsiMadeNewLow = (rsiArr[rsiArr.length - 1] || 50) < Math.min(...rsiArr.slice(-10, -1));
      if (priceMadeNewLow && !rsiMadeNewLow) {
        volumePriceDivergence = 'BULLISH_DIVERGENCE';
      }
    }
  }

  const structure = analyzeMarketStructure(candles);
  const candlePattern = detectCandlePattern(candles);

  let chartPattern = 'Normal Consolidation';
  if (structure.lastEvent === 'BOS_BULL') chartPattern = 'Breakout of Structure (Bullish)';
  else if (structure.lastEvent === 'BOS_BEAR') chartPattern = 'Breakdown of Structure (Bearish)';
  else if (bb.widthPercent < 4.0) chartPattern = 'Bollinger Squeeze (Volatility Compression)';
  else if (volumeSpike && lastCandle.close > lastCandle.open) chartPattern = 'Volume Expansion Breakout';

  return {
    ema9: ema9Arr[ema9Arr.length - 1] || lastCandle.close,
    ema20: ema20Arr[ema20Arr.length - 1] || lastCandle.close,
    ema50: ema50Arr[ema50Arr.length - 1] || lastCandle.close,
    ema100: ema100Arr[ema100Arr.length - 1] || lastCandle.close,
    ema200: ema200Arr[ema200Arr.length - 1] || lastCandle.close,
    sma20: sma20Arr[sma20Arr.length - 1] || lastCandle.close,
    vwap,
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    supertrend,
    rsi: rsiArr[rsiArr.length - 1] || 50,
    stochRsi,
    macd: macdResult,
    roc,
    momentum,
    cci,
    williamsR,
    atr: atrArr[atrArr.length - 1] || (lastCandle.high - lastCandle.low),
    bollingerBands: bb,
    realizedVolatility,
    rangeExpansion,
    volumeZScore,
    relativeVolume,
    obv,
    volumeSpike,
    volumePriceDivergence,
    structure,
    candlePattern,
    chartPattern,
  };
}
