/**
 * Files behind mod_resource / mod_folder activities. Tests mutate copies of these
 * (bump a revision, expire the session) through MockState.
 */
export type ResourceMode = 'redirect' | 'embed' | 'workaround' | 'readonly';
export type DispositionStyle = 'utf8-raw' | 'rfc5987' | 'none';

export interface SeedResource {
  readonly cmid: number;
  readonly mode: ResourceMode;
  readonly contextId: number;
  revision: number;
  readonly fileName: string;
  readonly contentType: string;
  size: number;
  lastModified: string;
  readonly disposition: DispositionStyle;
  /** False: HEAD answers 405 (H4 fallback). */
  readonly head: boolean;
  /** Answer 429 (Retry-After: 1) to the first N requests for the file. */
  rateLimit?: number;
}

export interface SeedFolderFile {
  readonly path: readonly string[];
  readonly name: string;
  readonly contentType: string;
  readonly size: number;
}

export interface SeedFolder {
  readonly cmid: number;
  readonly name: string;
  readonly contextId: number;
  readonly revision: number;
  readonly files: readonly SeedFolderFile[];
}

const DATE = 'Mon, 14 Sep 2026 15:00:00 GMT';

export const RESOURCES: readonly SeedResource[] = [
  // Course 101 (fixture onetopic-2level), rendered week.
  {
    cmid: 2102,
    mode: 'redirect',
    contextId: 5101,
    revision: 1,
    fileName: 'Presentación Semana 12.pptx',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    size: 245_760,
    lastModified: DATE,
    disposition: 'utf8-raw',
    head: true,
  },
  {
    cmid: 2103,
    mode: 'embed',
    contextId: 5102,
    revision: 3,
    fileName: 'Guía de ejercicios - TLC.pdf',
    contentType: 'application/pdf',
    size: 51_200,
    lastModified: DATE,
    disposition: 'rfc5987',
    head: true,
  },
  {
    cmid: 2104,
    mode: 'workaround',
    contextId: 5103,
    revision: 1,
    fileName: 'tabla_t.pdf',
    contentType: 'application/pdf',
    size: 12_000,
    lastModified: DATE,
    disposition: 'none',
    head: false,
  },
  // Course 102 (fixture onetopic-dimmed-tabs).
  {
    cmid: 3102,
    mode: 'redirect',
    contextId: 5201,
    revision: 2,
    fileName: 'Guia 1: Repaso.pdf',
    contentType: 'application/pdf',
    size: 80_000,
    lastModified: DATE,
    disposition: 'utf8-raw',
    head: true,
  },
  {
    cmid: 3103,
    mode: 'redirect',
    contextId: 5202,
    revision: 1,
    fileName: 'guia9.pdf',
    contentType: 'application/pdf',
    size: 10_000,
    lastModified: DATE,
    disposition: 'utf8-raw',
    head: true,
  },
  {
    cmid: 3104,
    mode: 'redirect',
    contextId: 5203,
    revision: 1,
    fileName: 'guia9.pdf',
    contentType: 'application/pdf',
    size: 11_000,
    lastModified: DATE,
    disposition: 'utf8-raw',
    head: true,
  },
  {
    cmid: 3106,
    mode: 'redirect',
    contextId: 5204,
    revision: 1,
    fileName: 'Simulación',
    contentType: 'application/octet-stream',
    size: 4_096,
    lastModified: DATE,
    disposition: 'none',
    head: true,
  },
  // Resolver edge cases.
  {
    cmid: 9001,
    mode: 'readonly',
    contextId: 5901,
    revision: 1,
    fileName: 'protegido.pdf',
    contentType: 'application/pdf',
    size: 1_000,
    lastModified: DATE,
    disposition: 'none',
    head: true,
  },
  {
    cmid: 9002,
    mode: 'redirect',
    contextId: 5902,
    revision: 1,
    fileName: 'lento.pdf',
    contentType: 'application/pdf',
    size: 1_000,
    lastModified: DATE,
    disposition: 'none',
    head: true,
    rateLimit: 1,
  },
];

export const FOLDERS: readonly SeedFolder[] = [
  {
    cmid: 2106,
    name: 'Material complementario',
    contextId: 5105,
    revision: 4,
    files: [
      { path: ['Unidad 1'], name: 'ejercicio 1.pdf', contentType: 'application/pdf', size: 3_000 },
      {
        path: ['Unidad 1', 'Resueltos'],
        name: 'solución: 1.pdf',
        contentType: 'application/pdf',
        size: 4_000,
      },
      {
        path: [],
        name: 'tabla.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 9_000,
      },
    ],
  },
];
