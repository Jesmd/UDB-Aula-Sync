import type { Task } from '../core/queue/task';
import { compareNatural } from '../core/text/natural-sort';
import { splitExtension } from '../core/text/sanitize-filename';
import type { FileRecord } from '../storage/db';
import type { CourseMeta } from '../storage/meta-repo';

export interface QueueSummary {
  readonly waiting: number;
  readonly active: number;
  readonly failed: number;
  readonly done: number;
  /** The file being downloaded now, for the status line. */
  readonly current: string | null;
}

export function summarizeQueue(tasks: readonly Task[]): QueueSummary {
  let waiting = 0;
  let active = 0;
  let failed = 0;
  let done = 0;
  let current: string | null = null;
  for (const task of tasks) {
    switch (task.state) {
      case 'en_cola':
        waiting += 1;
        break;
      case 'resolviendo':
      case 'descargando':
      case 'verificando':
        active += 1;
        current ??= task.request.relativePath;
        break;
      case 'fallida':
        failed += 1;
        break;
      case 'hecha':
        done += 1;
        break;
      case 'omitida':
        break;
    }
  }
  return { waiting, active, failed, done, current };
}

export interface CourseRow {
  readonly id: number;
  readonly name: string;
  readonly files: number;
  readonly lastDownload: number | null;
}

/** Courses the extension has seen, with how many of their files are in the index. */
export function courseRows(
  courses: readonly CourseMeta[],
  files: readonly FileRecord[],
): CourseRow[] {
  const stats = new Map<number, { files: number; last: number }>();
  for (const file of files) {
    const s = stats.get(file.courseId) ?? { files: 0, last: 0 };
    stats.set(file.courseId, { files: s.files + 1, last: Math.max(s.last, file.downloadedAt) });
  }
  const rows = courses.map((c) => ({
    id: c.id,
    name: c.fullName,
    files: stats.get(c.id)?.files ?? 0,
    lastDownload: stats.get(c.id)?.last ?? null,
  }));
  // Files of courses without a name yet (downloaded before M4) still count.
  for (const [id, s] of stats)
    if (!courses.some((c) => c.id === id))
      rows.push({ id, name: `#${id}`, files: s.files, lastDownload: s.last });
  return rows.sort((a, b) => compareNatural(a.name, b.name));
}

/** Lowercase without accents, for matching "guia" with "Guía". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export interface FileHit {
  readonly id: string;
  readonly name: string;
  readonly folder: string;
  readonly extension: string;
  readonly downloadId: number | null;
}

/** Index search: every word must appear in the saved path. Newest first. */
export function searchFiles(files: readonly FileRecord[], query: string, limit = 30): FileHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return files
    .filter((f) => {
      const path = fold(f.relativePath);
      return words.every((w) => path.includes(w));
    })
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .slice(0, limit)
    .map((f) => {
      const slash = f.relativePath.lastIndexOf('/');
      const name = f.relativePath.slice(slash + 1);
      return {
        id: f.id,
        name,
        folder: f.relativePath.slice(0, Math.max(0, slash)),
        extension: splitExtension(name).extension,
        downloadId: f.downloadId,
      };
    });
}
