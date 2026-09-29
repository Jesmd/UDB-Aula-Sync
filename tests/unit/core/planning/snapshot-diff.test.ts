import { describe, expect, it } from 'vitest';
import {
  diffSnapshots,
  mergeNovelties,
  noveltiesFrom,
  SNAPSHOT_VERSION,
  type CourseSnapshot,
  type SnapshotItem,
  type SnapshotSection,
} from '../../../../src/core/planning/snapshot-diff';

const section = (n: number, available = true): SnapshotSection => ({
  key: `n:${n}`,
  name: `Semana ${n}`,
  parent: null,
  available,
});
const item = (
  cmid: number,
  sectionKey: string,
  over: Partial<SnapshotItem> = {},
): SnapshotItem => ({
  cmid,
  name: `Archivo ${cmid}`,
  sectionKey,
  modname: 'resource',
  available: true,
  downloadable: true,
  ...over,
});
const snap = (sections: SnapshotSection[], items: SnapshotItem[]): CourseSnapshot => ({
  version: SNAPSHOT_VERSION,
  courseId: 1,
  takenAt: 0,
  sections,
  items,
});

describe('diffSnapshots', () => {
  it('finds new and newly available downloadable items, ignoring the rest', () => {
    const before = snap(
      [section(1), section(2, false)],
      [item(10, 'n:1'), item(11, 'n:1', { available: false }), item(12, 'n:1')],
    );
    const after = snap(
      [section(1), section(2)],
      [
        item(10, 'n:1', { name: 'renombrado' }),
        item(11, 'n:1'),
        item(13, 'n:1', { modname: 'forum', downloadable: false }),
        item(14, 'n:2'),
        item(15, 'n:2', { available: false }),
      ],
    );
    const diff = diffSnapshots(before, after);
    expect(diff.newItems.map((i) => i.cmid)).toEqual([11, 14]);
    expect(diff.sectionsNowAvailable.map((s) => s.key)).toEqual(['n:2']);
    expect(diffSnapshots(after, after)).toEqual({ newItems: [], sectionsNowAvailable: [] });
  });

  it('counts an opened section once when it brings nothing downloadable', () => {
    const before = snap([section(1), section(2, false), section(3, false)], []);
    const after = snap([section(1), section(2), section(3)], [item(20, 'n:2')]);
    const sections = after.sections;
    const novelties = noveltiesFrom(diffSnapshots(before, after), sections, 5);
    expect(novelties).toEqual([
      { kind: 'item', cmid: 20, name: 'Archivo 20', section: 'Semana 2', since: 5 },
      { kind: 'section', key: 'n:3', name: 'Semana 3', since: 5 },
    ]);
  });

  it('merges novelties without duplicates, keeping the first time seen', () => {
    const a = noveltiesFrom({ newItems: [item(1, 'x')], sectionsNowAvailable: [] }, [], 1);
    const b = noveltiesFrom(
      { newItems: [item(1, 'x'), item(2, 'x')], sectionsNowAvailable: [section(4)] },
      [],
      2,
    );
    const merged = mergeNovelties(a, b);
    expect(merged.map((n) => [n.kind, n.since])).toEqual([
      ['item', 1],
      ['item', 2],
      ['section', 2],
    ]);
  });
});
