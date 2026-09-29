export const UDB_ORIGIN = 'https://www.udbvirtual.edu.sv';
export const MOODLE_BASE_PATH = '/auladigital/';
export const MOODLE_ROOT_URL = `${UDB_ORIGIN}${MOODLE_BASE_PATH}`;

/** Prefix for every DOM id, class and custom element the extension injects. */
export const UI_PREFIX = 'udbsync-';

export const RATE_LIMIT = {
  maxConcurrent: 2,
  minDelayMs: 300,
  maxDelayMs: 800,
} as const;

export const HOVER_DELAY_MS = 400;
export const PROBE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const CONFIRM_THRESHOLD = {
  files: 100,
  bytes: 200 * 1024 * 1024,
} as const;

export const SYNC_INTERVAL_HOURS = { default: 6, min: 1 } as const;

export const PATH_LIMITS = {
  segment: 120,
  relativePath: 180,
} as const;

/** Only these extensions may be opened automatically after download. */
export const OPEN_ALLOWLIST: readonly string[] = [
  'pdf',
  'ppt',
  'pptx',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'txt',
  'csv',
  'png',
  'jpg',
  'jpeg',
];

export const LOG_RING_SIZE = 500;
