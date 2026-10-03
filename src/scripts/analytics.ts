type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  'ga-disable-G-RQ6456HXLD'?: boolean;
  'ga-disable-G-8SFTFGKZ9Y'?: boolean;
};

const progressThresholds = [25, 50, 75, 90] as const;
const consentKey = 'devlog.analytics-consent.v1';
let consentGranted = false;
let analyticsStarted = false;
let consentWriteFailed = false;

function readConsent(): string | null {
  try {
    return window.localStorage.getItem(consentKey);
  } catch {
    return null;
  }
}

function revokeAnalytics(reload = true) {
  consentGranted = false;
  const analyticsWindow = window as AnalyticsWindow;
  document.documentElement.setAttribute('data-google-analytics-opt-out', '');
  for (const id of ['G-RQ6456HXLD', 'G-8SFTFGKZ9Y'] as const)
    analyticsWindow[`ga-disable-${id}`] = true;
  // Cookies are scoped to this hostname; leave auth and site preferences alone.
  for (const name of ['_ga', '_ga_RQ6456HXLD', '_ga_8SFTFGKZ9Y'])
    document.cookie = `${name}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
  // A fresh document completely unloads the Google tag. Do not send denied pings.
  if (analyticsStarted && reload) window.location.reload();
}

function initializeConsent() {
  const panel = document.querySelector<HTMLElement>(
    '[data-analytics-consent-panel]'
  );
  const open = document.querySelector<HTMLButtonElement>(
    '[data-analytics-consent-open]'
  );
  const accept = document.querySelector<HTMLButtonElement>(
    '[data-analytics-consent-accept]'
  );
  const deny = document.querySelector<HTMLButtonElement>(
    '[data-analytics-consent-deny]'
  );
  const close = document.querySelector<HTMLButtonElement>(
    '[data-analytics-consent-close]'
  );
  const status = document.querySelector<HTMLElement>(
    '[data-analytics-consent-status]'
  );
  if (!panel || !open || !accept || !deny || !close || !status) return;
  const show = (visible: boolean) => {
    panel.hidden = !visible;
    open.setAttribute('aria-expanded', String(visible));
  };
  const sync = () => {
    const choice = consentWriteFailed ? null : readConsent();
    if (choice !== 'granted' && consentGranted) revokeAnalytics();
    consentGranted = choice === 'granted';
    if (choice === 'granted' || choice === 'denied') open.hidden = false;
    status.textContent = consentGranted
      ? '현재 통계 수집을 허용했습니다.'
      : '현재 통계 수집에 동의하지 않았습니다.';
    deny.textContent = consentGranted ? '동의 철회' : '거부';
    if (consentGranted) initializeAnalytics();
  };
  const choose = (choice: 'granted' | 'denied') => {
    const restart = choice === 'granted' && analyticsStarted && !consentGranted;
    try {
      window.localStorage.setItem(consentKey, choice);
      consentWriteFailed = false;
    } catch {
      consentWriteFailed = true;
      try {
        window.localStorage.removeItem(consentKey);
      } catch {}
      revokeAnalytics(false);
      status.textContent = '선택을 저장할 수 없어 통계를 수집하지 않습니다.';
      return;
    }
    if (restart) {
      window.location.reload();
      return;
    }
    if (choice === 'denied') revokeAnalytics();
    sync();
    show(false);
    open.focus();
  };
  open.addEventListener('click', () => {
    sync();
    show(true);
    accept.focus();
  });
  accept.addEventListener('click', () => choose('granted'));
  deny.addEventListener('click', () => choose('denied'));
  close.addEventListener('click', () => {
    show(false);
    open.focus();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      show(false);
      open.focus();
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === consentKey || event.key === null) sync();
  });
  window.addEventListener('pageshow', sync);
  sync();
}

function cleanPageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function initializeAnalytics(offerOnly = false) {
  if (analyticsStarted || (!consentGranted && !offerOnly)) return;
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
  if (offerOnly) {
    const panel = document.querySelector<HTMLElement>(
      '[data-analytics-consent-panel]'
    );
    const open = document.querySelector<HTMLButtonElement>(
      '[data-analytics-consent-open]'
    );
    if (panel && open) {
      panel.hidden = false;
      open.hidden = false;
      open.setAttribute('aria-expanded', 'true');
    }
    return;
  }
  analyticsStarted = true;
  analyticsWindow[
    production ? 'ga-disable-G-RQ6456HXLD' : 'ga-disable-G-8SFTFGKZ9Y'
  ] = false;
  document.documentElement.removeAttribute('data-google-analytics-opt-out');
  const pageReferrer = document.referrer
    ? cleanPageUrl(document.referrer)
    : undefined;

  const dataLayer = (analyticsWindow.dataLayer ??= []);
  // Google tag commands use Arguments objects, as in Google's installation snippet.
  function gtag(..._args: unknown[]) {
    if (!consentGranted) return;
    dataLayer.push(arguments);
  }
  analyticsWindow.gtag = gtag;
  const denied = {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
  gtag('consent', 'default', denied);
  gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
  gtag('js', new Date());
  const config = {
    page_location: pageLocation,
    page_referrer: pageReferrer ?? '',
    page_title: 'devlog',
    cookie_domain: window.location.hostname,
    cookie_path: '/',
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

initializeConsent();
// The same origin/page guards apply to the first-visit banner and collection.
if (!['granted', 'denied'].includes(readConsent() ?? ''))
  initializeAnalytics(true);
