import { useState } from 'preact/hooks';
import { sendToTab } from '../../shared/browser-api';
import { MOODLE_ROOT_URL } from '../../shared/constants';
import { t } from '../../shared/i18n';
import type { DiagnosticReport } from '../../moodle/diagnostic';

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

function fileName(report: DiagnosticReport): string {
  const stamp = report.generatedAt.replace(/[:.]/g, '-').slice(0, 19);
  const course = 'error' in report.parsed ? 'pagina' : `curso-${report.parsed.course.id}`;
  return `UDB/_diagnostico/diagnostico-${course}-${stamp}.json`;
}

async function save(json: string, path: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    await chrome.downloads.download({
      url,
      filename: path,
      saveAs: false,
      conflictAction: 'uniquify',
    });
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }
}

/** Structure-only report of the active Aula Digital tab (M1 human checkpoint). */
export function DiagnosePage() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = async () => {
    setState({ kind: 'running' });
    // Without the "tabs" permission, url is only visible for hosts we have access to.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || tab.url?.startsWith(MOODLE_ROOT_URL) !== true) {
      setState({ kind: 'error', message: t('popupDiagnoseNotUdb') });
      return;
    }
    const result = await sendToTab(tab.id, { target: 'content', type: 'content/diagnose' });
    if (!result.ok) {
      setState({ kind: 'error', message: t('popupDiagnoseError') });
      return;
    }
    const json = JSON.stringify(result.value, null, 2);
    const path = fileName(result.value);
    await save(json, path);
    setState({ kind: 'done', report: result.value, json, path, copied: false });
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
