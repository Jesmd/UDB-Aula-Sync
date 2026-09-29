import { describe, expect, it } from 'vitest';
import { releaseNotes } from '../../scripts/release-notes';

const CHANGELOG = `# Changelog

## [Sin publicar]

## [1.0.0] - 2026-09-29

### Añadido

- Copia de seguridad.

## [0.9.0] - 2026-09-01

- Antes.
`;

describe('releaseNotes', () => {
  it('takes only the section of that version', () => {
    const notes = releaseNotes(CHANGELOG, '1.0.0');
    expect(notes).toContain('- Copia de seguridad.');
    expect(notes).not.toContain('Antes.');
    expect(notes).toContain('guía del README');
    expect(releaseNotes(CHANGELOG, '2.0.0')).toBe('Versión 2.0.0.');
  });
});
