import { PATH_LIMITS } from '../../shared/constants';
import { appError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { codePointLength, truncateCodePoints } from '../text/unicode';
import { FALLBACK_SEGMENT } from '../text/sanitize-filename';

export interface PathLimits {
  readonly segment: number;
  readonly relativePath: number;
}

/** Shortest a folder may get while fitting the total length. */
const MIN_FOLDER = 8;

const totalLength = (segments: readonly string[]) =>
  segments.reduce((n, s) => n + codePointLength(s), 0) + Math.max(0, segments.length - 1);

/**
 * Shrinks folder segments (longest first) until the path fits. The file name is shrunk by
 * the caller (it must keep its extension and suffix), so it is passed separately.
 * Refuses unsafe segments instead of fixing them: they indicate a bug upstream.
 */
export function fitFolders(
  folders: readonly string[],
  fileName: string,
  limits: PathLimits = PATH_LIMITS,
): Result<string[], AppError> {
  for (const segment of [...folders, fileName]) {
    if (segment === '' || segment === '.' || segment === '..' || /[/\\]/.test(segment)) {
      return err(appError('unsafe_path', `bad segment "${segment}"`));
    }
  }
  const result = folders.map(
    (s) => truncateCodePoints(s, limits.segment).replace(/[. ]+$/, '') || FALLBACK_SEGMENT,
  );
  while (totalLength([...result, fileName]) > limits.relativePath) {
    let longest = -1;
    for (const [i, s] of result.entries()) {
      if (
        codePointLength(s) > MIN_FOLDER &&
        (longest === -1 || codePointLength(s) > codePointLength(result[longest] ?? ''))
      ) {
        longest = i;
      }
    }
    if (longest === -1) break;
    const current = result[longest] ?? '';
    const excess = totalLength([...result, fileName]) - limits.relativePath;
    const target = Math.max(MIN_FOLDER, codePointLength(current) - excess);
    result[longest] = truncateCodePoints(current, target).replace(/[. ]+$/, '') || FALLBACK_SEGMENT;
  }
  return ok(result);
}

/** Room left for the file name once folders are at their minimum. */
export function fileNameBudget(
  folders: readonly string[],
  limits: PathLimits = PATH_LIMITS,
): number {
  const minFolders = folders.reduce((n, s) => n + Math.min(codePointLength(s), MIN_FOLDER) + 1, 0);
  return Math.min(limits.segment, limits.relativePath - minFolders);
}

export function joinRelative(segments: readonly string[]): string {
  return segments.join('/');
}
