/* ── Mirmi Messenger - orb.js ────────────────────────────── */
/* Sphere engine extracted from mirmi-prototype.html          */
/* Mood system, eye tracking, ring rotation, moodBg canvas    */

'use strict';

// ══════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════
const BRIDGE_URL = 'https://mirmi-bridge.sekanson.com';
const API_KEY = 'mirmi-dev-key-2026';
const SESSION_ID = 'mirmi-' + Math.random().toString(36).slice(2, 10);

// User identity - each person edits this
const USER_NAME = 'User';
const USER_ID = SESSION_ID; // use the random session id as user id for now

// ══════════════════════════════════════════════════════════
// BRIDGE FETCH — route API calls through background worker
// ══════════════════════════════════════════════════════════
function bridgeFetch(path, method, body) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'bridgeFetch', path, method, body },
      (resp) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp || !resp.ok) {
          return reject(new Error((resp && resp.error) || 'Bridge request failed'));
        }
        resolve(resp.data);
      }
    );
  });
}

// ══════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════
let isOpen = false;
let currentMood = 'idle';
let recognition = null;
let isListening = false;
let isSpeaking = false;
let currentAudio = null;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

// ══════════════════════════════════════════════════════════
// DOM REFS (from shadow root)
// ══════════════════════════════════════════════════════════
const shadowRoot = window.__mirmiShadowRoot;
const $ = (sel) => shadowRoot.querySelector(sel);
const $id = (id) => shadowRoot.getElementById(id);

const trigger = $id('mirmi-orb-trigger');
const overlay = $id('mirmi-chat-overlay');
const closeBtn = $id('mirmi-close-btn');
const messagesEl = $id('mirmi-messages');
const inputEl = $id('mirmi-input');
const sendBtn = $id('mirmi-send-btn');
const micBtn = $id('mirmi-mic-btn');
const stateText = $id('mirmi-state-text');
const promptsEl = $id('mirmi-prompts');
const moodCanvas = $id('mirmi-mood-bg');
const moodCtx = moodCanvas.getContext('2d');

// ══════════════════════════════════════════════════════════
// RING SHADOWS — exact from prototype (lines 1395-1403)
// ══════════════════════════════════════════════════════════
const ringShadows = {
  idle:   {rps:1/5,  s:'0 6px 12px 0 #38bdf8 inset,0 12px 18px 0 #005dff inset,0 36px 36px 0 #1e40af inset,0 0 24px 6px rgba(56,189,248,.15),0 0 60px 12px rgba(0,93,255,.1)'},
  think:  {rps:1/7,  s:'0 6px 12px 0 #818cf8 inset,0 12px 18px 0 #4338ca inset,0 36px 36px 0 #312e81 inset,0 0 24px 6px rgba(129,140,248,.18),0 0 60px 12px rgba(67,56,202,.1)'},
  gen:    {rps:1/2,  s:'0 6px 12px 0 #f472b6 inset,0 12px 18px 0 #db2777 inset,0 36px 36px 0 #831843 inset,0 0 24px 6px rgba(244,114,182,.18),0 0 60px 12px rgba(219,39,119,.1)'},
  done:   {rps:1/5,  s:'0 6px 12px 0 #34d399 inset,0 12px 18px 0 #059669 inset,0 36px 36px 0 #064e3b inset,0 0 26px 7px rgba(52,211,153,.22),0 0 60px 12px rgba(5,150,105,.12)'},
  talk:   {rps:1/4,  s:'0 6px 12px 0 #67e8f9 inset,0 12px 18px 0 #0891b2 inset,0 36px 36px 0 #164e63 inset,0 0 26px 7px rgba(103,232,249,.2),0 0 60px 14px rgba(8,145,178,.12)'},
  listen: {rps:1/6,  s:'0 6px 12px 0 #fde68a inset,0 12px 18px 0 #d97706 inset,0 36px 36px 0 #78350f inset,0 0 24px 6px rgba(253,230,138,.18),0 0 60px 12px rgba(217,119,6,.1)'},
  sleep:  {rps:1/14, s:'0 6px 10px 0 #7c3aed inset,0 10px 16px 0 #4c1d95 inset,0 30px 30px 0 #2e1065 inset,0 0 18px 4px rgba(124,58,237,.12),0 0 50px 10px rgba(76,29,149,.08)'},
};

// ══════════════════════════════════════════════════════════
// MOOD CONFIG — exact from prototype (lines 1505-1512)
// ══════════════════════════════════════════════════════════
const moodCfg = {
  idle:   {label:'Ready',       sc:'rgba(100,160,220,.5)',  vol:'rgba(30,80,200,.4)',   rim:'rgba(56,189,248,.20)',  lH:52,lY:74,rH:52,rY:74, dots:false,typing:false,sound:false,listen:false},
  think:  {label:'Thinking\u2026', sc:'rgba(167,139,250,.8)',  vol:'rgba(60,35,165,.52)',  rim:'rgba(167,139,250,.26)', lH:20,lY:91,rH:54,rY:70, dots:true, typing:false,sound:false,listen:false},
  gen:    {label:'Generating',  sc:'rgba(251,146,60,.85)',  vol:'rgba(150,35,75,.48)',  rim:'rgba(244,114,182,.22)', lH:60,lY:70,rH:60,rY:70, dots:false,typing:true, sound:false,listen:false},
  done:   {label:'Complete \u2726',sc:'rgba(52,211,153,.9)',   vol:'rgba(8,105,65,.5)',    rim:'rgba(52,211,153,.26)',  lH:62,lY:69,rH:62,rY:69, dots:false,typing:false,sound:false,listen:false},
  talk:   {label:'Talking',     sc:'rgba(103,232,249,.9)',  vol:'rgba(6,90,130,.52)',   rim:'rgba(103,232,249,.22)', lH:50,lY:75,rH:50,rY:75, dots:false,typing:false,sound:true, listen:false},
  listen: {label:'Listening',   sc:'rgba(253,230,138,.9)',  vol:'rgba(110,72,8,.4)',    rim:'rgba(253,230,138,.20)', lH:58,lY:71,rH:58,rY:71, dots:false,typing:false,sound:false,listen:true},
};

// ══════════════════════════════════════════════════════════
// ORB INSTANCE MANAGEMENT
// ══════════════════════════════════════════════════════════
// Each orb (trigger, header, chat avatars) is an instance
// with refs to its DOM elements and per-instance state.

let orbInstances = [];
let ringTargetRps = ringShadows.idle.rps;

function createOrbInstance(idPrefix) {
  const inst = {
    idPrefix,
    vol:  $id(idPrefix + '-vol'),
    rim:  $id(idPrefix + '-rim'),
    spec: $id(idPrefix + '-spec'),
    ring: $id(idPrefix + '-ring'),
    talkRings:   $id(idPrefix + '-talk'),
    listenRings: $id(idPrefix + '-listen'),
    eyeL: $id(idPrefix + '-eyeL'),
    eyeR: $id(idPrefix + '-eyeR'),
    dots: [1,2,3].map(i => $id(idPrefix + '-dot' + i)),
    tds:  [1,2,3].map(i => $id(idPrefix + '-td' + i)),
    // Per-instance animation state
    eyeLH: 52, eyeLY: 74,
    eyeRH: 52, eyeRY: 74,
    ringAngle: 0,
    ringRps: ringShadows.idle.rps,
    curPX: 0, curPY: 0,
  };
  return inst;
}

function applyMoodToOrb(inst, name) {
  const c = moodCfg[name]; if (!c || !inst.vol) return;
  // Eye shape
  inst.eyeLH = c.lH; inst.eyeLY = c.lY;
  inst.eyeRH = c.rH; inst.eyeRY = c.rY;
  // Volume gradient
  inst.vol.style.background = `radial-gradient(ellipse 65% 65% at 38% 30%,${c.vol} 0%,transparent 70%)`;
  // Rim gradient
  const rimLow = c.rim.replace(/,([\d.]+)\)$/, ',0.06)');
  inst.rim.style.background = `radial-gradient(ellipse 100% 100% at 50% 50%,transparent 52%,${rimLow} 70%,${c.rim} 85%,rgba(100,200,255,.06) 100%)`;
  // Ring shadow
  inst.ring.style.boxShadow = (ringShadows[name] || ringShadows.idle).s;
  // Talk/listen rings
  if (inst.talkRings) inst.talkRings.classList.toggle('visible', c.sound);
  if (inst.listenRings) inst.listenRings.classList.toggle('visible', c.listen);
  // Clear dots
  if (inst.dots) inst.dots.forEach(d => { if (d) { d.setAttribute('r','0'); d.setAttribute('opacity','0'); } });
  if (inst.tds) inst.tds.forEach(d => { if (d) { d.setAttribute('r','0'); d.setAttribute('opacity','0'); } });
}

// ══════════════════════════════════════════════════════════
// MOOD BACKGROUND — canvas that breathes with mood
// Exact from prototype (lines 905-960)
// ══════════════════════════════════════════════════════════
const MOOD_BG = {
  idle:   [{r:11,g:26,b:61},{r:3,g:6,b:16}],
  think:  [{r:24,g:13,b:61},{r:3,g:6,b:16}],
  gen:    [{r:60,g:10,b:40},{r:3,g:6,b:16}],
  done:   [{r:5,g:40,b:28},{r:3,g:6,b:16}],
  talk:   [{r:5,g:35,b:55},{r:3,g:6,b:16}],
  listen: [{r:45,g:28,b:3},{r:3,g:6,b:16}],
  sleep:  [{r:18,g:5,b:40},{r:3,g:6,b:16}],
};

let bgCurrent = MOOD_BG.idle.map(c => ({...c}));
let bgTarget = MOOD_BG.idle.map(c => ({...c}));
let bgBlend = 1;

function setBgMood(mood) {
  bgTarget = (MOOD_BG[mood] || MOOD_BG.idle).map(c => ({...c}));
  bgBlend = 0;
}

function lerpColor(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function drawMoodBg(blend) {
  const w = moodCanvas.width, h = moodCanvas.height;
  if (w === 0 || h === 0) return;
  const c0 = lerpColor(bgCurrent[0], bgTarget[0], blend);
  const c1 = lerpColor(bgCurrent[1], bgTarget[1], blend);
  const grad = moodCtx.createRadialGradient(w * .5, h * .32, 0, w * .5, h * .32, w * .7);
  grad.addColorStop(0, `rgb(${c0.r|0},${c0.g|0},${c0.b|0})`);
  grad.addColorStop(1, `rgb(${c1.r|0},${c1.g|0},${c1.b|0})`);
  moodCtx.fillStyle = grad;
  moodCtx.fillRect(0, 0, w, h);
}

function resizeMoodCanvas() {
  const rect = overlay.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    moodCanvas.width = rect.width;
    moodCanvas.height = rect.height;
    drawMoodBg(bgBlend);
  }
}

// ══════════════════════════════════════════════════════════
// GEN TYPING DOTS — timer-based animation from prototype
// ══════════════════════════════════════════════════════════
let typingTimer = null;
function startTypingDots() {
  stopTypingDots();
  let step = 0;
  orbInstances.forEach(inst => {
    if (inst.tds) inst.tds.forEach(d => { if (d) { d.setAttribute('r','0'); d.setAttribute('opacity','0'); } });
  });
  function tick() {
    if (currentMood !== 'gen') return;
    if (step < 3) {
      orbInstances.forEach(inst => {
        if (inst.tds && inst.tds[step]) {
          inst.tds[step].setAttribute('r','5');
          inst.tds[step].setAttribute('opacity','1');
        }
      });
      step++;
      typingTimer = setTimeout(tick, 340);
    } else {
      typingTimer = setTimeout(() => {
        orbInstances.forEach(inst => {
          if (inst.tds) inst.tds.forEach(d => { if (d) { d.setAttribute('r','0'); d.setAttribute('opacity','0'); } });
        });
        step = 0;
        typingTimer = setTimeout(tick, 260);
      }, 600);
    }
  }
  tick();
}
function stopTypingDots() {
  clearTimeout(typingTimer); typingTimer = null;
  orbInstances.forEach(inst => {
    if (inst.tds) inst.tds.forEach(d => { if (d) { d.setAttribute('r','0'); d.setAttribute('opacity','0'); } });
  });
}

// ══════════════════════════════════════════════════════════
// SET MOOD — adapted from prototype setMood (line 1514)
// ══════════════════════════════════════════════════════════
function setMood(name) {
  currentMood = name;
  const c = moodCfg[name]; if (!c) return;

  // State text
  if (stateText) {
    stateText.textContent = c.label;
    stateText.style.color = c.sc;
  }

  // Ring rotation speed target
  ringTargetRps = (ringShadows[name] || ringShadows.idle).rps;

  // Apply to all orb instances
  orbInstances.forEach(inst => applyMoodToOrb(inst, name));

  // Typing dots
  stopTypingDots();
  if (c.typing) startTypingDots();

  // Mood background
  setBgMood(name);
}

// ══════════════════════════════════════════════════════════
// BLINK — from prototype (line 1575)
// ══════════════════════════════════════════════════════════
let blinkTimer;
function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    if (currentMood === 'think') { scheduleBlink(); return; }
    // Blink all orbs
    orbInstances.forEach(inst => {
      if (inst.eyeL) {
        inst.eyeL.setAttribute('height', '4');
        inst.eyeL.setAttribute('y', (inst.eyeLY + inst.eyeLH / 2 - 2) + '');
      }
      if (inst.eyeR) {
        inst.eyeR.setAttribute('height', '4');
        inst.eyeR.setAttribute('y', (inst.eyeRY + inst.eyeRH / 2 - 2) + '');
      }
    });
    setTimeout(() => {
      orbInstances.forEach(inst => {
        if (inst.eyeL) {
          inst.eyeL.setAttribute('height', inst.eyeLH);
          inst.eyeL.setAttribute('y', inst.eyeLY);
        }
        if (inst.eyeR) {
          inst.eyeR.setAttribute('height', inst.eyeRH);
          inst.eyeR.setAttribute('y', inst.eyeRY);
        }
      });
      scheduleBlink();
    }, 110);
  }, 2000 + Math.random() * 2500);
}

// ══════════════════════════════════════════════════════════
// FRAME LOOP — adapted from prototype (line 1644)
// Ring rotation, eye tracking, spec highlight, dot animations
// ══════════════════════════════════════════════════════════
const startT = performance.now();
let lastFrameT = performance.now();

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrameT) / 1000, .033);
  lastFrameT = now;
  const t = (now - startT) * .001;
  const vw = window.innerWidth, vh = window.innerHeight;
  const ndx = (mouseX - vw / 2) / (vw / 2);
  const ndy = (mouseY - vh / 2) / (vh / 2);

  // Mood background blend
  if (bgBlend < 1) {
    bgBlend = Math.min(1, bgBlend + dt * 0.9);
    drawMoodBg(bgBlend);
    if (bgBlend >= 1) bgCurrent = bgTarget.map(c => ({...c}));
  }

  // Update all orb instances
  for (const inst of orbInstances) {
    if (!inst.ring || !inst.eyeL) continue;

    // Per-instance eye tracking offsets
    let miniPX, miniPY;
    if (inst.idPrefix === 'trig') {
      // Trigger orb (56px): track relative to orb's own screen center
      const trigRect = trigger.getBoundingClientRect();
      const trigCX = trigRect.left + trigRect.width / 2;
      const trigCY = trigRect.top + trigRect.height / 2;
      const dx = mouseX - trigCX;
      const dy = mouseY - trigCY;
      const ndxTrig = Math.max(-1, Math.min(1, dx / 200));
      const ndyTrig = Math.max(-1, Math.min(1, dy / 200));
      miniPX = ndxTrig * 22;
      miniPY = ndyTrig * 18;
    } else {
      // Header / message orbs: track relative to orb's own screen center
      const orbEl = inst.ring?.closest ? inst.ring.closest('.mini-mirmi') : null;
      if (orbEl) {
        const rect = orbEl.getBoundingClientRect();
        const ocx = rect.left + rect.width / 2;
        const ocy = rect.top + rect.height / 2;
        const dx2 = mouseX - ocx;
        const dy2 = mouseY - ocy;
        miniPX = Math.max(-1, Math.min(1, dx2 / 300)) * 18;
        miniPY = Math.max(-1, Math.min(1, dy2 / 300)) * 14;
      } else {
        miniPX = ndx * 18;
        miniPY = ndy * 14;
      }
    }

    // Smooth eye lerp toward target
    const lerpFactor = 0.08;
    inst.curPX = inst.curPX + (miniPX - inst.curPX) * lerpFactor;
    inst.curPY = inst.curPY + (miniPY - inst.curPY) * lerpFactor;

    // Ring rotation
    inst.ringRps += (ringTargetRps - inst.ringRps) * Math.min(1, dt * 2.2);
    inst.ringAngle = (inst.ringAngle + inst.ringRps * 360 * dt) % 360;
    inst.ring.style.transform = `rotate(${inst.ringAngle}deg)`;

    // Eye tracking — eyes follow cursor
    const lH = inst.eyeLH, lY = inst.eyeLY, rH = inst.eyeRH, rY = inst.eyeRY;
    inst.eyeL.setAttribute('x', 52 + inst.curPX);
    inst.eyeL.setAttribute('y', lY + inst.curPY);
    inst.eyeR.setAttribute('x', 110 + inst.curPX);
    inst.eyeR.setAttribute('y', rY + inst.curPY);
    inst.eyeL.setAttribute('height', lH);
    inst.eyeR.setAttribute('height', rH);
    inst.eyeL.setAttribute('rx', Math.min(19, lH / 2));
    inst.eyeL.setAttribute('ry', Math.min(19, lH / 2));
    inst.eyeR.setAttribute('rx', Math.min(19, rH / 2));
    inst.eyeR.setAttribute('ry', Math.min(19, rH / 2));

    // Specular highlight follows cursor
    if (inst.spec) {
      inst.spec.style.background = `radial-gradient(ellipse 22% 17% at ${34 - ndx * 10}% ${26 - ndy * 8}%,rgba(255,255,255,.22) 0%,rgba(255,255,255,.05) 44%,transparent 68%)`;
    }

    // Think dots — bobbing animation
    if (currentMood === 'think' && inst.dots) {
      const dotXs = [86, 100, 114];
      inst.dots.forEach((d, i) => {
        if (!d) return;
        const bob = Math.sin(t * 1.9 + i * 1.15) * 3.5;
        const r = 4 + Math.sin(t * 2.1 + i * .95) * 1;
        d.setAttribute('cx', dotXs[i] + inst.curPX);
        d.setAttribute('cy', 54 + bob + inst.curPY);
        d.setAttribute('r', Math.max(.1, r) + '');
        d.setAttribute('opacity', (.75 + Math.sin(t * 1.8 + i * .8) * .2) + '');
      });
      // Think: right eye drifts
      inst.eyeR.setAttribute('y', rY + inst.curPY + Math.sin(t * .55) * 3);
    }

    // Gen dots — bobbing position (appearance controlled by timer)
    if (currentMood === 'gen' && inst.tds) {
      inst.tds.forEach((d, i) => {
        if (!d) return;
        const bob = Math.sin(t * 1.9 + i * 1.15) * 3.5;
        d.setAttribute('cx', [86, 100, 114][i] + inst.curPX);
        d.setAttribute('cy', 54 + bob + inst.curPY);
      });
    }

    // Talk — eye bounce
    if (currentMood === 'talk') {
      const dh = lH * Math.abs(Math.sin(t * 3.2)) * .18;
      inst.eyeL.setAttribute('height', lH + dh);
      inst.eyeL.setAttribute('y', lY + inst.curPY - dh * .5);
      inst.eyeR.setAttribute('height', rH + dh);
      inst.eyeR.setAttribute('y', rY + inst.curPY - dh * .5);
      inst.eyeL.setAttribute('rx', Math.min(19, (lH + dh) / 2));
      inst.eyeL.setAttribute('ry', Math.min(19, (lH + dh) / 2));
      inst.eyeR.setAttribute('rx', Math.min(19, (rH + dh) / 2));
      inst.eyeR.setAttribute('ry', Math.min(19, (rH + dh) / 2));
    }
  }

  requestAnimationFrame(frame);
}

// ══════════════════════════════════════════════════════════
// MOUSE TRACKING
// ══════════════════════════════════════════════════════════
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
document.addEventListener('touchmove', e => {
  if (e.touches.length > 0) { mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY; }
}, { passive: true });

// ══════════════════════════════════════════════════════════
// OPEN / CLOSE
// ══════════════════════════════════════════════════════════
function openChat() {
  isOpen = true;
  overlay.classList.add('open');
  trigger.classList.add('hidden');
  inputEl.focus();
  // Resize moodBg canvas now that overlay is visible
  requestAnimationFrame(resizeMoodCanvas);
}

function closeChat() {
  isOpen = false;
  overlay.classList.remove('open');
  trigger.classList.remove('hidden');
  stopListening();
}

trigger.addEventListener('click', openChat);
closeBtn.addEventListener('click', closeChat);

// ══════════════════════════════════════════════════════════
// CREATE MINI MIRMI FOR CHAT AVATARS
// ══════════════════════════════════════════════════════════
let msgOrbCount = 0;

function createMiniMirmiEl(size) {
  const id = 'msg' + (msgOrbCount++);
  const wrap = document.createElement('div');
  wrap.className = 'mini-mirmi msg-avatar';
  wrap.style.width = size + 'px';
  wrap.style.height = size + 'px';

  wrap.innerHTML = `
    <div class="mm-ambient"></div>
    <div class="mm-base"></div>
    <div class="mm-vol" id="${id}-vol"></div>
    <div class="mm-rim" id="${id}-rim"></div>
    <div class="mm-vig"></div>
    <div class="mm-spec" id="${id}-spec"></div>
    <div class="mm-talk-rings" id="${id}-talk">
      <div class="mm-talk-ring"></div><div class="mm-talk-ring"></div><div class="mm-talk-ring"></div>
    </div>
    <div class="mm-listen-rings" id="${id}-listen">
      <div class="mm-listen-ring"></div><div class="mm-listen-ring"></div><div class="mm-listen-ring"></div>
    </div>
    <div class="mm-ring" id="${id}-ring"></div>
    <svg class="mm-eyes" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" overflow="visible">
      <defs>
        <filter id="${id}-eglow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="${id}-dglow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle id="${id}-dot1" cx="86" cy="54" r="0" fill="#a78bfa" filter="url(#${id}-dglow)" opacity="0"/>
      <circle id="${id}-dot2" cx="100" cy="54" r="0" fill="#c4b5fd" filter="url(#${id}-dglow)" opacity="0"/>
      <circle id="${id}-dot3" cx="114" cy="54" r="0" fill="#a78bfa" filter="url(#${id}-dglow)" opacity="0"/>
      <circle id="${id}-td1" cx="86" cy="54" r="0" fill="#f472b6" filter="url(#${id}-dglow)" opacity="0"/>
      <circle id="${id}-td2" cx="100" cy="54" r="0" fill="#fb923c" filter="url(#${id}-dglow)" opacity="0"/>
      <circle id="${id}-td3" cx="114" cy="54" r="0" fill="#fbbf24" filter="url(#${id}-dglow)" opacity="0"/>
      <rect id="${id}-eyeL" x="52" y="74" width="38" height="52" rx="19" ry="19" fill="white" opacity=".95" filter="url(#${id}-eglow)"/>
      <rect id="${id}-eyeR" x="110" y="74" width="38" height="52" rx="19" ry="19" fill="white" opacity=".95" filter="url(#${id}-eglow)"/>
    </svg>`;

  // Register after DOM insertion
  requestAnimationFrame(() => {
    const inst = {
      idPrefix: id,
      vol:  shadowRoot.getElementById(id + '-vol'),
      rim:  shadowRoot.getElementById(id + '-rim'),
      spec: shadowRoot.getElementById(id + '-spec'),
      ring: shadowRoot.getElementById(id + '-ring'),
      talkRings:   shadowRoot.getElementById(id + '-talk'),
      listenRings: shadowRoot.getElementById(id + '-listen'),
      eyeL: shadowRoot.getElementById(id + '-eyeL'),
      eyeR: shadowRoot.getElementById(id + '-eyeR'),
      dots: [1,2,3].map(i => shadowRoot.getElementById(id + '-dot' + i)),
      tds:  [1,2,3].map(i => shadowRoot.getElementById(id + '-td' + i)),
      eyeLH: moodCfg[currentMood].lH,
      eyeLY: moodCfg[currentMood].lY,
      eyeRH: moodCfg[currentMood].rH,
      eyeRY: moodCfg[currentMood].rY,
      ringAngle: 0,
      ringRps: (ringShadows[currentMood] || ringShadows.idle).rps,
      curPX: 0, curPY: 0,
    };
    applyMoodToOrb(inst, currentMood);
    orbInstances.push(inst);
  });

  return wrap;
}

// ══════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════
function addMessage(role, content) {
  if (promptsEl) promptsEl.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'msg-row ' + role;

  if (role === 'mirmi') {
    const avatar = createMiniMirmiEl(24);
    avatar.style.marginBottom = '2px';
    row.appendChild(avatar);
  } else {
    const av = document.createElement('div');
    av.className = 'user-av';
    av.innerHTML = '<span class="user-av-letter">U</span>';
    row.appendChild(av);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = content;
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
  const row = document.createElement('div');
  row.className = 'msg-row mirmi';
  row.id = 'mirmi-typing';

  const avatar = createMiniMirmiEl(24);
  avatar.style.marginBottom = '2px';
  row.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
  const el = $id('mirmi-typing');
  if (el) el.remove();
}

// ══════════════════════════════════════════════════════════
// TELEGRAM POLLING — fetch incoming messages periodically
// ══════════════════════════════════════════════════════════
let pollTimer = null;
let lastPollTs = Date.now() - 600000; // 10 min lookback on load

function startPolling() {
  if (pollTimer) return;
  pollMessages();                          // immediate first poll
  pollTimer = setInterval(pollMessages, 3000);
}

async function pollMessages() {
  try {
    const data = await bridgeFetch('/api/messages?since=' + lastPollTs, 'GET', null);
    if (data.messages && data.messages.length) {
      data.messages.forEach(msg => addTelegramMessage(msg));
      lastPollTs = Date.now();
    }
  } catch (e) {
    console.warn('Poll failed:', e.message);
  }
}

function addTelegramMessage(msg) {
  if (promptsEl) promptsEl.style.display = 'none';

  const row = document.createElement('div');
  const isMe = msg.from === USER_NAME;
  row.className = 'msg-row ' + (isMe ? 'user' : 'mirmi');

  if (isMe) {
    const av = document.createElement('div');
    av.className = 'user-av';
    av.innerHTML = '<span class="user-av-letter">U</span>';
    row.appendChild(av);
  } else {
    const av = document.createElement('div');
    av.className = 'user-av';
    av.innerHTML = '<span class="user-av-letter">' + (msg.from ? msg.from.charAt(0).toUpperCase() : 'T') + '</span>';
    row.appendChild(av);
  }

  const col = document.createElement('div');

  const label = document.createElement('div');
  label.className = 'tg-label';
  label.textContent = msg.from || 'Telegram';
  col.appendChild(label);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.text || msg.message || '';
  col.appendChild(bubble);

  row.appendChild(col);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ══════════════════════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════════════════════
async function sendMessage(text) {
  if (!text || !text.trim()) return;
  text = text.trim();

  addMessage('user', text);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.classList.remove('has-text');

  // Think → Gen → Talk → Idle (matching prototype flow)
  setMood('think');
  showTyping();

  try {
    // Switch to gen after a beat
    const genTimer = setTimeout(() => setMood('gen'), 900);

    const data = await bridgeFetch('/api/chat', 'POST', { message: text, sessionId: SESSION_ID, userName: USER_NAME });

    clearTimeout(genTimer);
    hideTyping();

    // Speak the reply
    setMood('talk');
    addMessage('mirmi', data.reply);
    speak(data.reply, () => {
      setMood('done');
      setTimeout(() => setMood('idle'), 2200);
    });
  } catch (err) {
    hideTyping();
    setMood('idle');
    addMessage('mirmi', 'I can\'t reach my brain right now. Is the bridge server running? (' + err.message + ')');
  }
}

// ══════════════════════════════════════════════════════════
// INPUT HANDLERS
// ══════════════════════════════════════════════════════════
sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

inputEl.addEventListener('input', () => {
  sendBtn.classList.toggle('has-text', inputEl.value.trim().length > 0);
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
});

// ══════════════════════════════════════════════════════════
// PROMPT CHIPS
// ══════════════════════════════════════════════════════════
if (promptsEl) {
  promptsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.mirmi-prompt-chip');
    if (chip) sendMessage(chip.textContent);
  });
}

// ══════════════════════════════════════════════════════════
// VOICE INPUT (Web Speech API)
// ══════════════════════════════════════════════════════════
function startListening() {
  stopSpeaking();
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    addMessage('mirmi', 'Speech recognition is not supported in this browser.');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('mic-on');
    setMood('listen');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    stopListening();
    sendMessage(transcript);
  };

  recognition.onerror = () => stopListening();
  recognition.onend = () => stopListening();
  recognition.start();
}

function stopListening() {
  isListening = false;
  if (micBtn) micBtn.classList.remove('mic-on');
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
  if (currentMood === 'listen') setMood('idle');
}

micBtn.addEventListener('click', () => {
  isListening ? stopListening() : startListening();
});

// ══════════════════════════════════════════════════════════
// TTS (ElevenLabs via bridge, fallback to Web Speech)
// ══════════════════════════════════════════════════════════
async function speak(text, onEnd) {
  isSpeaking = true;
  try {
    const res = await fetch(BRIDGE_URL + '/api/speak?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sessionId: SESSION_ID })
    });
    if (!res.ok) throw new Error('TTS bridge error: ' + res.status);
    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      isSpeaking = false;
      if (onEnd) onEnd();
    };
    currentAudio.play();
  } catch (err) {
    console.warn('ElevenLabs TTS failed, falling back to speechSynthesis:', err.message);
    currentAudio = null;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.onend = () => { isSpeaking = false; if (onEnd) onEnd(); };
      utter.onerror = () => { isSpeaking = false; if (onEnd) onEnd(); };
      window.speechSynthesis.speak(utter);
    } else {
      isSpeaking = false;
      if (onEnd) onEnd();
    }
  }
}

function stopSpeaking() {
  if (currentAudio) {
    const src = currentAudio.src;
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    URL.revokeObjectURL(src);
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  isSpeaking = false;
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
requestAnimationFrame(() => {
  // Create orb instances for trigger and header
  const trigInst = createOrbInstance('trig');
  const headerInst = createOrbInstance('header');
  orbInstances.push(trigInst, headerInst);

  // Apply initial mood
  setMood('idle');

  // Start polling for Telegram messages
  startPolling();

  // Start blink timer
  scheduleBlink();

  // Size moodBg canvas
  resizeMoodCanvas();
  drawMoodBg(1);

  // Start frame loop
  frame();
});

// Resize moodBg on window resize
window.addEventListener('resize', () => {
  if (isOpen) resizeMoodCanvas();
});

console.log('Mirmi Messenger loaded.');
