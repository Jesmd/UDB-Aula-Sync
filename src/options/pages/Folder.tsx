import { errorMessage } from '../../shared/error-text';
import { useEffect, useState } from 'preact/hooks';
import {
  createHandleStore,
  folderPermission,
  pickerAvailable,
  pickFolder,
  type FolderHandle,
  type FolderPermission,
} from '../../fs-access/directory-handle';
import { FOLDER_INFO_KEY, type FolderInfo } from '../../fs-access/folder-info';
import { sendMessage } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import type { FolderCheck } from '../../shared/messages';
import { openDatabase } from '../../storage/db';
import { createMetaRepo } from '../../storage/meta-repo';
import type { SettingsProps } from '../use-settings';

type State =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'set'; handle: FolderHandle; permission: FolderPermission };

async function stores() {
  const db = await openDatabase();
  return { handles: createHandleStore(db), meta: createMetaRepo(db) };
}

/**
 * Optional folder verifier (spec §5 b, M6). The user picks the base folder once, read-only.
 * With it the extension notices deleted files and adopts files that are already there.
 */
export function FolderPage({ settings }: SettingsProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [check, setCheck] = useState<FolderCheck | null>(null);
  const [message, setMessage] = useState('');
  const supported = pickerAvailable(window);

  const load = async () => {
    const handle = await (await stores()).handles.get();
    setState(
      handle === undefined
        ? { kind: 'none' }
        : { kind: 'set', handle, permission: await folderPermission(handle) },
    );
  };
  useEffect(() => {
    void load();
  }, []);

  const runCheck = async () => {
    setMessage(t('folderChecking'));
    const result = await sendMessage({ target: 'background', type: 'folder/check' });
    setCheck(result.ok ? result.value : null);
    setMessage(result.ok ? '' : errorMessage(result.error.code));
  };

  const pick = async () => {
    const picked = await pickFolder(window);
    if (!picked.ok) {
      if (picked.error.code !== 'cancelled') setMessage(errorMessage(picked.error.code));
      return;
    }
    const { handles, meta } = await stores();
    await handles.set(picked.value);
    await meta.set(FOLDER_INFO_KEY, {
      name: picked.value.name,
      pickedAt: Date.now(),
    } satisfies FolderInfo);
    await load();
    await runCheck();
  };

  const authorize = async () => {
    if (state.kind !== 'set') return;
    const permission = await folderPermission(state.handle, true);
    setState({ ...state, permission });
    if (permission === 'granted') await runCheck();
  };

  const forget = async () => {
    const { handles, meta } = await stores();
    await handles.clear();
    await meta.delete(FOLDER_INFO_KEY);
    setCheck(null);
    setMessage('');
    await load();
  };

  return (
    <section>
      <p>{t('folderIntro', settings.paths.base)}</p>
      <p class="muted">{t('folderReadOnly')}</p>
      {!supported && <p class="status-error">{t('folderUnsupported')}</p>}
      {state.kind === 'set' && (
        <p data-testid="folder-state">
          {t('folderChosen', state.handle.name)}{' '}
          <span class={state.permission === 'granted' ? 'status-ok' : 'status-error'}>
            {state.permission === 'granted' ? t('folderGranted') : t('folderNeedsPermission')}
          </span>
        </p>
      )}
      <div class="row">
        <button type="button" disabled={!supported} onClick={() => void pick()}>
          {state.kind === 'set' ? t('folderChange') : t('folderPick')}
        </button>
        {state.kind === 'set' && state.permission !== 'granted' && (
          <button type="button" onClick={() => void authorize()}>
            {t('folderAuthorize')}
          </button>
        )}
        {state.kind === 'set' && state.permission === 'granted' && (
          <button type="button" class="secondary" onClick={() => void runCheck()}>
            {t('folderCheck')}
          </button>
        )}
        {state.kind === 'set' && (
          <button type="button" class="secondary" onClick={() => void forget()}>
            {t('folderForget')}
          </button>
        )}
      </div>
      <p role="status" class="muted">
        {message}
      </p>
      {check !== null && (
        <div data-testid="folder-check">
          <p>{t('folderSummary', [check.rootName, String(check.files)])}</p>
          {check.truncated && <p class="status-error">{t('folderTruncated')}</p>}
          {!check.matchesBase && (
            <p class="status-error">{t('folderWrongName', settings.paths.base)}</p>
          )}
          {check.missing === 0 ? (
            <p class="status-ok">{t('folderAllThere')}</p>
          ) : (
            <>
              <p>{t('folderMissing', String(check.missing))}</p>
              <ul>
                {check.missingSample.map((path) => (
                  <li key={path} class="path">
                    {path}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
