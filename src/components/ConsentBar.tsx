import { useEffect, useState } from 'react';
import { getConsent, setConsent } from '../lib/analytics';

/**
 * Cookie notice. Shown until the visitor chooses; the footer's 「Cookie 設定」 reopens it
 * (it dispatches `jhl-open-consent`). Rendered only after mount, so prerendered HTML never
 * includes it and returning visitors who already chose never see it flash.
 */
export function ConsentBar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (import.meta.env.PROD && getConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener('jhl-open-consent', reopen);
    return () => window.removeEventListener('jhl-open-consent', reopen);
  }, []);

  if (!open) return null;
  const choose = (c: 'granted' | 'denied') => { setConsent(c); setOpen(false); };

  return (
    <div className="consent" role="region" aria-label="Cookie 設定">
      <p>我們用 Cookie 了解大家怎麼使用這個網站，幫助改善內容。不會用於廣告。</p>
      <div className="consent-actions">
        <button type="button" className="btn btn-light consent-no" onClick={() => choose('denied')}>不用了</button>
        <button type="button" className="btn btn-primary" onClick={() => choose('granted')}>接受</button>
      </div>
    </div>
  );
}
