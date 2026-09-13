/* TenderRisk: optional confirmation after a successful Formspree registration.
   Public configuration only. API keys live exclusively in Cloudflare Secrets. */
(() => {
  'use strict';
  const ENDPOINT = 'https://tenderrisk-confirmation.daniellux.workers.dev/confirm';
  const SITE_KEY = '0x4AAAAAAEvXuPc02V89Benm';
  let scriptPromise;

  function loadVerification() {
    if (window.turnstile) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => reject(new Error('verification_load_timeout')), 15000);
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('verification_load_failed')); };
      document.head.appendChild(script);
    }).catch(error => { scriptPromise = undefined; throw error; });
    return scriptPromise;
  }

  async function verificationToken() {
    await loadVerification();
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;justify-content:center;margin-top:16px;';
    const success = document.querySelector('#questionnaireContent .success-screen');
    if (!success) throw new Error('success_screen_closed');
    success.appendChild(container);
    let widget;
    try {
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('verification_timeout')), 20000);
        const finish = (error, token) => { clearTimeout(timeout); error ? reject(error) : resolve(token); };
        try {
          widget = window.turnstile.render(container, {
            sitekey: SITE_KEY, action: 'early_access', theme: 'light',
            callback: token => finish(null, token),
            'error-callback': () => { finish(new Error('verification_failed')); return true; },
            'expired-callback': () => finish(new Error('verification_expired')),
            'timeout-callback': () => finish(new Error('verification_timeout'))
          });
        } catch (error) { finish(error); }
      });
    } finally {
      if (widget !== undefined) window.turnstile.remove(widget);
      container.remove();
    }
  }

  window.sendTenderRiskConfirmation = async email => {
    try {
      const token = await verificationToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'omit', body: JSON.stringify({ email, token }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error('confirmation_http_' + response.status);
      } finally { clearTimeout(timeout); }
    } catch {
      // Formspree already succeeded. Never show a registration error or submit it again.
      console.warn('TenderRisk: confirmation email could not be completed; registration remains successful.');
    }
  };
})();
