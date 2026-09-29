import type { ServerResponse } from 'node:http';
import type { DispositionStyle, SeedResource } from '../seeds/files';
import { BASE, escapeHtml, page, redirect, sendHtml, type MockState, type Route } from './types';

const enc = (segment: string) => encodeURIComponent(segment);

export function resourceFileUrl(r: SeedResource): string {
  return `${BASE}/pluginfile.php/${r.contextId}/mod_resource/content/${r.revision}/${enc(r.fileName)}`;
}

function disposition(style: DispositionStyle, name: string): string | undefined {
  if (style === 'none') return undefined;
  if (style === 'rfc5987') return `inline; filename="file"; filename*=UTF-8''${enc(name)}`;
  // What Moodle does: raw UTF-8 bytes in a quoted string (arrives as Latin-1 in JS).
  return `inline; filename="${Buffer.from(name, 'utf8').toString('latin1')}"`;
}

function sendFile(
  res: ServerResponse,
  method: string,
  file: {
    name: string;
    contentType: string;
    size: number;
    lastModified: string;
    etag: string;
    style: DispositionStyle;
  },
): void {
  const headers: Record<string, string | number> = {
    'content-type': file.contentType,
    'content-length': file.size,
    'last-modified': file.lastModified,
    etag: file.etag,
  };
  const cd = disposition(file.style, file.name);
  if (cd !== undefined) headers['content-disposition'] = cd;
  res.writeHead(200, headers);
  res.end(method === 'HEAD' ? undefined : Buffer.alloc(file.size, 0x25));
}

function resourcePage(r: SeedResource): string {
  const url = resourceFileUrl(r);
  const name = escapeHtml(r.fileName);
  if (r.mode === 'embed') {
    return `<div class="resourcecontent resourcepdf"><object id="resourceobject" data="${url}" type="${r.contentType}"><param name="src" value="${url}">Haga clic en el enlace <a href="${url}">${name}</a> para ver el archivo.</object></div>`;
  }
  if (r.mode === 'workaround') {
    return `<div class="resourceworkaround">Haga clic en el enlace <a href="${url}?forcedownload=1">${name}</a> para ver el archivo.</div>`;
  }
  return `<iframe src="${BASE}/local/viewer/view.php?id=${r.cmid}" title="Visor"></iframe>`;
}

function consumeRateLimit(res: ServerResponse, r: { rateLimit?: number }): boolean {
  if ((r.rateLimit ?? 0) <= 0) return false;
  r.rateLimit = (r.rateLimit ?? 0) - 1;
  res.writeHead(429, { 'retry-after': '1', 'content-type': 'text/plain' });
  res.end('Too Many Requests');
  return true;
}

function findFolderFile(state: MockState, contextId: number, parts: string[]) {
  for (const folder of state.folders.values()) {
    if (folder.contextId !== contextId) continue;
    const file = folder.files.find((f) => [...f.path, f.name].join('/') === parts.join('/'));
    if (file !== undefined) return { folder, file };
  }
  return undefined;
}

export const fileRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: /^\/auladigital\/mod\/resource\/view\.php$/,
    handle: (_req, res, url, state) => {
      const r = state.resources.get(Number(url.searchParams.get('id')));
      if (r === undefined) {
        sendHtml(res, page('Error', 'page-mod-resource-view', '<p>No existe</p>'), 404);
        return;
      }
      if (r.mode === 'redirect' && url.searchParams.get('redirect') === '1') {
        redirect(res, resourceFileUrl(r));
        return;
      }
      sendHtml(res, page(r.fileName, 'page-mod-resource-view', resourcePage(r)));
    },
  },
  {
    method: 'ANY',
    path: /^\/auladigital\/pluginfile\.php\/(\d+)\/mod_resource\/content\/(\d+)\/(.+)$/,
    handle: (req, res, _url, state, match) => {
      const r = [...state.resources.values()].find((x) => x.contextId === Number(match[1]));
      if (r === undefined) {
        res.writeHead(404).end();
        return;
      }
      if (consumeRateLimit(res, r)) return;
      if (req.method === 'HEAD' && !r.head) {
        res.writeHead(405, { allow: 'GET' }).end();
        return;
      }
      // Like Moodle, the revision in the URL is ignored: the current file is served.
      sendFile(res, req.method ?? 'GET', {
        name: r.fileName,
        contentType: r.contentType,
        size: r.size,
        lastModified: r.lastModified,
        etag: `"${r.contextId}-${r.revision}-${r.size}"`,
        style: r.disposition,
      });
    },
  },
  {
    method: 'GET',
    path: /^\/auladigital\/mod\/folder\/view\.php$/,
    handle: (_req, res, url, state) => {
      const folder = state.folders.get(Number(url.searchParams.get('id')));
      if (folder === undefined) {
        sendHtml(res, page('Error', 'page-mod-folder-view', '<p>No existe</p>'), 404);
        return;
      }
      const items = folder.files
        .map((f) => {
          const href = `${BASE}/pluginfile.php/${folder.contextId}/mod_folder/content/${folder.revision}/${[...f.path, f.name].map(enc).join('/')}?forcedownload=1`;
          return `<li><span class="fp-filename-icon"><a href="${href}"><span class="fp-filename">${escapeHtml(f.name)}</span></a></span></li>`;
        })
        .join('');
      sendHtml(
        res,
        page(
          folder.name,
          'page-mod-folder-view',
          `<div id="folder_tree0" class="filemanager"><ul>${items}</ul></div>`,
        ),
      );
    },
  },
  {
    method: 'ANY',
    path: /^\/auladigital\/pluginfile\.php\/(\d+)\/mod_folder\/content\/(\d+)\/(.+)$/,
    handle: (req, res, _url, state, match) => {
      const parts = (match[3] ?? '').split('/').map(decodeURIComponent);
      const found = findFolderFile(state, Number(match[1]), parts);
      if (found === undefined) {
        res.writeHead(404).end();
        return;
      }
      sendFile(res, req.method ?? 'GET', {
        name: found.file.name,
        contentType: found.file.contentType,
        size: found.file.size,
        lastModified: 'Mon, 14 Sep 2026 15:00:00 GMT',
        etag: `"${found.folder.contextId}-${found.file.size}"`,
        style: 'utf8-raw',
      });
    },
  },
];
