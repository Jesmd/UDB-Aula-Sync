import { describe, expect, it, vi } from 'vitest';
import { FolderVerifier } from '../../../src/background/folder-verifier';
import {
  canAdopt,
  existsInFolder,
  folderMatchesBase,
  pathInFolder,
} from '../../../src/fs-access/adopt-existing';
import {
  createMemoryHandleStore,
  folderPermission,
  pickerAvailable,
  pickFolder,
  type FolderHandle,
} from '../../../src/fs-access/directory-handle';
import {
  scanFolder,
  type DirLike,
  type FileLike,
  type FolderListing,
} from '../../../src/fs-access/scan-folder';
import { appError, type AppError } from '../../../src/shared/errors';
import { createLogger } from '../../../src/shared/logger';
import { err, ok, type Result } from '../../../src/shared/result';

/** A fake folder: nested objects are folders, numbers are file sizes. */
interface Tree {
  readonly [name: string]: Tree | number;
}

function fakeDir(name: string, tree: Tree, fail?: Error): FolderHandle {
  return {
    kind: 'directory',
    name,
    async *values(): AsyncGenerator<DirLike | FileLike> {
      if (fail !== undefined) throw fail;
      for (const [child, value] of Object.entries(tree)) {
        await Promise.resolve();
        yield typeof value === 'number'
          ? {
              kind: 'file',
              name: child,
              getFile: () => Promise.resolve({ size: value, lastModified: 1 }),
            }
          : fakeDir(child, value);
      }
    },
  };
}

const TREE: Tree = {
  'Estadística Aplicada ESA501 G01T': {
    Desarrollo: { 'Semana 02': { 'Guia 1 - Redes.pdf': 10, 'otro.pdf': 5 } },
  },
  'notas.txt': 3,
};

async function listing(tree: Tree = TREE, takenAt = 100): Promise<FolderListing> {
  const result = await scanFolder(fakeDir('UDB', tree), takenAt);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('scanFolder', () => {
  it('lists every file with its size, by lower-case path', async () => {
    const l = await listing();
    expect(l.rootName).toBe('UDB');
    expect([...l.files.keys()].sort()).toEqual([
      'estadística aplicada esa501 g01t/desarrollo/semana 02/guia 1 - redes.pdf',
      'estadística aplicada esa501 g01t/desarrollo/semana 02/otro.pdf',
      'notas.txt',
    ]);
    expect(l.truncated).toBe(false);
  });

  it('stops at the entry and depth limits and says so', async () => {
    const many = await scanFolder(fakeDir('UDB', TREE), 0, { maxEntries: 2, maxDepth: 12 });
    expect(many.ok && many.value.truncated).toBe(true);
    const deep = await scanFolder(fakeDir('UDB', TREE), 0, { maxEntries: 100, maxDepth: 2 });
    expect(deep.ok && deep.value.truncated).toBe(true);
    expect(deep.ok && deep.value.files.has('notas.txt')).toBe(true);
  });

  it('maps a lost permission and other read errors', async () => {
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const a = await scanFolder(fakeDir('UDB', {}, denied), 0);
    expect(!a.ok && a.error.code).toBe('folder_permission');
    const b = await scanFolder(fakeDir('UDB', {}, new Error('io')), 0);
    expect(!b.ok && b.error.code).toBe('storage');
  });
});

describe('adoption and deletions', () => {
  const PATH = 'UDB/Estadística Aplicada ESA501 G01T/Desarrollo/Semana 02/Guia 1 - Redes.pdf';

  it('maps index paths into the chosen base folder', () => {
    expect(pathInFolder(PATH, 'UDB')).toBe(
      'Estadística Aplicada ESA501 G01T/Desarrollo/Semana 02/Guia 1 - Redes.pdf',
    );
    expect(pathInFolder('Otra/x.pdf', 'UDB')).toBeNull();
    expect(pathInFolder('udb/2026/x.pdf', 'UDB/2026')).toBe('x.pdf');
    expect(pathInFolder('UDB', 'UDB')).toBeNull();
    expect(folderMatchesBase({ rootName: 'udb' }, 'UDB')).toBe(true);
    expect(folderMatchesBase({ rootName: 'Descargas' }, 'UDB')).toBe(false);
  });

  it('tells present, deleted and unknown files apart', async () => {
    const l = await listing();
    expect(existsInFolder(l, PATH, 'UDB', 50)).toBe(true);
    expect(existsInFolder(l, PATH.replace('Guia 1', 'Guia 9'), 'UDB', 50)).toBe(false);
    // Downloaded after the scan, outside the base, or a truncated scan: unknown.
    expect(existsInFolder(l, PATH.replace('Guia 1', 'Guia 9'), 'UDB', 150)).toBeNull();
    expect(existsInFolder(l, 'Otra/x.pdf', 'UDB', 50)).toBeNull();
    expect(existsInFolder({ ...l, truncated: true }, 'UDB/nada.pdf', 'UDB', 50)).toBeNull();
  });

  it('adopts only a same-named file with the same known size', async () => {
    const l = await listing();
    expect(canAdopt(l, PATH, 'UDB', 10)).toBe(true);
    expect(canAdopt(l, PATH, 'UDB', 11)).toBe(false);
    expect(canAdopt(l, PATH, 'UDB', null)).toBe(false);
    expect(canAdopt(l, 'UDB/no/existe.pdf', 'UDB', 10)).toBe(false);
  });
});

describe('handles and permission', () => {
  it('stores the handle and reads permission without asking', async () => {
    const store = createMemoryHandleStore();
    const requestPermission = vi.fn(() => Promise.resolve('granted' as const));
    const handle: FolderHandle = {
      ...fakeDir('UDB', {}),
      queryPermission: vi.fn(() => Promise.resolve('prompt' as const)),
      requestPermission,
    };
    await store.set(handle);
    expect(await store.get()).toBe(handle);
    expect(await folderPermission(handle)).toBe('prompt');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await folderPermission(handle, true)).toBe('granted');
    expect(await folderPermission(fakeDir('UDB', {}))).toBe('unsupported');
    const broken: FolderHandle = {
      ...fakeDir('UDB', {}),
      queryPermission: () => Promise.reject(new Error('x')),
    };
    expect(await folderPermission(broken)).toBe('denied');
    await store.clear();
    expect(await store.get()).toBeUndefined();
  });

  it('opens the read-only picker and handles a closed dialog', async () => {
    expect(pickerAvailable({})).toBe(false);
    const handle = fakeDir('UDB', {});
    const showDirectoryPicker = vi.fn(() => Promise.resolve(handle));
    const picked = await pickFolder({ showDirectoryPicker });
    expect(picked).toEqual({ ok: true, value: handle });
    expect(showDirectoryPicker).toHaveBeenCalledWith({
      id: 'udbsync-base',
      mode: 'read',
      startIn: 'downloads',
    });
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const closed = await pickFolder({ showDirectoryPicker: () => Promise.reject(abort) });
    expect(!closed.ok && closed.error.code).toBe('cancelled');
    const blocked = await pickFolder({
      showDirectoryPicker: () => Promise.reject(new Error('no')),
    });
    expect(!blocked.ok && blocked.error.code).toBe('folder_permission');
    expect(!(await pickFolder({})).ok).toBe(true);
  });
});

describe('FolderVerifier', () => {
  it('reads the folder once per minute and never without a chosen folder', async () => {
    let now = 0;
    let configured = false;
    const l = await listing();
    const scan = vi.fn<() => Promise<Result<FolderListing, AppError>>>(() =>
      Promise.resolve(ok(l)),
    );
    const verifier = new FolderVerifier({
      configured: () => Promise.resolve(configured),
      scan,
      log: createLogger('t'),
      now: () => now,
    });
    expect(await verifier.listing()).toBeNull();
    expect(scan).not.toHaveBeenCalled();
    configured = true;
    now = 61_000;
    const [a, b] = await Promise.all([verifier.listing(), verifier.listing()]);
    expect(a).toBe(l);
    expect(b).toBe(l);
    now = 100_000;
    await verifier.listing();
    expect(scan).toHaveBeenCalledTimes(1);

    scan.mockResolvedValueOnce(err(appError('folder_permission', 'prompt')));
    now = 200_000;
    expect(await verifier.listing()).toBeNull();
    expect((await verifier.refresh()).ok).toBe(true);
  });
});
