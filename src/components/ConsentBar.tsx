import { useEffect, useState } from 'react';
import { getConsent, needsOptIn, setConsent } from '../lib/analytics';

/**
 * Cookie notice, two versions (see analytics.ts):
 * - Taiwan / outside Europe: analytics are on; the notice offers 知道了 or 不要追蹤.
 * - Europe (by time zone): nothing is measured until 接受.
 * Shown until the visitor chooses; the footer's 「Cookie 設定」 reopens it (`jhl-open-consent`).
 * Rendered only after mount, so it is never in the prerendered HTML.
 */
export function ConsentBar() {
  const [open, setOpen] = useState(false);
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    setOptIn(needsOptIn());
    if (import.meta.env.PROD && getConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener('jhl-open-consent', reopen);
    return () => window.removeEventListener('jhl-open-consent', reopen);
  }, []);

  if (!open) return null;
  const choose = (c: 'granted' | 'denied') => { setConsent(c); setOpen(false); };

  return (
    <div className="consent" role="region" aria-label="Cookie 設定">
      {optIn ? (
        <>
          <p>我們想用 Cookie 了解大家怎麼使用這個網站，幫助改善內容。不會用於廣告。</p>
          <div className="consent-actions">
            <button type="button" className="btn btn-light consent-no" onClick={() => choose('denied')}>不用了</button>
            <button type="button" className="btn btn-primary" onClick={() => choose('granted')}>接受</button>
          </div>
        </>
      ) : (
        <>
          <p>本站使用 Cookie 分析流量，幫助改善內容，不會用於廣告。</p>
          <div className="consent-actions">
            <button type="button" className="btn btn-light consent-no" onClick={() => choose('denied')}>不要追蹤</button>
            <button type="button" className="btn btn-primary" onClick={() => choose('granted')}>知道了</button>
          </div>
        </>
      )}
    </div>
  );
}
