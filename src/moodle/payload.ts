import { numberWidth } from '../core/text/pad-numbers';
import type { DownloadPayload } from '../shared/messages';
import type { CourseScan, FoundFile } from './scan';

/** Message fields for one found file, with its section in the scanned course. */
export function payloadFor(scan: CourseScan, found: FoundFile, open = false): DownloadPayload {
  const position = scan.sections.indexOf(found.item.section) + 1;
  return {
    target: 'background',
    courseId: scan.course.id,
    cmid: found.item.activity.cmid,
    course: { fullName: scan.course.fullName, shortName: scan.course.shortName },
    section: {
      name: found.item.section.name,
      parent: found.item.section.parent,
      position: Math.max(1, position),
      numberWidth: Math.min(4, numberWidth(scan.sections.map((s) => s.name))),
    },
    activityName: found.item.activity.name,
    file: {
      url: found.file.url,
      fileKey: found.file.ref.fileKey,
      path: found.file.ref.path,
      revision: found.file.ref.revision,
      originalName: found.file.originalName,
      extension: found.file.extension,
      size: found.file.size,
      lastModified: found.file.lastModified,
      etag: found.file.etag,
      contentType: found.file.contentType,
    },
    folderPath: found.folderPath === null ? null : [...found.folderPath],
    open,
  };
}
