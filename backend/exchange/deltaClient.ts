import crypto from 'node:crypto';
import dns from 'node:dns';
import type { DeltaEnvironment, DeltaProduct, DeltaTicker } from '../../src/types/index.js';

// Enforce IPv4 lookup priority to prevent CloudFront IPv6 DNS resolution timeouts
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignored if unsupported in certain Node runtimes
}

export interface DeltaApiCredentials {
  apiKey: string;
  apiSecret: string;
  environment: DeltaEnvironment;
}

export interface DeltaApiError {
  isError: true;
  httpStatus: number;
  deltaCode?: string | number;
  message: string;
  sanitizedDetails: string;
}

export class DeltaExchangeClient {
  private apiKey: string;
  private apiSecret: string;
  private environment: DeltaEnvironment;
  private baseUrl: string;
  private static cachedPublicIp: string = '';

  constructor(credentials?: DeltaApiCredentials) {
    this.apiKey = credentials?.apiKey?.trim() || '';
    this.apiSecret = credentials?.apiSecret?.trim() || '';
    this.environment = credentials?.environment || 'production';
    this.baseUrl = this.resolveBaseUrl(this.environment);
  }

  private resolveBaseUrl(env: DeltaEnvironment): string {
    if (env === 'india') {
      return 'https://api.india.delta.exchange';
    }
    if (env === 'testnet') {
      return 'https://testnet-api.delta.exchange';
    }
    return 'https://api.delta.exchange';
  }

  public getWebSocketUrl(): string {
    if (this.environment === 'india') {
      return 'wss://socket.india.delta.exchange';
    }
    if (this.environment === 'testnet') {
      return 'wss://testnet-socket.delta.exchange';
    }
    return 'wss://socket.delta.exchange';
  }

  public updateCredentials(credentials: DeltaApiCredentials) {
    this.apiKey = credentials.apiKey?.trim() || '';
    this.apiSecret = credentials.apiSecret?.trim() || '';
    this.environment = credentials.environment || 'production';
    this.baseUrl = this.resolveBaseUrl(this.environment);
  }

  public hasCredentials(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  public getEnvironment(): DeltaEnvironment {
    return this.environment;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Resilient outbound server IP detection across multiple providers.
   * Auto-refreshes to ensure genuine live IP is cached.
   */
  public static async detectServerIp(): Promise<string> {
    const ipServices = [
      'https://api.ipify.org?format=json',
      'https://api64.ipify.org?format=json',
      'https://icanhazip.com',
    ];

    for (const service of ipServices) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(service, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          if (service.includes('json')) {
            const json = (await res.json()) as any;
            const ip = json?.ip || json?.ip_addr;
            if (ip && typeof ip === 'string') {
              DeltaExchangeClient.cachedPublicIp = ip.trim();
              return DeltaExchangeClient.cachedPublicIp;
            }
          } else {
            const text = (await res.text()).trim();
            if (text && text.length >= 7 && text.length <= 45) {
              DeltaExchangeClient.cachedPublicIp = text;
              return DeltaExchangeClient.cachedPublicIp;
            }
          }
        }
      } catch {
        // try next endpoint
      }
    }
    return DeltaExchangeClient.cachedPublicIp || 'Detecting...';
  }

  public static getCachedServerIp(): string {
    return DeltaExchangeClient.cachedPublicIp || 'Detecting...';
  }

  /**
   * Generates Delta Exchange HMAC-SHA256 signature
   * signature = HMAC_SHA256(secret, method + timestamp + path + query + body)
   */
  private generateSignature(
    method: string,
    timestamp: string,
    path: string,
    queryString = '',
    bodyString = ''
  ): string {
    const payload = `${method.toUpperCase()}${timestamp}${path}${queryString}${bodyString}`;
    return crypto.createHmac('sha256', this.apiSecret).update(payload).digest('hex');
  }

  private sanitizeUrlForLogging(url: string): string {
    return url.replace(/api-key=[^&]+/gi, 'api-key=***');
  }

  public sanitizeErrorMessage(msg: unknown): string {
    if (!msg) return 'Unknown Delta Exchange Error';
    let clean = '';

    if (typeof msg === 'string') {
      clean = msg;
    } else if (typeof msg === 'object') {
      try {
        const obj = msg as Record<string, any>;
        if (typeof obj.message === 'string') {
          clean = obj.message;
        } else if (obj.code) {
          clean = `Delta error code: ${obj.code}${obj.context ? ` (${JSON.stringify(obj.context)})` : ''}`;
        } else {
          clean = JSON.stringify(msg);
        }
      } catch {
        clean = String(msg);
      }
    } else {
      clean = String(msg);
    }

    if (this.apiKey && typeof clean === 'string' && this.apiKey.length > 3) {
      clean = clean.split(this.apiKey).join('***MASKED_KEY***');
    }
    if (this.apiSecret && typeof clean === 'string' && this.apiSecret.length > 3) {
      clean = clean.split(this.apiSecret).join('***MASKED_SECRET***');
    }
    return clean;
  }

  /**
   * Core request dispatcher with authentication, rate limit guard, and sanitized telemetry
   */
  public async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: Record<string, unknown>,
    isPrivate = false
  ): Promise<{ data: T; latencyMs: number } | DeltaApiError> {
    const startTime = Date.now();
    let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let queryString = '';

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        queryString = `?${qs}`;
      }
    }

    const fullUrl = `${this.baseUrl}${path}${queryString}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'DeltaSmartTradingBot/1.0',
    };

    let bodyString = '';
    if (body && (method === 'POST' || method === 'PUT')) {
      bodyString = JSON.stringify(body);
    }

    if (isPrivate) {
      if (!this.apiKey || !this.apiSecret) {
        return {
          isError: true,
          httpStatus: 401,
          message: 'Delta API credentials missing. Please configure your API key and secret.',
          sanitizedDetails: 'Private endpoint called without active credentials',
        };
      }
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.generateSignature(method, timestamp, path, queryString, bodyString);
      headers['api-key'] = this.apiKey;
      headers['timestamp'] = timestamp;
      headers['signature'] = signature;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(fullUrl, {
        method,
        headers,
        body: bodyString || undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      const rawText = await response.text();
      let parsedJson: any = null;

      try {
        parsedJson = rawText ? JSON.parse(rawText) : {};
      } catch {
        parsedJson = { raw: rawText };
      }

      if (!response.ok) {
        const deltaErrorCode = parsedJson?.error?.code || parsedJson?.code;
        let errorMsg = '';

        if (deltaErrorCode === 'invalid_api_key') {
          errorMsg = `Delta Authentication Failed: Invalid API Key or Secret. Please verify your credentials and ensure the correct platform is selected (Delta India vs Global). For uninterrupted 24/7 cloud operation, set API Key IP Access to 'Unrestricted' in Delta settings.`;
        } else if (
          deltaErrorCode === 'ip_not_whitelisted_for_api_key' ||
          deltaErrorCode === 'ip_restricted' ||
          deltaErrorCode === 'ip_not_whitelisted' ||
          String(deltaErrorCode).includes('ip_not_whitelisted')
        ) {
          const clientIpFromDelta = parsedJson?.error?.context?.client_ip || parsedJson?.context?.client_ip || parsedJson?.client_ip;
          if (clientIpFromDelta && typeof clientIpFromDelta === 'string') {
            DeltaExchangeClient.cachedPublicIp = clientIpFromDelta.trim();
          }
          const currentIp = DeltaExchangeClient.cachedPublicIp || clientIpFromDelta || '34.34.244.93';
          errorMsg = `Delta IP Restriction Blocked: Delta Exchange rejected the order because your API Key has IP restriction enabled (Delta detected server IP: ${currentIp}). RECOMMENDED FOR 24/7 CLOUD BOT: Go to Delta Exchange -> API Management, edit your API key, and set IP Access Restriction to 'Unrestricted' (Allow all IPs). Or whitelist IP: ${currentIp}.`;
        } else if (typeof parsedJson?.error?.message === 'string') {
          errorMsg = parsedJson.error.message;
        } else if (typeof parsedJson?.message === 'string') {
          errorMsg = parsedJson.message;
        } else if (typeof parsedJson?.error === 'string') {
          errorMsg = parsedJson.error;
        } else if (deltaErrorCode) {
          errorMsg = `Delta Error: [${deltaErrorCode}]${parsedJson?.error?.context ? ` - ${JSON.stringify(parsedJson.error.context)}` : ''}`;
        } else {
          errorMsg = `HTTP ${response.status}: ${response.statusText || 'Exchange Request Rejected'}`;
        }

        return {
          isError: true,
          httpStatus: response.status,
          deltaCode: deltaErrorCode,
          message: this.sanitizeErrorMessage(errorMsg),
          sanitizedDetails: this.sanitizeErrorMessage(
            typeof parsedJson === 'object' ? JSON.stringify(parsedJson) : String(parsedJson)
          ),
        };
      }

      // Delta v2 standard response wrapper: { success: true, result: ... } or direct array
      const resultData = parsedJson?.result !== undefined ? parsedJson.result : parsedJson;
      return { data: resultData as T, latencyMs };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      const cleanMsg = isAbort
        ? 'Delta API request timed out (12s limit exceeded)'
        : this.sanitizeErrorMessage(err?.message || String(err));

      return {
        isError: true,
        httpStatus: isAbort ? 408 : 503,
        message: cleanMsg,
        sanitizedDetails: `Network transport failure to ${this.sanitizeUrlForLogging(fullUrl)}`,
      };
    }
  }

  /**
   * Test connection against Delta Exchange authenticated balance endpoint.
   * NEVER returns connected merely because credentials were typed in.
   */
  public async testConnection(): Promise<{
    success: boolean;
    balanceSummary?: { asset: string; available: number; total: number }[];
    error?: string;
    latencyMs?: number;
  }> {
    if (!this.hasCredentials()) {
      return { success: false, error: 'API Key or Secret is empty' };
    }

    const res = await this.request<any[]>('GET', '/v2/wallet/balances', undefined, undefined, true);

    if ('isError' in res) {
      return {
        success: false,
        error: `${res.message} (HTTP ${res.httpStatus})`,
      };
    }

    const balances = Array.isArray(res.data) ? res.data : [];
    const formatted = balances.map((b) => ({
      asset: b.asset_symbol || b.asset?.symbol || 'USDT',
      available: Number(b.available_balance || b.balance || 0),
      total: Number(b.balance || 0),
    }));

    return {
      success: true,
      balanceSummary: formatted,
      latencyMs: res.latencyMs,
    };
  }

  /**
   * Fetch all active Delta products (futures, perpetuals, options)
   */
  public async getProducts(): Promise<{ products: DeltaProduct[]; latencyMs: number } | DeltaApiError> {
    const res = await this.request<DeltaProduct[]>('GET', '/v2/products', undefined, undefined, false);
    if ('isError' in res) return res;

    const list = Array.isArray(res.data) ? res.data : [];
    return { products: list, latencyMs: res.latencyMs };
  }

  /**
   * Fetch all 24h tickers from Delta
   */
  public async getTickers(): Promise<{ tickers: DeltaTicker[]; latencyMs: number } | DeltaApiError> {
    const res = await this.request<DeltaTicker[]>('GET', '/v2/tickers', undefined, undefined, false);
    if ('isError' in res) return res;

    const list = Array.isArray(res.data) ? res.data : [];
    return { tickers: list, latencyMs: res.latencyMs };
  }

  /**
   * Fetch orderbook depth for executable arbitrage & slippage verification
   */
  public async getOrderbook(symbol: string): Promise<
    | {
        buy: { price: number; size: number }[];
        sell: { price: number; size: number }[];
        latencyMs: number;
      }
    | DeltaApiError
  > {
    const res = await this.request<any>('GET', `/v2/l2orderbook/${symbol}`, undefined, undefined, false);
    if ('isError' in res) return res;

    const buy = Array.isArray(res.data?.buy)
      ? res.data.buy.map((b: any) => ({ price: Number(b.price || b[0]), size: Number(b.size || b[1]) }))
      : [];
    const sell = Array.isArray(res.data?.sell)
      ? res.data.sell.map((s: any) => ({ price: Number(s.price || s[0]), size: Number(s.size || s[1]) }))
      : [];

    return { buy, sell, latencyMs: res.latencyMs };
  }

  /**
   * Fetch real historical candles from Delta Exchange chart history
   */
  public async getCandles(
    symbol: string,
    resolution: string | number = '15',
    fromSeconds: number,
    toSeconds: number
  ): Promise<
    | {
        candles: Array<{
          time: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
        latencyMs: number;
      }
    | DeltaApiError
  > {
    const res = await this.request<any>(
      'GET',
      '/v2/chart/history',
      {
        symbol,
        resolution,
        from: fromSeconds,
        to: toSeconds,
      },
      undefined,
      false
    );

    if ('isError' in res) return res;

    const data = res.data;
    if (!data || !Array.isArray(data.t)) {
      return { candles: [], latencyMs: res.latencyMs };
    }

    const candles = data.t.map((t: number, i: number) => ({
      time: t * 1000,
      open: Number(data.o[i]),
      high: Number(data.h[i]),
      low: Number(data.l[i]),
      close: Number(data.c[i]),
      volume: Number(data.v[i] || 0),
    }));

    return { candles, latencyMs: res.latencyMs };
  }

  /**
   * Authenticated: Fetch real user wallet balances
   */
  public async getBalances(): Promise<
    | {
        balances: Array<{
          asset: string;
          balance: number;
          available_balance: number;
          order_margin: number;
          position_margin: number;
        }>;
        latencyMs: number;
      }
    | DeltaApiError
  > {
    const res = await this.request<any[]>('GET', '/v2/wallet/balances', undefined, undefined, true);
    if ('isError' in res) return res;

    const list = Array.isArray(res.data) ? res.data : [];
    const formatted = list.map((b) => ({
      asset: b.asset_symbol || b.asset?.symbol || 'USDT',
      balance: Number(b.balance || 0),
      available_balance: Number(b.available_balance || b.balance || 0),
      order_margin: Number(b.order_margin || 0),
      position_margin: Number(b.position_margin || 0),
    }));

    return { balances: formatted, latencyMs: res.latencyMs };
  }

  /**
   * Authenticated: Fetch real open positions
   */
  public async getPositions(): Promise<
    | {
        positions: any[];
        latencyMs: number;
      }
    | DeltaApiError
  > {
    const res = await this.request<any[]>('GET', '/v2/positions/margined', undefined, undefined, true);
    if ('isError' in res) return res;

    const list = Array.isArray(res.data) ? res.data : [];
    return { positions: list, latencyMs: res.latencyMs };
  }

  /**
   * Authenticated: Fetch real open orders
   */
  public async getOrders(state = 'open'): Promise<
    | {
        orders: any[];
        latencyMs: number;
      }
    | DeltaApiError
  > {
    const res = await this.request<any[]>('GET', '/v2/orders', { state }, undefined, true);
    if ('isError' in res) return res;

    const list = Array.isArray(res.data) ? res.data : [];
    return { orders: list, latencyMs: res.latencyMs };
  }

  /**
   * Authenticated: Place real Delta order
   */
  public async placeOrder(orderPayload: {
    product_id: number;
    size: number;
    side: 'buy' | 'sell';
    order_type: 'market_order' | 'limit_order';
    limit_price?: string;
    stop_loss_order?: {
      stop_price: string;
      order_type: 'market_order';
    };
    take_profit_order?: {
      stop_price: string;
      order_type: 'market_order';
    };
    client_order_id?: string;
    reduce_only?: boolean;
  }): Promise<{ order: any; latencyMs: number } | DeltaApiError> {
    const res = await this.request<any>('POST', '/v2/orders', undefined, orderPayload, true);
    if ('isError' in res) return res;

    return { order: res.data, latencyMs: res.latencyMs };
  }

  /**
   * Authenticated: Update order / TP / SL
   */
  public async updateOrder(
    orderId: string | number,
    updatePayload: {
      product_id: number;
      limit_price?: string;
      size?: number;
      stop_price?: string;
    }
  ): Promise<{ order: any; latencyMs: number } | DeltaApiError> {
    const res = await this.request<any>('PUT', '/v2/orders', undefined, { id: orderId, ...updatePayload }, true);
    if ('isError' in res) return res;

    return { order: res.data, latencyMs: res.latencyMs };
  }

  /**
   * Authenticated: Cancel open order
   */
  public async cancelOrder(orderId: string | number, productId: number): Promise<{ success: boolean } | DeltaApiError> {
    const res = await this.request<any>('DELETE', '/v2/orders', undefined, { id: orderId, product_id: productId }, true);
    if ('isError' in res) return res;

    return { success: true };
  }

  /**
   * Authenticated: Cancel all open/conditional/bracket orders for a specific product
   */
  public async cancelAllOrdersForProduct(productId: number): Promise<{ success: boolean } | DeltaApiError> {
    try {
      const res = await this.request<any>('DELETE', '/v2/orders/all', undefined, { product_id: productId }, true);
      if ('isError' in res) return res;
      return { success: true };
    } catch {
      return { success: false, isError: true, message: 'Failed to cancel orders' };
    }
  }

  /**
   * Authenticated: Set instrument leverage on Delta (sets both order leverage and position leverage)
   */
  public async changeLeverage(productId: number, leverage: number): Promise<{ success: boolean } | DeltaApiError> {
    const levVal = Math.round(leverage);
    const levStr = String(levVal);

    // 1. Try Order Leverage endpoint
    try {
      await this.request<any>(
        'POST',
        `/v2/products/${productId}/orders/leverage`,
        undefined,
        { leverage: levVal },
        true
      );
    } catch {
      // ignore
    }

    // 2. Try Position Leverage endpoint
    const res = await this.request<any>(
      'POST',
      '/v2/positions/change_leverage',
      undefined,
      { product_id: productId, leverage: levStr },
      true
    );
    if ('isError' in res) return res;

    return { success: true };
  }

  /**
   * Authenticated: Attach bracket order (Take Profit & Stop Loss) for an open position on Delta Exchange
   */
  public async placeBracketOrder(
    productId: number,
    stopLossPrice?: number | string,
    takeProfitPrice?: number | string
  ): Promise<{ success: boolean; data?: any; latencyMs?: number } | DeltaApiError> {
    const payload: any = {
      product_id: productId,
    };
    if (stopLossPrice && Number(stopLossPrice) > 0) {
      payload.stop_loss_order = {
        stop_price: String(stopLossPrice),
        order_type: 'market_order',
      };
    }
    if (takeProfitPrice && Number(takeProfitPrice) > 0) {
      payload.take_profit_order = {
        stop_price: String(takeProfitPrice),
        order_type: 'market_order',
      };
    }
    const res = await this.request<any>('POST', '/v2/orders/bracket', undefined, payload, true);
    if ('isError' in res) {
      return res;
    }
    return { success: true, data: res.data, latencyMs: res.latencyMs };
  }
}
