import { describe, expect, it, vi } from 'vitest';
import { isLoginUrl, probeSession } from '../../../src/moodle/session';

const BASE = 'https://www.udbvirtual.edu.sv/auladigital';

function fakeResponse(url: string, status = 200, redirected = false): Response {
  const response = new Response('<html>secret body</html>', { status });
  Object.defineProperties(response, {
    url: { value: url },
    redirected: { value: redirected },
  });
  return response;
}

describe('isLoginUrl', () => {
  it('detects the Moodle login page', () => {
    expect(isLoginUrl(`${BASE}/login/index.php`)).toBe(true);
    expect(isLoginUrl(`${BASE}/login/index.php?loginredirect=1`)).toBe(true);
    expect(isLoginUrl(`${BASE}/my/`)).toBe(false);
    expect(isLoginUrl(`${BASE}/course/view.php?id=1&x=/login/index.php`)).toBe(false);
    expect(isLoginUrl('not a url')).toBe(false);
  });
});

describe('probeSession', () => {
  it('reports a live session without reading the body', async () => {
    const response = fakeResponse(`${BASE}/my/`);
    const cancel = vi.spyOn(response.body as ReadableStream, 'cancel');
    const fetchImpl = vi.fn(() => Promise.resolve(response));
    const probe = await probeSession(`${BASE}/my/`, fetchImpl);
    expect(probe).toEqual({
      status: 200,
      finalUrl: `${BASE}/my/`,
      redirected: false,
      sessionSent: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/my/`, {
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('reports a missing session when redirected to login', async () => {
    const fetchImpl = () => Promise.resolve(fakeResponse(`${BASE}/login/index.php`, 200, true));
    const probe = await probeSession(`${BASE}/my/`, fetchImpl);
    expect(probe.sessionSent).toBe(false);
    expect(probe.redirected).toBe(true);
  });
});

describe('isLoginDocument', () => {
  it('detects the login page by body id or form', async () => {
    const { JSDOM } = await import('jsdom');
    const { isLoginDocument } = await import('../../../src/moodle/session');
    const doc = (html: string) => new JSDOM(html).window.document;
    expect(isLoginDocument(doc('<body id="page-login-index"></body>'))).toBe(true);
    expect(
      isLoginDocument(
        doc(
          '<body><form id="login"><input name="username"><input name="password" type="password"></form></body>',
        ),
      ),
    ).toBe(true);
    expect(isLoginDocument(doc('<body><form id="login"><input name="q"></form></body>'))).toBe(
      false,
    );
    expect(isLoginDocument(doc('<body class="format-topics"></body>'))).toBe(false);
  });
});
