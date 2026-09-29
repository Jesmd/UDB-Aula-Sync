import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkManifest } from '../../scripts/check-manifest';

const valid = {
  manifest_version: 3,
  permissions: ['downloads', 'storage'],
  host_permissions: ['https://www.udbvirtual.edu.sv/auladigital/*'],
  content_scripts: [{ matches: ['https://www.udbvirtual.edu.sv/auladigital/*'] }],
  web_accessible_resources: [{ matches: ['https://www.udbvirtual.edu.sv/*'] }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};

describe('checkManifest', () => {
  it('accepts the allowed set', () => {
    expect(checkManifest(valid)).toEqual([]);
  });

  it('flags every widening', () => {
    expect(
      checkManifest({
        manifest_version: 2,
        permissions: ['downloads', 'tabs'],
        optional_permissions: ['history'],
        host_permissions: ['<all_urls>'],
        optional_host_permissions: ['https://*/*'],
        content_scripts: [{ matches: ['https://evil.test/*'] }],
        web_accessible_resources: [{ matches: ['<all_urls>'] }],
        externally_connectable: { matches: ['https://evil.test/*'] },
        content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" },
      }),
    ).toEqual([
      'manifest_version must be 3',
      'permission not allowed: tabs',
      'optional_permissions not allowed',
      'optional_host_permissions not allowed',
      'host permission not allowed: <all_urls>',
      'content script match not allowed: https://evil.test/*',
      'web_accessible_resources match not allowed: <all_urls>',
      'externally_connectable not allowed',
      `CSP missing "object-src 'self'"`,
      'CSP allows remote or inline code',
    ]);
  });
});

describe('check-manifest CLI', () => {
  // One real process run; spawning tsx takes seconds on CI runners.
  it('exits 1 with the problem list', { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'udbsync-manifest-'));
    const file = join(dir, 'manifest.json');
    writeFileSync(file, JSON.stringify({ ...valid, permissions: ['tabs'] }));
    try {
      execFileSync('pnpm', ['exec', 'tsx', 'scripts/check-manifest.ts', file], { stdio: 'pipe' });
      expect.unreachable('should exit with 1');
    } catch (error) {
      const e = error as { status: number; stderr: Buffer };
      expect(e.status).toBe(1);
      expect(e.stderr.toString()).toContain('permission not allowed: tabs');
    }
  });
});
