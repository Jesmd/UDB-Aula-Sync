import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const run = (manifest: object): { code: number; output: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'udbsync-manifest-'));
  const file = join(dir, 'manifest.json');
  writeFileSync(file, JSON.stringify(manifest));
  try {
    const output = execFileSync('pnpm', ['exec', 'tsx', 'scripts/check-manifest.ts', file], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, output };
  } catch (error) {
    const e = error as { status: number; stderr: string };
    return { code: e.status, output: e.stderr };
  }
};

const valid = {
  manifest_version: 3,
  permissions: ['downloads', 'storage'],
  host_permissions: ['https://www.udbvirtual.edu.sv/auladigital/*'],
  content_scripts: [{ matches: ['https://www.udbvirtual.edu.sv/auladigital/*'] }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};

describe('check-manifest', () => {
  it('accepts the allowed set', () => {
    expect(run(valid).code).toBe(0);
  });

  it('fails on extra permissions, hosts or weak CSP', () => {
    const bad = run({
      ...valid,
      permissions: ['downloads', 'tabs'],
      host_permissions: ['<all_urls>'],
      content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
      },
    });
    expect(bad.code).toBe(1);
    expect(bad.output).toContain('permission not allowed: tabs');
    expect(bad.output).toContain('host permission not allowed: <all_urls>');
    expect(bad.output).toContain('CSP allows remote or inline code');
  });
});
