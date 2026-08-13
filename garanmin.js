/**
 * GaranTea — Admin Panel v3.1 (garanmin.js)
 * Brand Colors & Fixes
 */

'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────
const SUPA_URL = 'https://mcsygnkhdjnkmqcntwvh.supabase.co';
const SUPA_KEY = 'sb_publishable_OQXQZLhb_4coBQvG6AM2TQ_qtyl59LY';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

// ─── STATE ────────────────────────────────────────────────────────
let TOKEN   = null;
let ADMIN_U = null;
let usersPage   = 0;
let searchQuery = '';
const PAGE_SIZE = 50;
const chartRefs = {};
let clockTick = null;

const PANEL_TITLES = {
  overview: 'Kontrol Merkezi',
  finance:  'Finansal Raporlar',
  users:    'Kullanıcı Veritabanı',
  devices:  'Cihaz Envanteri',
  support:  'Destek Talepleri',
  credits:  'Kredi Ekonomisi',
  security: 'Güvenlik ve Loglar',
  api:      'API Ayarları'
};

// Yalnızca GaranTea marka renkleri
const PALETTE = [
  '#2563eb', // blue
  '#EA4335', // red
  '#0B57D0', // deep blue
  '#f87171', // light red
  '#60a5fa', // light blue
  '#991b1b', // dark red
  '#1e40af', // dark blue
  '#fca5a5', // lighter red
  '#93c5fd', // lighter blue
  '#7f1d1d'  // darkest red
];

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
Chart.defaults.plugins.tooltip.titleFont = { size: 12, weight: 'bold' };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;

// ─── SHA-256 ──────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ─── UTILS ────────────────────────────────────────────────────────
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('tr-TR'));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtDatetime = iso => iso ? new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function spin() { return `<div class="ld" style="grid-column:1/-1;padding:3rem 0"><div class="sp"></div><span>Veriler Çekiliyor...</span></div>`; }

function getGridColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
}
function getGridZeroColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
}

function destroyChart(k) {
  if (chartRefs[k]) { chartRefs[k].destroy(); chartRefs[k] = null; }
}

async function rpc(fn, extra = {}) {
  const { data, error } = await db.rpc(fn, { p_token_hash: TOKEN, ...extra });
  if (error) throw error;
  return data;
}

// ─── LOGIN & INIT ─────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('inp-err');
  const btn   = document.getElementById('login-btn');
  const u     = document.getElementById('inp-user').value.trim();
  const p     = document.getElementById('inp-pass').value.trim();

  if (!u || !p) return;
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Doğrulanıyor…';

  try {
    const hash = await sha256(u + ':' + p);
    await rpc('admin_get_stats', { p_token_hash: hash }); // Verify
    TOKEN = hash; ADMIN_U = u;
    sessionStorage.setItem('gt_adm_h', hash);
    sessionStorage.setItem('gt_adm_u', u);
    enterDashboard();
  } catch(err) {
    errEl.textContent = err.message || 'Geçersiz giriş veya rate limit.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Doğrula ve Giriş Yap';
  }
});

(async () => {
  const h = sessionStorage.getItem('gt_adm_h');
  const u = sessionStorage.getItem('gt_adm_u');
  if (h && u) {
    try { await rpc('admin_get_stats', { p_token_hash: h }); TOKEN = h; ADMIN_U = u; enterDashboard(); return; } catch(_) {}
    sessionStorage.clear();
  }
})();

function enterDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('show');
  document.getElementById('sb-uname').textContent = ADMIN_U || 'Admin';
  document.getElementById('sb-since').textContent = 'Oturum: ' + new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  startClock();
  loadPanel('overview');
}

document.getElementById('logout-btn').addEventListener('click', () => {
  TOKEN = null; ADMIN_U = null; sessionStorage.clear();
  Object.keys(chartRefs).forEach(k => destroyChart(k));
  if (clockTick) clearInterval(clockTick);
  document.getElementById('app').classList.remove('show');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('inp-pass').value = '';
});

function startClock() {
  const el = document.getElementById('clock');
  const t = () => { el.textContent = new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); };
  t(); clockTick = setInterval(t, 1000);
}

// ─── THEME & SIDEBAR ──────────────────────────────────────────────
const htmlEl = document.documentElement;
document.getElementById('theme-btn').addEventListener('click', () => {
  const isDark = htmlEl.getAttribute('data-theme') === 'dark';
  const nt = isDark ? 'light' : 'dark';
  htmlEl.setAttribute('data-theme', nt);
  localStorage.setItem('gt_theme', nt);
  document.getElementById('icon-moon').style.display = nt==='dark' ? 'none' : 'block';
  document.getElementById('icon-sun').style.display = nt==='dark' ? 'block' : 'none';
  
  Chart.defaults.color = nt === 'dark' ? '#94a3b8' : '#64748b';
  Object.keys(chartRefs).forEach(k => { 
    if(chartRefs[k]) {
      if (chartRefs[k].options.scales) {
        if (chartRefs[k].options.scales.x) {
          chartRefs[k].options.scales.x.grid.color = getGridColor();
          chartRefs[k].options.scales.x.border = { color: getGridZeroColor() };
        }
        if (chartRefs[k].options.scales.y) {
          chartRefs[k].options.scales.y.grid.color = getGridColor();
          chartRefs[k].options.scales.y.border = { color: getGridZeroColor() };
        }
      }
      if (chartRefs[k].options.scales && chartRefs[k].options.scales.r) {
        chartRefs[k].options.scales.r.grid.color = getGridColor();
        chartRefs[k].options.scales.r.angleLines = { color: getGridColor() };
      }
      chartRefs[k].update();
    }
  });
});

// Sync Theme Button Icon on load
if (htmlEl.getAttribute('data-theme') === 'light') {
  document.getElementById('icon-moon').style.display = 'block';
  document.getElementById('icon-sun').style.display = 'none';
} else {
  document.getElementById('icon-moon').style.display = 'none';
  document.getElementById('icon-sun').style.display = 'block';
}

const sidebar = document.getElementById('sidebar');
document.getElementById('sb-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('gt_sb_col', sidebar.classList.contains('collapsed'));
});
if (localStorage.getItem('gt_sb_col') === 'true') sidebar.classList.add('collapsed');

// ─── NAVIGATION ───────────────────────────────────────────────────
function handleNav(panelId) {
  document.querySelectorAll('.nitem, .mnitem').forEach(n => n.classList.remove('on'));
  const d = document.querySelector(`.nitem[data-panel="${panelId}"]`); if(d) d.classList.add('on');
  const m = document.querySelector(`.mnitem[data-panel="${panelId}"]`); if(m) m.classList.add('on');
  document.getElementById('page-title').textContent = PANEL_TITLES[panelId] || panelId;
  loadPanel(panelId);
}
document.querySelectorAll('.nitem, .mnitem').forEach(i => i.addEventListener('click', () => handleNav(i.dataset.panel)));
document.getElementById('refresh-btn').addEventListener('click', () => {
  const a = document.querySelector('.nitem.on');
  if (a) loadPanel(a.dataset.panel);
});

async function loadPanel(name) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  
  // Show target panel
  const t = document.getElementById('panel-' + name);
  if (t) t.classList.add('on');
  else return; // If panel DOM doesn't exist, exit

  // Load data asynchronously (errors caught inside to prevent breaking nav)
  if (name === 'overview') await renderOverview();
  else if (name === 'users') await loadUsers(0);
  else if (name === 'devices') await renderDevices();
  else if (name === 'credits') await renderCredits();
  else if (name === 'support') await renderSupport();
}

// ─── ICONS ────────────────────────────────────────────────────────
const ic = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  credit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
  device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
  bar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
};

function buildKpi(lbl, val, ico, col, sub, trendUp) {
  return `<div class="card kpi">
    <div class="kpi-h"><div class="kpi-lbl">${lbl}</div><div class="kpi-ico" style="color:var(--${col})">${ico}</div></div>
    <div>
      <div class="kpi-val">${val}</div>
      <div class="kpi-sub ${trendUp === true ? 'trend-up' : (trendUp === false ? 'trend-dn' : '')}">${sub}</div>
    </div>
  </div>`;
}

function buildChartCard(cls, title, icon, id) {
  return `<div class="card ${cls}">
    <div class="chead"><div class="clabel">${icon} ${title}</div></div>
    <div class="cbody"><div class="cw"><canvas id="${id}"></canvas></div></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  OVERVIEW (V3 BENTO)
// ═══════════════════════════════════════════════════════════════════
async function renderOverview() {
  const g = document.getElementById('ov-grid');
  g.innerHTML = spin();
  try {
    const [stats, trend, brands, warranty] = await Promise.all([
      rpc('admin_get_stats'), rpc('admin_get_signup_trend'),
      rpc('admin_get_device_brands'), rpc('admin_get_warranty_stats')
    ]);

    g.innerHTML = `
      ${buildKpi('Kullanıcı (DAU/MAU)', `${fmt(stats.dau)} <span style="font-size:1rem;color:var(--muted)">/ ${fmt(stats.mau)}</span>`, ic.users, 'blue', `Son 30 günde ${fmt(stats.new_users_30d)} yeni kayıt`, true)}
      ${buildKpi('Eklenen Cihaz', fmt(stats.total_devices), ic.device, 'blue', `${fmt(stats.users_with_devices)} aktif cihaz sahibi`, null)}
      ${buildKpi('Ekonomi Hacmi', fmt(Math.round(stats.total_credits_sum)), ic.credit, 'red', `${fmt(Math.round(stats.total_ads_watched))} reklam izlendi`, true)}
      ${buildKpi('Destek Talebi', fmt(stats.support_tickets_total), ic.activity, 'red', `Son 7 günde ${fmt(stats.support_tickets_7d)} talep`, false)}
      ${buildChartCard('chart-main', 'Büyüme Hızı', ic.activity, 'ch-act')}
      ${buildChartCard('chart-side', 'Top 10 Marka', ic.pie, 'ch-brands')}
      ${buildChartCard('chart-wide', 'Garanti Sağlık Durumu', ic.bar, 'ch-warranty')}
    `;

    // 1. Line Chart
    destroyChart('chAct');
    chartRefs.chAct = new Chart(document.getElementById('ch-act').getContext('2d'), {
      type: 'line',
      data: { labels: trend.map(r=>r.date), datasets: [{
        label: 'Yeni Kayıt', data: trend.map(r=>r.count),
        borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.15)',
        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHitRadius: 10
      }]},
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: {display:false} },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: { grid: {display:false} },
          y: { grid: {color:getGridColor()}, beginAtZero:true }
        }
      }
    });

    // 2. Polar Area for Brands
    destroyChart('chBrands');
    chartRefs.chBrands = new Chart(document.getElementById('ch-brands').getContext('2d'), {
      type: 'polarArea',
      data: { labels: brands.map(b=>b.brand), datasets: [{ data: brands.map(b=>b.count), backgroundColor: PALETTE, borderWidth: 0 }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales: { r: { grid: {color:getGridColor()}, angleLines: {color:getGridColor()}, ticks:{display:false} } },
        plugins: { legend: { position: 'right', labels: {boxWidth:8, font:{size:10}} } }
      }
    });

    // 3. Bar for Warranty
    destroyChart('chWarranty');
    const wLabels = {'active':'Devam Ediyor', 'expiring_soon':'30 Günden Az', 'expired':'Süresi Dolmuş'};
    const wColors = {'active':'#2563eb', 'expiring_soon':'#0B57D0', 'expired':'#EA4335'};
    chartRefs.chWarranty = new Chart(document.getElementById('ch-warranty').getContext('2d'), {
      type: 'bar',
      data: {
        labels: warranty.map(w=>wLabels[w.status] || w.status),
        datasets: [{
          data: warranty.map(w=>w.count),
          backgroundColor: warranty.map(w=>wColors[w.status] || '#64748b'),
          borderRadius: 6, maxBarThickness: 40
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: {display:false} },
        scales: {
          x: { grid: {display:false} },
          y: { grid: {color:getGridColor()}, beginAtZero:true }
        }
      }
    });

  } catch(e) { g.innerHTML = `<div class="ebox" style="grid-column:1/-1">Hata: ${e.message}</div>`; }
}

// ═══════════════════════════════════════════════════════════════════
//  USERS (DRAWER & TABLE)
// ═══════════════════════════════════════════════════════════════════
let searchTimer = null;
document.getElementById('usearch').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); loadUsers(0); }, 400); });
document.getElementById('uprev').addEventListener('click', () => { if(usersPage>=PAGE_SIZE) loadUsers(usersPage-PAGE_SIZE); });
document.getElementById('unext').addEventListener('click', () => loadUsers(usersPage+PAGE_SIZE));

async function loadUsers(offset=0) {
  usersPage = offset;
  const tbody = document.getElementById('utbody');
  const label = document.getElementById('ulabel');
  tbody.innerHTML = `<tr><td colspan="7">${spin()}</td></tr>`;
  try {
    const rows = await rpc('admin_get_users', { p_limit:PAGE_SIZE, p_offset:offset, p_search:searchQuery }) || [];
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem">Kullanıcı bulunamadı</td></tr>'; label.textContent='0'; return; }

    tbody.innerHTML = rows.map(u => `
      <tr onclick="openDrawer('${u.id}', '${esc(u.email)}')">
        <td><div style="font-weight:600;font-size:.82rem">${esc(u.email)}</div><div style="font-size:.7rem;color:var(--muted);font-family:monospace">${u.id.split('-')[0]}</div></td>
        <td>${fmtDate(u.created_at)}</td>
        <td>${fmtDatetime(u.last_sign_in_at)}</td>
        <td><span class="badge bd-b">${fmt(u.credits)}</span></td>
        <td><span class="badge ${u.device_count>0?'bd-b':'bd-mu'}">${fmt(u.device_count)}</span></td>
        <td><span class="badge ${u.ticket_count>0?'bd-r':'bd-mu'}">${fmt(u.ticket_count)}</span></td>
        <td><span class="peek">İncele →</span></td>
      </tr>
    `).join('');
    label.textContent = `${offset+1}–${offset+rows.length}`;
    document.getElementById('uprev').disabled = offset===0;
    document.getElementById('unext').disabled = rows.length<PAGE_SIZE;
  } catch(e) { tbody.innerHTML = `<tr><td colspan="7"><div class="ebox">Hata: ${e.message}</div></td></tr>`; }
}

const overlay = document.getElementById('overlay'); const drawer = document.getElementById('drawer');
function openDrawer(uid, email) {
  document.getElementById('drawer-title').textContent = email;
  document.getElementById('drawer-body').innerHTML = spin();
  overlay.classList.add('on'); drawer.classList.add('on');
  fetchUserDetail(uid);
}
function closeDrawer() { overlay.classList.remove('on'); drawer.classList.remove('on'); }
document.getElementById('drawer-x').addEventListener('click', closeDrawer);
overlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

async function fetchUserDetail(uid) {
  const body = document.getElementById('drawer-body');
  try {
    const { user:u, devices:devs, tickets } = await rpc('admin_get_user_detail', { p_user_id:uid });
    body.innerHTML = `
      <div class="dsec"><div class="dstitle">Kimlik & Erişim</div>
        <div class="dr"><span class="dk">ID</span><span class="dv" style="font-family:monospace;font-size:.7rem">${u.id}</span></div>
        <div class="dr"><span class="dk">Kayıt</span><span class="dv">${fmtDatetime(u.created_at)}</span></div>
        <div class="dr"><span class="dk">Son Login</span><span class="dv">${fmtDatetime(u.last_sign_in_at)}</span></div>
      </div>
      <div class="dsec"><div class="dstitle">Ekonomi</div>
        <div class="dr"><span class="dk">Kredi Bakiye</span><span class="dv"><span class="badge bd-b">${fmt(u.credits)}</span></span></div>
        <div class="dr"><span class="dk">İzlenen Reklam</span><span class="dv">${fmt(u.ad_watch_count)}</span></div>
      </div>
      <div class="dsec"><div class="dstitle">Cihazlar (${devs.length})</div>
        ${devs.length?devs.map(d=>`
          <div class="dvc">
            <div class="dvc-h">
              <div><div class="dvc-n">${esc(d.name||'—')}</div><div class="dvc-b">${esc(d.brand||'')} · <span class="badge bd-mu" style="font-size:.6rem">${d.category}</span></div></div>
              ${wBadge(d.warranty_end)}
            </div>
            ${d.price?`<div class="dvc-r"><span>Değer</span><span>${fmt(d.price)} ${d.currency||''}</span></div>`:''}
            ${d.room?`<div class="dvc-r"><span>Konum</span><span>${esc(d.room)}</span></div>`:''}
          </div>`).join(''):'<p style="text-align:center;color:var(--muted);font-size:.8rem;padding:1rem 0">Cihaz yok</p>'}
      </div>
    `;
  } catch(e) { body.innerHTML = `<div class="ebox">Hata: ${e.message}</div>`; }
}
function wBadge(endIso) {
  if (!endIso) return ''; const days = Math.round((new Date(endIso) - new Date()) / 86400000);
  if (days<0) return '<span class="badge bd-r">Bitti</span>';
  return `<span class="badge bd-b">${days}g Kaldı</span>`;
}

// ═══════════════════════════════════════════════════════════════════
//  DEVICES
// ═══════════════════════════════════════════════════════════════════
async function renderDevices() {
  const g = document.getElementById('dev-grid');
  g.innerHTML = spin();
  try {
    const [cats, rooms] = await Promise.all([rpc('admin_get_device_categories'), rpc('admin_get_room_stats')]);
    
    g.innerHTML = `
      ${buildChartCard('', 'Kategoriler', ic.pie, 'ch-dcats')}
      ${buildChartCard('', 'Mekansal Dağılım (Odalar)', ic.bar, 'ch-drooms')}
    `;

    destroyChart('chDcats');
    chartRefs.chDcats = new Chart(document.getElementById('ch-dcats').getContext('2d'), {
      type: 'doughnut',
      data: { labels: cats.map(c=>catLabel(c.category)), datasets: [{ data: cats.map(c=>c.count), backgroundColor: PALETTE, borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins: { legend: { position:'bottom', labels:{boxWidth:10,font:{size:11}} } } }
    });

    destroyChart('chDrooms');
    chartRefs.chDrooms = new Chart(document.getElementById('ch-drooms').getContext('2d'), {
      type: 'bar',
      data: { labels: rooms.map(r=>r.room), datasets: [{ label:'Cihaz', data: rooms.map(r=>r.count), backgroundColor: '#2563eb', borderRadius:4 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins: { legend: {display:false} }, scales: { x: {grid:{display:false}}, y: {grid:{color:getGridColor()}, beginAtZero:true} } }
    });
  } catch(e) { g.innerHTML = `<div class="ebox">Hata: ${e.message}</div>`; }
}
function catLabel(c) {
  const m = { tv:'TV', audio:'Ses Sist.', computer:'Bilgisayar', phone:'Telefon', appliance:'Beyaz Eşya', small_appliance:'Küçük Ev Aleti', car:'Otomotiv' };
  return m[c] || c || 'Diğer';
}

// ═══════════════════════════════════════════════════════════════════
//  CREDITS
// ═══════════════════════════════════════════════════════════════════
async function renderCredits() {
  const g = document.getElementById('cr-grid');
  g.innerHTML = spin();
  try {
    const [dist, top] = await Promise.all([rpc('admin_get_credit_distribution'), rpc('admin_get_top_credit_users')]);
    
    g.innerHTML = `
      ${buildChartCard('chart-wide', 'Kredi Dağılım Grupları', ic.bar, 'ch-cr')}
      <div class="card"><div class="chead"><div class="clabel">${ic.list} Kredi Balinaları (Top 10)</div></div><div class="cbody" style="overflow-y:auto">
        ${top.map((u,i) => `<div class="list-row"><div class="list-k"><div class="rank-dot">${i+1}</div> <span>${esc(u.email)}</span></div><div class="list-v" style="color:var(--blue)">${fmt(u.credits)} <span style="font-size:.65rem;color:var(--muted)">CR</span></div></div>`).join('')}
      </div></div>
    `;

    destroyChart('chCr');
    chartRefs.chCr = new Chart(document.getElementById('ch-cr').getContext('2d'), {
      type: 'bar',
      data: { labels: dist.map(d=>d.bucket + ' CR'), datasets: [{ data: dist.map(d=>d.count), backgroundColor: '#EA4335', borderRadius:4 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins: { legend: {display:false} }, scales: { x: {grid:{display:false}}, y: {grid:{color:getGridColor()}, beginAtZero:true} } }
    });
  } catch(e) { g.innerHTML = `<div class="ebox">Hata: ${e.message}</div>`; }
}

// ═══════════════════════════════════════════════════════════════════
//  SUPPORT
// ═══════════════════════════════════════════════════════════════════
async function renderSupport() {
  const g = document.getElementById('sup-grid');
  g.innerHTML = spin();
  try {
    const t = await rpc('admin_get_ticket_stats');
    g.innerHTML = `${buildChartCard('', 'Kategori Dağılımı', ic.pie, 'ch-sup')}`;
    destroyChart('chSup');
    chartRefs.chSup = new Chart(document.getElementById('ch-sup').getContext('2d'), {
      type: 'pie',
      data: { labels: t.map(x=>x.kind), datasets: [{ data: t.map(x=>x.count), backgroundColor: PALETTE, borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins: { legend: {position:'right', labels:{boxWidth:10, font:{size:11}}} } }
    });
  } catch(e) { g.innerHTML = `<div class="ebox">Hata: ${e.message}</div>`; }
}
