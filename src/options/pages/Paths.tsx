import { errorMessage } from '../../shared/error-text';
import { parseTemplate } from '../../core/paths/template';
import { t } from '../../shared/i18n';
import { invalid, TextField, Toggle, valid } from '../fields';
import { previewPath, TOKEN_LIST } from '../preview';
import type { SettingsProps } from '../use-settings';

export function parseTemplateText(text: string) {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return invalid(t('optErrTemplate'));
  return parseTemplate(trimmed).ok ? valid(trimmed) : invalid(t('optErrTemplate'));
}

export function PathsPage({ settings, update }: SettingsProps) {
  const paths = settings.paths;
  const preview = previewPath(paths);
  const set = (change: Partial<typeof paths>) => {
    update((s) => ({ ...s, paths: { ...s.paths, ...change } }));
  };

  return (
    <section>
      <p class="muted">{t('optPathsIntro')}</p>
      <p>
        {t('optPreview')}{' '}
        <code data-testid="path-preview">
          {preview.ok ? preview.value : errorMessage(preview.error.code)}
        </code>
      </p>
      <TextField
        label={t('optBase')}
        hint={t('optBaseHint')}
        value={paths.base}
        parse={(text) => {
          const base = text.trim();
          return base.length >= 1 && base.length <= 80 ? valid(base) : invalid(t('optErrBase'));
        }}
        onCommit={(base) => {
          set({ base });
        }}
      />
      <TextField
        label={t('optTemplate')}
        hint={t('optTemplateHint', TOKEN_LIST)}
        value={paths.template}
        parse={parseTemplateText}
        onCommit={(template) => {
          set({ template });
        }}
      />
      <Toggle
        label={t('optIncludeParent')}
        hint={t('optIncludeParentHint')}
        checked={paths.includeParent}
        onChange={(includeParent) => {
          set({ includeParent });
        }}
      />
      <Toggle
        label={t('optGroupByCycle')}
        hint={t('optGroupByCycleHint')}
        checked={paths.groupByCycle}
        onChange={(groupByCycle) => {
          set({ groupByCycle });
        }}
      />
      <Toggle
        label={t('optPadNumbers')}
        hint={t('optPadNumbersHint')}
        checked={paths.padNumbers}
        onChange={(padNumbers) => {
          set({ padNumbers });
        }}
      />
      <Toggle
        label={t('optOrderPrefix')}
        hint={t('optOrderPrefixHint')}
        checked={paths.orderPrefix}
        onChange={(orderPrefix) => {
          set({ orderPrefix });
        }}
      />
    </section>
  );
}
