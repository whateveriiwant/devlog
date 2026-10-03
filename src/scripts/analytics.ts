type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const progressThresholds = [25, 50, 75, 90] as const;

function cleanPageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function initializeAnalytics() {
  const analyticsWindow = window as AnalyticsWindow;
  const {
    analyticsMeasurementId: measurementId,
    analyticsSiteOrigin,
    analyticsEnvironment,
  } = document.documentElement.dataset;
  if (
    !measurementId ||
    !/^G-[A-Z0-9]+$/.test(measurementId) ||
    !analyticsSiteOrigin
  )
    return;

  const stage =
    analyticsEnvironment === 'stage' &&
    measurementId === 'G-8SFTFGKZ9Y' &&
    analyticsSiteOrigin ===
      'https://devlog-site-stage.seungjun-jeong10.workers.dev';
  const production =
    analyticsEnvironment === 'production' &&
    measurementId === 'G-RQ6456HXLD' &&
    analyticsSiteOrigin === 'https://seungjun.sh';
  if (!stage && !production) return;

  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots || /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(robots.content))
    return;

  const page = new URL(window.location.href);
  if (
    page.protocol !== 'https:' ||
    page.origin !== analyticsSiteOrigin ||
    !page.pathname.startsWith('/blog/') ||
    page.pathname === '/blog/' ||
    page.search ||
    (stage ? page.hash !== '#ga_debug' : Boolean(page.hash))
  )
    return;

  const pageLocation = cleanPageUrl(page.href);
  if (!pageLocation) return;
  const pageReferrer = document.referrer
    ? cleanPageUrl(document.referrer)
    : undefined;

  const dataLayer = (analyticsWindow.dataLayer ??= []);
  // Google tag commands use Arguments objects, as in Google's installation snippet.
  function gtag(..._args: unknown[]) {
    dataLayer.push(arguments);
  }
  analyticsWindow.gtag = gtag;
  gtag('js', new Date());
  const config = {
    page_location: pageLocation,
    page_referrer: pageReferrer ?? '',
    page_title: 'devlog',
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(stage ? { debug_mode: true } : {}),
  };
  gtag('config', measurementId, config);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  const articleBody = document.querySelector<HTMLElement>(
    '[data-analytics-body]'
  );
  if (articleBody) {
    const sent = new Set<number>();
    let scheduled = false;
    const measureProgress = () => {
      scheduled = false;
      if (document.visibilityState !== 'visible') return;
      const { top, height } = articleBody.getBoundingClientRect();
      if (height <= 0) return;
      const articleTop = top + window.scrollY;
      const viewportBottom = window.scrollY + window.innerHeight;
      const progress = Math.min(
        100,
        Math.max(0, ((viewportBottom - articleTop) / height) * 100)
      );
      for (const threshold of progressThresholds) {
        if (progress >= threshold && !sent.has(threshold)) {
          sent.add(threshold);
          gtag('event', 'article_progress', {
            progress_percent: threshold,
          });
        }
      }
    };
    const scheduleProgress = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(measureProgress);
    };

    window.addEventListener('scroll', scheduleProgress, { passive: true });
    window.addEventListener('resize', scheduleProgress, { passive: true });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) scheduleProgress();
    });
    document.addEventListener('visibilitychange', scheduleProgress);
    document.addEventListener(
      'load',
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === 'IMG' && articleBody.contains(target))
          scheduleProgress();
      },
      true
    );
    scheduleProgress();
  }

  const trackNavigation = (event: MouseEvent) => {
    if (
      (event.type === 'click' && event.button !== 0) ||
      (event.type === 'auxclick' && event.button !== 1)
    )
      return;
    const target = event.target as Element | null;
    const link = target?.closest<HTMLAnchorElement>(
      'a[data-analytics-navigation]'
    );
    if (!link) return;
    const direction = link.dataset.analyticsNavigation;
    if (direction !== 'previous' && direction !== 'next') return;
    try {
      const destination = new URL(link.href, page.href);
      if (
        destination.origin !== page.origin ||
        !destination.pathname.startsWith('/blog/') ||
        destination.pathname === '/blog/'
      )
        return;
      gtag('event', 'article_navigation', {
        navigation_direction: direction,
        target_path: destination.pathname,
      });
    } catch {
      // Invalid link URLs must not interfere with normal link behavior.
    }
  };
  document.addEventListener('click', trackNavigation);
  document.addEventListener('auxclick', trackNavigation);
}

initializeAnalytics();
