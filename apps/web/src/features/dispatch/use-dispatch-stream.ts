'use client';

// Nhận sự kiện điều vận qua SSE (/api/v1/stream/dispatch). Tự nối lại khi mất kết nối và báo trạng thái để
// bảng chuyển sang "Lỗi" (giữ dữ liệu cũ). Sau khi nối lại gọi onReconnect vì có thể đã lỡ sự kiện.
import type { DispatchEvent } from '@core/lib/redis/publish';
import { useCallback, useEffect, useRef, useState } from 'react';

export type StreamStatus = 'connecting' | 'open' | 'lost';

const STREAM_URL = '/api/v1/stream/dispatch';
const EVENT_NAME = 'dispatch.updated';

/** Chờ bao lâu (ms) trước lần nối lại thứ `attempt` (bắt đầu từ 1): 1, 2, 4, 8, 15 giây rồi giữ 15 giây. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

export function parseDispatchEvent(raw: string): DispatchEvent | null {
  try {
    const value = JSON.parse(raw) as Partial<DispatchEvent>;
    if (
      value.type === 'dispatch.updated' &&
      typeof value.tenantId === 'string' &&
      typeof value.tripId === 'string' &&
      typeof value.version === 'number' &&
      Array.isArray(value.orderContainerIds)
    ) {
      return value as DispatchEvent;
    }
  } catch {
    // thông điệp hỏng: bỏ qua
  }
  return null;
}

export function useDispatchStream(handlers: {
  onEvent: (event: DispatchEvent) => void;
  onReconnect?: () => void;
}): { status: StreamStatus; reconnect: () => void } {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [generation, setGeneration] = useState(0);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let everOpened = false;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      source = new EventSource(STREAM_URL);
      source.onopen = () => {
        attempt = 0;
        setStatus('open');
        if (everOpened) latest.current.onReconnect?.();
        everOpened = true;
      };
      source.addEventListener(EVENT_NAME, (message) => {
        const event = parseDispatchEvent((message as MessageEvent<string>).data);
        if (event) latest.current.onEvent(event);
      });
      source.onerror = () => {
        setStatus('lost');
        // Trình duyệt tự nối lại khi còn CONNECTING; đã CLOSED (vd. 401 khi hết phiên) thì ta tự nối lại có chờ.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          attempt += 1;
          timer = setTimeout(connect, reconnectDelayMs(attempt));
        }
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [generation]);

  const reconnect = useCallback(() => setGeneration((n) => n + 1), []);
  return { status, reconnect };
}
