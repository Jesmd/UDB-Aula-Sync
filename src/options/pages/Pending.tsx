import { t } from '../../shared/i18n';

/** Placeholder for sections delivered in later milestones. */
export function Pending() {
  return <p class="muted">{t('optionsPending')}</p>;
}
