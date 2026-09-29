import { render } from 'preact';
import { useState } from 'preact/hooks';
import { t, type MessageKey } from '../shared/i18n';
import '../ui/page.css';
import { DiagnosticsPage } from './pages/Diagnostics';
import { GeneralPage } from './pages/General';
import { NamesPage } from './pages/Names';
import { PathsPage } from './pages/Paths';
import { SecurityPage } from './pages/Security';
import { SyncPage } from './pages/Sync';

const TABS = [
  { id: 'general', label: 'tabGeneral', Page: GeneralPage },
  { id: 'paths', label: 'tabPaths', Page: PathsPage },
  { id: 'names', label: 'tabNames', Page: NamesPage },
  { id: 'sync', label: 'tabSync', Page: SyncPage },
  { id: 'security', label: 'tabSecurity', Page: SecurityPage },
  { id: 'diagnostics', label: 'tabDiagnostics', Page: DiagnosticsPage },
] as const satisfies readonly { id: string; label: MessageKey; Page: () => preact.JSX.Element }[];

type TabId = (typeof TABS)[number]['id'];

function Options() {
  const [active, setActive] = useState<TabId>('general');
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0];

  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px' }}>
      <h1>{t('optionsTitle')}</h1>
      <nav
        role="tablist"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls="tab-panel"
            onClick={() => {
              setActive(tab.id);
            }}
          >
            {t(tab.label)}
          </button>
        ))}
      </nav>
      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${current.id}`}>
        <current.Page />
      </div>
    </main>
  );
}

const app = document.getElementById('app');
if (app !== null) render(<Options />, app);
