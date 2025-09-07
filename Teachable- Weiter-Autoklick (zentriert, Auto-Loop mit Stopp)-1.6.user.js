// ==UserScript==
// @name         Teachable: Weiter-Autoklick (zentriert, Auto-Loop mit Stopp)
// @namespace    chaot2000.teachable.weiter
// @version      1.6
// @description  Button zentriert über Content; klickt #lecture_complete_button wiederholt bis keiner mehr da ist. Zweiter Klick stoppt.
// @match        https://deutsches-assistenzhunde-zentrum-tarsq-aus-und.teachable.com/*
// @match        https://*.teachable.com/*
// @match        *://*/courses/*/lectures/*
// @run-at       document-end
// @inject-into  page
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const LOG = (...a) => console.log('[Teachable Weiter]', ...a);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let running = false; // Auto-Weiter Status

  function waitForPageComplete() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise(res => window.addEventListener('load', res, { once: true }));
  }

  function findWeiterButton() {
    // 1) exakte ID
    let t = document.querySelector('#lecture_complete_button');
    if (t) return t;
    // 2) Fallback: Klassen/Text
    const candidates = Array.from(document.querySelectorAll('a.nav-btn.complete, a.nav-btn, a.complete'));
    return candidates.find(a => /Geschafft\s*und\s*weiter/i.test(a.textContent || '')) || null;
  }

  function getContentContainer() {
    return document.querySelector('#lecture_content')
        || document.querySelector('main')
        || document.body;
  }

  // Wartet auf URL-Wechsel ODER auf DOM-Wechsel, der den Weiter-Button ersetzt/entfernt
  function waitForNextState(prevHref, prevButton, timeoutMs = 15000) {
    return new Promise(resolve => {
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(hrefPoll);
        clearTimeout(to);
        obs.disconnect();
        window.removeEventListener('popstate', onPop);
      };

      const to = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);

      const onPop = () => { cleanup(); resolve(); };
      window.addEventListener('popstate', onPop);

      const hrefPoll = setInterval(() => {
        if (location.href !== prevHref) { cleanup(); resolve(); }
      }, 250);

      const obs = new MutationObserver(() => {
        const btn = findWeiterButton();
        // Zustand hat sich geändert, wenn alter Button verschwunden ist oder ein neuer Node existiert
        if (!document.contains(prevButton) || (btn && btn !== prevButton)) {
          cleanup();
          resolve();
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function autoAdvanceLoop(uiBtn) {
    try {
      uiBtn.textContent = 'Auto-Weiter läuft – zum Stoppen klicken';
      uiBtn.style.background = '#0a7a1f';

      while (running) {
        await waitForPageComplete();
        await sleep(1000);

        const target = findWeiterButton();
        if (!target) {
          uiBtn.textContent = 'Kein Weiter-Button – Auto aus (klicken zum Starten)';
          uiBtn.style.background = '#1f6feb';
          running = false;
          break;
        }

        const hrefBefore = location.href;
        target.click();
        // Auf Navigation/DOM-Wechsel warten (SPA/Reload)
        await waitForNextState(hrefBefore, target, 15000);

        // kleine Pause, damit neuer Inhalt rendern kann
        await sleep(300);

        // Falls user währenddessen stoppt, hier sauber raus
        if (!running) break;
      }
    } catch (e) {
      console.error('[Teachable Weiter] Auto-Loop Fehler:', e);
      uiBtn.textContent = 'Fehler – erneut klicken zum Starten';
      uiBtn.style.background = '#1f6feb';
      running = false;
    }
  }

  function ensureFab() {
    if (document.getElementById('gm-weiter-fab') || !document.body) return;

    const container = getContentContainer();

    const wrapper = document.createElement('div');
    wrapper.id = 'gm-weiter-wrapper';
    wrapper.style.textAlign = 'center';
    wrapper.style.margin = '20px 0';

    const btn = document.createElement('button');
    btn.id = 'gm-weiter-fab';
    btn.type = 'button';
    btn.textContent = 'Weiter klicken (Auto-Weiter starten)';
    Object.assign(btn.style, {
      padding: '10px 18px',
      borderRadius: '12px',
      border: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,.25)',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: '700',
      fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
      background: '#1f6feb',
      color: '#fff'
    });

    btn.addEventListener('click', async () => {
      // Toggle: Start/Stop
      if (!running) {
        running = true;
        autoAdvanceLoop(btn);
      } else {
        running = false;
        btn.textContent = 'Gestoppt – erneut klicken zum Starten';
        btn.style.background = '#1f6feb';
      }
    });

    wrapper.appendChild(btn);
    container.prepend(wrapper);
    LOG('Button zentriert über Content eingefügt (Auto-Loop ready)');
  }

  function ensureUI() { ensureFab(); }

  if (document.body) ensureUI();
  else {
    const obs = new MutationObserver(() => {
      if (document.body) { obs.disconnect(); ensureUI(); }
    });
    obs.observe(document.documentElement, { childList: true });
  }

  // SPA-Navigation absichern
  (function patchHistory() {
    const push = history.pushState, rep = history.replaceState;
    const onNav = () => setTimeout(ensureUI, 300);
    history.pushState = function () { const r = push.apply(this, arguments); onNav(); return r; };
    history.replaceState = function () { const r = rep.apply(this, arguments); onNav(); return r; };
    window.addEventListener('popstate', onNav);
  })();

  // Keepalive (falls Framework den Button mal rauswirft)
  setInterval(ensureUI, 2000);
})();
