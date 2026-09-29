import { sendMessage } from '../shared/browser-api';
import { MOODLE_BASE_PATH } from '../shared/constants';
import { t } from '../shared/i18n';
import { consoleSink, createLogger } from '../shared/logger';
import { mountUiRoot } from './ui/root';
import css from './ui/styles.css?inline';
import { showToast } from './ui/toast';

const log = createLogger('content', { sinks: [consoleSink], minLevel: 'info' });

function main(): void {
  // The manifest match already limits the host; this guards against path tricks.
  if (!location.pathname.startsWith(MOODLE_BASE_PATH)) return;

  const root = mountUiRoot(document, css);
  showToast(root, t('toastReady'), { closeLabel: t('toastClose'), timeoutMs: 4000 });

  void sendMessage({ target: 'background', type: 'content/hello', url: location.href }).then(
    (result) => {
      if (!result.ok) log.warn(`background did not accept hello: ${result.error.code}`);
    },
  );
}

main();
