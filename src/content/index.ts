import { sendMessage } from '../shared/browser-api';
import { MOODLE_BASE_PATH } from '../shared/constants';
import { t } from '../shared/i18n';
import { consoleSink, createLogger } from '../shared/logger';
import { parseMessage } from '../shared/messages';
import { moodleRoot } from '../moodle/adapters/sections';
import { domParser } from '../moodle/html-parser';
import { resolveResource } from '../moodle/resolver/resolve-chain';
import { loadSettings } from '../storage/settings';
import { DEFAULT_SETTINGS, type Settings } from '../storage/settings-schema';
import { registerDiagnostics } from './diagnostics';
import { DownloadsUi } from './downloads-ui';
import { installInterceptor } from './interceptor';
import { observeDebounced } from './observers';
import { PageContext } from './page-context';
import { ResolveCache } from './resolver-client';
import { mountUiRoot } from './ui/root';
import css from './ui/styles.css?inline';
import { showToast } from './ui/toast';

const log = createLogger('content', { sinks: [consoleSink], minLevel: 'info' });

function main(): void {
  // The manifest match already limits the host; this guards against path tricks.
  if (!location.pathname.startsWith(MOODLE_BASE_PATH)) return;

  registerDiagnostics();

  const context = new PageContext(document, () => location.href);
  const content = document.querySelector('.course-content');
  if (content !== null) {
    observeDebounced(content, () => {
      context.invalidate();
    });
  }
  const page = context.get();
  if (page.ok) {
    log.info(
      `course ${page.value.course.id}: ${page.value.layout}, ${page.value.sections.length} sections`,
    );
  }

  const root = mountUiRoot(document, css);
  showToast(root, t('toastReady'), { closeLabel: t('toastClose'), timeoutMs: 4000 });

  let settings: Settings = DEFAULT_SETTINGS;
  const refreshSettings = () =>
    loadSettings().then(
      (s) => {
        settings = s;
      },
      () => undefined,
    );
  void refreshSettings();
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void refreshSettings();
  });

  // Same-origin fetches from the page carry the session cookie (no H3 dependency).
  const cache = new ResolveCache((cmid) =>
    resolveResource(cmid, {
      fetch: (input, init) => fetch(input, init),
      parseHtml: domParser,
      moodleRoot: moodleRoot(location.href),
    }),
  );
  const ui = new DownloadsUi(root);
  installInterceptor({
    doc: document,
    context,
    cache,
    enabled: () => settings.interceptClicks,
    openAfterDownload: () => settings.openAfterDownload,
    onDownload: (message, activity) => {
      void ui.request(message, activity.name);
    },
    onReadOnly: (activity) => {
      ui.readOnly(activity.name);
    },
  });

  // Progress from the worker. Only the worker (extension sender without a tab) may send it.
  chrome.runtime.onMessage.addListener((raw, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
    const parsed = parseMessage(raw);
    if (
      parsed.ok &&
      parsed.value.target === 'content' &&
      parsed.value.type === 'content/download-update'
    ) {
      ui.update(parsed.value);
    }
    return false;
  });

  void sendMessage({ target: 'background', type: 'content/hello', url: location.href }).then(
    (result) => {
      if (!result.ok) log.warn(`background did not accept hello: ${result.error.code}`);
    },
  );
}

main();
