import { render } from 'preact';
import { useState } from 'preact/hooks';
import { t, type MessageKey } from '../shared/i18n';
import '../ui/page.css';
import { CoursesPage } from './pages/Courses';
import { DiagnosticsPage } from './pages/Diagnostics';
import { GeneralPage } from './pages/General';
import { NamesPage } from './pages/Names';
import { PathsPage } from './pages/Paths';
import { SecurityPage } from './pages/Security';
import { SyncPage } from './pages/Sync';
import { useSettings, type SettingsProps } from './use-settings';

const TABS = [
  { id: 'general', label: 'tabGeneral', Page: GeneralPage },
  { id: 'paths', label: 'tabPaths', Page: PathsPage },
  { id: 'names', label: 'tabNames', Page: NamesPage },
  { id: 'sync', label: 'tabSync', Page: SyncPage },
  { id: 'courses', label: 'tabCourses', Page: CoursesPage },
  { id: 'security', label: 'tabSecurity', Page: SecurityPage },
  { id: 'diagnostics', label: 'tabDiagnostics', Page: DiagnosticsPage },
] as const satisfies readonly {
  id: string;
  label: MessageKey;
  Page: (props: SettingsProps) => preact.JSX.Element;
}[];

type TabId = (typeof TABS)[number]['id'];

function Options() {
  const [active, setActive] = useState<TabId>('general');
  const { settings, update, saveState } = useSettings();
  const index = Math.max(
    0,
    TABS.findIndex((tab) => tab.id === active),
  );
  const current = TABS[index] ?? TABS[0];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length] ?? TABS[0];
    setActive(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <main class="options">
      <h1>{t('optionsTitle')}</h1>
      <nav role="tablist" class="tabs" aria-label={t('optionsTitle')} onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls="tab-panel"
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => {
              setActive(tab.id);
            }}
          >
            {t(tab.label)}
          </button>
        ))}
      </nav>
      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${current.id}`}>
        {settings === null ? (
          <p class="muted">{t('popupStatusChecking')}</p>
        ) : (
          <current.Page settings={settings} update={update} />
        )}
      </div>
      <p role="status" class="muted save-state" data-testid="save-state">
        {saveState === 'saved' ? t('optSaved') : saveState === 'error' ? t('optSaveError') : ''}
      </p>
    </main>
  );
}

const app = document.getElementById('app');
if (app !== null) render(<Options />, app);
