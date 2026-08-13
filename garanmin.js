/**
 * GaranTea — Admin Panel v5.0 (Full Features, Modal, Calendar, Finance, Security)
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
Chart.defaults.color = '#a7acb2';
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
const fmtPrice = n => (n == null ? '—' : '₺' + Number(n).toLocaleString('tr-TR'));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function spin() { return `<div class="col-12 w-100 h-100"><div class="loading-box"><div class="spinner"></div><span>Yükleniyor...</span></div></div>`; }
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
  else if (name === 'finance') await renderFinance();
  else if (name === 'users') await loadUsers(0);
  else if (name === 'devices') await renderDevices();
  else if (name === 'credits') await renderCredits();
  else if (name === 'support') await renderSupport();
  else if (name === 'security') await renderSecurity();
}

// ─── BUILDERS ────────────────────────────────────────────────
function buildStatCard(title, val, sub, ico, colorClass) {
  const isUp = String(sub).includes('++') || String(sub).includes('Yeni') || String(sub).includes('Artış');
  const subText = String(sub).replace('++', '');
  return `<div class="col-md-3 col-6 d-flex">
    <div class="card w-100">
      <div class="card-body p-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <div class="stat-card-icon ${colorClass}" style="width:36px;height:36px">${ico}</div>
        </div>
        <span class="stat-label" style="font-size:0.75rem">${title}</span>
        <h4 class="stat-value m-0" style="font-size:1.15rem">${val}</h4>
        <small class="stat-badge ${isUp ? 'up' : 'down'} m-0 p-0" style="font-size:0.7rem">${isUp ? '↑' : ''} ${subText}</small>
      </div>
    </div>
  </div>`;
}

const icUsr = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
const icDev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/></svg>';
const icCre = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';
const icSup = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
const icMon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';

function generateCalendarHTML() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  
  let html = `<div class="calendar-widget">
    <div class="calendar-header">
      <span>${monthNames[month]} ${year}</span>
    </div>
    <div class="calendar-grid">
      <div class="calendar-day-name">Pt</div><div class="calendar-day-name">Sa</div><div class="calendar-day-name">Ça</div>
      <div class="calendar-day-name">Pe</div><div class="calendar-day-name">Cu</div><div class="calendar-day-name">Ct</div><div class="calendar-day-name">Pz</div>`;
  
  // Adjust first day for Monday start (0=Sun -> 6, 1=Mon -> 0, etc.)
  let startOffset = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < startOffset; i++) { html += `<div class="calendar-day empty"></div>`; }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate();
    html += `<div class="calendar-day ${isToday ? 'today' : ''}">${d}</div>`;
  }
  html += `</div></div>`;
  return html;
}

// ─── OVERVIEW (Single Screen) ──────────────────────────────────
async function renderOverview() {
  const g = document.getElementById('ov-grid'); g.innerHTML = spin();
  try {
    const stats = await rpc('admin_get_stats');
    
    // Overview grid is constrained by h-100
    g.innerHTML = `
      <!-- Üst Kısım: Welcome + 4 Mini Stat -->
      <div class="col-xl-6 col-12 d-flex flex-column h-100">
        <div class="card mb-3" style="flex:0 0 auto">
          <div class="welcome-card-body p-3">
            <span class="badge-shimmer">GaranTea Pro</span>
            <h5 class="welcome-card-title m-0">Tebrikler Admin! 🎉</h5>
            <p class="m-0 mt-1 small">Bugün uygulamaya <span class="fw-bold text-heading">${fmt(stats.new_users_7d)}</span> yeni kullanıcı katıldı.</p>
          </div>
          <div class="welcome-card-visual" style="height:100px"><svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
        </div>
        
        <div class="row m-0 flex-grow-1" style="margin-left:-0.375rem !important; margin-right:-0.375rem !important">
          ${buildStatCard('Aktif (MAU)', fmt(stats.mau), `++${fmt(stats.new_users_30d)} 30g`, icUsr, 'primary')}
          ${buildStatCard('Ciro', fmtPrice(stats.total_revenue), 'Kazanç', icMon, 'success')}
          ${buildStatCard('Cihaz', fmt(stats.total_devices), `${fmt(stats.users_with_devices)} Sahip`, icDev, 'info')}
          ${buildStatCard('Talep', fmt(stats.support_tickets_total), `++${fmt(stats.support_tickets_7d)} 7g`, icSup, 'red')}
        </div>
      </div>
      
      <!-- Orta Kısım: Hızlı Finans ve Takvim -->
      <div class="col-xl-3 col-md-6 col-12 d-flex flex-column h-100">
        <div class="card mb-3 flex-grow-1">
          <div class="card-header p-3 pb-0"><h6 class="card-title m-0">Aktivite</h6></div>
          <div class="card-body p-3">
             <div class="chart-wrapper"><canvas id="ch-ov-trend"></canvas></div>
          </div>
        </div>
        <div class="card" style="flex:0 0 auto">
          <div class="card-body p-3">
            ${generateCalendarHTML()}
          </div>
        </div>
      </div>

      <!-- Sağ Kısım: Son Ödemeler / Loglar -->
      <div class="col-xl-3 col-md-6 col-12 d-flex flex-column h-100">
        <div class="card h-100">
          <div class="card-header p-3 border-bottom">
            <h6 class="card-title m-0">Hızlı İşlemler</h6>
          </div>
          <div class="card-body p-0 overflow-auto">
             <div class="list-group list-group-flush w-100 p-2">
                <button class="btn btn-primary btn-sm mb-2 w-100" onclick="document.querySelector('[data-panel=users]').click()">Kullanıcıları Yönet</button>
                <button class="btn btn-outline-primary btn-sm mb-2 w-100" onclick="document.querySelector('[data-panel=finance]').click()">Finansal Raporlar</button>
                <button class="btn btn-outline-primary btn-sm mb-2 w-100" onclick="document.querySelector('[data-panel=security]').click()">Güvenlik Logları</button>
             </div>
             <div class="p-3 pt-0">
               <span class="text-muted small d-block mb-1">Veritabanı Sağlığı</span>
               <div class="progress" style="height:4px"><div class="progress-bar success" style="width:100%"></div></div>
               <span class="text-success small fw-bold">ONLINE</span>
             </div>
          </div>
        </div>
      </div>
    `;

    const trend = await rpc('admin_get_signup_trend');
    chartRefs.chOvTrend = new Chart(document.getElementById('ch-ov-trend').getContext('2d'), {
      type: 'line',
      data: { labels: trend.map(r=>r.date), datasets: [{ data: trend.map(r=>r.count), borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{display:false}, y:{display:false, beginAtZero:true} } }
    });
  } catch(e) { g.innerHTML = `<div class="error-box">Hata: ${e.message}</div>`; }
}

// ─── FINANCE ───────────────────────────────────────────────────
async function renderFinance() {
  const g = document.getElementById('fin-grid'); g.innerHTML = spin();
  try {
    const fin = await rpc('admin_get_finance_stats');
    g.innerHTML = `
      <div class="col-12">
        <div class="card">
          <div class="card-header"><h5 class="card-title">Ciro Trendi (Son 30 Gün)</h5></div>
          <div class="card-body" style="height:400px">
            <div class="chart-wrapper"><canvas id="ch-fin"></canvas></div>
          </div>
        </div>
      </div>
    `;
    chartRefs.chFin = new Chart(document.getElementById('ch-fin').getContext('2d'), {
      type: 'bar',
      data: { labels: fin.map(f=>f.day), datasets: [{ label: 'Ciro (₺)', data: fin.map(f=>f.revenue), backgroundColor: '#71dd37', borderRadius:4 }] },
      options: { responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{display:false}}, y:{grid:{color:getGridColor(), borderDash:[5,5]}, beginAtZero:true} } }
    });
  } catch(e) { g.innerHTML = `<div class="error-box">Hata: ${e.message}</div>`; }
}

// ─── USERS & MODAL ─────────────────────────────────────────────
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
      <tr onclick="showUserModal('${u.id}')">
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
        <td class="fw-medium text-success">${fmtPrice(u.total_spent)}</td>
        <td><span class="badge ${u.device_count>0?'badge-primary':'badge-secondary'}">${fmt(u.device_count)}</span></td>
      </tr>
    `).join('');
    label.textContent = `${offset+1}–${offset+rows.length}`;
    document.getElementById('uprev').disabled = offset===0; document.getElementById('unext').disabled = rows.length<PAGE_SIZE;
  } catch(e) { tbody.innerHTML = `<tr><td colspan="5"><div class="error-box">Hata: ${e.message}</div></td></tr>`; }
}

const modalOverlay = document.getElementById('user-modal-overlay');
const modalLoader = document.getElementById('modal-loader');
const modalContent = document.getElementById('modal-content');
let activeUserId = null;

async function showUserModal(userId) {
  activeUserId = userId;
  modalOverlay.classList.add('open');
  modalLoader.style.display = 'flex';
  modalContent.style.display = 'none';
  
  try {
    const detail = await rpc('admin_get_user_detail', { p_user_id: userId });
    document.getElementById('modal-title').textContent = detail.email;
    
    document.getElementById('m-dev-count').textContent = detail.devices.length;
    document.getElementById('m-dev-list').innerHTML = detail.devices.length ? detail.devices.map(d => `<tr><td><span class="fw-medium">${esc(d.name)}</span><br><small class="text-muted">${esc(d.brand)}</small></td><td>${fmtDate(d.warranty_end_date)}</td></tr>`).join('') : '<tr><td colspan="2" class="text-muted">Cihaz yok</td></tr>';
    
    document.getElementById('m-pay-count').textContent = detail.payments.length;
    document.getElementById('m-pay-list').innerHTML = detail.payments.length ? detail.payments.map(p => `<tr><td class="fw-medium text-success">${fmtPrice(p.amount)}</td><td>${fmtDate(p.created_at)}<br><small class="text-muted">${esc(p.plan_name)}</small></td></tr>`).join('') : '<tr><td colspan="2" class="text-muted">Ödeme yok</td></tr>';

    document.getElementById('m-tic-count').textContent = detail.tickets.length;
    document.getElementById('m-tic-list').innerHTML = detail.tickets.length ? detail.tickets.map(t => `<tr><td>${esc(t.kind)}</td><td><span class="badge ${t.status==='open'?'badge-warning':'badge-success'}">${t.status}</span></td><td>${fmtDate(t.created_at)}</td></tr>`).join('') : '<tr><td colspan="3" class="text-muted">Talep yok</td></tr>';

    modalLoader.style.display = 'none';
    modalContent.style.display = 'block';
  } catch(e) {
    modalLoader.innerHTML = `<div class="error-box">Hata: ${e.message}</div>`;
  }
}

document.getElementById('modal-close').addEventListener('click', () => modalOverlay.classList.remove('open'));
document.getElementById('modal-btn-close').addEventListener('click', () => modalOverlay.classList.remove('open'));
document.getElementById('modal-btn-delete').addEventListener('click', () => {
  alert('Güvenlik: Kullanıcı silme işlemleri Supabase Authentication paneli üzerinden (Dashboard -> Authentication) gerçekleştirilmelidir. Yetki sınırlandırılması aktiftir.');
});

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
    const [dist, top, hist] = await Promise.all([rpc('admin_get_credit_distribution'), rpc('admin_get_top_credit_users'), rpc('admin_get_credit_history')]);
    
    g.innerHTML = `
      <div class="col-12">
        <div class="card mb-3">
          <div class="card-header"><h5 class="card-title">Kredi Kazanç Kaynakları (Satın Alma vs Reklam)</h5></div>
          <div class="card-body" style="height:300px">
            <div class="chart-wrapper"><canvas id="ch-cr-hist"></canvas></div>
          </div>
        </div>
      </div>
      <div class="col-md-7 col-12">
        <div class="card h-100">
          <div class="card-header"><h5 class="card-title">Bakiye Dağılımı</h5></div>
          <div class="card-body" style="height:300px">
             <div class="chart-wrapper"><canvas id="ch-cr"></canvas></div>
          </div>
        </div>
      </div>
      <div class="col-md-5 col-12">
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
                      <td class="text-end"><span class="badge badge-primary">${fmt(u.credits)} CR</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    
    chartRefs.chCrHist = new Chart(document.getElementById('ch-cr-hist').getContext('2d'), { 
      type: 'line', 
      data: { 
        labels: hist.map(h=>h.day), 
        datasets: [
          { label: 'Satın Alınan', data: hist.map(h=>h.purchased), borderColor: '#71dd37', backgroundColor:'rgba(113, 221, 55, 0.1)', fill:true, tension: 0.4 },
          { label: 'Reklam İzlenen', data: hist.map(h=>h.ad_watched), borderColor: '#2563eb', backgroundColor:'rgba(37, 99, 235, 0.1)', fill:true, tension: 0.4 }
        ] 
      }, 
      options: { responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{display:false}}, y:{grid:{color:getGridColor(), borderDash:[5,5]}} } } 
    });

    chartRefs.chCr = new Chart(document.getElementById('ch-cr').getContext('2d'), { type: 'bar', data: { labels: dist.map(d=>d.bucket), datasets: [{ data: dist.map(d=>d.count), backgroundColor: '#EA4335', borderRadius:4, barPercentage: 0.6 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false, drawBorder:false}}, y:{grid:{color:getGridColor(), drawBorder:false, borderDash:[5,5]}} } } });
  } catch(e) { g.innerHTML = `<div class="col-12"><div class="error-box">${e.message}</div></div>`; }
}

// ─── SECURITY & LOGS ───────────────────────────────────────────
async function renderSecurity() {
  const g = document.getElementById('sec-grid'); g.innerHTML = spin();
  try {
    const [logs, dbHealth] = await Promise.all([rpc('admin_get_security_logs'), rpc('admin_get_db_health')]);
    const sizeMb = (dbHealth.db_size_bytes / (1024*1024)).toFixed(2);
    
    g.innerHTML = `
      <div class="col-md-4 col-12">
        <div class="card mb-3">
          <div class="card-body p-3 text-center">
            <h6 class="fw-bold mb-3">Veritabanı Boyutu</h6>
            <h2 class="text-primary mb-1">${sizeMb} MB</h2>
            <p class="small text-muted m-0">Toplam tahsis edilen 500 MB</p>
            <div class="progress mt-3"><div class="progress-bar" style="width:${Math.min((dbHealth.db_size_bytes/524288000)*100, 100)}%"></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-body p-3 text-center">
            <h6 class="fw-bold mb-3">Aktif Bağlantılar</h6>
            <h2 class="text-success mb-1">${dbHealth.active_connections}</h2>
            <p class="small text-muted m-0">Anlık Query / Client Sayısı</p>
          </div>
        </div>
      </div>
      <div class="col-md-8 col-12">
        <div class="card h-100">
          <div class="card-header border-bottom"><h5 class="card-title">Son Sistem Olayları (Audit Logs)</h5></div>
          <div class="table-responsive" style="max-height:400px">
            <table class="table">
              <thead><tr><th>Olay</th><th>Kullanıcı</th><th>Detay</th><th>Zaman</th></tr></thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td><span class="badge ${l.event_type==='error'?'badge-red':l.event_type==='login'?'badge-success':'badge-secondary'}">${l.event_type.toUpperCase()}</span></td>
                    <td><span class="fw-medium">${l.email ? esc(l.email.split('@')[0]) : 'SİSTEM'}</span></td>
                    <td style="font-size:0.75rem; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(JSON.stringify(l.details))}</td>
                    <td>${fmtDateTime(l.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch(e) { g.innerHTML = `<div class="error-box">Hata: ${e.message}</div>`; }
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
