/**
 * GaranTea — Admin Panel v4.1 (Sneat Theme with GaranTea Identity)
 */

'use strict';

const SUPA_URL = 'https://mcsygnkhdjnkmqcntwvh.supabase.co';
const SUPA_KEY = 'sb_publishable_OQXQZLhb_4coBQvG6AM2TQ_qtyl59LY';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

let TOKEN = null;
let ADMIN_U = null;
let usersPage = 0;
let searchQuery = '';
const PAGE_SIZE = 50;
const chartRefs = {};

// Colors
const PALETTE = [ '#2563eb', '#EA4335', '#0B57D0', '#f87171', '#60a5fa', '#991b1b', '#1e40af', '#fca5a5', '#93c5fd', '#7f1d1d' ];

Chart.defaults.font.family = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
Chart.defaults.color = '#a7acb2'; // muted-color
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(34, 48, 62, 0.95)';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 6;
Chart.defaults.plugins.tooltip.titleFont = { size: 13, family: "'Public Sans', sans-serif", weight: '600' };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12, family: "'Public Sans', sans-serif" };

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const fmt = n => (n == null ? '—' : Number(n).toLocaleString('tr-TR'));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' }) : '—';
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function spin() { return `<div class="col-12"><div class="loading-box"><div class="spinner"></div><span>Veriler yükleniyor...</span></div></div>`; }
function getGridColor() { return document.documentElement.getAttribute('data-theme') === 'dark' ? '#434368' : '#e4e6e8'; }

function destroyChart(k) {
  if (chartRefs[k]) { chartRefs[k].destroy(); chartRefs[k] = null; }
}

async function rpc(fn, extra = {}) {
  const { data, error } = await db.rpc(fn, { p_token_hash: TOKEN, ...extra });
  if (error) throw error;
  return data;
}

// ─── LOGIN & SHELL ──────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('inp-err');
  const btn = document.getElementById('login-btn');
  const u = document.getElementById('inp-user').value.trim();
  const p = document.getElementById('inp-pass').value.trim();

  if (!u || !p) return;
  errEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Doğrulanıyor…';

  try {
    const hash = await sha256(u + ':' + p);
    await rpc('admin_get_stats', { p_token_hash: hash });
    TOKEN = hash; ADMIN_U = u;
    sessionStorage.setItem('gt_adm_h', hash); sessionStorage.setItem('gt_adm_u', u);
    enterDashboard();
  } catch(err) {
    errEl.textContent = err.message || 'Geçersiz giriş veya rate limit.';
    errEl.style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Giriş Yap'; }
});

(async () => {
  const h = sessionStorage.getItem('gt_adm_h'); const u = sessionStorage.getItem('gt_adm_u');
  if (h && u) { try { await rpc('admin_get_stats', { p_token_hash: h }); TOKEN = h; ADMIN_U = u; enterDashboard(); return; } catch(_) {} sessionStorage.clear(); }
})();

function enterDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadPanel('overview');
}

document.getElementById('logout-btn').addEventListener('click', () => {
  TOKEN = null; ADMIN_U = null; sessionStorage.clear();
  Object.keys(chartRefs).forEach(k => destroyChart(k));
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('inp-pass').value = '';
});

// ─── THEME & NAV ──────────────────────────────────────────────
const htmlEl = document.documentElement;
document.getElementById('theme-btn').addEventListener('click', () => {
  const nt = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  htmlEl.setAttribute('data-theme', nt);
  document.getElementById('icon-moon').style.display = nt==='dark' ? 'none' : 'block';
  document.getElementById('icon-sun').style.display = nt==='dark' ? 'block' : 'none';
  
  Object.keys(chartRefs).forEach(k => { 
    if(chartRefs[k] && chartRefs[k].options.scales) {
      if (chartRefs[k].options.scales.x) { chartRefs[k].options.scales.x.grid.color = getGridColor(); }
      if (chartRefs[k].options.scales.y) { chartRefs[k].options.scales.y.grid.color = getGridColor(); }
      if (chartRefs[k].options.scales.r) { chartRefs[k].options.scales.r.grid.color = getGridColor(); chartRefs[k].options.scales.r.angleLines = {color:getGridColor()}; }
      chartRefs[k].update();
    }
  });
});

document.querySelectorAll('.nitem').forEach(i => i.addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  i.parentElement.classList.add('active');
  loadPanel(i.dataset.panel);
}));
document.getElementById('refresh-btn').addEventListener('click', () => {
  const a = document.querySelector('.menu-item.active .nitem');
  if (a) loadPanel(a.dataset.panel);
});
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('layout-menu').classList.toggle('collapsed');
});

async function loadPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  const t = document.getElementById('panel-' + name);
  if (t) t.classList.add('on');
  else return;

  if (name === 'overview') await renderOverview();
  else if (name === 'users') await loadUsers(0);
  else if (name === 'devices') await renderDevices();
  else if (name === 'credits') await renderCredits();
  else if (name === 'support') await renderSupport();
}

// ─── BUILDERS (SNEAT) ──────────────────────────────────────────────
function buildStatCard(title, val, sub, ico, colorClass) {
  const isUp = sub.includes('++') || sub.includes('Yeni') || sub.includes('Artış');
  const subText = sub.replace('++', '');
  return `<div class="col-md-3 col-sm-6">
    <div class="card">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between mb-4">
          <div class="stat-card-icon ${colorClass}">${ico}</div>
          <div class="dropdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--muted-color);cursor:pointer"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
        </div>
        <span class="stat-label">${title}</span>
        <h3 class="stat-value">${val}</h3>
        <small class="stat-badge ${isUp ? 'up' : 'down'}">${isUp ? '↑' : ''} ${subText}</small>
      </div>
    </div>
  </div>`;
}

function buildChartCard(widthClass, title, id, height=320, subtitle='') {
  return `<div class="${widthClass}">
    <div class="card">
      <div class="card-header">
        <div>
          <h5 class="card-title">${title}</h5>
          ${subtitle ? `<p class="card-subtitle">${subtitle}</p>` : ''}
        </div>
        <div class="dropdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--muted-color);cursor:pointer"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
      </div>
      <div class="card-body">
        <div class="chart-wrapper"><canvas id="${id}" style="height:${height}px;width:100%"></canvas></div>
      </div>
    </div>
  </div>`;
}

const icUsr = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
const icDev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/></svg>';
const icCre = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';
const icSup = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';

// ─── OVERVIEW ──────────────────────────────────────────────────
async function renderOverview() {
  const g = document.getElementById('ov-grid'); g.innerHTML = spin();
  try {
    const [stats, trend, brands, warranty] = await Promise.all([rpc('admin_get_stats'), rpc('admin_get_signup_trend'), rpc('admin_get_device_brands'), rpc('admin_get_warranty_stats')]);
    
    g.innerHTML = `
      <div class="col-md-8 col-12">
        <div class="congrats-card card h-100">
          <div class="welcome-card-body">
            <span class="badge-shimmer">GaranTea Pro</span>
            <h5 class="welcome-card-title">Tebrikler Admin! 🎉</h5>
            <p class="mb-4">Bugün uygulamaya <span class="fw-bold text-heading">${fmt(stats.new_users_7d)}</span> yeni kullanıcı katıldı. Tüm istatistikler ve cihaz durumları aşağıda listelenmiştir.</p>
            <a href="#" class="btn btn-outline-primary btn-sm" onclick="document.querySelector('[data-panel=users]').click()">Kullanıcıları Gör</a>
          </div>
          <div class="welcome-card-visual">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
        </div>
      </div>
      <div class="col-md-4 col-12 row m-0 p-0">
        ${buildStatCard('Aktif (MAU)', fmt(stats.mau), `++${fmt(stats.new_users_30d)} Son 30 gün`, icUsr, 'primary')}
        ${buildStatCard('Ekonomi', fmt(Math.round(stats.total_credits_sum)), `++${fmt(Math.round(stats.total_ads_watched))} Reklam`, icCre, 'info')}
      </div>
      <div class="col-12 row m-0 p-0 mt-2">
        ${buildStatCard('Toplam Cihaz', fmt(stats.total_devices), `${fmt(stats.users_with_devices)} Cihaz Sahibi`, icDev, 'success')}
        ${buildStatCard('Destek Talebi', fmt(stats.support_tickets_total), `++${fmt(stats.support_tickets_7d)} Son 7 gün`, icSup, 'red')}
        ${buildChartCard('col-xl-8 col-12', 'Büyüme Hızı (Son 30 Gün)', 'ch-act', 320, 'Kayıt olan yeni kullanıcıların günlük trendi')}
        ${buildChartCard('col-xl-4 col-md-6 col-12', 'Garanti Sağlık Durumu', 'ch-warranty', 320)}
      </div>
    `;

    chartRefs.chAct = new Chart(document.getElementById('ch-act').getContext('2d'), {
      type: 'line',
      data: { labels: trend.map(r=>r.date), datasets: [{ label: 'Kayıt', data: trend.map(r=>r.count), borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointRadius: 0, pointHoverRadius: 6 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false, drawBorder:false}}, y:{grid:{color:getGridColor(), drawBorder:false, borderDash:[5,5]}, beginAtZero:true} }, interaction:{intersect:false, mode:'index'} }
    });

    const wLabels = {'active':'Devam Ediyor', 'expiring_soon':'30 Günden Az', 'expired':'Süresi Dolmuş'};
    const wColors = {'active':'#71dd37', 'expiring_soon':'#ffab00', 'expired':'#EA4335'};
    chartRefs.chWarranty = new Chart(document.getElementById('ch-warranty').getContext('2d'), {
      type: 'bar', data: { labels: warranty.map(w=>wLabels[w.status]||w.status), datasets: [{ data: warranty.map(w=>w.count), backgroundColor: warranty.map(w=>wColors[w.status]), borderRadius:4, barPercentage: 0.5 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false, drawBorder:false}}, y:{grid:{color:getGridColor(), drawBorder:false, borderDash:[5,5]}} } }
    });
  } catch(e) { g.innerHTML = `<div class="col-12"><div class="error-box">Hata: ${e.message}</div></div>`; }
}

// ─── USERS ─────────────────────────────────────────────────────
let searchTimer = null;
document.getElementById('usearch').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); loadUsers(0); }, 400); });
document.getElementById('uprev').addEventListener('click', () => { if(usersPage>=PAGE_SIZE) loadUsers(usersPage-PAGE_SIZE); });
document.getElementById('unext').addEventListener('click', () => loadUsers(usersPage+PAGE_SIZE));

async function loadUsers(offset=0) {
  usersPage = offset; const tbody = document.getElementById('utbody'); const label = document.getElementById('ulabel');
  tbody.innerHTML = `<tr><td colspan="5" class="text-center"><div class="loading-box"><div class="spinner"></div></div></td></tr>`;
  try {
    const rows = await rpc('admin_get_users', { p_limit:PAGE_SIZE, p_offset:offset, p_search:searchQuery }) || [];
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:2rem">Kayıt bulunamadı</td></tr>'; label.textContent='0'; return; }
    
    tbody.innerHTML = rows.map(u => `
      <tr>
        <td>
          <div class="d-flex align-items-center gap-3">
            <div class="user-avatar" style="width:34px;height:34px;font-size:12px">${u.email.substring(0,2).toUpperCase()}</div>
            <div>
              <div class="tbl-main">${esc(u.email)}</div>
              <div class="tbl-sub">${u.id.split('-')[0]}</div>
            </div>
          </div>
        </td>
        <td>${fmtDate(u.created_at)}</td>
        <td><span class="badge badge-primary">${fmt(u.credits)} CR</span></td>
        <td><span class="badge ${u.device_count>0?'badge-primary':'badge-secondary'}">${fmt(u.device_count)}</span></td>
        <td><span class="badge ${u.ticket_count>0?'badge-red':'badge-secondary'}">${fmt(u.ticket_count)}</span></td>
      </tr>
    `).join('');
    label.textContent = `${offset+1}–${offset+rows.length}`;
    document.getElementById('uprev').disabled = offset===0; document.getElementById('unext').disabled = rows.length<PAGE_SIZE;
  } catch(e) { tbody.innerHTML = `<tr><td colspan="5"><div class="error-box">Hata: ${e.message}</div></td></tr>`; }
}

// ─── DEVICES ───────────────────────────────────────────────────
async function renderDevices() {
  const g = document.getElementById('dev-grid'); g.innerHTML = spin();
  try {
    const [cats, rooms, brands] = await Promise.all([rpc('admin_get_device_categories'), rpc('admin_get_room_stats'), rpc('admin_get_device_brands')]);
    g.innerHTML = `
      ${buildChartCard('col-xl-4 col-md-6', 'Kategoriler', 'ch-dcats')}
      ${buildChartCard('col-xl-4 col-md-6', 'Oda Dağılımı', 'ch-drooms')}
      ${buildChartCard('col-xl-4 col-12', 'Top Markalar', 'ch-dbrands')}
    `;
    chartRefs.chDcats = new Chart(document.getElementById('ch-dcats').getContext('2d'), { type: 'pie', data: { labels: cats.map(c=>c.category), datasets: [{ data: cats.map(c=>c.count), backgroundColor: PALETTE, borderWidth:2, borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#2b2c40' : '#fff' }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} } });
    chartRefs.chDrooms = new Chart(document.getElementById('ch-drooms').getContext('2d'), { type: 'bar', data: { labels: rooms.map(r=>r.room), datasets: [{ data: rooms.map(r=>r.count), backgroundColor: '#2563eb', borderRadius:4 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false, drawBorder:false}}, y:{grid:{color:getGridColor(), drawBorder:false, borderDash:[5,5]}} } } });
    chartRefs.chDbrands = new Chart(document.getElementById('ch-dbrands').getContext('2d'), { type: 'doughnut', data: { labels: brands.map(b=>b.brand), datasets: [{ data: brands.map(b=>b.count), backgroundColor: PALETTE, borderWidth:2, borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#2b2c40' : '#fff' }] }, options: { responsive:true, maintainAspectRatio:false, cutout:'70%', plugins:{legend:{position:'bottom'}} } });
  } catch(e) { g.innerHTML = `<div class="col-12"><div class="error-box">${e.message}</div></div>`; }
}

// ─── CREDITS ───────────────────────────────────────────────────
async function renderCredits() {
  const g = document.getElementById('cr-grid'); g.innerHTML = spin();
  try {
    const [dist, top] = await Promise.all([rpc('admin_get_credit_distribution'), rpc('admin_get_top_credit_users')]);
    g.innerHTML = `
      ${buildChartCard('col-md-8 col-12', 'Kredi Dağılımı', 'ch-cr')}
      <div class="col-md-4 col-12">
        <div class="card h-100">
          <div class="card-header border-bottom">
            <h5 class="card-title">Top 10 Balina</h5>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table">
                <tbody>
                  ${top.map((u,i) => `
                    <tr>
                      <td>
                        <div class="d-flex align-items-center gap-3">
                          <div class="user-avatar" style="width:30px;height:30px;font-size:11px;background:var(--secondary-light);color:var(--heading-color)">#${i+1}</div>
                          <div class="tbl-main">${esc(u.email.split('@')[0])}</div>
                        </div>
                      </td>
                      <td class="text-end"><span class="badge badge-primary">${fmt(u.credits)}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    chartRefs.chCr = new Chart(document.getElementById('ch-cr').getContext('2d'), { type: 'bar', data: { labels: dist.map(d=>d.bucket), datasets: [{ data: dist.map(d=>d.count), backgroundColor: '#EA4335', borderRadius:4, barPercentage: 0.6 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false, drawBorder:false}}, y:{grid:{color:getGridColor(), drawBorder:false, borderDash:[5,5]}} } } });
  } catch(e) { g.innerHTML = `<div class="col-12"><div class="error-box">${e.message}</div></div>`; }
}

// ─── SUPPORT ───────────────────────────────────────────────────
async function renderSupport() {
  const g = document.getElementById('sup-grid'); g.innerHTML = spin();
  try {
    const t = await rpc('admin_get_ticket_stats');
    g.innerHTML = `${buildChartCard('col-xl-6 col-12', 'Kategori Dağılımı', 'ch-sup')}`;
    chartRefs.chSup = new Chart(document.getElementById('ch-sup').getContext('2d'), { type: 'doughnut', data: { labels: t.map(x=>x.kind), datasets: [{ data: t.map(x=>x.count), backgroundColor: PALETTE, borderWidth:2, borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#2b2c40' : '#fff' }] }, options: { responsive:true, maintainAspectRatio:false, cutout:'65%' } });
  } catch(e) { g.innerHTML = `<div class="col-12"><div class="error-box">${e.message}</div></div>`; }
}
