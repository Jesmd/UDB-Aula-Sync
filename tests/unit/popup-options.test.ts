import { beforeEach, describe, expect, it } from 'vitest';
import { createTask, type Task } from '../../src/core/queue/task';
import { parseExtensions, parseSizeMb } from '../../src/options/fields';
import { previewPath } from '../../src/options/preview';
import { courseRows, fold, searchFiles, summarizeQueue } from '../../src/popup/model';
import { setMessageLookup } from '../../src/shared/i18n';
import type { TaskState } from '../../src/shared/types';
import type { FileRecord } from '../../src/storage/db';
import { DEFAULT_SETTINGS } from '../../src/storage/settings-schema';

const FP = {
  path: '/p',
  revision: 0,
  size: 1,
  lastModified: null,
  etag: null,
  contentType: null,
};

function task(cmid: number, state: TaskState, path = `UDB/C/${cmid}.pdf`): Task {
  const base = createTask(
    {
      courseId: 1,
      cmid,
      fileKey: `k${cmid}`,
      request: {
        url: 'https://x/pluginfile.php/1/a.pdf',
        relativePath: path,
        conflictAction: 'uniquify',
        extension: 'pdf',
        expectedSize: 1,
        expectedType: null,
        open: false,
      },
      fingerprint: FP,
      reason: 'nuevo',
      versions: 1,
      originTabId: null,
    },
    0,
  );
  return { ...base, state };
}

function file(courseId: number, cmid: number, relativePath: string, at: number): FileRecord {
  return {
    id: `${courseId}:${cmid}:k`,
    courseId,
    cmid,
    fileKey: 'k',
    fingerprint: FP,
    url: 'https://x',
    relativePath,
    localPath: null,
    downloadId: cmid === 3 ? null : cmid * 10,
    versions: 1,
    downloadedAt: at,
  };
}

beforeEach(() => {
  setMessageLookup((key) => key);
});

describe('popup model', () => {
  it('summarizes the queue and names the file in progress', () => {
    const summary = summarizeQueue([
      task(1, 'en_cola'),
      task(2, 'en_cola'),
      task(3, 'descargando', 'UDB/C/ahora.pdf'),
      task(4, 'fallida'),
      task(5, 'hecha'),
      task(6, 'omitida'),
    ]);
    expect(summary).toEqual({
      waiting: 2,
      active: 1,
      failed: 1,
      done: 1,
      current: 'UDB/C/ahora.pdf',
    });
    expect(summarizeQueue([]).current).toBeNull();
  });

  it('lists courses by name with their file counts, including unnamed ones', () => {
    const rows = courseRows(
      [
        { id: 2, fullName: 'Redes 10', shortName: null, lastSeen: 0 },
        { id: 1, fullName: 'Redes 9', shortName: null, lastSeen: 0 },
      ],
      [file(1, 1, 'a', 5), file(1, 2, 'b', 9), file(7, 1, 'c', 3)],
    );
    expect(rows).toEqual([
      { id: 7, name: '#7', files: 1, lastDownload: 3 },
      { id: 1, name: 'Redes 9', files: 2, lastDownload: 9 },
      { id: 2, name: 'Redes 10', files: 0, lastDownload: null },
    ]);
  });

  it('searches saved paths by every word, without accents, newest first', () => {
    const files = [
      file(1, 1, 'UDB/Estadística/Semana 01/Guía 1.pdf', 1),
      file(1, 2, 'UDB/Estadística/Semana 02/Guía 2.pdf', 2),
      file(1, 3, 'UDB/Redes/Semana 01/guia.docx', 3),
    ];
    expect(fold('Guía ÉXITO')).toBe('guia exito');
    expect(searchFiles(files, '  ')).toEqual([]);
    expect(searchFiles(files, 'guia estadistica').map((h) => h.name)).toEqual([
      'Guía 2.pdf',
      'Guía 1.pdf',
    ]);
    expect(searchFiles(files, 'redes')).toEqual([
      {
        id: '1:3:k',
        name: 'guia.docx',
        folder: 'UDB/Redes/Semana 01',
        extension: 'docx',
        downloadId: null,
      },
    ]);
    expect(searchFiles(files, 'semana', 1)).toHaveLength(1);
  });
});

describe('options parsing', () => {
  it('accepts extension lists and rejects junk', () => {
    expect(parseExtensions('.MP4, zip;  mp4 rar')).toEqual({
      ok: true,
      value: ['mp4', 'zip', 'rar'],
    });
    expect(parseExtensions('')).toEqual({ ok: true, value: [] });
    expect(parseExtensions('p/d/f').ok).toBe(false);
  });

  it('reads sizes: empty is no limit', () => {
    expect(parseSizeMb(' ')).toEqual({ ok: true, value: null });
    expect(parseSizeMb('250')).toEqual({ ok: true, value: 250 });
    expect(parseSizeMb('2.5').ok).toBe(false);
    expect(parseSizeMb('0').ok).toBe(false);
  });

  it('previews the saved path with the current settings', () => {
    const preview = previewPath(DEFAULT_SETTINGS.paths);
    expect(preview).toEqual({
      ok: true,
      value: 'UDB/Estadística Aplicada ESA501 G01T/Unidad 01/Semana 03/Guía de ejercicios.pdf',
    });
    const grouped = previewPath({
      ...DEFAULT_SETTINGS.paths,
      groupByCycle: true,
      orderPrefix: true,
      fileNaming: 'ambos',
    });
    expect(grouped.ok && grouped.value).toBe(
      'UDB/2026-C02/Estadística Aplicada ESA501 G01T/Unidad 01/04 - Semana 03/Guía de ejercicios - guia_semana3.pdf',
    );
  });
});

describe('sync summary text', () => {
  it('explains each outcome', async () => {
    const { summaryText } = await import('../../src/popup/components/SyncPanel');
    const base = { courses: 2, novelties: 0, queued: 0, skipped: null, errorCode: null };
    expect(summaryText(base)).toBe('syncNothingNew');
    expect(summaryText({ ...base, novelties: 3, queued: 1 })).toBe('syncFound syncQueued');
    expect(summaryText({ ...base, skipped: 'no_courses' })).toBe('syncNoCourses');
    expect(summaryText({ ...base, skipped: 'offline' })).toBe('syncOffline');
    expect(summaryText({ ...base, skipped: 'running' })).toBe('syncRunning');
    expect(summaryText({ ...base, errorCode: 'session_expired' })).toBe('error_session_expired');
  });
});
