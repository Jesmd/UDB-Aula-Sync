import { render } from 'preact';
import { t } from '../shared/i18n';
import '../ui/page.css';
import { CourseList } from './components/CourseList';
import { DiagnosePage } from './components/DiagnosePage';
import { FileSearch } from './components/FileSearch';
import { HypothesesPanel } from './components/HypothesesPanel';
import { QueuePanel } from './components/QueuePanel';
import { ServiceStatus } from './components/ServiceStatus';
import { useQueue } from './use-queue';

function Popup() {
  const { data, failed, refresh } = useQueue();
  return (
    <main class="popup">
      <h1>{t('popupTitle')}</h1>
      <ServiceStatus />
      {failed && data === null && <p class="status-error">{t('popupStatusError')}</p>}
      {data !== null && (
        <>
          <QueuePanel data={data} refresh={refresh} />
          <FileSearch data={data} />
          <CourseList data={data} />
        </>
      )}
      <button type="button" class="secondary" onClick={() => void chrome.runtime.openOptionsPage()}>
        {t('popupOpenOptions')}
      </button>
      <details>
        <summary>{t('popupDiagTitle')}</summary>
        <DiagnosePage />
        <HypothesesPanel />
      </details>
    </main>
  );
}

const app = document.getElementById('app');
if (app !== null) render(<Popup />, app);
