import { politeFetch } from '../core/http/polite-fetch';
import { createRateLimiter } from '../core/http/rate-limiter';
import { sendMessage } from '../shared/browser-api';
import { MOODLE_BASE_PATH, PROBE_CACHE_TTL_MS, RATE_LIMIT } from '../shared/constants';
import { t } from '../shared/i18n';
import { consoleSink, createLogger } from '../shared/logger';
import { parseMessage } from '../shared/messages';
import { moodleRoot } from '../moodle/adapters/sections';
import { domParser } from '../moodle/html-parser';
import type { FetchLike } from '../moodle/resolver/head-probe';
import { resolveResource } from '../moodle/resolver/resolve-chain';
import { loadSettings } from '../storage/settings';
import { DEFAULT_SETTINGS, type Settings } from '../storage/settings-schema';
import { BulkRunner } from './bulk';
import { installDetails } from './details';
import { registerDiagnostics } from './diagnostics';
import { DownloadsUi } from './downloads-ui';
import { installHoverIndicator } from './hover-indicator';
import { buildDownloadRequest, installInterceptor } from './interceptor';
import { observeDebounced } from './observers';
import { PageContext } from './page-context';
import { PageStatus } from './page-status';
import { ResolveCache } from './resolver-client';
import { CoursePanel } from './ui/course-panel';
import { CursorBadge } from './ui/cursor-badge';
import { DetailsCard } from './ui/hover-card';
import { mountUiRoot, OVERLAY_ID } from './ui/root';
import { StatusPills } from './ui/status-badge';
import css from './ui/styles.css?inline';
import { showToast } from './ui/toast';

const log = createLogger('content', { sinks: [consoleSink], minLevel: 'info' });

function main(): void {
  // The manifest match already limits the host; this guards against path tricks.
  if (!location.pathname.startsWith(MOODLE_BASE_PATH)) return;

  registerDiagnostics();

  const context = new PageContext(document, () => location.href);
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
        status.refresh();
      },
      () => undefined,
    );
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void refreshSettings();
  });

  // One limiter for every request this page makes: at most 2 at once, spaced (spec §2).
  // Same-origin fetches carry the session cookie (no H3 dependency).
  const limiter = createRateLimiter(RATE_LIMIT);
  // It also waits and retries on 429/5xx, honoring Retry-After.
  const limitedFetch: FetchLike = politeFetch((input, init) => fetch(input, init), { limiter });
  const cache = new ResolveCache(
    (cmid) =>
      resolveResource(cmid, {
        fetch: limitedFetch,
        parseHtml: domParser,
        moodleRoot: moodleRoot(location.href),
      }),
    Date.now,
    PROBE_CACHE_TTL_MS,
    // Requests are limited above; resolutions themselves may overlap.
    createRateLimiter({ maxConcurrent: 8, minDelayMs: 0, maxDelayMs: 0 }),
  );

  const overlay = mountUiRoot(document, css, OVERLAY_ID);
  const pills = new StatusPills(overlay, document, {
    nuevo: t('statusNuevo'),
    descargado: t('statusDescargado'),
    actualizado: t('statusActualizado'),
    solo_lectura: t('statusSoloLectura'),
    perdido_local: t('statusPerdido'),
    omitido: t('statusOmitido'),
    error: t('statusError'),
  });
  const status = new PageStatus(pills, () => settings.showStatusBadges);
  const ui = new DownloadsUi(root);

  const content = document.querySelector('.course-content');
  if (content !== null) {
    observeDebounced(content, () => {
      context.invalidate();
      status.refresh();
    });
  }
  window.addEventListener('resize', () => {
    status.refresh();
  });

  const download = (
    activity: Parameters<Parameters<typeof installInterceptor>[0]['onDownload']>[1],
    open: boolean,
  ) => {
    const current = context.get();
    const resolution = cache.peek(activity.cmid);
    if (!current.ok || resolution?.kind !== 'file') return;
    const message = buildDownloadRequest(current.value, activity, resolution.file, open);
    if (message !== null) void ui.request(message, activity.name);
  };

  installHoverIndicator({
    doc: document,
    context,
    cache,
    enabled: () => settings.interceptClicks && settings.hoverDetails === 'simple',
    badge: new CursorBadge(root, {
      resolving: t('badgeResolving'),
      ready: t('badgeReady'),
      readonly: t('badgeReadOnly'),
      error: t('badgeError'),
    }),
  });
  installDetails({
    doc: document,
    context,
    cache,
    status,
    card: new DetailsCard(overlay, {
      type: t('cardType'),
      file: t('cardFile'),
      size: t('cardSize'),
      destination: t('cardDest'),
      status: t('cardStatus'),
      download: t('cardDownload'),
      copy: t('cardCopy'),
      copied: t('cardCopied'),
      openFrameTitle: `${t('dlOpen')} / ${t('dlShow')}`,
    }),
    enabled: () => true,
    hoverEnabled: () => settings.hoverDetails === 'tarjeta',
    onDownload: (activity) => {
      download(activity, false);
    },
  });
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
      status.onReadOnly(activity.cmid);
      ui.readOnly(activity.name);
    },
  });

  let bulk: BulkRunner | null = null;
  if (page.ok) {
    let runner: BulkRunner | null = null;
    const panel = new CoursePanel(
      root,
      {
        open: t('panelOpen'),
        title: t('panelTitle'),
        hint: t('panelHint'),
        section: t('panelSection'),
        all: t('panelAll'),
        onlyNew: t('panelNew'),
        retry: t('panelRetry'),
        cancel: t('panelCancel'),
        close: t('panelClose'),
        planTitle: t('planTitle'),
      },
      {
        onSection: () => void runner?.run('section'),
        onAll: () => void runner?.run('all'),
        onNew: () => void runner?.run('new'),
        onRetry: () => void runner?.retryFailed(),
        onCancel: () => runner?.cancel(),
      },
    );
    runner = new BulkRunner({
      doc: document,
      url: () => location.href,
      context,
      panel,
      status,
      fetch: limitedFetch,
      parseHtml: domParser,
      settings: () => settings,
    });
    bulk = runner;
  }

  // Progress from the worker. Only the worker (extension sender without a tab) may send it.
  chrome.runtime.onMessage.addListener((raw, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab !== undefined) return false;
    const parsed = parseMessage(raw);
    if (
      !parsed.ok ||
      parsed.value.target !== 'content' ||
      parsed.value.type !== 'content/download-update'
    )
      return false;
    const update = parsed.value;
    if (bulk?.handleUpdate(update) === true) return false;
    if (update.cmid !== null && update.state === 'hecha') status.onDownloaded(update.cmid);
    ui.update(update);
    return false;
  });

  void refreshSettings().then(() => (page.ok ? status.load(page.value.course.id) : undefined));
  void sendMessage({ target: 'background', type: 'content/hello', url: location.href }).then(
    (result) => {
      if (!result.ok) log.warn(`background did not accept hello: ${result.error.code}`);
    },
  );
}

main();
