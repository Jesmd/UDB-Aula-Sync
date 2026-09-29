import { sendMessage } from '../shared/browser-api';
import { MOODLE_BASE_PATH } from '../shared/constants';
import { t } from '../shared/i18n';
import { consoleSink, createLogger } from '../shared/logger';
import { registerDiagnostics } from './diagnostics';
import { observeDebounced } from './observers';
import { PageContext } from './page-context';
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

  void sendMessage({ target: 'background', type: 'content/hello', url: location.href }).then(
    (result) => {
      if (!result.ok) log.warn(`background did not accept hello: ${result.error.code}`);
    },
  );
}

main();
