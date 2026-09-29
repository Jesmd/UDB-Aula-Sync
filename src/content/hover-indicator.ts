import { HOVER_DELAY_MS } from '../shared/constants';
import { activityFromEvent } from './interceptor';
import type { PageContext } from './page-context';
import type { ResolveCache } from './resolver-client';
import type { BadgeState, CursorBadge } from './ui/cursor-badge';

const RESOURCE_LINK = 'a[href*="/mod/resource/view.php"]';

export interface HoverIndicatorDeps {
  readonly doc: Document;
  readonly context: PageContext;
  readonly cache: ResolveCache;
  readonly badge: CursorBadge;
  readonly enabled: () => boolean;
  readonly delayMs?: number;
}

function stateOf(cache: ResolveCache, cmid: number): BadgeState | null {
  const resolution = cache.peek(cmid);
  if (resolution === null) return null;
  return resolution.kind === 'file' ? 'ready' : 'readonly';
}

/**
 * Shows the cursor badge on downloadable files after the same 400 ms hover delay the
 * resolver uses, so a pointer merely passing by triggers nothing (spec §3.1). Keyboard
 * focus gets the details card instead (details.ts).
 */
export function installHoverIndicator(deps: HoverIndicatorDeps): () => void {
  let current: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let point = { x: 0, y: 0 };

  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    current = null;
    deps.badge.hide();
  };

  const begin = (cmid: number) => {
    current = cmid;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (current !== cmid) return;
      deps.badge.show(stateOf(deps.cache, cmid) ?? 'resolving', point.x, point.y);
      if (stateOf(deps.cache, cmid) !== null) return;
      void deps.cache.get(cmid).then((result) => {
        if (current !== cmid) return;
        deps.badge.setState(
          result.ok ? (result.value.kind === 'file' ? 'ready' : 'readonly') : 'error',
        );
      });
    }, deps.delayMs ?? HOVER_DELAY_MS);
  };

  const activityCmid = (event: Event): number | null => {
    if (!deps.enabled()) return null;
    const page = deps.context.get();
    return page.ok ? (activityFromEvent(event, page.value)?.cmid ?? null) : null;
  };

  const over = (event: MouseEvent) => {
    point = { x: event.clientX, y: event.clientY };
    const cmid = activityCmid(event);
    if (cmid !== null && cmid !== current) begin(cmid);
  };

  const move = (event: MouseEvent) => {
    point = { x: event.clientX, y: event.clientY };
    if (current !== null) deps.badge.move(point.x, point.y);
  };

  const out = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest(RESOURCE_LINK);
    const related = event.relatedTarget as Node | null;
    if (link != null && related !== null && link.contains(related)) return;
    if (link != null) stop();
  };

  const options = { capture: true } as const;
  deps.doc.addEventListener('mouseover', over, options);
  deps.doc.addEventListener('mousemove', move, options);
  deps.doc.addEventListener('mouseout', out, options);
  // A click starts the download: the toast takes over.
  deps.doc.addEventListener('click', stop, options);
  return () => {
    stop();
    deps.doc.removeEventListener('mouseover', over, options);
    deps.doc.removeEventListener('mousemove', move, options);
    deps.doc.removeEventListener('mouseout', out, options);
    deps.doc.removeEventListener('click', stop, options);
  };
}
