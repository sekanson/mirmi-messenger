/* ── Mirmi Messenger - content_script.js ─────────────────── */
/* Injects orb + chat overlay into every page via shadow DOM  */

(function() {
  'use strict';

  // Prevent double-injection
  if (document.getElementById('mirmi-messenger-host')) return;

  // ── Create host element with shadow DOM ─────────────────
  const host = document.createElement('div');
  host.id = 'mirmi-messenger-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ── Load CSS ────────────────────────────────────────────
  const cssUrl = chrome.runtime.getURL('orb.css');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssUrl;
  shadow.appendChild(link);

  // ── Sphere markup helper (exact prototype mini-mirmi structure) ──
  function sphereHTML(size, idPrefix) {
    return `
      <div class="mini-mirmi" style="width:${size}px;height:${size}px;">
        <div class="mm-ambient"></div>
        <div class="mm-base"></div>
        <div class="mm-vol" id="${idPrefix}-vol"></div>
        <div class="mm-rim" id="${idPrefix}-rim"></div>
        <div class="mm-vig"></div>
        <div class="mm-spec" id="${idPrefix}-spec"></div>
        <div class="mm-talk-rings" id="${idPrefix}-talk">
          <div class="mm-talk-ring"></div><div class="mm-talk-ring"></div><div class="mm-talk-ring"></div>
        </div>
        <div class="mm-listen-rings" id="${idPrefix}-listen">
          <div class="mm-listen-ring"></div><div class="mm-listen-ring"></div><div class="mm-listen-ring"></div>
        </div>
        <div class="mm-ring" id="${idPrefix}-ring"></div>
        <svg class="mm-eyes" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" overflow="visible">
          <defs>
            <filter id="${idPrefix}-eglow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="${idPrefix}-dglow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle id="${idPrefix}-dot1" cx="86" cy="54" r="0" fill="#a78bfa" filter="url(#${idPrefix}-dglow)" opacity="0"/>
          <circle id="${idPrefix}-dot2" cx="100" cy="54" r="0" fill="#c4b5fd" filter="url(#${idPrefix}-dglow)" opacity="0"/>
          <circle id="${idPrefix}-dot3" cx="114" cy="54" r="0" fill="#a78bfa" filter="url(#${idPrefix}-dglow)" opacity="0"/>
          <circle id="${idPrefix}-td1" cx="86" cy="54" r="0" fill="#f472b6" filter="url(#${idPrefix}-dglow)" opacity="0"/>
          <circle id="${idPrefix}-td2" cx="100" cy="54" r="0" fill="#fb923c" filter="url(#${idPrefix}-dglow)" opacity="0"/>
          <circle id="${idPrefix}-td3" cx="114" cy="54" r="0" fill="#fbbf24" filter="url(#${idPrefix}-dglow)" opacity="0"/>
          <rect id="${idPrefix}-eyeL" x="52" y="74" width="38" height="52" rx="19" ry="19" fill="white" opacity=".95" filter="url(#${idPrefix}-eglow)"/>
          <rect id="${idPrefix}-eyeR" x="110" y="74" width="38" height="52" rx="19" ry="19" fill="white" opacity=".95" filter="url(#${idPrefix}-eglow)"/>
        </svg>
      </div>
    `;
  }

  // ── Build DOM ───────────────────────────────────────────
  const container = document.createElement('div');
  container.style.cssText = 'pointer-events:auto;';
  container.innerHTML = `
    <!-- Collapsed orb trigger -->
    <div id="mirmi-orb-trigger">
      ${sphereHTML(56, 'trig')}
    </div>

    <!-- Chat overlay -->
    <div id="mirmi-chat-overlay">
      <canvas id="mirmi-mood-bg"></canvas>

      <!-- Header -->
      <div class="mirmi-chat-header">
        <button class="mirmi-chat-close" id="mirmi-close-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="mirmi-header-orb">
          ${sphereHTML(100, 'header')}
        </div>
        <div class="mirmi-label">
          <div class="mirmi-name">Mirmi</div>
          <div class="mirmi-state-text" id="mirmi-state-text">Ready</div>
        </div>
      </div>

      <!-- Suggested prompts -->
      <div class="mirmi-prompts" id="mirmi-prompts">
        <div class="mirmi-prompt-chip">What can you help with?</div>
        <div class="mirmi-prompt-chip">Tell me something interesting</div>
        <div class="mirmi-prompt-chip">Help me think through something</div>
      </div>

      <!-- Messages -->
      <div class="mirmi-messages" id="mirmi-messages"></div>

      <!-- Input -->
      <div class="mirmi-input-zone">
        <div class="mirmi-input-shell">
          <div class="mirmi-input-row">
            <textarea class="mirmi-chat-input" id="mirmi-input" rows="1" placeholder="Ask Mirmi anything..."></textarea>
            <div class="mirmi-input-actions">
              <button class="mirmi-action-btn" id="mirmi-mic-btn" title="Voice input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
                </svg>
              </button>
              <button class="mirmi-send-btn" id="mirmi-send-btn" title="Send">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  shadow.appendChild(container);

  // Expose shadow root for orb.js (loaded as a separate content script)
  window.__mirmiShadowRoot = shadow;

})();
