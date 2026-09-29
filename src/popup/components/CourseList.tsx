import { MOODLE_ROOT_URL } from '../../shared/constants';
import { t } from '../../shared/i18n';
import { courseRows } from '../model';
import type { QueueData } from '../use-queue';

const date = (ms: number) =>
  new Date(ms).toLocaleDateString(chrome.i18n.getUILanguage(), {
    day: 'numeric',
    month: 'short',
  });

/** Courses with material in the index; each links to its Aula Digital page. */
export function CourseList({ data }: { data: QueueData }) {
  const rows = courseRows(data.courses, data.files);
  return (
    <section aria-labelledby="courses-title">
      <h2 id="courses-title">{t('popupCoursesTitle')}</h2>
      {rows.length === 0 ? (
        <p class="muted">{t('coursesEmpty')}</p>
      ) : (
        <ul class="list" data-testid="course-list">
          {rows.map((row) => (
            <li key={row.id}>
              <a
                href={`${MOODLE_ROOT_URL}course/view.php?id=${row.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {row.name}
              </a>
              <span class="muted">
                {row.lastDownload === null
                  ? t('courseNoFiles')
                  : t('courseInfo', [String(row.files), date(row.lastDownload)])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
