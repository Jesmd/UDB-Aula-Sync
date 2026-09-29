export interface ContentDisposition {
  readonly type: string;
  readonly filename: string | null;
}

/** Splits parameters on ";" outside quoted strings. */
function splitParams(header: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header.charAt(i);
    if (ch === '\\' && quoted) {
      current += ch + header.charAt(i + 1);
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (ch === ';' && !quoted) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return v;
}

function decodeBytes(bytes: Uint8Array, charset: string): string | null {
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** RFC 5987 ext-value: charset'lang'pct-encoded. */
function decodeExtValue(value: string): string | null {
  const match = /^([\w!#$%&+^`{}~-]+)'[\w-]*'(.*)$/.exec(value.trim());
  if (match === null) return null;
  const charset = (match[1] ?? '').toLowerCase();
  const encoded = match[2] ?? '';
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded.charAt(i);
    if (ch === '%' && /^[0-9a-f]{2}$/i.test(encoded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = ch.charCodeAt(0);
      if (code > 0x7f) return null;
      bytes.push(code);
    }
  }
  return decodeBytes(new Uint8Array(bytes), charset === 'iso-8859-1' ? 'latin1' : charset);
}

/**
 * Header values reach JS as Latin-1 "byte strings". Moodle sends raw UTF-8 in filename=,
 * which then reads "GuÃ­a". Re-decode when the bytes form valid UTF-8.
 */
export function repairLatin1Utf8(text: string): string {
  // eslint-disable-next-line no-control-regex -- Latin-1 range check, not a control match.
  if (!/[\u0080-\u00ff]/.test(text) || /[^\u0000-\u00ff]/.test(text)) return text;
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  return decodeBytes(bytes, 'utf-8') ?? text;
}

/** Some servers percent-encode inside filename="..."; decode only if it is clean UTF-8. */
function maybePercentDecoded(text: string): string {
  if (!/%[0-9a-f]{2}/i.test(text)) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Parses Content-Disposition; filename* (RFC 6266/5987) wins over filename. */
export function parseContentDisposition(header: string | null): ContentDisposition | null {
  if (header === null || header.trim() === '') return null;
  const [typePart, ...params] = splitParams(header);
  const type = (typePart ?? '').toLowerCase();
  if (type === '' || type.includes('=')) return null;

  let plain: string | null = null;
  let extended: string | null = null;
  for (const param of params) {
    const eq = param.indexOf('=');
    if (eq === -1) continue;
    const name = param.slice(0, eq).trim().toLowerCase();
    const value = param.slice(eq + 1);
    if (name === 'filename*') extended = decodeExtValue(unquote(value));
    else if (name === 'filename') plain = maybePercentDecoded(repairLatin1Utf8(unquote(value)));
  }
  const filename = extended ?? plain;
  // Keep only the last path component: a header must never choose a folder.
  const safe = filename === null ? null : (filename.split(/[/\\]/).pop() ?? '').trim();
  return { type, filename: safe === '' ? null : safe };
}
