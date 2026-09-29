import { sendMessage } from '../shared/browser-api';
import { HOVER_DELAY_MS } from '../shared/constants';
import { t, type MessageKey } from '../shared/i18n';
import type { DownloadPreviewResponse } from '../shared/messages';
import type { Activity } from '../moodle/types';
import { OPEN_PAGE } from './downloads-ui';
import { activityFromEvent, buildDownloadRequest } from './interceptor';
import type { PageContext } from './page-context';
import { pillFor, type PageStatus } from './page-status';
import type { ResolveCache } from './resolver-client';
import { formatBytes, typeLabel } from './ui/format';
import type { CardData, DetailsCard } from './ui/hover-card';

const RESOURCE_LINK = 'a[href*="/mod/resource/view.php"]';
const HIDE_DELAY_MS = 250;

const STATUS_KEYS: Readonly<Record<string, MessageKey>> = {
  nuevo: 'statusNuevo',
  descargado: 'statusDescargado',
  actualizado: 'statusActualizado',
  solo_lectura: 'statusSoloLectura',
  perdido_local: 'statusPerdido',
  omitido: 'statusOmitido',
  error: 'statusError',
};

export interface DetailsDeps {
  readonly doc: Document;
  readonly context: PageContext;
  readonly cache: ResolveCache;
  readonly card: DetailsCard;
  readonly status: PageStatus;
  /** Mouse hover shows the card only in "tarjeta" mode; keyboard focus always does. */
  readonly hoverEnabled: () => boolean;
  readonly enabled: () => boolean;
  readonly onDownload: (activity: Activity) => void;
  readonly delayMs?: number;
}

/**
 * Details card controller (spec §3.1): after the 400 ms hover (or on keyboard focus) it
 * resolves the file, asks the worker for a dry run, and shows name, type, real name, size,
 * destination, status and actions. Leaving both the link and the card hides it.
 */
export function installDetails(deps: DetailsDeps): () => void {
  let current: { cmid: number; link: Element } | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const view = deps.doc.defaultView;

  const cancelHide = () => {
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    hideTimer = undefined;
  };
  const hide = () => {
    cancelHide();
    if (showTimer !== undefined) clearTimeout(showTimer);
    showTimer = undefined;
    current = null;
    deps.card.hide();
  };
  const hideSoon = () => {
    cancelHide();
    hideTimer = setTimeout(hide, HIDE_DELAY_MS);
  };

  // A function, so narrowing does not freeze `current` across awaits.
  const stale = (cmid: number) => current?.cmid !== cmid;
  const render = async (activity: Activity, link: Element) => {
    const page = deps.context.get();
    if (!page.ok) return;
    const resolution = await deps.cache.get(activity.cmid);
    if (stale(activity.cmid)) return;
    const unknown = t('cardUnknown');
    if (!resolution.ok || resolution.value.kind === 'readonly') {
      const key = resolution.ok ? 'statusSoloLectura' : 'statusError';
      if (resolution.ok) deps.status.onReadOnly(activity.cmid);
      deps.card.show(
        link,
        {
          name: activity.name,
          type: unknown,
          fileName: unknown,
          size: unknown,
          destination: '—',
          status: t(key),
          openFrameUrl: null,
          canDownload: false,
        },
        handlers(activity, null),
      );
      return;
    }
    const file = resolution.value.file;
    const message = buildDownloadRequest(page.value, activity, file, false);
    let preview: DownloadPreviewResponse | null = null;
    if (message !== null) {
      const answer = await sendMessage({ ...message, type: 'download/preview' });
      if (answer.ok) {
        preview = answer.value;
        deps.status.onPreview(activity.cmid, preview);
      }
    }
    if (stale(activity.cmid)) return;
    const pill = preview === null ? null : pillFor(preview.status);
    const data: CardData = {
      name: activity.name,
      type: typeLabel(file.extension, file.contentType, unknown),
      fileName: file.originalName,
      size: formatBytes(file.size, unknown),
      destination: preview?.relativePath ?? unknown,
      status: pill === null ? unknown : t(STATUS_KEYS[pill] ?? 'cardUnknown'),
      openFrameUrl:
        preview !== null && (pill === 'descargado' || pill === 'actualizado')
          ? `${chrome.runtime.getURL(OPEN_PAGE)}?id=${encodeURIComponent(preview.fileId)}`
          : null,
      canDownload: preview?.willDownload ?? true,
    };
    deps.card.show(link, data, handlers(activity, preview));
  };

  const handlers = (activity: Activity, preview: DownloadPreviewResponse | null) => ({
    onDownload: () => {
      deps.onDownload(activity);
      hide();
    },
    onCopy: async () => {
      if (preview !== null) await view?.navigator.clipboard.writeText(preview.relativePath);
    },
  });

  const begin = (event: Event, delay: number) => {
    if (!deps.enabled()) return;
    const page = deps.context.get();
    const activity = page.ok ? activityFromEvent(event, page.value) : null;
    const link = (event.target as Element | null)?.closest(RESOURCE_LINK) ?? null;
    if (activity === null || link === null) return;
    cancelHide();
    if (current?.cmid === activity.cmid) return;
    current = { cmid: activity.cmid, link };
    if (showTimer !== undefined) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      showTimer = undefined;
      void render(activity, link);
    }, delay);
  };

  const over = (event: MouseEvent) => {
    if (deps.card.contains(event.target as Node | null)) {
      cancelHide();
      return;
    }
    if (deps.hoverEnabled()) begin(event, deps.delayMs ?? HOVER_DELAY_MS);
  };
  const out = (event: MouseEvent | FocusEvent) => {
    if (current === null) return;
    const related = event.relatedTarget as Node | null;
    if (related !== null && (current.link.contains(related) || deps.card.contains(related))) return;
    hideSoon();
  };
  const focus = (event: FocusEvent) => {
    begin(event, 0);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && deps.card.visible) hide();
  };

  const options = { capture: true } as const;
  deps.doc.addEventListener('mouseover', over, options);
  deps.doc.addEventListener('mouseout', out, options);
  deps.doc.addEventListener('focusin', focus, options);
  deps.doc.addEventListener('focusout', out, options);
  deps.doc.addEventListener('keydown', key, options);
  return () => {
    hide();
    deps.doc.removeEventListener('mouseover', over, options);
    deps.doc.removeEventListener('mouseout', out, options);
    deps.doc.removeEventListener('focusin', focus, options);
    deps.doc.removeEventListener('focusout', out, options);
    deps.doc.removeEventListener('keydown', key, options);
  };
}
