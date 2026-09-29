import type { AppError } from '../shared/errors';
import type { CoursePage } from './course';
import { parseCoursePage } from './course';
import { detectLayout, type LayoutDetection } from './detect-layout';
import { sanitizeDocument, sanitizeUrl } from './sanitize';

export const DIAGNOSTIC_VERSION = 1;

export interface DiagnosticReport {
  readonly kind: 'udbsync-diagnostic';
  readonly version: typeof DIAGNOSTIC_VERSION;
  readonly generatedAt: string;
  readonly extensionVersion: string;
  /** Page URL with identifying parameters removed. */
  readonly page: string;
  readonly detection: LayoutDetection;
  readonly parsed: CoursePage | { readonly error: AppError };
  readonly sanitized: { readonly removedPersonal: number; readonly elements: number };
  /** Structure-only HTML, ready for scripts/sanitize-fixture.ts. */
  readonly html: string;
}

export function buildDiagnosticReport(
  doc: Document,
  url: string,
  extensionVersion: string,
  now: Date = new Date(),
): DiagnosticReport {
  const parsed = parseCoursePage(doc, url);
  const { html, removedPersonal, elements } = sanitizeDocument(doc, url);
  return {
    kind: 'udbsync-diagnostic',
    version: DIAGNOSTIC_VERSION,
    generatedAt: now.toISOString(),
    extensionVersion,
    page: sanitizeUrl(url, url),
    detection: detectLayout(doc),
    parsed: parsed.ok ? parsed.value : { error: parsed.error },
    sanitized: { removedPersonal, elements },
    html,
  };
}
