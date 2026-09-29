import { readFileSync } from 'node:fs';

/**
 * Audits dist/manifest.json against the spec (§6). This list is deliberately separate
 * from manifest.config.ts: widening permissions must fail CI until both change.
 */
const ALLOWED_PERMISSIONS = new Set([
  'downloads',
  'downloads.open',
  'storage',
  'alarms',
  'notifications',
  'offscreen',
  'idle',
]);
const ALLOWED_HOSTS = new Set(['https://www.udbvirtual.edu.sv/auladigital/*']);
/** crxjs exposes content-script chunks to the page origin; nothing wider is allowed. */
const ALLOWED_WAR_MATCHES = new Set(['https://www.udbvirtual.edu.sv/*']);
const REQUIRED_CSP = ["script-src 'self'", "object-src 'self'"];

interface Manifest {
  manifest_version?: number;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: { matches?: string[] }[];
  web_accessible_resources?: { matches?: string[] }[];
  externally_connectable?: unknown;
  content_security_policy?: { extension_pages?: string };
}

export function checkManifest(manifest: Manifest): string[] {
  const problems: string[] = [];
  if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');

  for (const p of manifest.permissions ?? []) {
    if (!ALLOWED_PERMISSIONS.has(p)) problems.push(`permission not allowed: ${p}`);
  }
  if ((manifest.optional_permissions ?? []).length > 0)
    problems.push('optional_permissions not allowed');
  if ((manifest.optional_host_permissions ?? []).length > 0) {
    problems.push('optional_host_permissions not allowed');
  }
  for (const h of manifest.host_permissions ?? []) {
    if (!ALLOWED_HOSTS.has(h)) problems.push(`host permission not allowed: ${h}`);
  }
  for (const cs of manifest.content_scripts ?? []) {
    for (const m of cs.matches ?? []) {
      if (!ALLOWED_HOSTS.has(m)) problems.push(`content script match not allowed: ${m}`);
    }
  }
  for (const war of manifest.web_accessible_resources ?? []) {
    for (const m of war.matches ?? []) {
      if (!ALLOWED_WAR_MATCHES.has(m))
        problems.push(`web_accessible_resources match not allowed: ${m}`);
    }
  }
  if (manifest.externally_connectable !== undefined)
    problems.push('externally_connectable not allowed');

  const csp = manifest.content_security_policy?.extension_pages ?? '';
  for (const directive of REQUIRED_CSP) {
    if (!csp.includes(directive)) problems.push(`CSP missing "${directive}"`);
  }
  if (/unsafe-eval|unsafe-inline|https?:/.test(csp))
    problems.push('CSP allows remote or inline code');
  return problems;
}

const path = process.argv[2] ?? 'dist/manifest.json';
const problems = checkManifest(JSON.parse(readFileSync(path, 'utf8')) as Manifest);
if (problems.length > 0) {
  console.error(`check-manifest: ${path}\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`check-manifest: ${path} OK`);
