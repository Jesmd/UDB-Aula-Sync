import {
  extensionFromContentType,
  isGenericContentType,
  isHtml,
} from '../../core/http/content-type';
import {
  canonicalFileUrl,
  parsePluginfileUrl,
  type PluginfileRef,
} from '../../core/http/pluginfile-url';
import { splitExtension } from '../../core/text/sanitize-filename';
import { appError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { HtmlParser } from '../html-parser';
import { resourceViewUrl } from '../modules/resource';
import {
  checkResponse,
  probeFromResponse,
  probeHeaders,
  type FetchLike,
  type HeaderProbe,
} from './head-probe';
import { findResourceFileUrl } from './embed-parser';

export interface ResolveDeps {
  readonly fetch: FetchLike;
  readonly parseHtml: HtmlParser;
  /** Moodle wwwroot, e.g. https://www.udbvirtual.edu.sv/auladigital/ */
  readonly moodleRoot: string;
}

/** A downloadable file and what its headers say. */
export interface ResolvedFile {
  readonly url: string;
  readonly ref: PluginfileRef;
  /** From Content-Disposition, else the URL. */
  readonly originalName: string;
  /** From the name, else Content-Type; '' when unknown. Never from the icon. */
  readonly extension: string;
  readonly contentType: string | null;
  readonly size: number | null;
  readonly lastModified: string | null;
  readonly etag: string | null;
  /** How it was found: H1 redirect, embedded/linked in the view page, or a direct link. */
  readonly via: 'redirect' | 'embed' | 'direct';
}

export type Resolution =
  | { readonly kind: 'file'; readonly file: ResolvedFile }
  /** No real file URL exists (viewer only): status "solo_lectura", nothing else is tried. */
  | { readonly kind: 'readonly' };

export function fileFromProbe(probe: HeaderProbe, via: ResolvedFile['via']): ResolvedFile | null {
  const ref = parsePluginfileUrl(probe.finalUrl);
  if (ref === null) return null;
  const originalName = probe.disposition?.filename ?? ref.filename;
  const fromName = splitExtension(originalName).extension || splitExtension(ref.filename).extension;
  const extension =
    fromName !== ''
      ? fromName
      : isGenericContentType(probe.contentType)
        ? ''
        : extensionFromContentType(probe.contentType);
  return {
    url: canonicalFileUrl(probe.finalUrl),
    ref,
    originalName,
    extension,
    contentType: probe.contentType,
    size: probe.contentLength,
    lastModified: probe.lastModified,
    etag: probe.etag,
    via,
  };
}

/** Probes a pluginfile URL found on a page. */
export async function resolveFileUrl(
  url: string,
  deps: Pick<ResolveDeps, 'fetch'>,
  via: ResolvedFile['via'] = 'direct',
): Promise<Result<Resolution, AppError>> {
  const probe = await probeHeaders(url, deps.fetch);
  if (!probe.ok) return probe;
  const file = fileFromProbe(probe.value, via);
  return file === null ? ok({ kind: 'readonly' }) : ok({ kind: 'file', file });
}

/**
 * mod_resource: view.php?id=X&redirect=1 (H1). One GET; if it lands on pluginfile.php the
 * headers are the probe and the body is cancelled. Otherwise the view page is parsed for
 * an embedded or linked file; none means read-only.
 */
export async function resolveResource(
  cmid: number,
  deps: ResolveDeps,
): Promise<Result<Resolution, AppError>> {
  let response: Response;
  try {
    response = await deps.fetch(resourceViewUrl(deps.moodleRoot, cmid, true), {
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (cause) {
    return err(appError('network', cause instanceof Error ? cause.message : String(cause)));
  }

  if (parsePluginfileUrl(response.url) !== null) {
    const probe = await probeFromResponse(response, 'GET');
    if (!probe.ok) return probe;
    const file = fileFromProbe(probe.value, 'redirect');
    return file === null ? ok({ kind: 'readonly' }) : ok({ kind: 'file', file });
  }

  const checked = checkResponse(response);
  if (!checked.ok) {
    await response.body?.cancel().catch(() => undefined);
    return checked;
  }
  if (!isHtml(response.headers.get('content-type'))) {
    await response.body?.cancel().catch(() => undefined);
    return ok({ kind: 'readonly' });
  }
  const page = deps.parseHtml(await response.text());
  const embedded = findResourceFileUrl(page, response.url);
  return embedded === null ? ok({ kind: 'readonly' }) : resolveFileUrl(embedded, deps, 'embed');
}
