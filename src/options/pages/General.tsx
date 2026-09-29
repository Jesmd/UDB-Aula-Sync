import { t } from '../../shared/i18n';
import { DEFAULT_SETTINGS } from '../../storage/settings-schema';
import { Choice, ConfirmButton, Toggle } from '../fields';
import type { SettingsProps } from '../use-settings';

export function GeneralPage({ settings, update }: SettingsProps) {
  return (
    <section>
      <Toggle
        label={t('optInterceptClicks')}
        hint={t('optInterceptClicksHint')}
        checked={settings.interceptClicks}
        onChange={(interceptClicks) => {
          update((s) => ({ ...s, interceptClicks }));
        }}
      />
      <Toggle
        label={t('optOpenAfter')}
        hint={t('optOpenAfterHint')}
        checked={settings.openAfterDownload}
        onChange={(openAfterDownload) => {
          update((s) => ({ ...s, openAfterDownload }));
        }}
      />
      <Choice
        legend={t('optHoverDetails')}
        value={settings.hoverDetails}
        options={[
          { value: 'simple', label: t('optHoverSimple'), hint: t('optHoverSimpleHint') },
          { value: 'tarjeta', label: t('optHoverCard'), hint: t('optHoverCardHint') },
        ]}
        onChange={(hoverDetails) => {
          update((s) => ({ ...s, hoverDetails }));
        }}
      />
      <Toggle
        label={t('optStatusBadges')}
        hint={t('optStatusBadgesHint')}
        checked={settings.showStatusBadges}
        onChange={(showStatusBadges) => {
          update((s) => ({ ...s, showStatusBadges }));
        }}
      />
      <h2>{t('optResetTitle')}</h2>
      <p class="muted">{t('optResetHint')}</p>
      <ConfirmButton
        label={t('optReset')}
        confirm={t('optResetSure')}
        onConfirm={() => {
          update(() => DEFAULT_SETTINGS);
        }}
      />
    </section>
  );
}
