import { isSkippedSection } from '../core/planning/filters';
import { appError, type AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import { parseCoursePage } from './course';
import type { HtmlParser } from './html-parser';
import { folderViewUrl, parseFolderPage } from './modules/folder';
import { moodleRoot } from './adapters/sections';
import { checkResponse, type FetchLike } from './resolver/head-probe';
import { resolveFileUrl, resolveResource, type ResolvedFile } from './resolver/resolve-chain';
import type { Activity, CourseInfo, SectionRef } from './types';

export interface ScanDeps {
  /** Rate-limited, same-origin fetch (the content script's). */
  readonly fetch: FetchLike;
  readonly parseHtml: HtmlParser;
  readonly onProgress?: (progress: ScanProgress) => void;
  /** Stop early (the user closed the panel). */
  readonly signal?: AbortSignal;
}

export interface ScanProgress {
  readonly phase: 'sections' | 'files';
  readonly done: number;
  readonly total: number;
}

export interface ScanItem {
  readonly section: SectionRef;
  readonly activity: Activity;
}

export interface CourseScan {
  readonly course: CourseInfo;
  /** Every section found, in page order (groups expanded). */
  readonly sections: readonly SectionRef[];
  readonly items: readonly ScanItem[];
  /** Left out: not available (dimmed/restricted) or listed in skipSections. */
  readonly skipped: readonly SectionRef[];
}

export type ScanScope =
  { readonly kind: 'course' } | { readonly kind: 'sections'; readonly numbers: readonly number[] };

const MAX_SECTION_PAGES = 200;
const aborted = () => err(appError('cancelled', 'scan cancelled'));

/** Stable id of a section across pages and syncs. */
export const sectionKey = (s: SectionRef): string =>
  s.number === null ? `name:${s.parent ?? ''}/${s.name}` : `n:${s.number}`;

/**
 * Discovers the course's sections and activities (spec §5 steps 1-2). Single-page layouts
 * are already complete; Onetopic renders one tab per page, so each available section is
 * fetched once, and fetching a group tab reveals its children.
 */
export async function scanCourse(
  doc: Document,
  url: string,
  scope: ScanScope,
  skipSections: readonly string[],
  deps: ScanDeps,
): Promise<Result<CourseScan, AppError>> {
  const first = parseCoursePage(doc, url);
  if (!first.ok) return first;
  const { course } = first.value;

  const sections = new Map<string, SectionRef>();
  const items = new Map<number, ScanItem>();
  const fetched = new Set<string>();
  const addPage = (page: typeof first.value) => {
    for (const s of page.sections) {
      const key = sectionKey(s);
      const known = sections.get(key);
      // Prefer the entry that knows the section's content (rendered) or its link.
      if (
        known === undefined ||
        (s.rendered && !known.rendered) ||
        (known.url === null && s.url !== null)
      ) {
        sections.set(
          key,
          known === undefined ? s : { ...known, ...s, rendered: s.rendered || known.rendered },
        );
      }
    }
    for (const { section, items: acts } of page.activities) {
      for (const activity of acts)
        if (!items.has(activity.cmid)) items.set(activity.cmid, { section, activity });
      fetched.add(sectionKey(section));
    }
  };
  addPage(first.value);

  const wanted = (s: SectionRef) =>
    s.available &&
    !isSkippedSection(s.name, skipSections) &&
    !(s.parent !== null && isSkippedSection(s.parent, skipSections)) &&
    (scope.kind === 'course' || (s.number !== null && scope.numbers.includes(s.number)));

  let pages = 0;
  for (;;) {
    if (deps.signal?.aborted === true) return aborted();
    const pending = [...sections.values()].filter(
      (s) => wanted(s) && s.url !== null && !fetched.has(sectionKey(s)),
    );
    const next = pending[0];
    if (next?.url == null || pages >= MAX_SECTION_PAGES) break;
    fetched.add(sectionKey(next));
    pages += 1;
    deps.onProgress?.({ phase: 'sections', done: pages, total: pages + pending.length - 1 });
    let response: Response;
    try {
      response = await deps.fetch(next.url, { credentials: 'include', cache: 'no-store' });
    } catch (cause) {
      return err(appError('network', cause instanceof Error ? cause.message : String(cause)));
    }
    const checked = checkResponse(response);
    if (!checked.ok) return checked;
    const page = parseCoursePage(deps.parseHtml(await response.text()), response.url);
    if (!page.ok) return page;
    if (page.value.course.id !== course.id) continue;
    addPage(page.value);
  }

  const all = [...sections.values()];
  const keep = new Set(all.filter(wanted).map(sectionKey));
  return ok({
    course,
    sections: all,
    items: [...items.values()].filter((i) => keep.has(sectionKey(i.section))),
    skipped: all.filter(
      (s) =>
        !keep.has(sectionKey(s)) &&
        (scope.kind === 'course' || (s.number !== null && scope.numbers.includes(s.number))),
    ),
  });
}

/** One downloadable file found for an activity (a resource, or one file of a folder). */
export interface FoundFile {
  readonly item: ScanItem;
  readonly file: ResolvedFile;
  /** Subfolders inside a mod_folder; null for a resource. */
  readonly folderPath: readonly string[] | null;
}

export interface ResolveOutcome {
  readonly files: readonly FoundFile[];
  /** Activities without a real file (viewer only). */
  readonly readOnly: readonly ScanItem[];
  readonly failed: readonly { readonly item: ScanItem; readonly error: AppError }[];
}

/**
 * Resolves the downloadable activities (spec §5 step 3). A lost session stops everything
 * (no more requests, spec §2); other errors are recorded per activity.
 */
export async function resolveItems(
  items: readonly ScanItem[],
  pageUrl: string,
  deps: ScanDeps,
): Promise<Result<ResolveOutcome, AppError>> {
  const root = moodleRoot(pageUrl);
  const files: FoundFile[] = [];
  const readOnly: ScanItem[] = [];
  const failed: { item: ScanItem; error: AppError }[] = [];
  const candidates = items.filter((i) => i.activity.downloadCandidate && i.activity.available);

  for (const [index, item] of candidates.entries()) {
    if (deps.signal?.aborted === true) return aborted();
    deps.onProgress?.({ phase: 'files', done: index, total: candidates.length });
    if (item.activity.modname === 'folder') {
      const folder = await resolveFolder(item, root, deps);
      if (!folder.ok) {
        if (folder.error.code === 'session_expired') return folder;
        failed.push({ item, error: folder.error });
        continue;
      }
      files.push(...folder.value);
      continue;
    }
    const resolved = await resolveResource(item.activity.cmid, {
      fetch: deps.fetch,
      parseHtml: deps.parseHtml,
      moodleRoot: root,
    });
    if (!resolved.ok) {
      if (resolved.error.code === 'session_expired') return resolved;
      failed.push({ item, error: resolved.error });
    } else if (resolved.value.kind === 'readonly') {
      readOnly.push(item);
    } else {
      files.push({ item, file: resolved.value.file, folderPath: null });
    }
  }
  deps.onProgress?.({ phase: 'files', done: candidates.length, total: candidates.length });
  return ok({ files, readOnly, failed });
}

async function resolveFolder(
  item: ScanItem,
  root: string,
  deps: ScanDeps,
): Promise<Result<FoundFile[], AppError>> {
  let response: Response;
  try {
    response = await deps.fetch(folderViewUrl(root, item.activity.cmid), {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch (cause) {
    return err(appError('network', cause instanceof Error ? cause.message : String(cause)));
  }
  const checked = checkResponse(response);
  if (!checked.ok) return checked;
  const found: FoundFile[] = [];
  for (const entry of parseFolderPage(deps.parseHtml(await response.text()), response.url)) {
    const resolved = await resolveFileUrl(entry.url, deps);
    if (!resolved.ok) return resolved;
    if (resolved.value.kind === 'file')
      found.push({ item, file: resolved.value.file, folderPath: entry.folderPath });
  }
  return ok(found);
}
