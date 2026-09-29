// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeDebounced } from '../../../src/content/observers';
import { PageContext } from '../../../src/content/page-context';

describe('observeDebounced', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('runs once per burst of mutations', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const observer = observeDebounced(document.body, callback, 100);
    for (let i = 0; i < 5; i++) document.body.append(document.createElement('p'));
    await Promise.resolve();
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    document.body.append(document.createElement('p'));
    await Promise.resolve();
    observer.disconnect();
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('PageContext', () => {
  it('caches the parse until invalidated', () => {
    document.body.className = 'format-topics course-7';
    const context = new PageContext(
      document,
      () => 'https://www.udbvirtual.edu.sv/auladigital/course/view.php?id=7',
    );
    const first = context.get();
    expect(context.get()).toBe(first);
    context.invalidate();
    expect(context.get()).not.toBe(first);
    expect(first.ok && first.value.course.id).toBe(7);
  });
});
