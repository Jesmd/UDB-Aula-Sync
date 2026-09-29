import { useCallback, useEffect, useState } from 'preact/hooks';
import { sendMessage } from '../shared/browser-api';
import type { ResponseMap } from '../shared/messages';

export type QueueData = ResponseMap['queue/list'];

const POLL_MS = 1500;

/** The worker's queue and index, refreshed while the popup is open. */
export function useQueue(): { data: QueueData | null; failed: boolean; refresh: () => void } {
  const [data, setData] = useState<QueueData | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    void sendMessage({ target: 'background', type: 'queue/list' }).then((result) => {
      if (result.ok) setData(result.value);
      setFailed(!result.ok);
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);

  return { data, failed, refresh };
}
