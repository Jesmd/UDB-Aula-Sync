import type { ActivityKind } from '../types';
import { MODTYPE_CLASS } from '../selectors';

const KIND_BY_MODNAME: Readonly<Record<string, ActivityKind>> = {
  resource: 'file',
  folder: 'folder',
  url: 'url',
  assign: 'assign',
  forum: 'forum',
  label: 'label',
  page: 'page',
  quiz: 'quiz',
};

/** Modules that may lead to a downloadable file. Assignment intro files are optional (M2). */
const DOWNLOAD_CANDIDATES = new Set(['resource', 'folder']);

const MOD_URL = /\/mod\/([a-z0-9_]+)\/view\.php/;

/**
 * Module name from the modtype_* class, else from the /mod/<name>/view.php link.
 * Never from the icon.
 */
export function extractModname(className: string, href: string | null): string | null {
  const byClass = MODTYPE_CLASS.exec(className)?.[1];
  if (byClass !== undefined) return byClass;
  const byUrl = href === null ? undefined : MOD_URL.exec(href)?.[1];
  return byUrl ?? null;
}

export function classifyModule(modname: string): {
  readonly kind: ActivityKind;
  readonly downloadCandidate: boolean;
} {
  return {
    kind: KIND_BY_MODNAME[modname] ?? 'other',
    downloadCandidate: DOWNLOAD_CANDIDATES.has(modname),
  };
}
