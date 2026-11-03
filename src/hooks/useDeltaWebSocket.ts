import { useEffect, useState, useRef } from 'react';
import { deltaWsService, type DeltaLiveTickerTick, type DeltaWsStatus } from '../services/deltaWebSocket.js';
import type { DeltaEnvironment } from '../types/index.js';

export function useDeltaWebSocket(environment: DeltaEnvironment = 'production') {
  const [status, setStatus] = useState<DeltaWsStatus>(deltaWsService.getStatus());
  const [latencyMs, setLatencyMs] = useState<number>(deltaWsService.getLatency());
  const [latestTick, setLatestTick] = useState<DeltaLiveTickerTick | null>(null);

  useEffect(() => {
    deltaWsService.setEnvironment(environment);
    deltaWsService.connect();

    const unsubStatus = deltaWsService.subscribeToStatus((newStatus, latency) => {
      setStatus(newStatus);
      setLatencyMs(latency);
    });

    const unsubTicks = deltaWsService.subscribeToTicks((tick) => {
      setLatestTick(tick);
    });

    return () => {
      unsubStatus();
      unsubTicks();
    };
  }, [environment]);

  return {
    status,
    latencyMs,
    latestTick,
    subscribeToTicks: deltaWsService.subscribeToTicks.bind(deltaWsService),
    getLatestTick: deltaWsService.getLatestTick.bind(deltaWsService),
  };
}
