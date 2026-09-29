import { useState } from 'preact/hooks';
import { sendMessage } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import { summarizeQueue } from '../model';
import type { QueueData } from '../use-queue';

/** Queue status with pause/resume, cancel (asks twice) and retry (spec §3.5). */
export function QueuePanel({ data, refresh }: { data: QueueData; refresh: () => void }) {
  const [sure, setSure] = useState(false);
  const [note, setNote] = useState('');
  const summary = summarizeQueue(data.tasks);
  const pending = summary.waiting + summary.active;

  const control = (action: 'pause' | 'resume' | 'cancel') => {
    setSure(false);
    setNote('');
    void sendMessage({ target: 'background', type: 'queue/control', action }).then(refresh);
  };
  const retry = () => {
    void sendMessage({ target: 'background', type: 'queue/retry-failed' }).then((result) => {
      setNote(result.ok ? t('retryDone', String(result.value.retried)) : t('error_unknown'));
      refresh();
    });
  };

  return (
    <section aria-labelledby="queue-title">
      <h2 id="queue-title">{t('popupQueueTitle')}</h2>
      <p role="status" data-testid="queue-status">
        {pending === 0 && summary.failed === 0
          ? t('queueEmpty')
          : t('queueCounts', [
              String(summary.waiting),
              String(summary.active),
              String(summary.failed),
            ])}
      </p>
      {summary.current !== null && <p class="muted path">{t('queueCurrent', summary.current)}</p>}
      {data.paused && (
        <p class={data.pausedBy === 'session' ? 'status-error' : 'muted'}>
          {data.pausedBy === 'session' ? t('queuePausedSession') : t('queuePausedUser')}
        </p>
      )}
      <div class="row">
        {data.paused ? (
          <button
            type="button"
            onClick={() => {
              control('resume');
            }}
          >
            {t('queueResume')}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending === 0}
            onClick={() => {
              control('pause');
            }}
          >
            {t('queuePause')}
          </button>
        )}
        <button
          type="button"
          class="secondary"
          disabled={pending === 0}
          onClick={() => {
            if (sure) control('cancel');
            else setSure(true);
          }}
        >
          {sure ? t('queueCancelSure') : t('queueCancel')}
        </button>
        <button type="button" class="secondary" disabled={summary.failed === 0} onClick={retry}>
          {t('queueRetry')}
        </button>
      </div>
      {note !== '' && <p class="muted">{note}</p>}
    </section>
  );
}
