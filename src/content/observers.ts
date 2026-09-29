export interface DebouncedObserver {
  disconnect(): void;
}

/**
 * MutationObserver whose callback runs once per burst of changes, after `delayMs` of
 * quiet. Keeps work off the hot path while the theme or Moodle JS mutates the page.
 */
export function observeDebounced(
  target: Node,
  callback: () => void,
  delayMs = 250,
  options: MutationObserverInit = { childList: true, subtree: true },
): DebouncedObserver {
  const view = target.ownerDocument?.defaultView ?? globalThis;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new view.MutationObserver(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      callback();
    }, delayMs);
  });
  observer.observe(target, options);
  return {
    disconnect() {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
    },
  };
}
