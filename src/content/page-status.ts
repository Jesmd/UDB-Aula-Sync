import { sendMessage } from '../shared/browser-api';
import type { DownloadPreviewResponse } from '../shared/messages';
import type { FileStatus } from '../shared/types';
import type { PillStatus, StatusPills } from './ui/status-badge';

/** Index/plan status to the pill shown on the page. */
export function pillFor(status: FileStatus): PillStatus | null {
  switch (status) {
    case 'nuevo':
    case 'actualizado':
    case 'perdido_local':
    case 'omitido':
    case 'solo_lectura':
    case 'error':
      return status;
    case 'sin_cambios':
    case 'ya_existe':
      return 'descargado';
    default:
      return null;
  }
}

/**
 * Keeps the status pills of the current page in sync: the index on load, then every
 * preview, read-only resolution and finished download. Pills are off when the user
 * turned them off.
 */
export class PageStatus {
  readonly #previews = new Map<number, DownloadPreviewResponse>();

  constructor(
    private readonly pills: StatusPills,
    private readonly enabled: () => boolean,
  ) {}

  preview(cmid: number): DownloadPreviewResponse | undefined {
    return this.#previews.get(cmid);
  }

  async load(courseId: number): Promise<void> {
    if (!this.enabled()) return;
    const result = await sendMessage({ target: 'background', type: 'files/status', courseId });
    if (!result.ok) return;
    for (const file of result.value.files) {
      if (this.pills.get(file.cmid) !== undefined) continue;
      this.pills.set(file.cmid, file.localExists === false ? 'perdido_local' : 'descargado');
    }
    // New since the last sync ("NUEVO", spec §3.4).
    for (const cmid of result.value.novelties)
      if (this.pills.get(cmid) === undefined) this.pills.set(cmid, 'nuevo');
  }

  onPreview(cmid: number, preview: DownloadPreviewResponse): void {
    this.#previews.set(cmid, preview);
    if (this.enabled()) this.pills.set(cmid, pillFor(preview.status));
  }

  onReadOnly(cmid: number): void {
    if (this.enabled()) this.pills.set(cmid, 'solo_lectura');
  }

  onDownloaded(cmid: number): void {
    this.#previews.delete(cmid);
    if (this.enabled()) this.pills.set(cmid, 'descargado');
  }

  onFailed(cmid: number): void {
    if (this.enabled()) this.pills.set(cmid, 'error');
  }

  refresh(): void {
    if (this.enabled()) this.pills.render();
    else this.pills.clear();
  }
}
