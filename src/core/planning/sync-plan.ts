import { CONFIRM_THRESHOLD } from '../../shared/constants';
import type { FileStatus } from '../../shared/types';

export interface PlanItem {
  readonly status: FileStatus;
  /** Bytes to download; null when unknown. Only items that will download count. */
  readonly size: number | null;
  readonly willDownload: boolean;
}

export interface SyncPlan {
  readonly counts: Readonly<Record<FileStatus, number>>;
  readonly downloads: number;
  /** Sum of known sizes of files to download. */
  readonly totalBytes: number;
  /** Files to download whose size is unknown (the total is then a lower bound). */
  readonly unknownSizes: number;
  /** Spec §3.3: confirm above 100 files or 200 MB. */
  readonly needsConfirmation: boolean;
}

const STATUSES: readonly FileStatus[] = [
  'nuevo',
  'sin_cambios',
  'actualizado',
  'perdido_local',
  'ya_existe',
  'solo_lectura',
  'omitido',
  'retirado_en_linea',
  'error',
];

/** Dry-run summary shown before "Descargar todo" / "Solo nuevos" (M4 UI). */
export function buildPlan(items: readonly PlanItem[], threshold = CONFIRM_THRESHOLD): SyncPlan {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<FileStatus, number>;
  let downloads = 0;
  let totalBytes = 0;
  let unknownSizes = 0;
  for (const item of items) {
    counts[item.status] += 1;
    if (!item.willDownload) continue;
    downloads += 1;
    if (item.size === null) unknownSizes += 1;
    else totalBytes += item.size;
  }
  return {
    counts,
    downloads,
    totalBytes,
    unknownSizes,
    needsConfirmation: downloads > threshold.files || totalBytes > threshold.bytes,
  };
}
