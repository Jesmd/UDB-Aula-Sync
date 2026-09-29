/** URLs of a mod_resource activity. */
export function resourceViewUrl(moodleRoot: string, cmid: number, redirect: boolean): string {
  const url = new URL('mod/resource/view.php', moodleRoot);
  url.searchParams.set('id', String(cmid));
  if (redirect) url.searchParams.set('redirect', '1');
  return url.href;
}
