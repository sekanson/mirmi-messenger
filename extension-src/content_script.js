/* ── Mirmi Messenger - content_script.js ─────────────────── */
/* Injects orb + messenger panel into every page via shadow DOM */

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
    <!-- Identity Picker Overlay -->
    <div id="mirmi-identity-overlay" class="mirmi-identity-overlay" style="display:none;">
      <div class="mirmi-identity-card">
        <div class="mirmi-identity-orb">
          ${sphereHTML(64, 'identity')}
        </div>
        <div class="mirmi-identity-title">Who are you?</div>
        <div class="mirmi-identity-buttons">
          <button class="mirmi-identity-btn" data-name="Hammad">Hammad</button>
          <button class="mirmi-identity-btn" data-name="Tiago">Tiago</button>
          <button class="mirmi-identity-btn" data-name="Aamir">Aamir</button>
        </div>
      </div>
    </div>

    <!-- Collapsed orb trigger -->
    <div id="mirmi-orb-trigger">
      ${sphereHTML(56, 'trig')}
    </div>

    <!-- Messenger panel -->
    <div id="mirmi-chat-overlay">
      <canvas id="mirmi-mood-bg"></canvas>

      <!-- Messenger layout: sidebar + chat -->
      <div class="mirmi-messenger-layout">
        <!-- Sidebar -->
        <div class="mirmi-sidebar">
          <div class="mirmi-sidebar-header">
            <div class="mirmi-sidebar-logo">
              ${sphereHTML(28, 'sidebar')}
            </div>
            <span class="mirmi-sidebar-title">Mirmi</span>
          </div>
          <div class="mirmi-conversation-list" id="mirmi-conversation-list">
            <div class="mirmi-conv-card active" data-conv="group">
              <div class="mirmi-conv-icon mirmi-conv-icon-group">M</div>
              <div class="mirmi-conv-info">
                <div class="mirmi-conv-name">Mirmi Group</div>
                <div class="mirmi-conv-preview" id="mirmi-conv-preview-group"></div>
              </div>
              <div class="mirmi-conv-badge" id="mirmi-conv-badge-group" style="display:none;">0</div>
            </div>
            <div class="mirmi-conv-card" data-conv="dm">
              <div class="mirmi-conv-icon mirmi-conv-icon-dm">M</div>
              <div class="mirmi-conv-info">
                <div class="mirmi-conv-name">Mirmi DM</div>
                <div class="mirmi-conv-preview" id="mirmi-conv-preview-dm"></div>
              </div>
              <div class="mirmi-conv-badge" id="mirmi-conv-badge-dm" style="display:none;">0</div>
            </div>
          </div>
        </div>

        <!-- Chat area -->
        <div class="mirmi-chat-area">
          <!-- Chat header -->
          <div class="mirmi-chat-header">
            <button class="mirmi-chat-close" id="mirmi-close-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div class="mirmi-chat-header-info">
              <div class="mirmi-chat-header-orb">
                ${sphereHTML(32, 'header')}
              </div>
              <div class="mirmi-chat-header-text">
                <div class="mirmi-chat-header-name" id="mirmi-chat-header-name">Mirmi Group</div>
                <div class="mirmi-state-text" id="mirmi-state-text">Ready</div>
              </div>
            </div>
          </div>

          <!-- Messages -->
          <div class="mirmi-messages" id="mirmi-messages"></div>

          <!-- Input -->
          <div class="mirmi-input-zone">
            <div class="mirmi-input-shell">
              <div class="mirmi-input-row">
                <button class="mirmi-action-btn" id="mirmi-attach-btn" title="Attach image">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <input type="file" id="mirmi-file-input" accept="image/*" style="display:none;" />
                <textarea class="mirmi-chat-input" id="mirmi-input" rows="1" placeholder="Message..."></textarea>
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
      </div>
    </div>
  `;

  shadow.appendChild(container);

  // Expose shadow root for orb.js (loaded as a separate content script)
  window.__mirmiShadowRoot = shadow;

})();
