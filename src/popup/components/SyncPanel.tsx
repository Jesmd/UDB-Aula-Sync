import { useState } from 'preact/hooks';
import { sendMessage } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import type { SyncSummary } from '../../shared/messages';
import type { QueueData } from '../use-queue';

const time = (ms: number) =>
  new Date(ms).toLocaleString(chrome.i18n.getUILanguage(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function summaryText(s: SyncSummary): string {
  if (s.skipped === 'no_courses') return t('syncNoCourses');
  if (s.skipped === 'offline') return t('syncOffline');
  if (s.skipped === 'running') return t('syncRunning');
  if (s.errorCode === 'session_expired') return t('error_session_expired');
  const base =
    s.novelties === 0
      ? t('syncNothingNew', String(s.courses))
      : t('syncFound', [String(s.novelties), String(s.courses)]);
  return s.queued > 0 ? `${base} ${t('syncQueued', String(s.queued))}` : base;
}

/** "Sincronizar ahora" and the state of background checks (spec §3.4, §3.5). */
export function SyncPanel({ data, refresh }: { data: QueueData; refresh: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { sync } = data;
  const total = Object.values(data.novelties).reduce((n, list) => n + list.length, 0);

  const run = () => {
    setBusy(true);
    setNote(t('syncRunning'));
    void sendMessage({ target: 'background', type: 'sync/run' }).then((result) => {
      setBusy(false);
      setNote(result.ok ? summaryText(result.value) : t('error_unknown'));
      refresh();
    });
  };
  const clearAll = () => {
    void sendMessage({ target: 'background', type: 'novelties/clear', courseId: null }).then(
      refresh,
    );
  };

  return (
    <section aria-labelledby="sync-title">
      <h2 id="sync-title">{t('popupSyncTitle')}</h2>
      <p class="muted" data-testid="sync-status">
        {sync.tracked.length === 0
          ? t('syncNotTracking')
          : t('syncTracking', [
              String(sync.tracked.length),
              sync.lastRunAt === null ? t('syncNever') : time(sync.lastRunAt),
            ])}
      </p>
      {sync.sessionLost && <p class="status-error">{t('syncSessionLost')}</p>}
      <div class="row">
        <button
          type="button"
          disabled={busy || sync.running || sync.tracked.length === 0}
          onClick={run}
        >
          {t('syncNow')}
        </button>
        {total > 0 && (
          <button type="button" class="secondary" onClick={clearAll}>
            {t('syncMarkAllSeen')}
          </button>
        )}
      </div>
      <p role="status" class="muted" data-testid="sync-result">
        {note}
      </p>
    </section>
  );
}
