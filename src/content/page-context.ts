import type { AppError } from '../shared/errors';
import type { Result } from '../shared/result';
import { parseCoursePage, type CoursePage } from '../moodle/course';

/**
 * Parsed view of the current page, computed lazily and cached until the DOM changes
 * (see observers.ts). M3/M4 read activities and sections from here.
 */
export class PageContext {
  #cached: Result<CoursePage, AppError> | undefined;

  constructor(
    private readonly doc: Document,
    private readonly url: () => string,
  ) {}

  get(): Result<CoursePage, AppError> {
    this.#cached ??= parseCoursePage(this.doc, this.url());
    return this.#cached;
  }

  invalidate(): void {
    this.#cached = undefined;
  }
}
