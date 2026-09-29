import { useState } from 'preact/hooks';
import { sendMessage } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import { runDownloadOpenSpike } from '../spikes';

type Check = 'offscreen' | 'downloadOpen' | 'fetchSession' | 'logs';

/** Formats any result as readable JSON for copying into docs/MOODLE-NOTES.md. */
const show = (value: unknown): string => JSON.stringify(value, null, 2);

export function DiagnosticsPage() {
  const [running, setRunning] = useState<Check | undefined>();
  const [output, setOutput] = useState('');

  const run = (check: Check, task: () => Promise<unknown>) => async () => {
    setRunning(check);
    setOutput(t('diagRunning'));
    try {
      setOutput(show(await task()));
    } catch (cause) {
      setOutput(show({ thrown: String(cause) }));
    } finally {
      setRunning(undefined);
    }
  };

  const fetchBoth = async () => ({
    worker: await sendMessage({ target: 'background', type: 'spike/fetch-worker' }),
    offscreen: await sendMessage({ target: 'background', type: 'spike/fetch-offscreen' }),
  });

  const buttons: readonly [Check, string, () => Promise<unknown>][] = [
    [
      'offscreen',
      t('diagOffscreen'),
      () => sendMessage({ target: 'background', type: 'spike/offscreen' }),
    ],
    ['downloadOpen', t('diagDownloadOpen'), runDownloadOpenSpike],
    ['fetchSession', t('diagFetchSession'), fetchBoth],
    ['logs', t('diagExportLogs'), () => sendMessage({ target: 'background', type: 'logs/export' })],
  ];

  return (
    <section>
      <p>{t('diagIntro')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {buttons.map(([id, label, task]) => (
          <button
            key={id}
            type="button"
            disabled={running !== undefined}
            onClick={() => {
              void run(id, task)();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <h2>{t('diagResult')}</h2>
      <pre aria-live="polite" data-testid="diag-output">
        {output}
      </pre>
    </section>
  );
}
