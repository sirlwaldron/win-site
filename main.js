/* =========== Page controller =========== */
const pages = Array.from(document.querySelectorAll('.page'));
const names = ['Home','Services','Testimonials','Pricing','Contact'];
let current = 0;
let busy = false;
const pgBtns = document.querySelectorAll('.pg-btn');
const stepBig = document.getElementById('stepBig');
const stepName = document.getElementById('stepName');
const brandStripe = document.getElementById('brandStripe');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
let globeControls = null;

function setMobileMenuOpen(open){
  document.body.classList.toggle('mobile-menu-open', !!open);
  if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// Keep off-screen pages out of the tab order and the accessibility tree.
function syncInert(idx){
  const focusInHidden = pages.some((p,i) => i !== idx && p.contains(document.activeElement));
  pages.forEach((p,i) => { p.inert = i !== idx; });
  if (focusInHidden) pages[idx].focus({preventScroll:true});
}

function applyChromeForPage(idx){
  const dark = pages[idx].dataset.chrome === 'dark';
  document.body.classList.toggle('on-dark', dark);
  brandStripe.classList.toggle('on-dark', dark);
}

function goTo(idx){
  idx = Math.max(0, Math.min(pages.length-1, idx));
  if (idx === current || busy) return;
  busy = true;
  pages.forEach((p,i) => {
    p.classList.remove('active','prev','next');
    if (i === idx) p.classList.add('active');
    else if (i < idx) p.classList.add('prev');
    else p.classList.add('next');
  });
  current = idx;
  syncInert(idx);
  pgBtns.forEach((b,i) => {
    b.classList.toggle('active', i===idx);
    if (i===idx) b.setAttribute('aria-current','true'); else b.removeAttribute('aria-current');
  });
  stepBig.textContent = String(idx+1).padStart(2,'0');
  stepName.textContent = names[idx];
  applyChromeForPage(idx);
  // Pause heavy animations when not on Home
  if (globeControls) globeControls.setActive(idx === 0);
  document.getElementById('pgPrev').disabled = idx === 0;
  document.getElementById('pgNext').disabled = idx === pages.length-1;
  // persist
  try { localStorage.setItem('win.page', String(idx)); } catch(e){}
  setTimeout(() => busy = false, 320);
}

// Init state
pages.forEach((p,i)=> {
  if (i===0) return;
  p.classList.add('next');
});
syncInert(0);
try {
  const saved = parseInt(localStorage.getItem('win.page') || '0', 10);
  if (!isNaN(saved) && saved > 0 && saved < pages.length) goTo(saved);
} catch(e){}
document.getElementById('pgPrev').disabled = true;

/* =========== Embedded Stripe Checkout =========== */
let embeddedCheckoutInstance = null;

function openCheckoutModal(title){
  const m = document.getElementById('checkoutModal');
  if (!m) return;
  if (title) {
    const t = document.getElementById('checkoutTitle');
    if (t) t.textContent = title;
  }
  const sub = document.getElementById('checkoutSub');
  if (sub) sub.textContent = 'Secure checkout powered by Stripe.';
  m.classList.add('show');
  m.setAttribute('aria-hidden', 'false');
}

function closeCheckoutModal(){
  const m = document.getElementById('checkoutModal');
  if (!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden', 'true');
  try {
    if (embeddedCheckoutInstance && typeof embeddedCheckoutInstance.destroy === 'function') {
      embeddedCheckoutInstance.destroy();
    }
  } catch(e){}
  const mount = document.getElementById('embeddedCheckout');
  if (mount) mount.innerHTML = '';
  embeddedCheckoutInstance = null;
}

document.querySelectorAll('[data-checkout-close="1"]').forEach(el => el.addEventListener('click', closeCheckoutModal));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCheckoutModal();
});

async function startEmbeddedCheckout(plan){
  if (!window.Stripe) throw new Error('Stripe.js failed to load');
  const pk = window.WIN_STRIPE_PUBLISHABLE_KEY;
  if (!pk) throw new Error('Missing Stripe publishable key (WIN_STRIPE_PUBLISHABLE_KEY)');

  // Only one instance allowed. Tear down any previous instance.
  try {
    if (embeddedCheckoutInstance && typeof embeddedCheckoutInstance.destroy === 'function') {
      embeddedCheckoutInstance.destroy();
    }
  } catch(e){}
  embeddedCheckoutInstance = null;

  const stripe = window.Stripe(pk);
  const mount = document.getElementById('embeddedCheckout');
  if (!mount) throw new Error('Missing embedded checkout mount node');
  mount.innerHTML = '';

  embeddedCheckoutInstance = await stripe.initEmbeddedCheckout({
    fetchClientSecret: async () => {
      const res = await fetch('/api/create-embedded-checkout-session', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error('Checkout is unavailable right now. Please email waldronhq@gmail.com');
      const data = await res.json();
      if (!data.clientSecret) throw new Error('Checkout is unavailable right now. Please email waldronhq@gmail.com');
      return data.clientSecret;
    }
  });

  embeddedCheckoutInstance.mount('#embeddedCheckout');
}

/* =========== Triggers =========== */
pgBtns.forEach(b => b.addEventListener('click', () => {
  goTo(parseInt(b.dataset.idx,10));
  setMobileMenuOpen(false);
}));
document.getElementById('pgPrev').addEventListener('click', () => goTo(current-1));
document.getElementById('pgNext').addEventListener('click', () => goTo(current+1));
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    setMobileMenuOpen(!document.body.classList.contains('mobile-menu-open'));
  });
}

document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => {
    const plan = el.dataset.plan;
    if (plan && el.classList.contains('p-cta')){
      setMobileMenuOpen(false);
      openCheckoutModal(`Checkout · ${plan}`);
      startEmbeddedCheckout(plan).catch(err => {
        const sub = document.getElementById('checkoutSub');
        if (sub) sub.textContent = (err && err.message) ? err.message : 'Checkout failed to start.';
      });
      return;
    }
    if (plan){
      const map = {
        'Starter': 'Starter - $599',
        'Growth': 'Growth - $1,199',
        'BackendGrowth': 'Systems Build - $1,799',
        'Care': 'Care Plan (existing client)',
      };
      setTimeout(() => {
        const sel = document.getElementById('f-plan');
        if (sel && map[plan]) sel.value = map[plan];
      }, 500);
    }
    goTo(parseInt(el.dataset.goto, 10));
  });
});

/* =========== Keyboard =========== */
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') setMobileMenuOpen(false);
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(current+1); }
  else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(current-1); }
  else if (/^[1-4]$/.test(e.key)) goTo(parseInt(e.key,10)-1);
});

// Note: we intentionally do NOT change pages on scroll/swipe.
// Scrolling should only scroll within the active page.

/* =========== Contact form =========== */
const CONTACT_EMAIL_TO = 'waldronhq@gmail.com';
// Formspree endpoint. If empty, the form falls back to a mailto link.
const CONTACT_FORM_ENDPOINT = 'https://formspree.io/f/xaeebgpy';

function escapeText(s){ return String(s ?? '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
function buildEmailBody(data){
  return [
    `Name: ${data.name || ''}`,
    `Business: ${data.biz || ''}`,
    `Email: ${data.email || ''}`,
    `Phone: ${data.phone || ''}`,
    `Plan: ${data.plan || ''}`,
    '',
    (data.message || '').trim()
  ].join('\n');
}
function showSuccess(messageHtml){
  document.querySelectorAll('.form > .field, .form > .submit').forEach(el => el.style.display='none');
  const node = document.getElementById('formSuccess');
  if (messageHtml) node.querySelector('div:last-child').innerHTML = messageHtml;
  node.classList.add('show');
}

document.getElementById('contactEmail').setAttribute('href', `mailto:${CONTACT_EMAIL_TO}`);

function showFormError(form, messageHtml){
  let node = document.getElementById('formError');
  if (!node){
    node = document.createElement('div');
    node.id = 'formError';
    node.setAttribute('role', 'alert');
    node.style.cssText = 'grid-column:1/-1;margin-top:4px;padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.5;color:#fff;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.5)';
    const btn = form.querySelector('.submit');
    btn.insertAdjacentElement('afterend', node);
  }
  node.innerHTML = messageHtml;
  node.style.display = '';
}
function clearFormError(){
  const node = document.getElementById('formError');
  if (node) node.style.display = 'none';
}
function mailtoFallbackLink(data){
  const subject = encodeURIComponent(`New website inquiry: ${data.biz || data.name || 'WIN'}`);
  const body = encodeURIComponent(buildEmailBody(data));
  return `mailto:${CONTACT_EMAIL_TO}?subject=${subject}&body=${body}`;
}

document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const req = ['f-name','f-biz','f-email'];
  let ok = true;
  req.forEach(id => {
    const el = document.getElementById(id);
    if (!el.value.trim()) { el.style.borderColor = '#ef4444'; ok=false; }
    else el.style.borderColor = '';
  });
  if (!ok) return;

  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  clearFormError();

  // Prefer a real endpoint if configured.
  if (CONTACT_FORM_ENDPOINT){
    const btn = form.querySelector('.submit');
    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    btn.style.opacity = '.7';
    btn.style.cursor = 'not-allowed';

    // Formspree special fields
    fd.set('_subject', 'New WaldronHQ inquiry');
    const email = (data.email || '').trim();
    if (email) fd.set('_replyto', email);
    // _gotcha honeypot is included from the hidden form field (left empty by real users).

    try{
      const res = await fetch(CONTACT_FORM_ENDPOINT, {
        method: 'POST',
        headers: {'Accept':'application/json'},
        body: fd
      });
      if (!res.ok) throw new Error('Bad response: ' + res.status);
      showSuccess(`<b>Thanks - message sent.</b>We’ll be in touch within 6 hours.`);
    } catch(err){
      showFormError(form, `<b>Sorry - your message didn’t go through.</b> Please try again, or email us directly at <a href="${mailtoFallbackLink(data).replace(/"/g,'&quot;')}" style="color:var(--accent);font-weight:700">${escapeText(CONTACT_EMAIL_TO)}</a>.`);
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel;
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
    return;
  }

  // No endpoint configured: mailto fallback.
  window.location.href = mailtoFallbackLink(data);
  showSuccess(`<b>Almost done.</b>Your email app should open with a prefilled message. If it didn’t, email us at <a href="mailto:${escapeText(CONTACT_EMAIL_TO)}" style="color:var(--accent);font-weight:700">${escapeText(CONTACT_EMAIL_TO)}</a>.`);
});

/* =========== Tweaks =========== */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#1E6FFF",
  "navy": "#0A1628",
  "transition": "unique"
}/*EDITMODE-END*/;
let tweaks = {...TWEAK_DEFAULTS};
const tweaksPanel = document.getElementById('tweaks');

function applyTweaks(){
  document.documentElement.style.setProperty('--accent', tweaks.accent);
  document.documentElement.style.setProperty('--accent-soft', tweaks.accent + '14');
  document.documentElement.style.setProperty('--navy', tweaks.navy);
  document.documentElement.style.setProperty('--ink', tweaks.navy);
  document.getElementById('tw-accent').value = tweaks.accent;
  document.getElementById('tw-navy').value = tweaks.navy;
  document.getElementById('tw-transition').value = tweaks.transition;

  // Transition style override
  const styleNode = document.getElementById('tw-transition-style') || (() => {
    const s = document.createElement('style'); s.id = 'tw-transition-style'; document.head.appendChild(s); return s;
  })();
  if (tweaks.transition === 'fade'){
    styleNode.textContent = `
      .page{transition:opacity .5s ease !important;clip-path:none !important;transform:none !important;filter:none !important}
      .page.prev,.page.next{opacity:0 !important;transform:none !important;clip-path:none !important;filter:none !important}
      .page.active{opacity:1 !important;clip-path:none !important;transform:none !important;filter:none !important}`;
  } else if (tweaks.transition === 'slide'){
    styleNode.textContent = `
      .page{transition:transform .6s cubic-bezier(.76,0,.24,1), opacity .3s ease !important;clip-path:none !important;filter:none !important}
      .page.prev{transform:translateY(-100%) !important;opacity:0 !important}
      .page.next{transform:translateY(100%) !important;opacity:0 !important}
      .page.active{transform:translateY(0) !important;opacity:1 !important}`;
  } else {
    styleNode.textContent = '';
  }
}
applyTweaks();

function setKey(key, val){
  tweaks[key] = val;
  applyTweaks();
  try { window.parent.postMessage({type:'__edit_mode_set_keys', edits:{[key]:val}}, '*'); } catch(e){}
}
document.getElementById('tw-accent').addEventListener('input', e => setKey('accent', e.target.value));
document.getElementById('tw-navy').addEventListener('input', e => setKey('navy', e.target.value));
document.getElementById('tw-transition').addEventListener('change', e => setKey('transition', e.target.value));

window.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === '__activate_edit_mode') tweaksPanel.classList.add('show');
  if (d.type === '__deactivate_edit_mode') tweaksPanel.classList.remove('show');
});
try { window.parent.postMessage({type:'__edit_mode_available'}, '*'); } catch(e){}

/* =========== Dotted Earth globe (canvas 2D) ===========
   Land is a dot lattice sampled from a 0.5° land mask (Natural Earth 50m, public domain),
   run-length encoded in globe-land.js. The sphere (ocean shading, day/night terminator,
   atmosphere rim + halo) is pre-rendered once per resize; each frame only draws the dots,
   graticule, arcs and cities. */
(function initGlobe(){
  const canvas = document.getElementById('globeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, R = 0, cx = 0, cy = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  let pageActive = true, inView = true, tabVisible = !document.hidden;
  let active = false;
  let rafId = null;
  let spawnInterval = null;

  // Camera orientation
  const TILT = 0.36; // ~21 deg
  const START_YAW = 1.25;
  let yaw = START_YAW;    // starts centered near the Americas (Cleveland hub); auto-rotates west->east

  // Sun direction in camera space (x right, y up, z toward viewer): upper-left, in front.
  const SUN = (() => { const v=[-0.62, 0.38, 0.69], n=Math.hypot(v[0],v[1],v[2]); return [v[0]/n, v[1]/n, v[2]/n]; })();

  // Brand palette
  const NAVY = [10, 22, 40];
  const BLUE = [30, 111, 255];
  const COL = {
    grid: 'rgba(10, 22, 40, 0.07)',
    gridStrong: 'rgba(10, 22, 40, 0.14)',
    arc: 'rgba(30, 111, 255, 1)',
    arcGlow: 'rgba(30, 111, 255, 0.35)',
    label: 'rgba(10, 22, 40, 0.85)',
    labelDim: 'rgba(10, 22, 40, 0.45)',
  };

  // Cities (lat, lon, name, size)
  const cities = [
    // Trimmed set so the globe reads cleaner (less visual crowding).
    {n:'New York', lat:40.7, lon:-74.0, s:1.15},
    {n:'San Francisco', lat:37.8, lon:-122.4, s:1.05},
    {n:'Mexico City', lat:19.4, lon:-99.1, s:0.95},
    {n:'São Paulo', lat:-23.5, lon:-46.6, s:1.0},
    {n:'London', lat:51.5, lon:-0.1, s:1.15},
    {n:'Paris', lat:48.9, lon:2.3, s:0.95},
    {n:'Cairo', lat:30.0, lon:31.2, s:0.95},
    {n:'Lagos', lat:6.5, lon:3.4, s:0.9},
    {n:'Johannesburg', lat:-26.2, lon:28.0, s:0.9},
    {n:'Dubai', lat:25.2, lon:55.3, s:0.95},
    {n:'Mumbai', lat:19.1, lon:72.9, s:0.95},
    {n:'Singapore', lat:1.35, lon:103.8, s:0.95},
    {n:'Shanghai', lat:31.2, lon:121.5, s:1.0},
    {n:'Tokyo', lat:35.7, lon:139.7, s:1.15},
    {n:'Sydney', lat:-33.9, lon:151.2, s:0.95},
  ];

  /* ---- Land mask: decode run-length bitmap (alternating sea/land runs, varint, base64) ---- */
  let mask = null, MW = 0, MH = 0;
  function decodeMask(){
    const L = window.WIN_LAND;
    if (!L) return false;
    MW = L.w; MH = L.h;
    const bin = atob(L.rle);
    mask = new Uint8Array(MW * MH);
    let pos = 0, i = 0, v = 0;
    while (i < bin.length && pos < mask.length){
      let n = 0, shift = 0, b;
      do { b = bin.charCodeAt(i++); n |= (b & 127) << shift; shift += 7; } while (b & 128);
      if (v) mask.fill(1, pos, Math.min(mask.length, pos + n));
      pos += n; v ^= 1;
    }
    return true;
  }
  function isLand(lat, lon){
    let x = Math.floor((lon + 180) / 360 * MW) % MW; if (x < 0) x += MW;
    let y = Math.floor((90 - lat) / 180 * MH); y = y < 0 ? 0 : y >= MH ? MH - 1 : y;
    return mask[y * MW + x] === 1;
  }

  // Land dots: latitude rows with equal arc spacing (hex-ish stagger), kept only where land.
  let dots = null, nDots = 0;
  function buildDots(spacingPx){
    if (!mask && !decodeMask()) { dots = new Float32Array(0); nDots = 0; return; }
    const step = spacingPx / R;               // radians between dots
    const rows = Math.round(Math.PI / step);
    const out = [];
    for (let r = 0; r <= rows; r++){
      const phi = -Math.PI/2 + (r / rows) * Math.PI;
      const lat = phi * 180 / Math.PI;
      const cphi = Math.cos(phi);
      const cnt = Math.max(1, Math.round(2 * Math.PI * cphi / step));
      const off = (r & 1) ? 0.5 : 0;
      for (let k = 0; k < cnt; k++){
        const lon = ((k + off) / cnt) * 360 - 180;
        if (!isLand(lat, lon)) continue;
        const th = lon * Math.PI / 180;
        out.push(cphi * Math.sin(th), Math.sin(phi), cphi * Math.cos(th));
      }
    }
    dots = new Float32Array(out);
    nDots = dots.length / 3;
  }

  /* ---- Pre-rendered sphere: ocean shading, terminator, atmosphere ---- */
  let sphere = null;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function buildSphere(){
    // Smooth gradients, so shade at half device resolution (4x fewer pixels) and upscale; a crisp rim stroke is drawn per frame.
    const SC = 0.5;
    const S = Math.max(2, Math.round(W * DPR * SC));
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data;
    const half = S / 2, Rp = R * DPR * SC, haloR = Math.min(half, Rp * 1.14);
    // Day -> twilight -> night ocean colours (kept in the site's cool blue/navy family)
    const DAY = [228, 238, 254], TWI = [204, 219, 247], NIGHT = [112, 136, 190];
    for (let py = 0; py < S; py++){
      for (let px = 0; px < S; px++){
        const x = (px + 0.5 - half) / Rp, y = (half - (py + 0.5)) / Rp;
        const r2 = x*x + y*y, r = Math.sqrt(r2);
        const o = (py * S + px) * 4;
        if (r > haloR / Rp) continue;
        if (r <= 1.0 + 1/Rp){
          const nz = Math.sqrt(Math.max(0, 1 - r2));
          const lam = x*SUN[0] + y*SUN[1] + nz*SUN[2];
          const day = smooth(-0.18, 0.42, lam);
          const twi = Math.exp(-Math.pow((lam - 0.02) / 0.16, 2));
          let cr = NIGHT[0] + (DAY[0]-NIGHT[0])*day, cg = NIGHT[1] + (DAY[1]-NIGHT[1])*day, cb = NIGHT[2] + (DAY[2]-NIGHT[2])*day;
          // warm-free twilight band: a slightly more saturated blue along the terminator
          cr += (TWI[0]-cr)*twi*0.55; cg += (TWI[1]-cg)*twi*0.55; cb += (TWI[2]-cb)*twi*0.55;
          // soft sun glint on the ocean
          const rx = 2*lam*x - SUN[0], ry = 2*lam*y - SUN[1], rz = 2*lam*nz - SUN[2];
          const spec = Math.pow(Math.max(0, rz), 60) * 0.55 * day;
          cr += (255-cr)*spec; cg += (255-cg)*spec; cb += (255-cb)*spec;
          // atmosphere: fresnel rim in brand blue, stronger on the lit side
          const fres = Math.pow(1 - nz, 2.6);
          const rim = fres * (0.18 + 0.5 * day);
          cr += (BLUE[0]-cr)*rim*0.8; cg += (BLUE[1]-cg)*rim*0.8; cb += (BLUE[2]-cb)*rim*0.8;
          // edge anti-aliasing
          const cov = Math.max(0, Math.min(1, (1 - r) * Rp + 0.5));
          d[o] = cr; d[o+1] = cg; d[o+2] = cb; d[o+3] = 255 * cov;
          if (cov < 1){ // blend halo underneath at the edge
            const hh = 0.20 * (0.35 + 0.65 * day);
            const ha = hh * (1 - cov);
            const a = d[o+3]/255 + ha * (1 - d[o+3]/255);
            d[o] = (cr*cov + BLUE[0]*ha*(1-cov)) / (cov + ha*(1-cov));
            d[o+1] = (cg*cov + BLUE[1]*ha*(1-cov)) / (cov + ha*(1-cov));
            d[o+2] = (cb*cov + BLUE[2]*ha*(1-cov)) / (cov + ha*(1-cov));
            d[o+3] = 255 * a;
          }
        } else {
          // outer halo
          const t = (r - 1) / (haloR / Rp - 1);
          const lam = x*SUN[0] + y*SUN[1];
          const lit = smooth(-0.6, 0.7, lam / r);
          const a = 0.22 * Math.pow(1 - t, 2.6) * (0.3 + 0.7 * lit);
          d[o] = BLUE[0]; d[o+1] = BLUE[1]; d[o+2] = BLUE[2]; d[o+3] = 255 * a;
        }
      }
    }
    g.putImageData(img, 0, 0);
    sphere = c;
  }

  /* ---- Math helpers ---- */
  function slerp(a, b, t){
    const dot = Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2]));
    const om = Math.acos(dot);
    if (om < 1e-6) return a.slice();
    const s = Math.sin(om);
    const k1 = Math.sin((1-t)*om)/s, k2 = Math.sin(t*om)/s;
    return [a[0]*k1+b[0]*k2, a[1]*k1+b[1]*k2, a[2]*k1+b[2]*k2];
  }
  function latLonToUnit(lat, lon){
    const phi = lat*Math.PI/180, th = lon*Math.PI/180;
    return [Math.cos(phi)*Math.sin(th), Math.sin(phi), Math.cos(phi)*Math.cos(th)];
  }
  let cosY = 1, sinY = 0, cosT = Math.cos(TILT), sinT = Math.sin(TILT);
  function setCamera(){ cosY = Math.cos(yaw); sinY = Math.sin(yaw); }
  function projectUnit(u){
    // Apply yaw around Y, then tilt around X
    const x = u[0]*cosY + u[2]*sinY;
    const z = -u[0]*sinY + u[2]*cosY;
    const y2 = u[1]*cosT - z*sinT;
    const z2 = u[1]*sinT + z*cosT;
    return {x: cx + x*R, y: cy - y2*R, z: z2};
  }

  // Active flying arcs
  const hub = {n:'Cleveland', lat:41.4, lon:-81.8};
  const partners = cities.slice();
  const arcs = [];
  function spawnArc(){
    const from = hub;
    const to = partners[Math.floor(Math.random()*partners.length)];
    arcs.push({
      a: latLonToUnit(from.lat, from.lon),
      b: latLonToUnit(to.lat, to.lon),
      t0: performance.now(),
      dur: 2200 + Math.random()*1500,
      endCity: to,
    });
    if (arcs.length > 8) arcs.shift();
  }
  // Respect prefers-reduced-motion: draw a single static frame (no rotation or flying arcs).
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let needsBuild = true;
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    if (!W || !H) return;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    cx = W/2; cy = H/2;
    R = Math.min(W, H) * 0.44;
    needsBuild = true;
  }
  window.addEventListener('resize', () => { resize(); if (reduceMotion) drawScene(); });
  resize();

  function drawGrid(){
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.clip();
    ctx.lineWidth = 0.6;
    // Parallels
    for (let lat = -60; lat <= 60; lat += 30){
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 6){
        const p = projectUnit(latLonToUnit(lat, lon));
        if (p.z > -0.02){
          if (!started){ ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else { started = false; }
      }
      ctx.strokeStyle = COL.grid;
      ctx.stroke();
    }
    ctx.beginPath();
    let started = false;
    for (let lon = -180; lon <= 180; lon += 6){
      const p = projectUnit(latLonToUnit(0, lon));
      if (p.z > -0.02){ if (!started){ ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); } else started = false;
    }
    ctx.strokeStyle = COL.gridStrong; ctx.stroke();
    // Meridians
    ctx.strokeStyle = COL.grid;
    ctx.beginPath();
    for (let lon = -180; lon < 180; lon += 30){
      started = false;
      for (let lat = -84; lat <= 84; lat += 6){
        const p = projectUnit(latLonToUnit(lat, lon));
        if (p.z > -0.02){
          if (!started){ ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else { started = false; }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Land dots: depth-based size and opacity, lit by the sun; night-side dots glow blue like city lights.
  const NB = 8; // opacity buckets (one path + fill per bucket)
  const dayPaths = new Array(NB), nightPaths = new Array(NB);
  function drawLand(){
    if (!dots) return;
    const baseR = Math.max(0.9, R / 190);
    for (let i = 0; i < NB; i++){ dayPaths[i] = new Path2D(); nightPaths[i] = new Path2D(); }
    for (let i = 0; i < nDots; i++){
      const ux = dots[i*3], uy = dots[i*3+1], uz = dots[i*3+2];
      const z = -ux*sinY + uz*cosY;
      const z2 = uy*sinT + z*cosT;
      if (z2 <= 0.01) continue;
      const x = ux*cosY + uz*sinY;
      const y2 = uy*cosT - z*sinT;
      const lam = x*SUN[0] + y2*SUN[1] + z2*SUN[2];
      const day = smooth(-0.12, 0.38, lam);
      // limb falloff: dots shrink and fade toward the horizon (depth cue)
      const depth = Math.pow(z2, 0.55);
      const rad = baseR * (0.45 + 0.75 * depth);
      const px = cx + x*R, py = cy - y2*R;
      if (day > 0.5){
        const a = Math.min(NB-1, Math.floor(((day - 0.5) * 2 * 0.35 + 0.65 * depth * day) * NB));
        const path = dayPaths[Math.max(0, a)];
        path.moveTo(px + rad, py); path.arc(px, py, rad, 0, Math.PI*2);
      } else {
        const a = Math.min(NB-1, Math.floor(depth * (0.45 + 0.55 * day * 2) * NB));
        const path = nightPaths[Math.max(0, a)];
        path.moveTo(px + rad, py); path.arc(px, py, rad, 0, Math.PI*2);
      }
    }
    for (let i = 0; i < NB; i++){
      const f = (i + 0.5) / NB;
      ctx.fillStyle = `rgba(${NAVY[0]},${NAVY[1]},${NAVY[2]},${(0.22 + 0.68 * f).toFixed(3)})`;
      ctx.fill(dayPaths[i]);
      ctx.fillStyle = `rgba(206,226,255,${(0.18 + 0.6 * f).toFixed(3)})`;
      ctx.fill(nightPaths[i]);
    }
  }


  /* ---- Ring text: the brand line wrapped around the globe on a parallel, rotating with the Earth ----
     Each glyph is placed on the sphere (lat/lon), projected with the same camera as the land dots, and drawn with an
     affine transform so it follows the surface (foreshortened toward the limb). Far-side glyphs are skipped.
     Wide globes carry one line; narrow ones stack the phrase on two parallels so the whole line stays readable. */
  const RING_PHRASE = 'WALDRON INNOVATION NETWORK \u00B7 ONLINE IN 50+ COUNTRIES';
  let ring = null;
  function buildRing(){
    const size = Math.max(8.5, Math.min(11, R * 0.082));
    const font = '600 ' + size.toFixed(1) + 'px "JetBrains Mono", ui-monospace, monospace';
    const stacked = R < 150;
    const defs = stacked
      ? [{t:'WALDRON INNOVATION NETWORK \u00B7', lat:-3,  acc:false}, {t:'ONLINE IN 50+ COUNTRIES', lat:-13, acc:true}]
      : [{t:RING_PHRASE, lat:-9, acc:false}];
    const rows = defs.map(d => {
      const lat = d.lat * Math.PI / 180, cl = Math.cos(lat);
      const natural = (size * 0.6 + 0.8) / (R * cl);          // radians per glyph so glyphs do not touch
      const step = Math.max(natural, 1.85 / 53);              // keep the full phrase within ~105 degrees where room allows
      const text = d.t.length;
      const copies = text * step * 2 <= 2 * Math.PI * 0.92 ? 2 : 1;
      return {t:d.t, lat, cl, sl:Math.sin(lat), cl2:Math.cos(lat + 0.012), sl2:Math.sin(lat + 0.012), step, copies, acc:d.acc,
              // centre the first copy on the meridian facing the camera at start (static / reduced-motion frame reads in full)
              th0: -START_YAW - (text - 1) * step / 2};
    });
    ring = {font, rows};
  }
  function drawRingText(){
    if (!ring) return;
    const d = 0.012;
    ctx.save();
    ctx.font = ring.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    for (const row of ring.rows){
      const len = row.t.length;
      for (let c = 0; c < row.copies; c++){
        for (let k = 0; k < len; k++){
          const ch = row.t.charAt(k);
          if (ch === ' ') continue;
          const th = row.th0 + c * Math.PI + k * row.step, s = Math.sin(th), co = Math.cos(th);
          const p0 = projectUnit([s*row.cl, row.sl, co*row.cl]);
          if (p0.z < 0.1) continue;                            // far side: hidden
          const pE = projectUnit([Math.sin(th + d)*row.cl, row.sl, Math.cos(th + d)*row.cl]);
          const pN = projectUnit([s*row.cl2, row.sl2, co*row.cl2]);
          const ex = (pE.x - p0.x) / (R * row.cl * d), ey = (pE.y - p0.y) / (R * row.cl * d);  // along the parallel
          const nx = (pN.x - p0.x) / (R * d),          ny = (pN.y - p0.y) / (R * d);           // toward north
          ctx.setTransform(DPR*ex, DPR*ey, -DPR*nx, -DPR*ny, DPR*p0.x, DPR*p0.y);
          ctx.globalAlpha = smooth(0.1, 0.5, p0.z) * 0.92;
          const accent = row.acc || (row.t === RING_PHRASE && k >= RING_PHRASE.indexOf('ONLINE'));
          ctx.strokeText(ch, 0, 0);
          ctx.fillStyle = accent ? '#1a62e8' : '#0a1628';
          ctx.fillText(ch, 0, 0);
        }
      }
    }
    ctx.restore();
  }

  function drawCities(){
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    for (const c of cities){
      const p = projectUnit(latLonToUnit(c.lat, c.lon));
      if (p.z <= 0.05) continue;
      const alpha = Math.min(1, 0.4 + p.z);
      ctx.fillStyle = `rgba(30,111,255,${(alpha*0.18).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(10,22,40,${alpha.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.8*c.s, 0, Math.PI*2); ctx.fill();
      if (p.z > 0.2 && c.s >= (R < 150 ? 1.1 : 0.9)){ // fewer labels on small screens
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.strokeText(c.n, p.x + 6, p.y - 4);
        ctx.fillStyle = p.z > 0.6 ? COL.label : COL.labelDim;
        ctx.fillText(c.n, p.x + 6, p.y - 4);
      }
    }
    const hp = projectUnit(latLonToUnit(hub.lat, hub.lon));
    if (hp.z > 0){
      const pulse = reduceMotion ? 0.5 : 0.5 + 0.5*Math.sin(performance.now()/500);
      ctx.fillStyle = `rgba(30,111,255,${(0.15 + pulse*0.2).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 6 + pulse*4, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1E6FFF';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 4, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#1E6FFF';
      ctx.beginPath(); ctx.arc(hp.x, hp.y, 1.8, 0, Math.PI*2); ctx.fill();
    }
  }

  function drawArcs(now){
    for (const arc of arcs){
      const t = Math.min(1, (now - arc.t0)/arc.dur);
      const steps = 48;
      const tailLen = 0.4;
      const headT = t;
      const tailT = Math.max(0, t - tailLen);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let pass = 0; pass < 2; pass++){
        ctx.beginPath();
        ctx.strokeStyle = pass === 0 ? COL.arcGlow : COL.arc;
        ctx.lineWidth = pass === 0 ? 3.5 : 1.4;
        let moved = false;
        for (let i=0;i<=steps;i++){
          const u = i/steps;
          if (u < tailT || u > headT) continue;
          const p = slerp(arc.a, arc.b, u);
          const lift = Math.sin(u * Math.PI) * 0.25;
          const scale = 1 + lift;
          const proj = projectUnit([p[0]*scale, p[1]*scale, p[2]*scale]);
          if (proj.z < -0.2) { moved = false; continue; }
          if (!moved){ ctx.moveTo(proj.x, proj.y); moved = true; }
          else ctx.lineTo(proj.x, proj.y);
        }
        ctx.globalAlpha = pass === 0 ? 0.5 * (1 - Math.max(0, t-0.85)*6) : 1 * (1 - Math.max(0, t-0.9)*10);
        ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (t > 0 && t < 1){
        const p = slerp(arc.a, arc.b, headT);
        const lift = Math.sin(headT*Math.PI)*0.25;
        const proj = projectUnit([p[0]*(1+lift), p[1]*(1+lift), p[2]*(1+lift)]);
        if (proj.z > -0.1){
          ctx.fillStyle = 'rgba(30,111,255,0.28)';
          ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#1E6FFF';
          ctx.beginPath(); ctx.arc(proj.x, proj.y, 2, 0, Math.PI*2); ctx.fill();
        }
      }
    }
    for (let i=arcs.length-1;i>=0;i--){
      if ((now - arcs[i].t0) > arcs[i].dur + 100) arcs.splice(i,1);
    }
  }

  function drawScene(now){
    if (!W || !H) return;
    if (needsBuild){
      buildSphere();
      buildDots(Math.max(4.4, R / 42));
      buildRing();
      needsBuild = false;
    }
    setCamera();
    ctx.clearRect(0,0,W,H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sphere, 0, 0, W, H);
    // crisp limb
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(26, 98, 232, 0.28)'; ctx.lineWidth = 1; ctx.stroke();
    drawGrid();
    drawLand();
    drawArcs(now || performance.now());
    drawRingText();
    drawCities();
  }

  let last = performance.now();
  function frame(now){
    rafId = null;
    if (!active) return;
    const dt = Math.min(0.1, (now - last)/1000); last = now;
    if (!reduceMotion) yaw += dt * 0.08;
    drawScene(now);
    if (!reduceMotion) rafId = requestAnimationFrame(frame);
  }

  // Run only while Home is showing, the globe is in the viewport, and the tab is visible.
  function update(){
    const next = pageActive && inView && tabVisible;
    if (next === active) return;
    active = next;
    if (active){
      last = performance.now();
      if (!reduceMotion && !spawnInterval){
        if (!arcs.length) for (let i=0;i<4;i++) setTimeout(spawnArc, i*400);
        spawnInterval = setInterval(spawnArc, 900);
      }
      if (!rafId) rafId = requestAnimationFrame(frame);
    } else {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (spawnInterval) clearInterval(spawnInterval);
      spawnInterval = null;
    }
  }
  function setActive(on){ pageActive = !!on; update(); }

  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; update(); });
  if ('IntersectionObserver' in window){
    inView = false;
    new IntersectionObserver((entries) => {
      for (const e of entries) inView = e.isIntersecting;
      update();
    }).observe(canvas);
  }

  globeControls = { setActive };
  setActive(current === 0);
})();
