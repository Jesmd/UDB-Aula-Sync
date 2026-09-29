import { errorMessage } from '../shared/error-text';
import { buildPlan, type PlanItem } from '../core/planning/sync-plan';
import { sendMessage } from '../shared/browser-api';
import { t } from '../shared/i18n';
import type { DownloadPreviewResponse, DownloadUpdateMessage } from '../shared/messages';
import type { HtmlParser } from '../moodle/html-parser';
import { payloadFor } from '../moodle/payload';
import { snapshotFromScan } from '../moodle/snapshot';
import type { FetchLike } from '../moodle/resolver/head-probe';
import { resolveItems, scanCourse, type FoundFile, type ScanScope } from '../moodle/scan';
import { courseSettings, type Settings } from '../storage/settings-schema';
import type { PageContext } from './page-context';
import type { PageStatus } from './page-status';
import type { CoursePanel, PlanView } from './ui/course-panel';
import { formatBytes } from './ui/format';

export type BulkMode = 'section' | 'all' | 'new';

export interface BulkDeps {
  readonly doc: Document;
  readonly url: () => string;
  readonly context: PageContext;
  readonly panel: CoursePanel;
  readonly status: PageStatus;
  /** Rate-limited same-origin fetch. */
  readonly fetch: FetchLike;
  readonly parseHtml: HtmlParser;
  readonly settings: () => Settings;
}

/**
 * "Descargar sección / todo / solo nuevos" (spec §3.3, §5): scan, resolve, dry run with the
 * worker, show the plan, ask for confirmation above 100 files or 200 MB, then queue.
 * Per-file toasts stay quiet: the panel shows the combined progress.
 */
export class BulkRunner {
  #abort: AbortController | null = null;
  #ids = new Set<string>();
  #cmids = new Map<string, number>();
  #done = new Set<string>();
  #failed = new Set<string>();

  constructor(private readonly deps: BulkDeps) {}

  get running(): boolean {
    return this.#abort !== null;
  }

  /** True when the update belongs to this bulk run (the caller then skips its toast). */
  handleUpdate(message: DownloadUpdateMessage): boolean {
    if (message.fileId === null || !this.#ids.has(message.fileId)) return false;
    const cmid = this.#cmids.get(message.fileId);
    if (message.state === 'hecha') {
      this.#done.add(message.fileId);
      if (cmid !== undefined) this.deps.status.onDownloaded(cmid);
    } else if (message.state === 'fallida') {
      this.#failed.add(message.fileId);
      if (cmid !== undefined) this.deps.status.onFailed(cmid);
    } else if (message.state === 'omitida') {
      this.#failed.add(message.fileId);
    }
    this.#showDownloadProgress();
    return true;
  }

  #showDownloadProgress(): void {
    const total = this.#ids.size;
    const finished = this.#done.size + this.#failed.size;
    const text =
      finished >= total
        ? t('bulkDone', [String(this.#done.size), String(this.#failed.size)])
        : t('bulkProgress', [String(this.#done.size), String(total), String(this.#failed.size)]);
    this.deps.panel.setStatus(text, { done: finished, total });
    if (finished >= total) this.deps.panel.setBusy(false);
  }

  cancel(): void {
    this.#abort?.abort();
    this.#abort = null;
    if (this.#ids.size > this.#done.size + this.#failed.size) {
      void sendMessage({ target: 'background', type: 'queue/control', action: 'cancel' });
    }
    this.deps.panel.setBusy(false);
  }

  async retryFailed(): Promise<void> {
    const result = await sendMessage({ target: 'background', type: 'queue/retry-failed' });
    this.deps.panel.setStatus(
      result.ok ? t('retryDone', String(result.value.retried)) : t('error_unknown'),
    );
  }

  async run(mode: BulkMode): Promise<void> {
    if (this.running) return;
    const page = this.deps.context.get();
    if (!page.ok) {
      this.deps.panel.setStatus(errorMessage(page.error.code));
      return;
    }
    const abort = new AbortController();
    // A function, so narrowing does not freeze the flag between awaits.
    const aborted = () => abort.signal.aborted;
    this.#abort = abort;
    this.#ids = new Set();
    this.#cmids = new Map();
    this.#done = new Set();
    this.#failed = new Set();
    const { panel } = this.deps;
    panel.clearPlan();
    panel.setBusy(true);

    try {
      const settings = this.deps.settings();
      const { override } = courseSettings(settings, page.value.course.id);
      const scope: ScanScope =
        mode === 'section'
          ? {
              kind: 'sections',
              numbers: page.value.activities.flatMap((a) =>
                a.section.number === null ? [] : [a.section.number],
              ),
            }
          : { kind: 'course' };
      const onProgress = (p: { phase: 'sections' | 'files'; done: number; total: number }) => {
        panel.setStatus(
          t(p.phase === 'sections' ? 'scanSections' : 'scanFiles', [
            String(p.done),
            String(p.total),
          ]),
          p,
        );
      };
      const deps = {
        fetch: this.deps.fetch,
        parseHtml: this.deps.parseHtml,
        onProgress,
        signal: abort.signal,
      };

      const scan = await scanCourse(
        this.deps.doc,
        this.deps.url(),
        scope,
        override.skipSections,
        deps,
      );
      if (!scan.ok) {
        this.#fail(scan.error.code);
        return;
      }
      // A whole-course scan by hand is the course's first sync (spec §2, §3.4): from now
      // on the background checks it for novelties.
      if (scope.kind === 'course')
        void sendMessage({
          target: 'background',
          type: 'snapshot/save',
          snapshot: snapshotFromScan(scan.value, Date.now()),
        });
      const resolved = await resolveItems(scan.value.items, this.deps.url(), deps);
      if (!resolved.ok) {
        this.#fail(resolved.error.code);
        return;
      }

      panel.setStatus(t('scanPlanning'));
      const previews: { found: FoundFile; preview: DownloadPreviewResponse }[] = [];
      for (const found of resolved.value.files) {
        if (aborted()) return;
        const preview = await sendMessage({
          ...payloadFor(scan.value, found),
          type: 'download/preview',
        });
        if (!preview.ok) continue;
        previews.push({ found, preview: preview.value });
        if (found.folderPath === null)
          this.deps.status.onPreview(found.item.activity.cmid, preview.value);
      }
      for (const item of resolved.value.readOnly) this.deps.status.onReadOnly(item.activity.cmid);

      const wanted = (p: DownloadPreviewResponse) =>
        p.willDownload && (mode !== 'new' || p.status === 'nuevo');
      const planItems: PlanItem[] = [
        ...previews.map(({ preview }) => ({
          status: preview.status,
          size: preview.size,
          willDownload: wanted(preview),
        })),
        ...resolved.value.readOnly.map(() => ({
          status: 'solo_lectura' as const,
          size: null,
          willDownload: false,
        })),
        ...resolved.value.failed.map(() => ({
          status: 'error' as const,
          size: null,
          willDownload: false,
        })),
      ];
      const plan = buildPlan(planItems);
      const view: PlanView = {
        rows: [
          [t('planNew'), plan.counts.nuevo],
          [t('planUpdated'), plan.counts.actualizado],
          [t('planMissing'), plan.counts.perdido_local],
          [t('planAdopted'), plan.counts.ya_existe],
          [t('planUnchanged'), plan.counts.sin_cambios],
          [t('planReadOnly'), plan.counts.solo_lectura],
          [t('planOmitted'), plan.counts.omitido],
          [t('planErrors'), plan.counts.error],
          [t('planSkippedSections'), scan.value.skipped.length],
        ],
        total:
          plan.downloads === 0
            ? t('planNothing')
            : t('planTotal', [String(plan.downloads), formatBytes(plan.totalBytes, '0 B')]),
        note: plan.unknownSizes > 0 ? t('planUnknownSizes', String(plan.unknownSizes)) : null,
        warning: plan.needsConfirmation ? t('planBig') : null,
        confirmLabel: plan.downloads === 0 ? null : t('planConfirm', String(plan.downloads)),
      };
      panel.setStatus('');
      const go = await panel.showPlan(view, plan.needsConfirmation);
      if (!go || aborted()) {
        panel.setBusy(false);
        return;
      }

      const chosen = previews.filter(({ preview }) => wanted(preview));
      for (const { found, preview } of chosen) {
        this.#ids.add(preview.fileId);
        this.#cmids.set(preview.fileId, found.item.activity.cmid);
      }
      this.#showDownloadProgress();
      for (const { found, preview } of chosen) {
        if (aborted()) break;
        const result = await sendMessage({
          ...payloadFor(scan.value, found),
          type: 'download/request',
        });
        if (!result.ok) this.#failed.add(preview.fileId);
        // Already up to date after all (another tab downloaded it meanwhile).
        else if (result.value.action !== 'queued') this.#done.add(preview.fileId);
      }
      this.#showDownloadProgress();
    } finally {
      if (this.#abort === abort) this.#abort = null;
    }
  }

  #fail(code: string): void {
    this.deps.panel.setStatus(code === 'cancelled' ? t('panelCancel') : errorMessage(code));
    this.deps.panel.setBusy(false);
  }
}
