import { render } from 'preact';
import { t } from '../shared/i18n';
import '../ui/page.css';
import { DiagnosePage } from './components/DiagnosePage';
import { ServiceStatus } from './components/ServiceStatus';

function Popup() {
  return (
    <main style={{ width: '320px', padding: '12px 14px' }}>
      <h1>{t('popupTitle')}</h1>
      <ServiceStatus />
      <button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
        {t('popupOpenOptions')}
      </button>
      <DiagnosePage />
    </main>
  );
}

const app = document.getElementById('app');
if (app !== null) render(<Popup />, app);
