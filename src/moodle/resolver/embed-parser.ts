import { isPluginfileUrl } from '../../core/http/pluginfile-url';
import { absoluteUrl, queryAll } from '../dom';
import { SELECTORS } from '../selectors';

const URL_ATTRIBUTES = ['data', 'src', 'href'] as const;

/**
 * Finds the real file of a mod/resource/view.php page that did not redirect
 * (embedded, "open" or "popup" display). Returns null for a read-only viewer: then there
 * is no file to download and nothing else is tried.
 */
export function findResourceFileUrl(doc: Document, baseUrl: string): string | null {
  for (const selector of SELECTORS.resourceFile) {
    for (const element of queryAll(doc, [selector])) {
      for (const attribute of URL_ATTRIBUTES) {
        const url = absoluteUrl(element.getAttribute(attribute), baseUrl);
        if (url !== null && isPluginfileUrl(url)) return url;
      }
    }
  }
  return null;
}
