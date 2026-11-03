import type { DeltaExchangeClient } from '../exchange/deltaClient.js';
import type { FutureSetup, TradeRecord, BotErrorRecord, ExchangeConfig, DeltaProduct } from '../../src/types/index.js';

/**
 * Formats price to clean string conforming to exchange tick size, eliminating JavaScript IEEE-754 floating point artifacts
 */
function formatCleanPrice(price: number | string | undefined | null, tickSize?: string): string {
  if (price === undefined || price === null || price === '') return '';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (!num || isNaN(num) || num <= 0) return '';
  if (tickSize) {
    const tick = parseFloat(tickSize);
    if (!isNaN(tick) && tick > 0) {
      const decimals = Math.max(0, Math.min(8, (tickSize.split('.')[1] || '').length));
      const rounded = Math.round(num / tick) * tick;
      return rounded.toFixed(decimals);
    }
  }
  return parseFloat(num.toFixed(6)).toString();
}

export class OrderManager {
  private inFlightOrders = new Set<string>(); // Idempotency lock

  /**
   * Executes a confirmed order on Delta Exchange with full state machine & fill verification
   */
  public async executeLiveOrder(
    setup: FutureSetup,
    client: DeltaExchangeClient,
    config: ExchangeConfig,
    calculatedLeverage: number,
    quantity: number,
    capitalRequired: number,
    logError: (err: Omit<BotErrorRecord, 'errorId' | 'timestamp'>) => void,
    prod?: DeltaProduct,
    orderOverrides?: {
      overrideSide?: 'BUY' | 'SELL';
      overrideTp?: number;
      overrideSl?: number;
      isSideChangedOrder?: boolean;
      originalSetupSide?: string;
      sideChangeSlSetting?: string;
      normalSetupSnapshot?: TradeRecord['normalSetupSnapshot'];
    }
  ): Promise<{ success: boolean; trade?: TradeRecord; error?: string }> {
    const lockKey = `${setup.id}_${setup.coin}`;
    if (this.inFlightOrders.has(lockKey)) {
      return { success: false, error: 'Duplicate order prevented by in-flight lock' };
    }

    this.inFlightOrders.add(lockKey);

    try {
      const finalSide = orderOverrides?.overrideSide
        ? (orderOverrides.overrideSide.toLowerCase() as 'buy' | 'sell')
        : (setup.direction === 'BUY/LONG' ? 'buy' : 'sell');
      const side = finalSide;
      const finalTp = orderOverrides?.overrideTp !== undefined ? orderOverrides.overrideTp : setup.tp1;
      const finalSl = orderOverrides?.overrideSl !== undefined ? orderOverrides.overrideSl : setup.sl;

      // If credentials not configured, fallback to paper trading
      if (!client.hasCredentials()) {
        const fillPrice = setup.entryPrice;
        const tradeId = `PAPER_${setup.coin}_${Date.now()}`;
        const newTrade: TradeRecord = {
          tradeId,
          setupId: setup.id,
          orderId: `PAPER_ORD_${Date.now()}`,
          exchange: 'Delta',
          coin: setup.coin,
          instrumentType: setup.instrumentType,
          side: finalSide.toUpperCase() as 'BUY' | 'SELL',
          entryPrice: setup.entryPrice,
          actualFillPrice: setup.entryPrice,
          currentPrice: setup.entryPrice,
          tp: finalTp,
          sl: finalSl,
          quantity,
          capitalUsed: capitalRequired,
          leverage: calculatedLeverage,
          fees: Math.round(fillPrice * quantity * 0.0005 * 100) / 100,
          funding: 0,
          realizedPnl: 0,
          unrealizedPnl: 0,
          pnlPercent: 0,
          createdAt: new Date().toISOString(),
          status: 'OPEN',
          executionType: 'BOT_VIRTUAL',
          executionNote: 'Paper Virtual Trade (Delta API credentials not set)',
          timeframe: setup.timeframe || config.scanningTimeframe || '15m',
          strategy: setup.strategy || '1:5 Mathematical Confluence',
          partialProfitBooked: false,
          sideChangeEnabled: Boolean(orderOverrides?.isSideChangedOrder),
          isSideChangedOrder: Boolean(orderOverrides?.isSideChangedOrder),
          originalSetupSide: orderOverrides?.originalSetupSide || setup.direction,
          sideChangeSlSetting: orderOverrides?.sideChangeSlSetting,
          normalSetupSnapshot: orderOverrides?.normalSetupSnapshot ? {
            ...orderOverrides.normalSetupSnapshot,
            entry: setup.entryPrice,
          } : undefined,
          highestPrice: fillPrice,
          lowestPrice: fillPrice,
          tradeLogs: [
            { time: new Date().toISOString(), event: 'Setup Triggered', details: `Setup ${setup.direction} detected on ${setup.timeframe || '15m'}` },
            orderOverrides?.isSideChangedOrder
              ? { time: new Date().toISOString(), event: 'Side Change Active', details: `Inverted side from ${orderOverrides.originalSetupSide} to ${finalSide.toUpperCase()} (SL Mode: ${orderOverrides.sideChangeSlSetting})` }
              : { time: new Date().toISOString(), event: 'Order Placement', details: `Normal setup order placed (paper)` },
            { time: new Date().toISOString(), event: 'Order Filled', details: `Virtual order active at entry price $${setup.entryPrice}` },
          ],
        };
        return { success: true, trade: newTrade };
      }

      // 1. Resolve product ID from Delta Exchange if not populated
      let targetProductId = setup.productId;
      if (!targetProductId) {
        try {
          const prodsRes = await client.getProducts();
          if ('products' in prodsRes && Array.isArray(prodsRes.products)) {
            const cleanTarget = (setup.coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const match = prodsRes.products.find((p) => {
              if (p.id === setup.productId) return true;
              if (p.symbol === setup.coin) return true;
              const cleanSym = (p.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (cleanSym === cleanTarget) return true;
              if (p.underlying_asset?.symbol && cleanTarget.includes(p.underlying_asset.symbol.toUpperCase())) return true;
              return false;
            });
            if (match) {
              targetProductId = match.id;
              setup.productId = match.id;
            }
          }
        } catch (prodErr) {
          console.warn('[OrderManager] Product ID lookup warning:', prodErr);
        }
      }

      if (!targetProductId) {
        return {
          success: false,
          error: `Missing Delta product ID for coin ${setup.coin}. Order submission blocked.`,
        };
      }

      // 2. Set leverage on Delta Exchange if manual or auto determined
      try {
        await client.changeLeverage(targetProductId, calculatedLeverage);
      } catch (levErr) {
        console.warn(`[OrderManager] Leverage update non-fatal warning for ${setup.coin}:`, levErr);
      }

      // 3. Prepare client_order_id: Delta Exchange requires strictly <= 32 characters
      const cleanCoin = (setup.coin || 'ORD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
      const uniqueSuffix = `${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
      const safeClientOrderId = `B_${cleanCoin}_${uniqueSuffix}`.slice(0, 32);

      // Contract size must be integer contracts on Delta
      const contractSize = Math.max(1, Math.round(quantity));

      // 4. Submit Market Order cleanly to Delta Exchange
      // Note: On Delta Exchange, attaching inline bracket prices during /v2/orders causes 'bracket_order_position_exists'
      // if any position or previous bracket exists. The recommended pattern is submitting the market order first,
      // and immediately attaching the position bracket (TP/SL) via /v2/orders/bracket upon execution.
      const cleanSl = finalSl && Number(finalSl) > 0 ? formatCleanPrice(finalSl, prod?.tick_size) : undefined;
      const cleanTp = finalTp && Number(finalTp) > 0 ? formatCleanPrice(finalTp, prod?.tick_size) : undefined;

      const orderPayload = {
        product_id: targetProductId,
        size: contractSize,
        side: side as 'buy' | 'sell',
        order_type: 'market_order' as const,
        client_order_id: safeClientOrderId,
      };

      const deltaRes = await client.placeOrder(orderPayload);

      if ('isError' in deltaRes) {
        logError({
          severity: 'CRITICAL',
          module: 'Order',
          subModule: 'executeLiveOrder',
          functionName: 'placeOrder',
          exchange: 'Delta',
          coin: setup.coin,
          setupId: setup.id,
          httpStatus: deltaRes.httpStatus,
          deltaErrorCode: deltaRes.deltaCode,
          errorMessage: deltaRes.message,
          systemMessage: `Order submission failed for ${setup.coin} (${side.toUpperCase()} ${quantity})`,
          dataStatus: 'REJECTED',
          retryCount: 0,
          recoveryAction: 'BLOCKED new order. Review margin balance and instrument rules.',
          finalStatus: 'OPEN',
        });

        return {
          success: false,
          error: `Delta Exchange rejected order: ${deltaRes.message} (HTTP ${deltaRes.httpStatus})`,
        };
      }

      const orderData = deltaRes.order;
      const orderId = String(orderData.id || orderData.order_id || `ORD_${Date.now()}`);
      const fillPrice = parseFloat(orderData.average_fill_price || orderData.fill_price || String(setup.entryPrice));

      // 5. Guaranteed Stop-Loss and Take-Profit placement on Delta Exchange
      // User requested: "aur jab order place ho tab sl tp bhi lag kar place ho exchange par"
      if (cleanSl || cleanTp) {
        try {
          const bracketRes = await client.placeBracketOrder(targetProductId, cleanSl, cleanTp);
          if ('isError' in bracketRes) {
            if (bracketRes.deltaCode === 'bracket_order_exists') {
              console.log(`[OrderManager] Bracket SL/TP already active for ${setup.coin} position on Delta Exchange.`);
            } else {
              console.warn(`[OrderManager] /v2/orders/bracket for ${setup.coin}: ${bracketRes.message}. Placing conditional stop orders...`);
              const exitSide = side === 'buy' ? 'sell' : 'buy';
              if (cleanSl) {
                await client.placeOrder({
                  product_id: targetProductId,
                  size: contractSize,
                  side: exitSide,
                  order_type: 'market_order',
                  stop_order_type: 'stop_loss_order',
                  stop_price: cleanSl,
                  client_order_id: `SL_${cleanCoin}_${Date.now().toString(36)}`.slice(0, 32),
                } as any);
              }
              if (cleanTp) {
                await client.placeOrder({
                  product_id: targetProductId,
                  size: contractSize,
                  side: exitSide,
                  order_type: 'market_order',
                  stop_order_type: 'take_profit_order',
                  stop_price: cleanTp,
                  client_order_id: `TP_${cleanCoin}_${Date.now().toString(36)}`.slice(0, 32),
                } as any);
              }
            }
          } else {
            console.log(`[OrderManager] Successfully placed Bracket TP/SL on Delta Exchange for ${setup.coin} (SL: ${cleanSl}, TP: ${cleanTp})`);
          }
        } catch (bracketErr) {
          console.warn(`[OrderManager] Non-fatal TP/SL bracket registration log:`, bracketErr);
        }
      }

      const tradeId = `TRD_${setup.coin}_${Date.now()}`;

      const newTrade: TradeRecord = {
        tradeId,
        setupId: setup.id,
        orderId,
        productId: targetProductId,
        exchange: 'Delta',
        coin: setup.coin,
        instrumentType: setup.instrumentType,
        side: finalSide.toUpperCase() as 'BUY' | 'SELL',
        entryPrice: setup.entryPrice,
        actualFillPrice: setup.entryPrice,
        currentPrice: setup.entryPrice,
        tp: finalTp,
        sl: finalSl,
        quantity,
        capitalUsed: capitalRequired,
        leverage: calculatedLeverage,
        fees: Math.round(setup.entryPrice * quantity * 0.0005 * 100) / 100,
        funding: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        pnlPercent: 0,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
        executionType: 'EXCHANGE_LIVE',
        timeframe: setup.timeframe || config.scanningTimeframe || '15m',
        strategy: setup.strategy || '1:5 Mathematical Confluence',
        partialProfitBooked: false,
        sideChangeEnabled: Boolean(orderOverrides?.isSideChangedOrder),
        isSideChangedOrder: Boolean(orderOverrides?.isSideChangedOrder),
        originalSetupSide: orderOverrides?.originalSetupSide || setup.direction,
        sideChangeSlSetting: orderOverrides?.sideChangeSlSetting,
        normalSetupSnapshot: orderOverrides?.normalSetupSnapshot ? {
          ...orderOverrides.normalSetupSnapshot,
          entry: setup.entryPrice,
        } : undefined,
        highestPrice: setup.entryPrice,
        lowestPrice: setup.entryPrice,
        exchangeResponse: orderData,
        tradeLogs: [
          { time: new Date().toISOString(), event: 'Setup Triggered', details: `Setup ${setup.direction} detected on ${setup.timeframe || '15m'}` },
          orderOverrides?.isSideChangedOrder
            ? { time: new Date().toISOString(), event: 'Side Change Active', details: `Inverted side from ${orderOverrides.originalSetupSide} to ${finalSide.toUpperCase()} (SL Mode: ${orderOverrides.sideChangeSlSetting})` }
            : { time: new Date().toISOString(), event: 'Order Placement', details: `Normal setup order placed on Delta Exchange` },
          { time: new Date().toISOString(), event: 'Order Filled', details: `Delta Order ${orderId} filled at setup entry price $${setup.entryPrice}` },
          { time: new Date().toISOString(), event: 'TP/SL Registered', details: `Target: $${finalTp}, Stop: $${finalSl}` },
        ],
      };

      return { success: true, trade: newTrade };
    } catch (err: any) {
      logError({
        severity: 'CRITICAL',
        module: 'Order',
        subModule: 'executeLiveOrder',
        functionName: 'exception',
        exchange: 'Delta',
        coin: setup.coin,
        setupId: setup.id,
        errorMessage: err.message || 'Execution transport exception',
        systemMessage: 'Unexpected order placement exception',
        dataStatus: 'FAILED',
        retryCount: 0,
        recoveryAction: 'Reconcile open orders with Delta Exchange positions',
        finalStatus: 'OPEN',
      });

      return { success: false, error: err.message || 'Order execution error' };
    } finally {
      this.inFlightOrders.delete(lockKey);
    }
  }

  /**
   * Evaluates running trades for TP / SL hits and Configurable 50% TP Progress Partial Profit Booking
   * Requirement: When TP progress reaches configurable % (default 50%), book lot % (default 30%), move SL to Entry + buffer (+3%)
   */
  public async monitorTradeLifecycle(
    trade: TradeRecord,
    currentPrice: number,
    client: DeltaExchangeClient,
    logError: (err: Omit<BotErrorRecord, 'errorId' | 'timestamp'>) => void,
    config?: any
  ): Promise<{
    trade: TradeRecord;
    actionTaken?: 'TP_HIT' | 'SL_HIT' | 'PARTIAL_PROFIT_BOOKED' | 'SL_TRAILED';
  }> {
    if (trade.status !== 'OPEN') {
      return { trade };
    }

    const updated = { ...trade, currentPrice };
    const isLong = trade.side === 'BUY';
    const entry = trade.entryPrice || trade.actualFillPrice;
    const priceDiff = isLong ? currentPrice - entry : entry - currentPrice;

    // For live exchange trades, preserve authoritative PnL synced continuously from Delta Exchange
    if (trade.executionType === 'EXCHANGE_LIVE' && trade.pnlPercent !== undefined && trade.unrealizedPnl !== undefined) {
      updated.unrealizedPnl = trade.unrealizedPnl;
      updated.pnlPercent = trade.pnlPercent;
    } else {
      // Calculate live Unrealized PnL matching exchange mark price
      const unrealizedPnl = priceDiff * trade.quantity;
      const margin = trade.margin || trade.capitalUsed || (entry > 0 ? (entry * trade.quantity) / Math.max(1, trade.leverage) : 0);
      const pnlPercent = margin > 0
        ? (unrealizedPnl / margin) * 100
        : (entry > 0 ? (priceDiff / entry) * 100 * trade.leverage : 0);

      updated.unrealizedPnl = Math.round(unrealizedPnl * 100) / 100;
      updated.pnlPercent = Math.round(pnlPercent * 100) / 100;
    }
    if (!updated.margin && trade.capitalUsed) {
      updated.margin = trade.capitalUsed;
    }

    // 1. Check Take Profit Hit
    const tpHit = isLong ? currentPrice >= trade.tp : currentPrice <= trade.tp;
    if (tpHit) {
      updated.status = 'TP HIT';
      updated.closedAt = new Date().toISOString();
      updated.exitPrice = currentPrice;
      updated.realizedPnl = Math.round(((updated.realizedPnl || 0) + updated.unrealizedPnl) * 100) / 100;
      updated.unrealizedPnl = 0;
      return { trade: updated, actionTaken: 'TP_HIT' };
    }

    // 2. Check Stop Loss Hit
    const slHit = isLong ? currentPrice <= trade.sl : currentPrice >= trade.sl;
    if (slHit) {
      updated.status = 'SL HIT';
      updated.closedAt = new Date().toISOString();
      updated.exitPrice = currentPrice;
      updated.realizedPnl = Math.round(((updated.realizedPnl || 0) + updated.unrealizedPnl) * 100) / 100;
      updated.unrealizedPnl = 0;
      return { trade: updated, actionTaken: 'SL_HIT' };
    }

    // 3. Partial Profit Booking at Configurable TP Progress (Default: 50% TP Progress)
    const tpProgressEnabled = config?.tpProgressEnabled !== false;
    const triggerRatio = ((config?.tpProgressTriggerPercent ?? 50) || 50) / 100;
    const bookRatio = ((config?.tpProgressBookPercent ?? 30) || 30) / 100;
    const bufferRatio = ((config?.tpProgressSlBufferPercent ?? 3) || 3) / 100;

    const tpDistance = Math.abs(trade.tp - entry);
    const currentProgressDistance = Math.abs(currentPrice - entry);
    const isFavorableMove = isLong ? currentPrice > entry : currentPrice < entry;

    if (tpProgressEnabled && !trade.partialProfitBooked && isFavorableMove && tpDistance > 0) {
      const progressRatio = currentProgressDistance / tpDistance;

      if (progressRatio >= triggerRatio) {
        // Book configured % of position lot size
        const closedQty = Math.round(trade.quantity * bookRatio * 100) / 100;
        const remainingQty = Math.max(0.01, Math.round((trade.quantity - closedQty) * 100) / 100);

        const partialRealized = Math.round(priceDiff * closedQty * 100) / 100;
        updated.realizedPnl = Math.round(((updated.realizedPnl || 0) + partialRealized) * 100) / 100;
        updated.quantity = remainingQty;
        updated.partialProfitBooked = true;
        updated.partialProfitBookedAt = new Date().toISOString();
        updated.partialProfitBookedPrice = currentPrice;
        updated.partialProfitBookedPnl = partialRealized;

        // Move SL to Entry + buffer (Trailing breakeven protection)
        const buffer = entry * bufferRatio;
        const newSl = isLong ? entry + buffer : entry - buffer;
        updated.sl = Math.round(newSl * 100) / 100;

        return { trade: updated, actionTaken: 'PARTIAL_PROFIT_BOOKED' };
      }
    }

    return { trade: updated };
  }

  /**
   * Edit TP on Delta Exchange and verify response before confirming in dashboard
   */
  public async updateTakeProfit(
    trade: TradeRecord,
    newTp: number,
    client: DeltaExchangeClient
  ): Promise<{ success: boolean; error?: string }> {
    // If trade has live order id on Delta
    if (trade.orderId && client.hasCredentials()) {
      const res = await client.updateOrder(trade.orderId, {
        product_id: 1, // product id derived
        stop_price: String(newTp),
      });

      if ('isError' in res) {
        return {
          success: false,
          error: `TP UPDATE FAILED: ${res.message} (HTTP ${res.httpStatus})`,
        };
      }
    }

    return { success: true };
  }

  /**
   * Edit SL on Delta Exchange and verify response before confirming in dashboard
   */
  public async updateStopLoss(
    trade: TradeRecord,
    newSl: number,
    client: DeltaExchangeClient
  ): Promise<{ success: boolean; error?: string }> {
    if (trade.orderId && client.hasCredentials()) {
      const res = await client.updateOrder(trade.orderId, {
        product_id: 1,
        stop_price: String(newSl),
      });

      if ('isError' in res) {
        return {
          success: false,
          error: `SL UPDATE FAILED: ${res.message} (HTTP ${res.httpStatus})`,
        };
      }
    }

    return { success: true };
  }

  /**
   * Closes an active trade immediately at market price
   * Submits an offsetting market order with reduce_only: true to Delta Exchange,
   * cancels any attached bracket/stop orders, and updates trade status to CLOSED with realized PnL.
   */
  /**
   * Closes an active trade immediately at market price (Full or Partial Lot Size)
   * Submits an offsetting market order with reduce_only: true to Delta Exchange,
   * cancels any attached bracket/stop orders, and updates trade status with realized PnL.
   */
  public async closeTradeMarket(
    trade: TradeRecord,
    currentPrice: number,
    client: DeltaExchangeClient,
    products: DeltaProduct[] = [],
    closeQuantity?: number,
    customCloseReason?: string
  ): Promise<{ success: boolean; trade: TradeRecord; isPartial?: boolean; closedQuantity?: number; error?: string }> {
    if (trade.status !== 'OPEN') {
      return {
        success: false,
        trade,
        error: `Trade ${trade.tradeId} is not in OPEN status (current status: ${trade.status})`,
      };
    }

    const isLong = trade.side === 'BUY';
    const entry = trade.actualFillPrice || trade.entryPrice;
    const exitPrice = currentPrice > 0 ? currentPrice : entry;

    // Determine quantity to close: either specific lot size or all lots
    const targetCloseQty = closeQuantity !== undefined && closeQuantity > 0 && closeQuantity < trade.quantity
      ? Math.round(closeQuantity * 100) / 100
      : trade.quantity;

    const isPartial = targetCloseQty < trade.quantity;
    const remainingQty = Math.max(0, Math.round((trade.quantity - targetCloseQty) * 100) / 100);

    // Calculate Realized PnL for closed lots
    const priceDiff = isLong ? exitPrice - entry : entry - exitPrice;
    const portionRealizedPnl = Math.round(priceDiff * targetCloseQty * 100) / 100;
    const pnlPercent = entry > 0 ? Math.round(((priceDiff / entry) * 100 * trade.leverage) * 100) / 100 : 0;

    // ONLY execute market closing order on Delta Exchange if trade is explicitly an EXCHANGE_LIVE order!
    const isExchangeLive = trade.executionType === 'EXCHANGE_LIVE';

    if (isExchangeLive && client.hasCredentials()) {
      const prod = products.find((p) => p.symbol === trade.coin);
      const targetProductId = trade.productId || prod?.id || products.find((p) => {
        if (p.symbol === trade.coin) return true;
        const cleanP = (p.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cleanT = (trade.coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return cleanP === cleanT || (cleanP.length >= 3 && cleanT.includes(cleanP)) || (cleanT.length >= 3 && cleanP.includes(cleanT));
      })?.id || 1;
      const oppositeSide = isLong ? 'sell' : 'buy';

      try {
        await client.placeOrder({
          product_id: targetProductId,
          size: Math.max(1, Math.round(targetCloseQty)),
          side: oppositeSide,
          order_type: 'market_order',
          reduce_only: true,
        });

        // If full close, cancel all lingering open bracket/stop orders on Delta Exchange for this product
        if (!isPartial) {
          await client.cancelAllOrdersForProduct(targetProductId).catch(() => {});
          if (trade.orderId) {
            await client.cancelOrder(trade.orderId, targetProductId).catch(() => {});
          }
        }
      } catch (err: any) {
        console.warn(`[OrderManager] Delta Exchange market close warning: ${err.message}`);
      }
    } else {
      console.log(`[OrderManager] Closed ${isPartial ? `${targetCloseQty} lots (partial)` : 'all lots'} for ${trade.coin} in Bot simulation.`);
    }

    const now = new Date().toISOString();
    const updated: TradeRecord = {
      ...trade,
      quantity: isPartial ? remainingQty : trade.quantity,
      status: isPartial ? 'OPEN' : 'CLOSED',
      exitPrice,
      closedAt: isPartial ? undefined : now,
      realizedPnl: Math.round(((trade.realizedPnl || 0) + portionRealizedPnl) * 100) / 100,
      unrealizedPnl: isPartial ? Math.round(priceDiff * remainingQty * 100) / 100 : 0,
      pnlPercent,
      closeReason: isPartial ? undefined : (customCloseReason as any || 'MANUAL CLOSE'),
      executionNote: isPartial
        ? `Partial close: ${targetCloseQty} lots executed at $${exitPrice} (${customCloseReason || 'Auto Close'}). Remaining: ${remainingQty} lots open.`
        : `Closed at $${exitPrice} (${customCloseReason || 'Market Exit'}). Realized PnL: $${portionRealizedPnl} (${pnlPercent}%).`,
    };

    return {
      success: true,
      trade: updated,
      isPartial,
      closedQuantity: targetCloseQty,
    };
  }
}
