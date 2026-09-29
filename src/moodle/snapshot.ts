import { SNAPSHOT_VERSION, type CourseSnapshot } from '../core/planning/snapshot-diff';
import { sectionKey, type CourseScan } from './scan';

/** What to remember of a full course scan: ids, names and availability only. */
export function snapshotFromScan(scan: CourseScan, takenAt: number): CourseSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    courseId: scan.course.id,
    takenAt,
    sections: scan.sections.map((s) => ({
      key: sectionKey(s),
      name: s.name,
      parent: s.parent,
      available: s.available,
    })),
    items: scan.items.map(({ section, activity }) => ({
      cmid: activity.cmid,
      name: activity.name,
      sectionKey: sectionKey(section),
      modname: activity.modname,
      available: activity.available,
      downloadable: activity.downloadCandidate,
    })),
  };
}
