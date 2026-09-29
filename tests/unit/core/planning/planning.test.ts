import { describe, expect, it } from 'vitest';
import {
  fingerprintOf,
  hasChanged,
  type Fingerprint,
} from '../../../../src/core/planning/fingerprint';
import { reconcile } from '../../../../src/core/planning/reconcile';
import { buildPlan } from '../../../../src/core/planning/sync-plan';

const fp = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  path: '/pluginfile.php/5/mod_resource/content/0/a.pdf',
  revision: 0,
  size: 100,
  lastModified: 'Mon, 14 Sep 2026 15:00:00 GMT',
  etag: '"e1"',
  contentType: 'application/pdf',
  ...over,
});

describe('fingerprint', () => {
  it('builds from a resolved file', () => {
    expect(
      fingerprintOf({
        ref: { path: '/p', revision: 2 },
        size: 1,
        lastModified: null,
        etag: null,
        contentType: 'text/plain',
      }),
    ).toEqual({
      path: '/p',
      revision: 2,
      size: 1,
      lastModified: null,
      etag: null,
      contentType: 'text/plain',
    });
  });

  it('detects changes by size, date, etag or revision (revision alone stays 0 on the real site)', () => {
    expect(hasChanged(fp(), fp())).toBe(false);
    expect(hasChanged(fp(), fp({ size: 101 }))).toBe(true);
    expect(hasChanged(fp(), fp({ lastModified: 'Tue, 15 Sep 2026 15:00:00 GMT' }))).toBe(true);
    expect(hasChanged(fp(), fp({ etag: '"e2"' }))).toBe(true);
    expect(
      hasChanged(fp(), fp({ revision: 1, path: '/pluginfile.php/5/mod_resource/content/1/a.pdf' })),
    ).toBe(true);
    expect(hasChanged(fp(), fp({ path: '/pluginfile.php/5/mod_resource/content/0/b.pdf' }))).toBe(
      true,
    );
  });

  it('ignores fields unknown on either side', () => {
    expect(hasChanged(fp(), fp({ size: null, etag: null, lastModified: null }))).toBe(false);
    expect(hasChanged(fp({ revision: null, path: '/x' }), fp({ revision: null, path: '/x' }))).toBe(
      false,
    );
  });
});

describe('reconcile', () => {
  const entry = { fingerprint: fp(), versions: 1 };

  it('downloads new files without overwriting unknown local ones', () => {
    expect(reconcile(null, fp(), null, 'sobrescribir')).toEqual({
      status: 'nuevo',
      action: 'download',
      conflictAction: 'uniquify',
      versionSuffix: null,
    });
  });

  it('skips unchanged files and re-downloads lost ones', () => {
    expect(reconcile(entry, fp(), true, 'omitir')).toEqual({
      status: 'sin_cambios',
      action: 'skip',
    });
    expect(reconcile(entry, fp(), null, 'omitir')).toEqual({
      status: 'sin_cambios',
      action: 'skip',
    });
    expect(reconcile(entry, fp(), false, 'omitir')).toMatchObject({
      status: 'perdido_local',
      action: 'download',
      conflictAction: 'overwrite',
    });
  });

  it('applies the update policy to changed files', () => {
    const changed = fp({ size: 200 });
    expect(reconcile(entry, changed, true, 'omitir')).toEqual({
      status: 'actualizado',
      action: 'skip',
    });
    expect(reconcile(entry, changed, true, 'sobrescribir')).toMatchObject({
      action: 'download',
      conflictAction: 'overwrite',
      versionSuffix: null,
    });
    expect(reconcile({ ...entry, versions: 2 }, changed, true, 'conservar_ambas')).toMatchObject({
      status: 'actualizado',
      conflictAction: 'uniquify',
      versionSuffix: ' (rev 3)',
    });
  });
});

describe('buildPlan', () => {
  it('counts statuses and sizes and asks for confirmation above the limits', () => {
    const plan = buildPlan([
      { status: 'nuevo', size: 10, willDownload: true },
      { status: 'nuevo', size: null, willDownload: true },
      { status: 'sin_cambios', size: 50, willDownload: false },
      { status: 'solo_lectura', size: null, willDownload: false },
    ]);
    expect(plan).toMatchObject({
      downloads: 2,
      totalBytes: 10,
      unknownSizes: 1,
      needsConfirmation: false,
    });
    expect(plan.counts).toMatchObject({
      nuevo: 2,
      sin_cambios: 1,
      solo_lectura: 1,
      actualizado: 0,
    });
    expect(
      buildPlan([{ status: 'nuevo', size: 300 * 1024 * 1024, willDownload: true }])
        .needsConfirmation,
    ).toBe(true);
    expect(
      buildPlan(
        Array.from({ length: 101 }, () => ({
          status: 'nuevo' as const,
          size: 1,
          willDownload: true,
        })),
      ).needsConfirmation,
    ).toBe(true);
  });
});
