import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gzipSize, importGraph } from '../../scripts/check-budget';

describe('check-budget', () => {
  it('follows static, dynamic and extension-URL imports once each', () => {
    const root = mkdtempSync(join(tmpdir(), 'udbsync-budget-'));
    mkdirSync(join(root, 'assets'));
    const write = (file: string, code: string) => {
      writeFileSync(join(root, file), code);
    };
    write('assets/loader.js', 'await import(chrome.runtime.getURL("assets/main.js"));');
    write('assets/main.js', 'import{a}from"./a.js";import("./b.js");import "./a.js";');
    write('assets/a.js', 'import{b}from"./b.js";export const a=1;');
    write('assets/b.js', 'export const b=2;');
    write('assets/unused.js', 'x'.repeat(10_000));
    const files = importGraph(root, 'assets/loader.js').sort();
    expect(files).toEqual(['assets/a.js', 'assets/b.js', 'assets/loader.js', 'assets/main.js']);
    expect(gzipSize(root, files)).toBeLessThan(1_000);
  });
});
