/**
 * Google Analytics page views through gtag.js.
 */

const GTAG_URL = 'https://www.googletagmanager.com/gtag/js?id=';

// The page title can hold the open diagram's title, so every hit reports this
// fixed title instead.
const PAGE_TITLE = 'Nexus';

/**
 * Load gtag.js into a window and queue its page view for a measurement ID.
 * Returns whether it loaded; an empty ID loads nothing.
 */
export function startAnalytics(measurementId, win) {
  if (!measurementId) {
    return false;
  }

  win.dataLayer = win.dataLayer || [];

  // gtag.js ignores commands queued as arrays, so this pushes the Arguments
  // object.
  function gtag() {
    win.dataLayer.push(arguments);
  }

  gtag('js', new Date());
  gtag('config', measurementId, { page_title: PAGE_TITLE });

  const script = win.document.createElement('script');
  script.async = true;
  script.src = GTAG_URL + encodeURIComponent(measurementId);
  win.document.head.appendChild(script);

  return true;
}
