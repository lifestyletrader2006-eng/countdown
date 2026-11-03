import type { DeltaEnvironment } from '../types/index.js';

export interface DeltaLiveTickerTick {
  symbol: string;
  productId?: number;
  close: number;
  markPrice: number;
  change24h: number;
  high: number;
  low: number;
  volume: number;
  turnoverUsd: number;
  openInterest: number;
  fundingRate: number;
  bestBid?: number;
  bestAsk?: number;
  timestamp: number;
}

export type DeltaWsStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

export class DeltaWebSocketService {
  private ws: WebSocket | null = null;
  private environment: DeltaEnvironment = 'production';
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private isExplicitlyClosed = false;
  private subscribers: Set<(tick: DeltaLiveTickerTick) => void> = new Set();
  private statusListeners: Set<(status: DeltaWsStatus, latencyMs: number) => void> = new Set();
  private status: DeltaWsStatus = 'DISCONNECTED';
  private lastPingSentTime = 0;
  private latencyMs = 0;
  private lastKnownPrices: Map<string, DeltaLiveTickerTick> = new Map();
  private lastKnownPricesByProductId: Map<number, DeltaLiveTickerTick> = new Map();

  constructor(env: DeltaEnvironment = 'production') {
    this.environment = env;
  }

  public setEnvironment(env: DeltaEnvironment) {
    if (this.environment !== env) {
      this.environment = env;
      if (this.ws) {
        this.disconnect();
        this.connect();
      }
    }
  }

  public getStatus(): DeltaWsStatus {
    return this.status;
  }

  public getLatency(): number {
    return this.latencyMs;
  }

  public getLatestTick(symbol: string): DeltaLiveTickerTick | undefined {
    return this.lastKnownPrices.get(symbol);
  }

  public getLatestTickByProductId(productId: number): DeltaLiveTickerTick | undefined {
    return this.lastKnownPricesByProductId.get(productId);
  }

  public getAllTicks(): Map<string, DeltaLiveTickerTick> {
    return this.lastKnownPrices;
  }

  public getAllTicksByProductId(): Map<number, DeltaLiveTickerTick> {
    return this.lastKnownPricesByProductId;
  }

  private resolveWsUrl(): string {
    if (this.environment === 'india') {
      return 'wss://socket.india.delta.exchange';
    }
    if (this.environment === 'testnet') {
      return 'wss://testnet-socket.delta.exchange';
    }
    return 'wss://socket.delta.exchange';
  }

  private updateStatus(newStatus: DeltaWsStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((fn) => fn(newStatus, this.latencyMs));
  }

  public connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.updateStatus('CONNECTING');

    const url = this.resolveWsUrl();
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.updateStatus('CONNECTED');
        this.startHeartbeat();

        // Subscribe to live v2/ticker channel for all products
        const subMsg = {
          type: 'subscribe',
          payload: {
            channels: [
              {
                name: 'v2/ticker',
                symbols: ['all'],
              },
            ],
          },
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(subMsg));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);

          // Handle ping-pong
          if (raw.type === 'pong' || raw.type === 'heartbeat') {
            if (this.lastPingSentTime > 0) {
              this.latencyMs = Date.now() - this.lastPingSentTime;
              this.statusListeners.forEach((fn) => fn(this.status, this.latencyMs));
            }
            return;
          }

          // Handle live ticker message
          if (raw.type === 'v2/ticker' && raw.symbol) {
            const mark = typeof raw.mark_price === 'string' ? parseFloat(raw.mark_price) : raw.mark_price || 0;
            const close = typeof raw.close === 'string' ? parseFloat(raw.close) : raw.close || mark;
            const change24h =
              raw.ltp_change_24h !== undefined && raw.ltp_change_24h !== null && !isNaN(parseFloat(String(raw.ltp_change_24h)))
                ? parseFloat(String(raw.ltp_change_24h))
                : raw.mark_change_24h !== undefined && !isNaN(parseFloat(String(raw.mark_change_24h)))
                ? parseFloat(String(raw.mark_change_24h))
                : 0;

            const high = typeof raw.high === 'number' ? raw.high : parseFloat(raw.high || '0');
            const low = typeof raw.low === 'number' ? raw.low : parseFloat(raw.low || '0');
            const turnoverUsd = raw.turnover_usd || raw.turnover || (raw.volume || 0) * close;
            const openInterest = raw.open_interest || 0;
            const fundingRate = typeof raw.funding_rate === 'string' ? parseFloat(raw.funding_rate) : raw.funding_rate || 0;

            const bestBid = raw.quotes?.best_bid_price ? parseFloat(raw.quotes.best_bid_price) : undefined;
            const bestAsk = raw.quotes?.best_ask_price ? parseFloat(raw.quotes.best_ask_price) : undefined;

            const productId = raw.product_id !== undefined && raw.product_id !== null ? Number(raw.product_id) : undefined;

            const tick: DeltaLiveTickerTick = {
              symbol: raw.symbol,
              productId,
              close,
              markPrice: mark,
              change24h: Math.round(change24h * 100) / 100,
              high,
              low,
              volume: raw.volume || 0,
              turnoverUsd,
              openInterest,
              fundingRate,
              bestBid,
              bestAsk,
              timestamp: Date.now(),
            };

            this.lastKnownPrices.set(raw.symbol, tick);
            if (productId !== undefined && !isNaN(productId)) {
              this.lastKnownPricesByProductId.set(productId, tick);
            }
            this.subscribers.forEach((fn) => fn(tick));
          }
        } catch {
          // Ignore parse errors on transient frames
        }
      };

      this.ws.onerror = () => {
        this.updateStatus('DISCONNECTED');
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        if (!this.isExplicitlyClosed) {
          this.updateStatus('RECONNECTING');
          this.scheduleReconnect();
        } else {
          this.updateStatus('DISCONNECTED');
        }
      };
    } catch {
      this.updateStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 2500);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSentTime = Date.now();
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.updateStatus('DISCONNECTED');
  }

  public subscribeToTicks(listener: (tick: DeltaLiveTickerTick) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public subscribeToStatus(listener: (status: DeltaWsStatus, latencyMs: number) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status, this.latencyMs);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
}

// Global singleton instance for easy frontend consumption
export const deltaWsService = new DeltaWebSocketService('production');
