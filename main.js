/* =========== Page controller =========== */
const pages = Array.from(document.querySelectorAll('.page'));
const names = ['Home','Services','Pricing','Contact'];
let current = 0;
let busy = false;
const pgBtns = document.querySelectorAll('.pg-btn');
const stepBig = document.getElementById('stepBig');
const stepName = document.getElementById('stepName');
const brandStripe = document.getElementById('brandStripe');
let globeControls = null;

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
  pgBtns.forEach((b,i) => b.classList.toggle('active', i===idx));
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

/* =========== Stripe Customer Portal (email lookup) =========== */
function openBillingModal(){
  const m = document.getElementById('billingModal');
  if (!m) return;
  const note = document.getElementById('billingNote');
  if (note) note.textContent = '';
  const email = document.getElementById('bill-email');
  if (email) email.value = '';
  m.classList.add('show');
  m.setAttribute('aria-hidden', 'false');
  setTimeout(() => { try { email && email.focus(); } catch(e){} }, 0);
}

function closeBillingModal(){
  const m = document.getElementById('billingModal');
  if (!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('[data-billing-close="1"]').forEach(el => el.addEventListener('click', closeBillingModal));

const manageBtn = document.getElementById('manageBillingBtn');
if (manageBtn) manageBtn.addEventListener('click', openBillingModal);

const billingForm = document.getElementById('billingForm');
if (billingForm){
  billingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = document.getElementById('billingNote');
    const btn = document.getElementById('billingSubmit');
    const email = document.getElementById('bill-email')?.value?.trim();
    if (!email) { if (note) note.textContent = 'Please enter your email.'; return; }

    if (btn) btn.disabled = true;
    if (note) note.textContent = 'Opening billing portal…';

    try{
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to open portal.');
      window.location.href = data.url;
    } catch(err){
      if (note) note.textContent = (err && err.message) ? err.message : 'Failed to open portal.';
      if (btn) btn.disabled = false;
    }
  });
}

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
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.clientSecret;
    }
  });

  embeddedCheckoutInstance.mount('#embeddedCheckout');
}

/* =========== Triggers =========== */
pgBtns.forEach(b => b.addEventListener('click', () => goTo(parseInt(b.dataset.idx,10))));
document.getElementById('pgPrev').addEventListener('click', () => goTo(current-1));
document.getElementById('pgNext').addEventListener('click', () => goTo(current+1));

document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => {
    const plan = el.dataset.plan;
    if (plan && el.classList.contains('p-cta')){
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
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(current+1); }
  else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(current-1); }
  else if (/^[1-4]$/.test(e.key)) goTo(parseInt(e.key,10)-1);
});

// Note: we intentionally do NOT change pages on scroll/swipe.
// Scrolling should only scroll within the active page.

/* =========== Contact form =========== */
const CONTACT_EMAIL_TO = 'hello@waldroninnovation.network';
// Optional: set to a real endpoint later (Formspree/Netlify/etc). Leave empty to use mailto fallback.
const CONTACT_FORM_ENDPOINT = '';

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

document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const req = ['f-name','f-biz','f-email'];
  let ok = true;
  req.forEach(id => {
    const el = document.getElementById(id);
    if (!el.value.trim()) { el.style.borderColor = '#ef4444'; ok=false; }
    else el.style.borderColor = '';
  });
  if (!ok) return;

  const fd = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());

  // Prefer a real endpoint if configured.
  if (CONTACT_FORM_ENDPOINT){
    try{
      const res = await fetch(CONTACT_FORM_ENDPOINT, {
        method: 'POST',
        headers: {'Accept':'application/json'},
        body: fd
      });
      if (!res.ok) throw new Error('Bad response');
      showSuccess(`<b>Thanks - message sent.</b>We’ll be in touch within 24 hours.`);
      return;
    } catch(err){
      // Fall back to mailto if endpoint fails (useful during early setup).
    }
  }

  const subject = encodeURIComponent(`New website inquiry: ${data.biz || data.name || 'WIN'}`);
  const body = encodeURIComponent(buildEmailBody(data));
  const mailto = `mailto:${encodeURIComponent(CONTACT_EMAIL_TO)}?subject=${subject}&body=${body}`;
  // Open mail client with prefilled message (works without hosting).
  window.location.href = mailto;
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

/* =========== Wireframe Globe (canvas) =========== */
(function initGlobe(){
  const canvas = document.getElementById('globeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, R = 0, cx = 0, cy = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  let active = true;
  let rafId = null;
  let spawnInterval = null;

  // Camera orientation
  const TILT = 0.36; // ~21 deg
  let yaw = 0; // auto-rotate

  // Colors (on white): use brand navy/blue
  const COL = {
    grid: 'rgba(10, 22, 40, 0.08)',
    gridStrong: 'rgba(10, 22, 40, 0.18)',
    land: 'rgba(10, 22, 40, 0.22)',
    landStrong: 'rgba(10, 22, 40, 0.35)',
    arc: 'rgba(30, 111, 255, 1)',
    arcGlow: 'rgba(30, 111, 255, 0.35)',
    city: '#1E6FFF',
    label: 'rgba(10, 22, 40, 0.85)',
    labelDim: 'rgba(10, 22, 40, 0.45)',
  };

  // Cities (lat, lon, name, size)
  const cities = [
    {n:'New York', lat:40.7, lon:-74.0, s:1.2},
    {n:'Washington DC', lat:38.9, lon:-77.0, s:1},
    {n:'Miami', lat:25.8, lon:-80.2, s:1},
    {n:'Chicago', lat:41.9, lon:-87.6, s:1},
    {n:'Denver', lat:39.7, lon:-104.9, s:1},
    {n:'San Francisco', lat:37.8, lon:-122.4, s:1.1},
    {n:'Seattle', lat:47.6, lon:-122.3, s:1},
    {n:'Vancouver', lat:49.3, lon:-123.1, s:0.9},
    {n:'Montréal', lat:45.5, lon:-73.6, s:0.9},
    {n:'Mexico City', lat:19.4, lon:-99.1, s:1},
    {n:'Bogotá', lat:4.6, lon:-74.1, s:0.9},
    {n:'Lima', lat:-12.0, lon:-77.0, s:0.9},
    {n:'São Paulo', lat:-23.5, lon:-46.6, s:1.1},
    {n:'Buenos Aires', lat:-34.6, lon:-58.4, s:1},
    {n:'London', lat:51.5, lon:-0.1, s:1.2},
    {n:'Paris', lat:48.9, lon:2.3, s:1},
    {n:'Berlin', lat:52.5, lon:13.4, s:1},
    {n:'Madrid', lat:40.4, lon:-3.7, s:0.9},
    {n:'Rome', lat:41.9, lon:12.5, s:0.9},
    {n:'Istanbul', lat:41.0, lon:29.0, s:1},
    {n:'Cairo', lat:30.0, lon:31.2, s:1},
    {n:'Lagos', lat:6.5, lon:3.4, s:0.9},
    {n:'Nairobi', lat:-1.3, lon:36.8, s:0.9},
    {n:'Dubai', lat:25.2, lon:55.3, s:1},
    {n:'Mumbai', lat:19.1, lon:72.9, s:1},
    {n:'Bangalore', lat:12.97, lon:77.6, s:0.9},
    {n:'Singapore', lat:1.35, lon:103.8, s:1},
    {n:'Bangkok', lat:13.75, lon:100.5, s:0.9},
    {n:'Jakarta', lat:-6.2, lon:106.8, s:0.9},
    {n:'Shanghai', lat:31.2, lon:121.5, s:1.1},
    {n:'Beijing', lat:39.9, lon:116.4, s:1},
    {n:'Hong Kong', lat:22.3, lon:114.2, s:1},
    {n:'Seoul', lat:37.6, lon:126.9, s:1},
    {n:'Tokyo', lat:35.7, lon:139.7, s:1.2},
    {n:'Sydney', lat:-33.9, lon:151.2, s:1},
    {n:'Auckland', lat:-36.9, lon:174.8, s:0.9},
    {n:'Johannesburg', lat:-26.2, lon:28.0, s:0.9},
  ];

  // Continent outlines, hand-simplified polygons in [lon, lat] pairs.
  // Each polygon is a closed ring; we subdivide edges so they curve with the sphere.
  const continents = [
    // ---- North America (mainland + a bit of Alaska)
    [[-168,66],[-162,70],[-156,71],[-140,70],[-128,70],[-115,72],[-105,73],[-95,74],[-85,73],[-75,72],
     [-68,66],[-60,60],[-56,52],[-60,46],[-66,45],[-70,42],[-74,40],[-76,37],[-76,34],[-81,31],[-82,27],
     [-80,25],[-84,24],[-88,30],[-93,29],[-97,26],[-99,22],[-106,23],[-110,24],[-115,30],[-118,33],
     [-122,37],[-124,42],[-124,48],[-130,54],[-135,58],[-142,60],[-150,60],[-156,60],[-162,60],[-166,62]],
    // ---- Greenland
    [[-55,60],[-50,62],[-44,60],[-40,63],[-35,67],[-30,70],[-22,72],[-20,77],[-28,82],[-40,83],
     [-55,83],[-65,81],[-70,76],[-70,70],[-62,64]],
    // ---- Central America / Mexico tail (kept separate for clarity)
    [[-97,17],[-93,16],[-88,16],[-83,15],[-78,9],[-80,8],[-83,8],[-88,12],[-92,14],[-97,15]],
    // ---- South America
    [[-81,12],[-76,11],[-72,12],[-64,10],[-60,8],[-52,5],[-48,0],[-42,-2],[-38,-7],[-35,-10],
     [-38,-15],[-40,-22],[-44,-26],[-48,-30],[-54,-34],[-58,-38],[-62,-40],[-66,-43],[-70,-50],
     [-72,-54],[-68,-54],[-67,-46],[-72,-40],[-73,-35],[-72,-30],[-71,-24],[-70,-18],[-75,-14],
     [-79,-8],[-80,-4],[-78,2],[-77,6],[-81,8]],
    // ---- Africa
    [[-17,21],[-12,28],[-8,32],[-4,35],[3,36],[10,34],[15,32],[20,31],[25,31],[32,31],[34,28],
     [38,20],[40,12],[42,10],[45,10],[48,12],[51,11],[51,6],[48,2],[45,-2],[42,-7],[40,-12],
     [39,-17],[36,-22],[34,-26],[32,-29],[28,-33],[22,-34],[18,-34],[15,-30],[13,-25],[12,-18],
     [9,-10],[8,-4],[10,1],[8,5],[3,6],[-3,6],[-8,5],[-12,8],[-16,13],[-17,17]],
    // ---- Europe (includes UK/Ireland roughly)
    [[-10,35],[-9,39],[-10,43],[-5,44],[-2,43],[0,47],[-4,51],[-6,55],[-10,58],[-5,58],[-2,57],
     [3,59],[7,62],[11,64],[15,67],[22,70],[30,70],[40,68],[50,69],[60,70],[66,68],[60,60],
     [52,55],[42,48],[35,44],[30,41],[23,40],[18,40],[12,36],[8,44],[3,43],[-2,36]],
    // ---- Asia (big, includes India + SE tip + Kamchatka)
    [[30,70],[50,72],[75,74],[100,78],[130,75],[145,72],[160,68],[170,66],[180,65],
     [175,60],[170,58],[160,55],[155,50],[148,45],[145,42],[140,40],[135,35],[130,33],[123,30],
     [118,22],[114,18],[108,16],[105,10],[103,5],[100,3],[98,2],[100,8],[96,16],[94,22],[88,22],
     [82,20],[78,15],[74,10],[73,18],[72,22],[68,24],[64,25],[58,25],[55,30],[53,36],[50,40],
     [44,42],[40,44],[34,42],[32,46],[34,52],[40,58],[48,62],[55,66],[60,68]],
    // ---- Indian subcontinent (fill belly)
    [[70,24],[72,20],[74,15],[76,10],[80,8],[84,11],[88,20],[88,25],[82,23],[77,22],[72,24]],
    // ---- SE Asia / Indonesia cluster (as simple islands)
    [[95,6],[100,4],[105,2],[112,1],[118,0],[125,-1],[132,-3],[138,-4],[140,-8],[132,-8],
     [125,-9],[118,-9],[110,-8],[102,-6],[96,-3]],
    // ---- Japan (a lozenge)
    [[130,33],[134,34],[138,36],[141,40],[145,44],[141,41],[137,35],[133,33]],
    // ---- Philippines (blob)
    [[119,6],[121,8],[123,12],[125,15],[123,18],[121,16],[120,12],[119,9]],
    // ---- Australia
    [[114,-22],[122,-18],[130,-12],[137,-12],[142,-10],[146,-18],[150,-24],[153,-28],[150,-34],
     [146,-38],[140,-38],[132,-34],[125,-33],[118,-34],[114,-28]],
    // ---- New Zealand (two small islands merged)
    [[172,-34],[174,-36],[176,-38],[177,-42],[173,-43],[170,-42],[168,-46],[170,-47],[173,-45],
     [175,-41],[174,-38],[172,-36]],
    // ---- Madagascar
    [[43,-13],[46,-16],[48,-20],[49,-23],[47,-25],[44,-23],[43,-18]],
    // ---- UK + Ireland (separate so it reads)
    [[-10,52],[-8,55],[-5,58],[-2,58],[1,56],[2,53],[0,51],[-4,50],[-8,50]],
    // ---- Iceland
    [[-24,64],[-20,66],[-15,66],[-14,64],[-18,63],[-22,63]],
  ];

  // Great-circle arc: slerp between two unit vectors
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
  function projectUnit(u){
    // Apply yaw around Y, then tilt around X
    const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
    let x = u[0]*cy_ + u[2]*sy_;
    let y = u[1];
    let z = -u[0]*sy_ + u[2]*cy_;
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    const y2 = y*cosT - z*sinT;
    const z2 = y*sinT + z*cosT;
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
  // Initial arcs
  for (let i=0;i<4;i++) setTimeout(spawnArc, i*400);
  spawnInterval = setInterval(spawnArc, 900);

  function resize(){
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    cx = W/2; cy = H/2;
    R = Math.min(W, H) * 0.44;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawBackdrop(){
    // No background; just clear canvas so page shows through
    ctx.clearRect(0,0,W,H);
  }

  function drawGrid(){
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.clip();

    // Parallels
    for (let lat = -75; lat <= 75; lat += 15){
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 4){
        const p = projectUnit(latLonToUnit(lat, lon));
        if (p.z > -0.02){
          if (!started){ ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else { started = false; }
      }
      ctx.strokeStyle = (lat === 0) ? COL.gridStrong : COL.grid;
      ctx.lineWidth = (lat === 0) ? 0.9 : 0.6;
      ctx.stroke();
    }

    // Meridians
    for (let lon = -180; lon < 180; lon += 15){
      ctx.beginPath();
      let started = false;
      for (let lat = -85; lat <= 85; lat += 4){
        const p = projectUnit(latLonToUnit(lat, lon));
        if (p.z > -0.02){
          if (!started){ ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else { started = false; }
      }
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  function densifyEdge(a, b, step = 3){
    const out = [a];
    const dlon = b[0] - a[0];
    const dlat = b[1] - a[1];
    const dist = Math.hypot(dlon, dlat);
    const n = Math.max(1, Math.ceil(dist/step));
    for (let i=1;i<=n;i++){
      const t = i/n;
      out.push([a[0]+dlon*t, a[1]+dlat*t]);
    }
    return out;
  }
  function densifyRing(ring){
    const out = [];
    for (let i=0;i<ring.length;i++){
      const a = ring[i], b = ring[(i+1)%ring.length];
      const seg = densifyEdge(a, b, 2.5);
      for (let k=0;k<seg.length-1;k++) out.push(seg[k]);
    }
    return out;
  }
  const continentsDense = continents.map(densifyRing);

  function drawLand(){
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.clip();

    ctx.fillStyle = 'rgba(10,22,40,0.14)';
    ctx.strokeStyle = 'rgba(10,22,40,0.55)';
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const ring of continentsDense){
      const segments = [];
      let seg = null;
      for (const [lon, lat] of ring){
        const p = projectUnit(latLonToUnit(lat, lon));
        if (p.z > 0.02){
          if (!seg){ seg = []; segments.push(seg); }
          seg.push(p);
        } else {
          seg = null;
        }
      }
      if (segments.length === 0) continue;

      if (segments.length === 1 && segments[0].length >= ring.length - 2){
        const s = segments[0];
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        for (let i=1;i<s.length;i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (const s of segments){
          if (s.length < 2) continue;
          ctx.moveTo(s[0].x, s[0].y);
          for (let i=1;i<s.length;i++) ctx.lineTo(s[i].x, s[i].y);
        }
        ctx.fill();
        for (const s of segments){
          if (s.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(s[0].x, s[0].y);
          for (let i=1;i<s.length;i++) ctx.lineTo(s[i].x, s[i].y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawOuterRim(){
    ctx.beginPath(); ctx.arc(cx, cy, R+1, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(10,22,40,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R+4, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(10,22,40,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
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
      if (p.z > 0.2 && c.s >= 0.9){
        ctx.fillStyle = p.z > 0.6 ? COL.label : COL.labelDim;
        ctx.fillText(c.n, p.x + 6, p.y - 4);
      }
    }
    const hp = projectUnit(latLonToUnit(hub.lat, hub.lon));
    if (hp.z > 0){
      const pulse = 0.5 + 0.5*Math.sin(performance.now()/500);
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

  let last = performance.now();
  function frame(now){
    if (!active) return;
    const dt = (now - last)/1000; last = now;
    yaw += dt * 0.08;
    drawBackdrop();
    drawGrid();
    drawLand();
    drawOuterRim();
    drawArcs(now);
    drawCities();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  function setActive(next){
    const n = !!next;
    if (n === active) return;
    active = n;
    if (active){
      last = performance.now();
      if (!spawnInterval) spawnInterval = setInterval(spawnArc, 900);
      if (!rafId) rafId = requestAnimationFrame(frame);
    } else {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (spawnInterval) clearInterval(spawnInterval);
      spawnInterval = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setActive(false);
    else setActive(current === 0);
  });

  globeControls = { setActive };
  setActive(current === 0);
})();
