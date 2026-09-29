import { describe, expect, it } from 'vitest';
import {
  parseContentDisposition,
  repairLatin1Utf8,
} from '../../../../src/core/http/content-disposition';
import {
  extensionFromContentType,
  isGenericContentType,
  isHtml,
  mediaType,
} from '../../../../src/core/http/content-type';
import {
  canonicalFileUrl,
  isPluginfileUrl,
  parsePluginfileUrl,
} from '../../../../src/core/http/pluginfile-url';

/** How a UTF-8 header value arrives in JS (Latin-1 byte string). */
const asByteString = (text: string) => String.fromCharCode(...new TextEncoder().encode(text));

describe('parseContentDisposition', () => {
  it('reads plain and quoted file names', () => {
    expect(parseContentDisposition('attachment; filename=guia.pdf')).toEqual({
      type: 'attachment',
      filename: 'guia.pdf',
    });
    expect(parseContentDisposition('inline; filename="Guia 1; final.pdf"')).toEqual({
      type: 'inline',
      filename: 'Guia 1; final.pdf',
    });
    expect(parseContentDisposition('inline; filename="a \\"b\\".pdf"')?.filename).toBe('a "b".pdf');
  });

  it('prefers filename* (UTF-8 and ISO-8859-1)', () => {
    expect(
      parseContentDisposition(
        `attachment; filename="Gua.pdf"; filename*=UTF-8''Gu%C3%ADa%20%239.pdf`,
      )?.filename,
    ).toBe('Guía #9.pdf');
    expect(
      parseContentDisposition(`attachment; filename*=iso-8859-1'es'Gu%EDa.pdf`)?.filename,
    ).toBe('Guía.pdf');
    expect(parseContentDisposition(`attachment; filename*="UTF-8''Tabla.pdf"`)?.filename).toBe(
      'Tabla.pdf',
    );
  });

  it('repairs raw UTF-8 sent in filename= (Moodle does this)', () => {
    expect(
      parseContentDisposition(asByteString('inline; filename="Topología_Jerárquica_Guía2.pdf"'))
        ?.filename,
    ).toBe('Topología_Jerárquica_Guía2.pdf');
    expect(repairLatin1Utf8('café')).toBe('café');
    expect(repairLatin1Utf8('plain')).toBe('plain');
    expect(repairLatin1Utf8('ya bien ñ ✓')).toBe('ya bien ñ ✓');
  });

  it('decodes percent-encoded names and ignores broken encodings', () => {
    expect(parseContentDisposition('inline; filename="Gu%C3%ADa.pdf"')?.filename).toBe('Guía.pdf');
    expect(parseContentDisposition('inline; filename="100%.pdf"')?.filename).toBe('100%.pdf');
    expect(
      parseContentDisposition(`attachment; filename*=UTF-8''%FF%FE.pdf; filename="ok.pdf"`)
        ?.filename,
    ).toBe('ok.pdf');
    expect(parseContentDisposition(`attachment; filename*=UTF-8''ñ.pdf`)?.filename).toBeNull();
    expect(parseContentDisposition(`attachment; filename*=bad`)?.filename).toBeNull();
  });

  it('never lets the header pick a folder', () => {
    expect(parseContentDisposition('attachment; filename="../../x/evil.pdf"')?.filename).toBe(
      'evil.pdf',
    );
    expect(parseContentDisposition('attachment; filename=C:\\x\\evil.pdf')?.filename).toBe(
      'evil.pdf',
    );
    // Inside quotes a backslash escapes the next character (RFC 7230): no separator survives.
    expect(parseContentDisposition('attachment; filename="C:\\x\\evil.pdf"')?.filename).toBe(
      'C:xevil.pdf',
    );
    expect(parseContentDisposition('attachment; filename="dir/"')?.filename).toBeNull();
  });

  it('handles empty or malformed headers', () => {
    expect(parseContentDisposition(null)).toBeNull();
    expect(parseContentDisposition('  ')).toBeNull();
    expect(parseContentDisposition('filename=x.pdf')).toBeNull();
    expect(parseContentDisposition('inline')).toEqual({ type: 'inline', filename: null });
    expect(parseContentDisposition('inline; novalue; filename=')).toEqual({
      type: 'inline',
      filename: null,
    });
  });
});

describe('content type', () => {
  it('maps known types and flags generic ones', () => {
    expect(extensionFromContentType('application/pdf; charset=binary')).toBe('pdf');
    expect(
      extensionFromContentType(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    ).toBe('pptx');
    expect(extensionFromContentType('application/x-weird')).toBe('');
    expect(extensionFromContentType(null)).toBe('');
    expect(isGenericContentType('application/octet-stream')).toBe(true);
    expect(isGenericContentType(null)).toBe(true);
    expect(isGenericContentType('application/pdf')).toBe(false);
    expect(isHtml('text/html; charset=utf-8')).toBe(true);
    expect(isHtml('application/pdf')).toBe(false);
    expect(mediaType(' ; x')).toBeNull();
  });
});

describe('pluginfile URLs', () => {
  const ROOT = 'https://www.udbvirtual.edu.sv/auladigital';

  it('parses mod_resource with revision (H2 shape)', () => {
    const ref = parsePluginfileUrl(
      `${ROOT}/pluginfile.php/2556700/mod_resource/content/3/Gu%C3%ADa%20%239.pdf?forcedownload=1`,
    );
    expect(ref).toEqual({
      contextId: 2556700,
      component: 'mod_resource',
      filearea: 'content',
      revision: 3,
      filepath: [],
      filename: 'Guía #9.pdf',
      fileKey: 'mod_resource/content/Guía #9.pdf',
      path: '/pluginfile.php/2556700/mod_resource/content/3/Gu%C3%ADa%20%239.pdf',
    });
  });

  it('parses mod_folder subfolders (H6 shape)', () => {
    const ref = parsePluginfileUrl(
      `${ROOT}/pluginfile.php/10/mod_folder/content/0/Unidad%201/Resueltos/ej1.pdf`,
    );
    expect(ref).toMatchObject({
      revision: 0,
      filepath: ['Unidad 1', 'Resueltos'],
      filename: 'ej1.pdf',
    });
  });

  it('keeps item ids of other areas in the path and supports ?file=', () => {
    expect(parsePluginfileUrl(`${ROOT}/pluginfile.php/5/mod_assign/intro/att.pdf`)).toMatchObject({
      revision: null,
      filepath: [],
      filename: 'att.pdf',
    });
    expect(
      parsePluginfileUrl(`${ROOT}/pluginfile.php?file=/5/mod_resource/content/2/a.pdf`),
    ).toMatchObject({ revision: 2, filename: 'a.pdf' });
  });

  it('rejects non-file URLs and traversal', () => {
    for (const bad of [
      `${ROOT}/mod/resource/view.php?id=1`,
      'nope',
      `${ROOT}/pluginfile.php/x/mod_resource/content/1/a.pdf`,
      `${ROOT}/pluginfile.php/5/mod_resource`,
      `${ROOT}/pluginfile.php/5/mod_resource/content/1/..%2Fa.pdf`,
      `${ROOT}/pluginfile.php/5/mod_resource/content/1/a%5Cb.pdf`,
      `${ROOT}/pluginfile.php/5/mod_resource/content/1/%E0%A4%A.pdf`,
      `${ROOT}/pluginfile.php/5/mod_resource/content/1`,
    ]) {
      expect(isPluginfileUrl(bad), bad).toBe(false);
    }
  });

  it('canonicalizes download URLs', () => {
    expect(
      canonicalFileUrl(
        `${ROOT}/pluginfile.php/5/mod_resource/content/1/a.pdf?forcedownload=1#page=2`,
      ),
    ).toBe(`${ROOT}/pluginfile.php/5/mod_resource/content/1/a.pdf`);
  });
});
