import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = 'tests/.cache';

/** Self-signed cert for the mock server. Chromium runs with --ignore-certificate-errors. */
export function ensureCert(): { key: Buffer; cert: Buffer } {
  const keyPath = join(CACHE_DIR, 'mock-key.pem');
  const certPath = join(CACHE_DIR, 'mock-cert.pem');
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '30',
        '-subj',
        '/CN=www.udbvirtual.edu.sv',
        '-addext',
        'subjectAltName=DNS:www.udbvirtual.edu.sv,IP:127.0.0.1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    );
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}
