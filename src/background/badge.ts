/** Novelty counter on the action icon (spec §3.4). */
export function badgeText(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

export function setNoveltyBadge(count: number): void {
  void chrome.action.setBadgeText({ text: badgeText(count) });
  void chrome.action.setBadgeBackgroundColor({ color: '#0b5cad' });
}
