import { useState } from 'preact/hooks';
import { extensionVersion } from '../shared/browser-api';
import { errorMessage } from '../shared/error-text';
import { t } from '../shared/i18n';
import { openDatabase } from '../storage/db';
import { applyBackup, buildBackup, parseBackup } from '../storage/export-import';
import { createFilesRepo } from '../storage/files-repo';
import { createMetaRepo } from '../storage/meta-repo';
import { saveSettings } from '../storage/settings';
import { createSnapshotsRepo } from '../storage/snapshots-repo';
import type { SettingsProps } from './use-settings';

async function repos() {
  const db = await openDatabase();
  return {
    files: createFilesRepo(db),
    snapshots: createSnapshotsRepo(db),
    meta: createMetaRepo(db),
  };
}

/** Export/import of settings and index (spec §3.6), as a JSON file in Descargas/UDB/_respaldo. */
export function BackupSection({ settings, update }: SettingsProps) {
  const [message, setMessage] = useState('');

  const exportNow = async () => {
    const backup = await buildBackup(
      { settings, ...(await repos()) },
      extensionVersion(),
      Date.now(),
    );
    const day = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup)], { type: 'application/json' }),
    );
    try {
      await chrome.downloads.download({
        url,
        filename: `${settings.paths.base}/_respaldo/udb-aula-sync-${day}.json`,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      setMessage(
        t('backupSaved', [String(backup.files.length), `${settings.paths.base}/_respaldo`]),
      );
    } finally {
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    }
  };

  const importFile = async (file: File) => {
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setMessage(errorMessage(parsed.error.code));
      return;
    }
    const summary = await applyBackup(parsed.value, { saveSettings, ...(await repos()) });
    // Show the restored settings on every tab.
    update(() => parsed.value.settings);
    setMessage(
      t('backupImported', [
        String(summary.files),
        String(summary.snapshots),
        String(summary.courses),
      ]),
    );
  };

  return (
    <section aria-labelledby="backup-title">
      <h2 id="backup-title">{t('backupTitle')}</h2>
      <p class="muted">{t('backupHint')}</p>
      <div class="row">
        <button type="button" class="secondary" onClick={() => void exportNow()}>
          {t('backupExport')}
        </button>
        <label class="file-button">
          <span>{t('backupImport')}</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) void importFile(file);
            }}
          />
        </label>
      </div>
      <p role="status" class="muted" data-testid="backup-status">
        {message}
      </p>
    </section>
  );
}
