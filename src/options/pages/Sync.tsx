import { SYNC_INTERVAL_HOURS } from '../../shared/constants';
import { t } from '../../shared/i18n';
import { Choice, invalid, parseExtensions, parseSizeMb, TextField, valid } from '../fields';
import type { SettingsProps } from '../use-settings';

export function SyncPage({ settings, update }: SettingsProps) {
  return (
    <section>
      <Choice
        legend={t('optUpdatePolicy')}
        value={settings.updatePolicy}
        options={[
          { value: 'conservar_ambas', label: t('optPolicyKeep'), hint: t('optPolicyKeepHint') },
          { value: 'sobrescribir', label: t('optPolicyOverwrite') },
          { value: 'omitir', label: t('optPolicySkip') },
        ]}
        onChange={(updatePolicy) => {
          update((s) => ({ ...s, updatePolicy }));
        }}
      />
      <h2>{t('optFiltersTitle')}</h2>
      <p class="muted">{t('optFiltersHint')}</p>
      <TextField
        label={t('optExcluded')}
        hint={t('optExcludedHint')}
        value={settings.filters.excludedExtensions.join(', ')}
        parse={parseExtensions}
        onCommit={(excludedExtensions) => {
          update((s) => ({ ...s, filters: { ...s.filters, excludedExtensions } }));
        }}
      />
      <TextField
        label={t('optMaxSize')}
        hint={t('optMaxSizeHint')}
        inputMode="numeric"
        value={settings.filters.maxSizeMb === null ? '' : String(settings.filters.maxSizeMb)}
        parse={parseSizeMb}
        onCommit={(maxSizeMb) => {
          update((s) => ({ ...s, filters: { ...s.filters, maxSizeMb } }));
        }}
      />
      <h2>{t('optNewsTitle')}</h2>
      <TextField
        label={t('optInterval')}
        hint={t('optIntervalHint')}
        inputMode="numeric"
        value={String(settings.syncIntervalHours)}
        parse={(text) => {
          const n = Number(text.trim());
          return Number.isInteger(n) && n >= SYNC_INTERVAL_HOURS.min && n <= 48
            ? valid(n)
            : invalid(t('optErrInterval'));
        }}
        onCommit={(syncIntervalHours) => {
          update((s) => ({ ...s, syncIntervalHours }));
        }}
      />
    </section>
  );
}
