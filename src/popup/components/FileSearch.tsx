import { useState } from 'preact/hooks';
import { t } from '../../shared/i18n';
import { openOrShow } from '../../ui/open-file';
import { searchFiles, type FileHit } from '../model';
import type { QueueData } from '../use-queue';

/**
 * Search over the index (saved paths only, nothing leaves the browser). Abrir and
 * Mostrar call chrome.downloads directly inside the click (ADR-016).
 */
export function FileSearch({ data }: { data: QueueData }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const hits = searchFiles(data.files, query);

  const open = (hit: FileHit, show: boolean) => {
    setError('');
    if (hit.downloadId === null) {
      setError(t('dlOpenUnavailable'));
      return;
    }
    if (show) {
      chrome.downloads.show(hit.downloadId);
      return;
    }
    openOrShow(hit.downloadId, hit.extension).catch(() => {
      setError(t('dlOpenFailed'));
    });
  };

  return (
    <section aria-labelledby="search-title">
      <h2 id="search-title">{t('popupSearchTitle')}</h2>
      <label class="field">
        <span>{t('searchLabel')}</span>
        <input
          type="search"
          value={query}
          maxLength={120}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      {error !== '' && <p class="status-error">{error}</p>}
      {query.trim() !== '' && hits.length === 0 && <p class="muted">{t('searchNone')}</p>}
      {hits.length > 0 && (
        <ul class="list" data-testid="search-results">
          {hits.map((hit) => (
            <li key={hit.id}>
              <span class="path" title={hit.folder}>
                {hit.name}
              </span>
              <span class="muted path">{hit.folder}</span>
              <span class="row">
                <button
                  type="button"
                  aria-label={`${t('dlOpen')}: ${hit.name}`}
                  onClick={() => {
                    open(hit, false);
                  }}
                >
                  {t('dlOpen')}
                </button>
                <button
                  type="button"
                  class="secondary"
                  aria-label={`${t('dlShow')}: ${hit.name}`}
                  onClick={() => {
                    open(hit, true);
                  }}
                >
                  {t('dlShow')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
