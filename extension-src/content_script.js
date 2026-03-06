/* -- Mirmi Messenger v2 - content_script.js -------------------- */
/* Injects orb + messenger UI into every page via shadow DOM      */

(function() {
  'use strict';

  // Prevent double-injection
  if (document.getElementById('mirmi-messenger-host')) return;

  // -- Create host element with shadow DOM ----------------------
  const host = document.createElement('div');
  host.id = 'mirmi-messenger-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // -- Load Google Fonts into shadow root -------------------------
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&display=swap';
  shadow.appendChild(fontLink);

  // -- Load CSS -------------------------------------------------
  const cssUrl = chrome.runtime.getURL('orb.css');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssUrl;
  shadow.appendChild(link);

  // -- Sphere markup helper (exact prototype mini-mirmi structure) --
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

  // -- Build DOM ------------------------------------------------
  const container = document.createElement('div');
  container.style.cssText = 'pointer-events:auto;';
  container.innerHTML = `
    <!-- Identity picker overlay -->
    <div id="mirmi-identity-overlay" class="mirmi-identity-overlay" style="display:none;">
      <div class="mirmi-identity-card">
        <div class="mirmi-identity-orb">
          ${sphereHTML(80, 'identity')}
        </div>
        <div class="mirmi-identity-title">Who are you?</div>
        <div class="mirmi-identity-subtitle">Pick your name to get started</div>
        <div class="mirmi-identity-buttons">
          <button class="mirmi-identity-btn" data-name="Hammad" data-color="#3b82f6" data-letter="H">
            <span class="mirmi-identity-letter" style="background:rgba(59,130,246,.2);color:#60a5fa;">H</span>
            Hammad
          </button>
          <button class="mirmi-identity-btn" data-name="Tiago" data-color="#8b5cf6" data-letter="T">
            <span class="mirmi-identity-letter" style="background:rgba(139,92,246,.2);color:#a78bfa;">T</span>
            Tiago
          </button>
          <button class="mirmi-identity-btn" data-name="Aamir" data-color="#f59e0b" data-letter="A">
            <span class="mirmi-identity-letter" style="background:rgba(245,158,11,.2);color:#fbbf24;">A</span>
            Aamir
          </button>
        </div>
      </div>
    </div>

    <!-- Collapsed orb trigger (draggable) -->
    <div id="mirmi-orb-trigger">
      ${sphereHTML(56, 'trig')}
    </div>

    <!-- Messenger panel (mini + fullscreen states) -->
    <div id="mirmi-messenger" class="mirmi-messenger">
      <canvas id="mirmi-mood-bg"></canvas>

      <!-- Top bar -->
      <div class="mirmi-topbar">
        <div class="mirmi-topbar-left">
          <div class="mirmi-topbar-orb">
            ${sphereHTML(28, 'header')}
          </div>
          <span class="mirmi-topbar-title" id="mirmi-topbar-title">Mirmi</span>
          <span class="mirmi-topbar-sep">&middot;</span>
          <span class="mirmi-state-text" id="mirmi-state-text">Ready</span>
        </div>
        <div class="mirmi-topbar-actions">
          <button class="mirmi-topbar-btn" id="mirmi-expand-btn" title="Expand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <button class="mirmi-topbar-btn" id="mirmi-close-btn" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Body: sidebar + chat -->
      <div class="mirmi-body">
        <!-- Sidebar (conversations) -->
        <div class="mirmi-sidebar" id="mirmi-sidebar">
          <div class="mirmi-sidebar-header">Chats</div>
          <div class="mirmi-conv-list" id="mirmi-conv-list">
            <div class="mirmi-conv-card active" data-conv="group">
              <div class="mirmi-conv-avatar mirmi-avatar-green">M</div>
              <div class="mirmi-conv-info">
                <div class="mirmi-conv-name">Mirmi Group</div>
                <div class="mirmi-conv-last">Telegram sync</div>
              </div>
              <div class="mirmi-conv-badge" id="mirmi-badge-group" style="display:none;">0</div>
            </div>
            <div class="mirmi-conv-card" data-conv="dm">
              <div class="mirmi-conv-avatar mirmi-avatar-green">M</div>
              <div class="mirmi-conv-info">
                <div class="mirmi-conv-name">Mirmi DM</div>
                <div class="mirmi-conv-last">Direct AI chat</div>
              </div>
              <div class="mirmi-conv-badge" id="mirmi-badge-dm" style="display:none;">0</div>
            </div>
          </div>
        </div>

        <!-- Chat area -->
        <div class="mirmi-chat-area">
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

      <!-- Hidden file input for image upload -->
      <input type="file" id="mirmi-file-input" accept="image/*" style="display:none;" />
    </div>
  `;

  shadow.appendChild(container);

  // Expose shadow root for orb.js (loaded as a separate content script)
  window.__mirmiShadowRoot = shadow;

})();
