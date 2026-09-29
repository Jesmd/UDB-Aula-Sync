import { MOODLE_ROOT_URL, OPEN_ALLOWLIST } from '../../shared/constants';
import { t } from '../../shared/i18n';

/** What the extension does and never does (spec §2), in plain words. Nothing to change. */
export function SecurityPage() {
  return (
    <section>
      <h2>{t('secHostTitle')}</h2>
      <p>{t('secHost', MOODLE_ROOT_URL)}</p>
      <h2>{t('secOpenTitle')}</h2>
      <p>{t('secOpen')}</p>
      <p>
        <code data-testid="open-allowlist">{OPEN_ALLOWLIST.join(', ')}</code>
      </p>
      <p class="muted">{t('secNeverOpen')}</p>
      <h2>{t('secDataTitle')}</h2>
      <ul>
        <li>{t('secNoPasswords')}</li>
        <li>{t('secNoServers')}</li>
        <li>{t('secReadOnly')}</li>
        <li>{t('secGentle')}</li>
      </ul>
    </section>
  );
}
