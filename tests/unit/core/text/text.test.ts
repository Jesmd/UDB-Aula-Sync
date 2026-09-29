import { describe, expect, it } from 'vitest';
import { compareNatural, sortNatural } from '../../../../src/core/text/natural-sort';
import { numberWidth, padNumbers } from '../../../../src/core/text/pad-numbers';
import {
  sanitizeExtension,
  sanitizeFileName,
  sanitizeSegment,
  splitExtension,
} from '../../../../src/core/text/sanitize-filename';
import {
  codePointLength,
  collapseWhitespace,
  stripControl,
  toNFC,
  truncateCodePoints,
} from '../../../../src/core/text/unicode';
import {
  escapeWindowsReserved,
  isWindowsReserved,
} from '../../../../src/core/text/windows-reserved';

describe('sanitizeSegment: real names from the course', () => {
  it.each([
    ['Guia 1: Repaso Fundamentos de Redes', 'Guia 1 - Repaso Fundamentos de Redes'],
    ['Procedimiento - Guía #9', 'Procedimiento - Guía #9'],
    [
      'Guía de ejercicios - Teorema del límite central',
      'Guía de ejercicios - Teorema del límite central',
    ],
    ['Tabla t-student', 'Tabla t-student'],
    ['Topología_Jerárquica_Guía2', 'Topología_Jerárquica_Guía2'],
    ['Suba aqui su guia desarreollada: VTP', 'Suba aqui su guia desarreollada - VTP'],
    ['Práctica RIP-EIGRP_Redistribución de rutas', 'Práctica RIP-EIGRP_Redistribución de rutas'],
    ['Guia de Lab. ACL estándard', 'Guia de Lab. ACL estándard'],
    ['Semana 14 ', 'Semana 14'],
  ])('%s', (input, expected) => {
    expect(sanitizeSegment(input)).toBe(expected);
  });
});

describe('sanitizeSegment: hostile input', () => {
  it('neutralizes traversal and absolute paths', () => {
    expect(sanitizeSegment('..')).toBe('_');
    expect(sanitizeSegment('.')).toBe('_');
    expect(sanitizeSegment('../../etc/passwd')).toBe('.. - .. - etc - passwd');
    expect(sanitizeSegment('/root')).toBe('root');
    expect(sanitizeSegment('C:\\Windows')).toBe('C - Windows');
  });

  it('removes forbidden and control characters, bidi tricks and trailing dots', () => {
    expect(sanitizeSegment('a<b>c"d?e*f')).toBe('abcdef');
    expect(sanitizeSegment('tab\there\u0000x')).toBe('tabherex');
    expect(sanitizeSegment('evil\u202Efdp.exe')).toBe('evilfdp.exe');
    expect(sanitizeSegment('fin.  ..')).toBe('fin');
    expect(sanitizeSegment('   ')).toBe('_');
    expect(sanitizeSegment('???')).toBe('_');
    expect(sanitizeSegment(': a :')).toBe('a');
  });

  it('escapes Windows device names', () => {
    expect(sanitizeSegment('CON')).toBe('CON_');
    expect(sanitizeSegment('lpt1.txt')).toBe('lpt1_.txt');
    expect(sanitizeSegment('CONSOLA')).toBe('CONSOLA');
  });

  it('normalizes to NFC and truncates by code points', () => {
    expect(sanitizeSegment('Gui\u0301a')).toBe('Guía');
    expect(sanitizeSegment('😀'.repeat(10), 5)).toBe('😀'.repeat(5));
    expect(sanitizeSegment('abc def', 4)).toBe('abc');
  });
});

describe('sanitizeFileName', () => {
  it('uses the real extension and keeps the suffix when truncating', () => {
    expect(sanitizeFileName({ base: 'Guia 1: Redes', extension: 'PDF' })).toBe(
      'Guia 1 - Redes.pdf',
    );
    expect(
      sanitizeFileName({ base: 'x'.repeat(200), extension: 'pptx', suffix: ' (2102)' }, 40),
    ).toBe(`${'x'.repeat(28)} (2102).pptx`);
  });

  it('does not double an extension already in the name', () => {
    expect(
      sanitizeFileName({ base: 'Guia de Lab Configuración de VPN.pdf', extension: 'pdf' }),
    ).toBe('Guia de Lab Configuración de VPN.pdf');
    expect(sanitizeFileName({ base: 'Simulación.pkt', extension: 'pkt', suffix: ' (1)' })).toBe(
      'Simulación.pkt (1).pkt',
    );
  });

  it('handles missing and bogus extensions', () => {
    expect(sanitizeFileName({ base: 'Tabla t-student', extension: '' })).toBe('Tabla t-student');
    expect(sanitizeFileName({ base: 'x', extension: 'p d f' })).toBe('x');
    expect(sanitizeFileName({ base: 'CON', extension: '' })).toBe('CON_');
    expect(sanitizeFileName({ base: '.pdf', extension: 'pdf' })).toBe('_.pdf');
  });

  it('splits and validates extensions', () => {
    expect(splitExtension('Guia 1.PDF')).toEqual({ base: 'Guia 1', extension: 'pdf' });
    expect(splitExtension('.bashrc')).toEqual({ base: '.bashrc', extension: '' });
    expect(splitExtension('Lab 1.0 final')).toEqual({ base: 'Lab 1.0 final', extension: '' });
    expect(splitExtension('sin extension')).toEqual({ base: 'sin extension', extension: '' });
    expect(sanitizeExtension('.Tar')).toBe('tar');
    expect(sanitizeExtension('verylongextension')).toBe('');
  });
});

describe('unicode helpers', () => {
  it('work on code points', () => {
    expect(toNFC('e\u0301')).toBe('é');
    expect(stripControl('a\u0007b')).toBe('ab');
    expect(collapseWhitespace('  a \n b ')).toBe('a b');
    expect(codePointLength('😀a')).toBe(2);
    expect(truncateCodePoints('😀😀', 1)).toBe('😀');
    expect(truncateCodePoints('ab', 5)).toBe('ab');
  });

  it('knows reserved names', () => {
    expect(isWindowsReserved('aux')).toBe(true);
    expect(isWindowsReserved('COM¹.log')).toBe(true);
    expect(isWindowsReserved('auxiliar')).toBe(false);
    expect(escapeWindowsReserved('Nul')).toBe('Nul_');
    expect(escapeWindowsReserved('fine')).toBe('fine');
  });
});

describe('pad numbers and natural sort', () => {
  it('pads standalone numbers only', () => {
    expect(padNumbers('Semana 2', 2)).toBe('Semana 02');
    expect(padNumbers('Semana10', 2)).toBe('Semana10');
    expect(padNumbers('Semana1', 2)).toBe('Semana01');
    expect(padNumbers('Tema 3.1', 2)).toBe('Tema 3.1');
    expect(padNumbers('Semana 2', 1)).toBe('Semana 2');
    expect(numberWidth(['Semana 1', 'Semana 19'])).toBe(2);
    expect(numberWidth(['General'])).toBe(1);
  });

  it('sorts like a person would', () => {
    expect(compareNatural('Semana 2', 'Semana 10')).toBeLessThan(0);
    expect(compareNatural('guía', 'Guia')).toBe(0);
    expect(sortNatural(['Tema 10', 'Tema 9', 'Tema 1'], (x) => x)).toEqual([
      'Tema 1',
      'Tema 9',
      'Tema 10',
    ]);
  });
});
