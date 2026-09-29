import { useState } from 'preact/hooks';
import { sendToTab } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import type { HypothesisReport } from '../../moodle/hypotheses';
import { activeUdbTab, saveReport, stamp } from '../active-tab';

type State =
  | { kind: 'idle' }
  | { kind: 'consent' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; report: HypothesisReport; path: string };

/** Checks H1, H2, H4-H6 on the real site, only after explicit consent (spec §8). */
export function HypothesesPanel() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = async () => {
    setState({ kind: 'running' });
    const tabId = await activeUdbTab();
    if (tabId === null) {
      setState({ kind: 'error', message: t('popupDiagnoseNotUdb') });
      return;
    }
    const result = await sendToTab(tabId, { target: 'content', type: 'content/test-hypotheses' });
    if (!result.ok) {
      setState({ kind: 'error', message: t('popupDiagnoseError') });
      return;
    }
    const path = await saveReport(`hipotesis-${stamp(result.value.generatedAt)}`, result.value);
    setState({ kind: 'done', report: result.value, path });
  };

  return (
    <section style={{ marginTop: '12px' }}>
      {state.kind === 'consent' ? (
        <div role="alertdialog" aria-labelledby="hyp-consent">
          <p id="hyp-consent">{t('popupHypothesesConsent')}</p>
          <button
            type="button"
            onClick={() => {
              void run();
            }}
          >
            {t('popupContinue')}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setState({ kind: 'idle' });
            }}
          >
            {t('popupCancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={state.kind === 'running'}
          onClick={() => {
            setState({ kind: 'consent' });
          }}
        >
          {t('popupHypotheses')}
        </button>
      )}
      {state.kind === 'error' && (
        <p class="status-error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && (
        <div aria-live="polite">
          <ul>
            {state.report.results.map((r) => (
              <li key={r.id}>
                <strong>{r.id}</strong>: {r.status}. <span class="muted">{r.evidence}</span>
              </li>
            ))}
          </ul>
          <p class="muted">{t('popupDiagnoseSaved', state.path)}</p>
        </div>
      )}
    </section>
  );
}
