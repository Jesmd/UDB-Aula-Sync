/**
 * The ONLY place with DOM selectors. Each entry lists alternatives, most specific first;
 * the first alternative that matches wins.
 *
 * Source: synthetic fixtures modeled on Moodle 3.10 core renderers and format_onetopic.
 * TODO(verify-real-DOM): confirm every entry with the Diagnostics report from the real site.
 */
export const SELECTORS = {
  /** Main course area. Everything course-specific is searched inside it. */
  courseContent: ['.course-content', '#region-main [role="main"]', '#region-main', '[role="main"]'],
  pageTitle: ['.page-header-headings h1', '#page-header h1', 'header h1', '#region-main h1', 'h1'],
  breadcrumbCourseLink: [
    '.breadcrumb a[href*="/course/view.php?id="]',
    'nav[aria-label] a[href*="/course/view.php?id="]',
  ],

  section: [
    'li.section.main[id^="section-"]',
    'li.section[id^="section-"]',
    '[id^="section-"][data-sectionid]',
  ],
  sectionName: ['.sectionname', '.section-title', 'h3', 'h4'],
  sectionRestricted: [
    '.section_availability .isrestricted',
    '.section_availability .availabilityinfo',
  ],

  activity: ['li.activity[id^="module-"]', '[id^="module-"].activity', '[data-for="cmitem"]'],
  activityLink: [
    '.activityinstance a[href*="/mod/"]',
    'a.aalink[href*="/mod/"]',
    'a[href*="/mod/"][href*="view.php"]',
  ],
  activityName: ['.instancename', '.activityname'],
  activityDetails: ['.resourcelinkdetails'],
  activityRestricted: ['.availabilityinfo', '.isrestricted'],
  labelText: ['.contentwithoutlink', '.no-overflow', '.description'],
  /** Screen-reader suffixes such as " Archivo" inside the name. */
  accessHide: ['.accesshide', '.sr-only'],

  /** Onetopic tab rows inside courseContent. */
  tabRow: ['ul.nav-tabs', '.tabtree ul', 'ul.nav'],
  /** Direct tab label of a tab <li> (not the nested row). */
  tabLabel: [':scope > a', ':scope > .nav-link', ':scope > span'],

  loginForm: ['form#login', 'form[action*="/login/index.php"]'],

  /** Subtrees never exported by Diagnostics: personal data or noise. */
  personal: [
    '.usermenu',
    '.userbutton',
    '.logininfo',
    '.popover-region',
    '[data-region="drawer"]',
    '[data-region="message-drawer"]',
    '[data-region="right-hand-drawer"]',
    '.block_online_users',
    '.block_messages',
    '.userpicture',
    '#page-footer',
    'footer',
  ],
} as const satisfies Record<string, readonly string[]>;

/** Class names (not selectors) checked on tab links and their <li>. */
export const TAB_CLASSES = {
  active: ['active', 'selected'],
  dimmed: ['dimmed', 'disabled', 'dimmed_text'],
  highlighted: ['marker', 'current', 'highlighted'],
} as const;

/** Body classes that name the course format. */
export const FORMAT_BODY_CLASS = /(?:^|\s)format-([a-z0-9_]+)(?:\s|$)/;
export const COURSE_BODY_CLASS = /(?:^|\s)course-(\d+)(?:\s|$)/;
export const MODTYPE_CLASS = /(?:^|\s)modtype_([a-z0-9_]+)(?:\s|$)/;
