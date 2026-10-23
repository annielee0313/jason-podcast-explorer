/**
 * Site measurement: Google Analytics 4 and Microsoft Clarity, behind a consent choice.
 *
 * - GA4 always loads (production only) but starts in Consent Mode "denied": no cookies,
 *   only anonymous, modelled counts. Accepting the notice grants analytics storage.
 * - Clarity (heatmaps, recordings) loads only after the visitor accepts.
 * - Page views are sent by the app after each route change (title is correct by then),
 *   so GA4's own "browser history" page views should be switched off in the stream settings.
 * - Events: one click listener classifies platform links (listen_click), company links
 *   (company_click) and the book link; anything with data-track="name" sends that event with
 *   its other data-* attributes as parameters. Interactive features call track() directly.
 *
 * Event names map to the "goals → signals" table in Notion. No personal data is sent.
 */

const GA_ID = 'G-RJ1Q5T3RR4';
const CLARITY_ID: string | null = 'z26bvcq21m'; // clarity.microsoft.com → Settings → Overview

const CONSENT_KEY = 'jhl-consent'; // 'granted' | 'denied'
export type Consent = 'granted' | 'denied' | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

// Only real visits count: not the dev server, not local previews.
const enabled = () =>
  import.meta.env.PROD && typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export function getConsent(): Consent {
  try { return (localStorage.getItem(CONSENT_KEY) as Consent) ?? null; } catch { return null; }
}

export function setConsent(choice: 'granted' | 'denied') {
  try { localStorage.setItem(CONSENT_KEY, choice); } catch { /* private mode: choice lasts this visit */ }
  window.gtag?.('consent', 'update', { analytics_storage: choice });
  if (choice === 'granted') loadClarity();
  window.dispatchEvent(new Event('jhl-consent'));
}

function loadScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadClarity() {
  if (!CLARITY_ID || !enabled() || window.clarity) return;
  const q: unknown[] = [];
  window.clarity = Object.assign((...args: unknown[]) => { q.push(args); }, { q });
  loadScript(`https://www.clarity.ms/tag/${CLARITY_ID}`);
}

/** Send a GA4 event. Safe to call anywhere; does nothing in dev or before init. */
export function track(name: string, params: Record<string, string | number | undefined> = {}) {
  if (!enabled()) return;
  window.gtag?.('event', name, params);
}

export function trackPageView(path: string, title: string) {
  track('page_view', { page_location: location.origin + path, page_title: title });
}

const epFromPath = () => location.pathname.match(/\/episode\/(\d+)/)?.[1];

function classify(a: HTMLAnchorElement): [string, Record<string, string | undefined>] | null {
  const href = a.href;
  const ep = epFromPath();
  const platform =
    /podcasts\.apple\.com/.test(href) ? 'apple'
      : /open\.spotify\.com/.test(href) ? 'spotify'
        : /youtube\.com|youtu\.be/.test(href) ? 'youtube'
          : /soundon\.fm/.test(href) ? 'soundon' : null;
  if (platform) return ['listen_click', { platform, ep: ep ?? 'show' }];
  if (/js-adways\.com\.tw/.test(href)) return ['company_click', { target: 'website' }];
  if (/facebook\.com\/jsadways/.test(href)) return ['company_click', { target: 'facebook' }];
  if (href.startsWith('mailto:')) return ['company_click', { target: 'email' }];
  if (/books\.com\.tw/.test(href)) return ['book_click', {}];
  return null;
}

let started = false;

/** Call once in the browser. Sets up GA4 (consent-denied by default) and the click listener. */
export function initAnalytics() {
  if (started || !enabled()) return;
  started = true;

  const consent = getConsent();
  window.dataLayer = window.dataLayer || [];
  // gtag must push the `arguments` object itself, not an array.
  window.gtag = function gtag() { window.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag('consent', 'default', {
    analytics_storage: consent === 'granted' ? 'granted' : 'denied',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { send_page_view: false });
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  if (consent === 'granted') loadClarity();

  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-track], a[href]');
    if (!el) return;
    if (el.dataset.track) {
      const { track: name, ...params } = el.dataset;
      track(name, params);
      return;
    }
    const hit = classify(el as HTMLAnchorElement);
    if (hit) track(hit[0], hit[1]);
  }, { capture: true });
}
