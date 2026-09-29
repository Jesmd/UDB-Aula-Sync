import { sendMessage } from '../../shared/browser-api';
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
export function CourseList({ data, refresh }: { data: QueueData; refresh: () => void }) {
  const rows = courseRows(data.courses, data.files);
  const tracked = new Set(data.sync.tracked);
  const seen = (courseId: number) => {
    void sendMessage({ target: 'background', type: 'novelties/clear', courseId }).then(refresh);
  };
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
                {' · '}
                {tracked.has(row.id) ? t('courseTracked') : t('courseNotTracked')}
              </span>
              {(data.novelties[String(row.id)]?.length ?? 0) > 0 && (
                <span class="row">
                  <strong class="status-new">
                    {t('courseNew', String(data.novelties[String(row.id)]?.length ?? 0))}
                  </strong>
                  <button
                    type="button"
                    class="secondary"
                    aria-label={`${t('syncMarkSeen')}: ${row.name}`}
                    onClick={() => {
                      seen(row.id);
                    }}
                  >
                    {t('syncMarkSeen')}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
