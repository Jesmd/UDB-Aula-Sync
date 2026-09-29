import { useEffect, useState } from 'preact/hooks';
import { compareNatural } from '../../core/text/natural-sort';
import { sendMessage } from '../../shared/browser-api';
import { t } from '../../shared/i18n';
import type { CourseMeta } from '../../storage/meta-repo';
import { EMPTY_OVERRIDE, type CourseOverride } from '../../storage/settings-schema';
import { ConfirmButton, parseExtensions, parseSizeMb, TextField, Toggle, valid } from '../fields';
import type { SettingsProps } from '../use-settings';
import { parseTemplateText } from './Paths';

const isEmpty = (o: CourseOverride) =>
  o.template === null &&
  o.skipSections.length === 0 &&
  o.excludedExtensions === null &&
  o.maxSizeMb === null &&
  !o.autoDownload;

/** Per-course settings (spec §3.6): empty fields use the global value. */
export function CoursesPage({ settings, update }: SettingsProps) {
  const [courses, setCourses] = useState<readonly CourseMeta[] | null>(null);

  useEffect(() => {
    void sendMessage({ target: 'background', type: 'queue/list' }).then((result) => {
      setCourses(result.ok ? result.value.courses : []);
    });
  }, []);

  if (courses === null) return <p class="muted">{t('popupStatusChecking')}</p>;

  // Courses with settings but no name yet still show up.
  const known = new Map(courses.map((c) => [String(c.id), c.fullName]));
  for (const id of Object.keys(settings.courses)) if (!known.has(id)) known.set(id, `#${id}`);
  const rows = [...known].sort(([, a], [, b]) => compareNatural(a, b));

  const setOverride = (id: string, change: (o: CourseOverride) => CourseOverride) => {
    update((s) => {
      const next = change(s.courses[id] ?? EMPTY_OVERRIDE);
      const courses = { ...s.courses };
      if (isEmpty(next)) Reflect.deleteProperty(courses, id);
      else courses[id] = next;
      return { ...s, courses };
    });
  };

  return (
    <section>
      <p class="muted">{t('optCoursesIntro')}</p>
      {rows.length === 0 && <p>{t('optCoursesEmpty')}</p>}
      {rows.map(([id, name]) => {
        const o = settings.courses[id] ?? EMPTY_OVERRIDE;
        return (
          <details key={id} class="course" data-testid={`course-${id}`}>
            <summary>
              {name}
              {!isEmpty(o) && <span class="muted"> · {t('optCourseCustom')}</span>}
            </summary>
            <TextField
              label={t('optTemplate')}
              hint={t('optCourseInherit')}
              value={o.template ?? ''}
              parse={(text) => (text.trim() === '' ? valid(null) : parseTemplateText(text))}
              onCommit={(template) => {
                setOverride(id, (c) => ({ ...c, template }));
              }}
            />
            <TextField
              label={t('optSkipSections')}
              hint={t('optSkipSectionsHint')}
              multiline
              value={o.skipSections.join('\n')}
              parse={(text) =>
                valid(
                  [
                    ...new Set(
                      text
                        .split('\n')
                        .map((line) => line.trim().slice(0, 120))
                        .filter(Boolean),
                    ),
                  ].slice(0, 60),
                )
              }
              onCommit={(skipSections) => {
                setOverride(id, (c) => ({ ...c, skipSections }));
              }}
            />
            <TextField
              label={t('optExcluded')}
              hint={t('optCourseInherit')}
              value={o.excludedExtensions?.join(', ') ?? ''}
              parse={(text) => (text.trim() === '' ? valid(null) : parseExtensions(text))}
              onCommit={(excludedExtensions) => {
                setOverride(id, (c) => ({ ...c, excludedExtensions }));
              }}
            />
            <TextField
              label={t('optMaxSize')}
              hint={t('optCourseInherit')}
              inputMode="numeric"
              value={o.maxSizeMb === null ? '' : String(o.maxSizeMb)}
              parse={parseSizeMb}
              onCommit={(maxSizeMb) => {
                setOverride(id, (c) => ({ ...c, maxSizeMb }));
              }}
            />
            <Toggle
              label={t('optAutoDownload')}
              hint={t('optAutoDownloadHint')}
              checked={o.autoDownload}
              onChange={(autoDownload) => {
                setOverride(id, (c) => ({ ...c, autoDownload }));
              }}
            />
            {!isEmpty(o) && (
              <ConfirmButton
                label={t('optCourseReset')}
                confirm={t('optResetSure')}
                onConfirm={() => {
                  setOverride(id, () => EMPTY_OVERRIDE);
                }}
              />
            )}
          </details>
        );
      })}
    </section>
  );
}
