/**
 * GaranTea — Admin Panel v2 (garanmin.js)
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
  overview: 'Genel Bakış',
  users:    'Kullanıcılar',
  credits:  'Kredi Analizi',
  devices:  'Cihaz Analizi',
  activity: 'Büyüme Trendi',
  support:  'Destek Talepleri',
};

const CHART_COLORS = [
  '#2563eb','#ea4335','#10b981','#f59e0b','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#64748b'
];

// ─── SHA-256 ──────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ─── FORMATTERS ───────────────────────────────────────────────────
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('tr-TR'));
const fmtDate = iso => iso
  ? new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' })
  : '—';
const fmtDatetime = iso => iso
  ? new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—';

function destroyChart(k) {
  if (chartRefs[k]) { chartRefs[k].destroy(); chartRefs[k] = null; }
}

// ─── RPC HELPER ───────────────────────────────────────────────────
async function rpc(fn, extra = {}) {
  const { data, error } = await db.rpc(fn, { p_token_hash: TOKEN, ...extra });
  if (error) throw error;
  return data;
}

// ─── LOGIN ────────────────────────────────────────────────────────
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
    const { error } = await db.rpc('admin_get_stats', { p_token_hash: hash });
    if (error) throw new Error('Geçersiz kullanıcı adı veya şifre.');

    TOKEN   = hash;
    ADMIN_U = u;
    sessionStorage.setItem('gt_adm_h', hash);
    sessionStorage.setItem('gt_adm_u', u);
    enterDashboard();
  } catch(err) {
    errEl.textContent = err.message || 'Giriş başarısız.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
});

// ─── SESSION RESTORE ──────────────────────────────────────────────
(async () => {
  const h = sessionStorage.getItem('gt_adm_h');
  const u = sessionStorage.getItem('gt_adm_u');
  if (h && u) {
    try {
      const { error } = await db.rpc('admin_get_stats', { p_token_hash: h });
      if (!error) { TOKEN = h; ADMIN_U = u; enterDashboard(); return; }
    } catch(_) {}
    sessionStorage.removeItem('gt_adm_h');
    sessionStorage.removeItem('gt_adm_u');
  }
})();

// ─── ENTER DASHBOARD ─────────────────────────────────────────────
function enterDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('show');

  document.getElementById('sb-uname').textContent = ADMIN_U || 'Admin';
  document.getElementById('sb-since').textContent =
    'Giriş: ' + new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });

  startClock();
  loadPanel('overview');
}

// ─── LOGOUT ──────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  TOKEN = null; ADMIN_U = null;
  sessionStorage.removeItem('gt_adm_h');
  sessionStorage.removeItem('gt_adm_u');
  Object.keys(chartRefs).forEach(k => destroyChart(k));
  if (clockTick) clearInterval(clockTick);
  document.getElementById('app').classList.remove('show');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('inp-pass').value = '';
});

// ─── CLOCK ────────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('tr-TR',
      { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };
  tick();
  clockTick = setInterval(tick, 1000);
}

// ─── THEME TOGGLE ─────────────────────────────────────────────────
const htmlEl = document.documentElement;
const themeBtn = document.getElementById('theme-btn');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');

function toggleTheme() {
  const isDark = htmlEl.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  htmlEl.setAttribute('data-theme', newTheme);
  localStorage.setItem('gt_theme', newTheme);
  
  if (newTheme === 'dark') {
    iconMoon.style.display = 'none';
    iconSun.style.display = 'block';
  } else {
    iconMoon.style.display = 'block';
    iconSun.style.display = 'none';
  }

  // Update chart text color
  Chart.defaults.color = newTheme === 'dark' ? '#94a3b8' : '#64748b';
  Object.keys(chartRefs).forEach(k => { if(chartRefs[k]) chartRefs[k].update(); });
}

themeBtn.addEventListener('click', toggleTheme);

// Restore theme
const savedTheme = localStorage.getItem('gt_theme');
if (savedTheme === 'dark') {
  toggleTheme(); // it's light by default, this toggles to dark
}

// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const sbToggleBtn = document.getElementById('sb-toggle');

sbToggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('gt_sb_collapsed', sidebar.classList.contains('collapsed'));
});

// Restore sidebar state
if (localStorage.getItem('gt_sb_collapsed') === 'true') {
  sidebar.classList.add('collapsed');
}

// ─── NAVIGATION ──────────────────────────────────────────────────
function handleNav(panelId) {
  // Update desktop nav
  document.querySelectorAll('.nitem').forEach(n => n.classList.remove('on'));
  const desktopItem = document.querySelector(`.nitem[data-panel="${panelId}"]`);
  if (desktopItem) desktopItem.classList.add('on');

  // Update mobile nav
  document.querySelectorAll('.mnitem').forEach(n => n.classList.remove('on'));
  const mobileItem = document.querySelector(`.mnitem[data-panel="${panelId}"]`);
  if (mobileItem) mobileItem.classList.add('on');

  document.getElementById('page-title').textContent = PANEL_TITLES[panelId] || panelId;
  loadPanel(panelId);
}

document.querySelectorAll('.nitem, .mnitem').forEach(item => {
  item.addEventListener('click', () => handleNav(item.dataset.panel));
  item.addEventListener('keydown', e => { if (e.key === 'Enter') handleNav(item.dataset.panel); });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  const active = document.querySelector('.nitem.on');
  if (active) loadPanel(active.dataset.panel);
});

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  const t = document.getElementById('panel-' + id);
  if (t) t.classList.add('on');
}

async function loadPanel(name) {
  showPanel(name);
  switch(name) {
    case 'overview': return loadOverview();
    case 'users':    return loadUsers(0);
    case 'credits':  return loadCredits();
    case 'devices':  return loadDevices();
    case 'activity': return loadActivity();
    case 'support':  return loadSupport();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════════
async function loadOverview() {
  const el = document.getElementById('ov-stats');
  el.innerHTML = spin('grid-column:1/-1');
  try {
    const [stats, trend, cats] = await Promise.all([
      rpc('admin_get_stats'),
      rpc('admin_get_signup_trend'),
      rpc('admin_get_device_categories'),
    ]);

    el.innerHTML = [
      statCard('Toplam Kullanıcı',     fmt(stats.total_users),                  'si-b', icoUsers(),  `Son 7 günde +${fmt(stats.new_users_7d)}`),
      statCard('Toplam Cihaz',         fmt(stats.total_devices),                'si-a', icoDevice(), `${fmt(stats.users_with_devices)} kullanıcı cihaz ekledi`),
      statCard('Toplam Kredi',         fmt(Math.round(stats.total_credits_sum)),'si-g', icoCredit(), `Ort. ${fmt(Math.round(stats.avg_credits_per_user))} / kullanıcı`),
      statCard('Destek Talebi',        fmt(stats.support_tickets_total),        'si-r', icoSupport(),'Son 7 günde ' + fmt(stats.support_tickets_7d) + ' yeni'),
    ].join('');

    // Trend chart
    destroyChart('ovTrend');
    const tc = document.getElementById('ch-trend').getContext('2d');
    chartRefs.ovTrend = new Chart(tc, {
      type: 'line',
      data: {
        labels: (trend||[]).map(r => r.date),
        datasets: [{
          label: 'Yeni Kullanıcı',
          data: (trend||[]).map(r => r.count),
          borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)',
          fill: true, tension: .4, pointRadius: 2,
        }]
      },
      options: lineOpts('Yeni Kullanıcı'),
    });

    // Doughnut
    destroyChart('ovCats');
    const cd = cats || [];
    chartRefs.ovCats = new Chart(
      document.getElementById('ch-cats').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: cd.map(r => catLabel(r.category)),
        datasets: [{ data: cd.map(r => r.count), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 4 }]
      },
      options: { responsive:true, maintainAspectRatio:false, cutout:'70%', plugins: { legend: { position:'right', labels:{ boxWidth:10, font:{size:11} } } } }
    });

  } catch(err) {
    el.innerHTML = `<div class="ebox" style="grid-column:1/-1">Hata: ${err.message}</div>`;
  }
}

function statCard(label, value, iconCls, iconSvg, sub) {
  return `<div class="scard">
    <div class="sico ${iconCls}">${iconSvg}</div>
    <div class="slbl">${label}</div>
    <div class="sval">${value}</div>
    <div class="ssub">${sub}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════════
let searchTimer = null;
document.getElementById('usearch').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = e.target.value.trim();
    loadUsers(0);
  }, 400);
});

document.getElementById('uprev').addEventListener('click', () => {
  if (usersPage >= PAGE_SIZE) loadUsers(usersPage - PAGE_SIZE);
});
document.getElementById('unext').addEventListener('click', () => {
  loadUsers(usersPage + PAGE_SIZE);
});

async function loadUsers(offset = 0) {
  usersPage = offset;
  const tbody = document.getElementById('utbody');
  const label = document.getElementById('ulabel');
  tbody.innerHTML = `<tr><td colspan="7">${spinHtml()}</td></tr>`;

  try {
    const rows = await rpc('admin_get_users', {
      p_limit: PAGE_SIZE, p_offset: offset, p_search: searchQuery
    }) || [];

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--muted)">Kullanıcı bulunamadı</td></tr>';
      label.textContent = '0 kayıt';
      return;
    }

    tbody.innerHTML = rows.map(u => `
      <tr data-uid="${u.id}" data-email="${esc(u.email || '')}">
        <td>
          <div style="font-weight:600;font-size:.82rem">${esc(u.email || '—')}</div>
          <div style="font-size:.7rem;color:var(--muted);font-variant-numeric:tabular-nums">${u.id.slice(0,8)}…</div>
        </td>
        <td>${fmtDate(u.created_at)}</td>
        <td>${fmtDatetime(u.last_sign_in_at)}</td>
        <td><span class="badge ${u.credits > 0 ? 'bd-b' : 'bd-mu'}">${fmt(u.credits)}</span></td>
        <td><span class="badge ${u.device_count > 0 ? 'bd-g' : 'bd-mu'}">${fmt(u.device_count)}</span></td>
        <td><span class="badge ${u.ticket_count > 0 ? 'bd-a' : 'bd-mu'}">${fmt(u.ticket_count)}</span></td>
        <td><span class="peek">Detay →</span></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-uid]').forEach(tr => {
      tr.addEventListener('click', () => openDrawer(tr.dataset.uid, tr.dataset.email));
    });

    label.textContent = `${offset + 1}–${offset + rows.length} arası gösteriliyor`;
    document.getElementById('uprev').disabled = offset === 0;
    document.getElementById('unext').disabled = rows.length < PAGE_SIZE;

  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="ebox">Hata: ${err.message}</div></td></tr>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  USER DETAIL DRAWER
// ═══════════════════════════════════════════════════════════════════
const overlay = document.getElementById('overlay');
const drawer  = document.getElementById('drawer');

function openDrawer(uid, email) {
  document.getElementById('drawer-title').textContent = email || 'Kullanıcı Detayı';
  document.getElementById('drawer-body').innerHTML = spinHtml();
  overlay.classList.add('on');
  drawer.classList.add('on');
  fetchUserDetail(uid);
}

function closeDrawer() {
  overlay.classList.remove('on');
  drawer.classList.remove('on');
}

document.getElementById('drawer-x').addEventListener('click', closeDrawer);
overlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

async function fetchUserDetail(uid) {
  const body = document.getElementById('drawer-body');
  try {
    const detail = await rpc('admin_get_user_detail', { p_user_id: uid });
    const u  = detail.user;
    const devs = detail.devices || [];
    const tickets = detail.tickets || [];

    body.innerHTML = `
      <div class="dsec">
        <div class="dstitle">Kimlik Bilgileri</div>
        ${drow('E-posta',    esc(u.email || '—'))}
        ${drow('Kullanıcı ID', `<code style="font-size:.72rem">${u.id}</code>`)}
        ${drow('Kayıt Tarihi', fmtDatetime(u.created_at))}
        ${drow('Son Giriş',   fmtDatetime(u.last_sign_in_at))}
      </div>

      <div class="dsec">
        <div class="dstitle">Kredi Bilgileri</div>
        ${drow('Mevcut Kredi', `<span class="badge bd-b">${fmt(u.credits)}</span>`)}
        ${drow('Reklam İzleme', fmt(u.ad_watch_count))}
        ${drow('Son Kazanma',  fmtDate(u.last_credit_earn_date))}
        ${drow('Destek Talebi', fmt(u.ticket_count))}
      </div>

      <div class="dsec">
        <div class="dstitle">Cihazlar (${devs.length})</div>
        ${devs.length === 0
          ? '<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:1rem 0">Cihaz yok</p>'
          : devs.map(d => `
            <div class="dvc">
              <div class="dvc-h">
                <div>
                  <div class="dvc-n">${esc(d.name || '—')}</div>
                  <div class="dvc-b">${esc(d.brand || '')} · <span class="badge bd-mu" style="font-size:.65rem;padding:.1rem .4rem">${catLabel(d.category)}</span></div>
                </div>
                ${warrantyBadge(d.warranty_end)}
              </div>
              ${d.purchase_date ? `<div class="dvc-r"><span>Satın Alma</span><span>${fmtDate(d.purchase_date)}</span></div>` : ''}
              ${d.warranty_end  ? `<div class="dvc-r"><span>Garanti Bitiş</span><span>${fmtDate(d.warranty_end)}</span></div>` : ''}
              ${d.price         ? `<div class="dvc-r"><span>Fiyat</span><span>${fmt(d.price)} ${d.currency || ''}</span></div>` : ''}
              ${d.seller_name   ? `<div class="dvc-r"><span>Satıcı</span><span>${esc(d.seller_name)}</span></div>` : ''}
              ${d.serial_number ? `<div class="dvc-r"><span>Seri No</span><span>${esc(d.serial_number)}</span></div>` : ''}
              ${d.room          ? `<div class="dvc-r"><span>Oda</span><span>${esc(d.room)}</span></div>` : ''}
            </div>
          `).join('')
        }
      </div>

      <div class="dsec">
        <div class="dstitle">Destek Talepleri (${tickets.length})</div>
        ${tickets.length === 0
          ? '<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:1rem 0">Talep yok</p>'
          : tickets.map(t => `
            <div class="tkt">
              <div class="tkt-k">${esc(t.kind || '—')}</div>
              <div class="tkt-d">${fmtDatetime(t.created_at)}</div>
            </div>
          `).join('')
        }
      </div>
    `;
  } catch(err) {
    body.innerHTML = `<div class="ebox">Hata: ${err.message}</div>`;
  }
}

function warrantyBadge(endIso) {
  if (!endIso) return '';
  const days = Math.round((new Date(endIso) - new Date()) / 86400000);
  if (days < 0)   return '<span class="badge bd-r">Süresi Dolmuş</span>';
  if (days < 30)  return `<span class="badge bd-a">${days}g kaldı</span>`;
  if (days < 90)  return `<span class="badge bd-b">${days}g kaldı</span>`;
  return `<span class="badge bd-g">${days}g kaldı</span>`;
}

function drow(k, v) {
  return `<div class="dr"><span class="dk">${k}</span><span class="dv">${v}</span></div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  CREDITS
// ═══════════════════════════════════════════════════════════════════
async function loadCredits() {
  const sumEl = document.getElementById('cr-sum');
  sumEl.innerHTML = spinHtml();
  try {
    const [stats, dist] = await Promise.all([
      rpc('admin_get_stats'),
      rpc('admin_get_credit_distribution'),
    ]);

    sumEl.innerHTML = `<div>${[
      ['Toplam Kredi Havuzu',         fmt(Math.round(stats.total_credits_sum || 0))],
      ['Kullanıcı Başına Ortalama',   fmt(Math.round(stats.avg_credits_per_user || 0))],
      ['Kredisi Olan Kullanıcı',      fmt(stats.users_with_credits)],
      ['Toplam Kullanıcı',            fmt(stats.total_users)],
    ].map(([k,v]) => `<div class="sumr"><span class="sumk">${k}</span><span class="sumv">${v}</span></div>`).join('')}</div>`;

    destroyChart('crDist');
    const distData = dist || [];
    chartRefs.crDist = new Chart(
      document.getElementById('ch-crdist').getContext('2d'), {
      type: 'bar',
      data: {
        labels: distData.map(r => r.bucket + ' Kredi'),
        datasets: [{
          label: 'Kullanıcı Sayısı',
          data: distData.map(r => r.count),
          backgroundColor: CHART_COLORS.slice(0, distData.length),
          borderRadius: 6, borderSkipped: false,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins: { legend: { display:false } },
        scales: { x: { grid:{ color:getGridColor() } }, y: { grid:{ display:false } } }
      }
    });
  } catch(err) {
    sumEl.innerHTML = `<div class="ebox">Hata: ${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DEVICES
// ═══════════════════════════════════════════════════════════════════
async function loadDevices() {
  try {
    const cats = await rpc('admin_get_device_categories') || [];

    destroyChart('devPie');
    chartRefs.devPie = new Chart(
      document.getElementById('ch-dpie').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: cats.map(r => catLabel(r.category)),
        datasets: [{ data: cats.map(r => r.count), backgroundColor: CHART_COLORS, borderWidth:0, hoverOffset:6 }]
      },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins: { legend: { position:'bottom', labels:{ boxWidth:10, font:{size:11}, padding:12 } } } }
    });

    destroyChart('devBar');
    chartRefs.devBar = new Chart(
      document.getElementById('ch-dbar').getContext('2d'), {
      type: 'bar',
      data: {
        labels: cats.map(r => catLabel(r.category)),
        datasets: [{
          label: 'Cihaz Sayısı',
          data: cats.map(r => r.count),
          backgroundColor: CHART_COLORS,
          borderRadius: 6, borderSkipped: false,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: { display:false } },
        scales: { y: { grid: { color:getGridColor() }, beginAtZero:true }, x: { grid: { display:false } } }
      }
    });
  } catch(err) { console.error(err); }
}

// ═══════════════════════════════════════════════════════════════════
//  ACTIVITY
// ═══════════════════════════════════════════════════════════════════
async function loadActivity() {
  try {
    const trend = await rpc('admin_get_signup_trend') || [];
    destroyChart('actTrend');
    chartRefs.actTrend = new Chart(
      document.getElementById('ch-act').getContext('2d'), {
      type: 'line',
      data: {
        labels: trend.map(r => r.date),
        datasets: [{
          label: 'Yeni Kayıt',
          data: trend.map(r => r.count),
          borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)',
          fill: true, tension: .4, pointRadius: 3,
        }]
      },
      options: lineOpts('Yeni Kayıt'),
    });
  } catch(err) { console.error(err); }
}

// ═══════════════════════════════════════════════════════════════════
//  SUPPORT
// ═══════════════════════════════════════════════════════════════════
async function loadSupport() {
  const el = document.getElementById('sup-stats');
  el.innerHTML = spin('grid-column:1/-1');
  try {
    const stats = await rpc('admin_get_stats');
    el.innerHTML = [
      statCard('Toplam Destek Talebi', fmt(stats.support_tickets_total), 'si-b', icoSupport(), 'Tüm zamanlar'),
      statCard('Son 7 Gün',            fmt(stats.support_tickets_7d),    'si-a', icoSupport(), 'Bu haftaki yeni talepler'),
    ].join('');
  } catch(err) {
    el.innerHTML = `<div class="ebox" style="grid-column:1/-1">Hata: ${err.message}</div>`;
  }
}

// ─── CHART DEFAULTS ──────────────────────────────────────────────
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';

function getGridColor() {
  return htmlEl.getAttribute('data-theme') === 'dark' ? '#334155' : '#e2e8f0';
}

function lineOpts(label) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display:false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} ${label}` } } },
    scales: {
      x: { grid: { display:false }, ticks: { font:{size:10}, maxRotation:0, maxTicksLimit:10 } },
      y: { grid: { color:getGridColor() }, beginAtZero:true, ticks: { font:{size:11} } }
    }
  };
}

// ─── CATEGORIES ──────────────────────────────────────────────────
function catLabel(cat) {
  const m = {
    tv:'Televizyon', audio:'Ses Sistemleri', computer:'Bilgisayar',
    phone:'Telefon', appliance:'Beyaz Eşya', kitchen:'Mutfak Aletleri',
    small_appliance:'Küçük Ev Aleti', car:'Otomotiv',
    personal:'Kişisel Bakım', other:'Diğer'
  };
  return m[cat] || cat || 'Diğer';
}

// ─── UTILS ───────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function spin(style='') { return `<div class="ld"${style ? ` style="${style}"` : ''}><div class="sp"></div><span>Yükleniyor…</span></div>`; }
function spinHtml() { return `<div class="ld"><div class="sp"></div><span>Yükleniyor…</span></div>`; }

// ─── SVG ICONS ───────────────────────────────────────────────────
const iSvg = (path) => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">${path}</svg>`;
const icoUsers  = () => iSvg('<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>');
const icoDevice = () => iSvg('<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>');
const icoCredit = () => iSvg('<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>');
const icoSupport= () => iSvg('<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>');
