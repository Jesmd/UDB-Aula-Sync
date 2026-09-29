import { useState } from 'preact/hooks';
import { sendToTab } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import type { DiagnosticReport } from '../../moodle/diagnostic';
import { activeUdbTab, saveReport, stamp } from '../active-tab';

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; report: DiagnosticReport; json: string; path: string; copied: boolean };

function summary(report: DiagnosticReport): string {
  if ('error' in report.parsed) return report.parsed.error.code;
  const activities = report.parsed.activities.reduce((n, a) => n + a.items.length, 0);
  return t('popupDiagnoseSummary', [
    report.detection.kind,
    String(report.parsed.sections.length),
    String(activities),
  ]);
}

/** Structure-only report of the active Aula Digital tab (M1 human checkpoint). */
export function DiagnosePage() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = async () => {
    setState({ kind: 'running' });
    const tabId = await activeUdbTab();
    if (tabId === null) {
      setState({ kind: 'error', message: t('popupDiagnoseNotUdb') });
      return;
    }
    const result = await sendToTab(tabId, { target: 'content', type: 'content/diagnose' });
    if (!result.ok) {
      setState({ kind: 'error', message: t('popupDiagnoseError') });
      return;
    }
    const report = result.value;
    const course = 'error' in report.parsed ? 'pagina' : `curso-${report.parsed.course.id}`;
    const path = await saveReport(`diagnostico-${course}-${stamp(report.generatedAt)}`, report);
    setState({ kind: 'done', report, json: JSON.stringify(report, null, 2), path, copied: false });
  };

  return (
    <section style={{ marginTop: '12px' }}>
      <button
        type="button"
        disabled={state.kind === 'running'}
        onClick={() => {
          void run();
        }}
      >
        {t('popupDiagnose')}
      </button>
      {state.kind === 'error' && (
        <p class="status-error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && (
        <div aria-live="polite">
          <p data-testid="diagnose-summary">{summary(state.report)}</p>
          <p class="muted">{t('popupDiagnoseSaved', state.path)}</p>
          <p class="muted">{t('popupDiagnosePrivacy')}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(state.json).then(() => {
                setState({ ...state, copied: true });
              });
            }}
          >
            {state.copied ? t('popupDiagnoseCopied') : t('popupDiagnoseCopy')}
          </button>
        </div>
      )}
    </section>
  );
}
