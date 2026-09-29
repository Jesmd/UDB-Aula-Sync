import { t } from '../../shared/i18n';
import { Choice } from '../fields';
import { previewPath } from '../preview';
import type { SettingsProps } from '../use-settings';

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function NamesPage({ settings, update }: SettingsProps) {
  const example = (fileNaming: typeof settings.paths.fileNaming) => {
    const preview = previewPath({ ...settings.paths, fileNaming });
    return preview.ok ? fileName(preview.value) : '—';
  };
  return (
    <section>
      <Choice
        legend={t('optFileNaming')}
        value={settings.paths.fileNaming}
        options={[
          { value: 'actividad', label: t('optNamingActivity'), hint: example('actividad') },
          { value: 'original', label: t('optNamingOriginal'), hint: example('original') },
          { value: 'ambos', label: t('optNamingBoth'), hint: example('ambos') },
        ]}
        onChange={(fileNaming) => {
          update((s) => ({ ...s, paths: { ...s.paths, fileNaming } }));
        }}
      />
      <p class="muted">{t('optNamingFolderNote')}</p>
    </section>
  );
}
