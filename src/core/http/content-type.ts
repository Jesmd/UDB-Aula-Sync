const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

/** Types that say nothing about the file; the extension must come from elsewhere. */
const GENERIC = new Set([
  'application/octet-stream',
  'application/force-download',
  'application/download',
  'binary/octet-stream',
  'application/x-download',
]);

export function mediaType(contentType: string | null): string | null {
  if (contentType === null) return null;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === '' ? null : type;
}

export function isGenericContentType(contentType: string | null): boolean {
  const type = mediaType(contentType);
  return type === null || GENERIC.has(type);
}

export function extensionFromContentType(contentType: string | null): string {
  const type = mediaType(contentType);
  return type === null ? '' : (EXTENSION_BY_TYPE[type] ?? '');
}

export function isHtml(contentType: string | null): boolean {
  const type = mediaType(contentType);
  return type === 'text/html' || type === 'application/xhtml+xml';
}
