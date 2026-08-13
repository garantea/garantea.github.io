/**
 * GaranTea — Admin Panel (garanmin.js)
 *
 * KİMLİK DOĞRULAMA:
 *   Kullanıcı adı + şifre → SHA-256 hash → Supabase'deki admin_tokens
 *   tablosundaki hash ile karşılaştırılır. Şifre bu dosyada plain text
 *   olarak yer almaz.
 *
 * VERİ:
 *   Supabase'deki SECURITY DEFINER fonksiyonlar çağrılır.
 *   Bu fonksiyonlar RLS'i atlatır; ama yalnızca geçerli token hash ile.
 */

'use strict';

// ─── SUPABASE CONFIG ──────────────────────────────────────────────
const SUPA_URL  = 'https://mcsygnkhdjnkmqcntwvh.supabase.co';
const SUPA_KEY  = 'sb_publishable_OQXQZLhb_4coBQvG6AM2TQ_qtyl59LY';
const { createClient } = supabase;
const db = createClient(SUPA_URL, SUPA_KEY);

// ─── STATE ────────────────────────────────────────────────────────
let AUTH_TOKEN_HASH = null; // set after successful login
let usersPage      = 0;
const PAGE_SIZE    = 50;

// Chart references — to destroy before re-draw
const chartRefs = {};

// ─── PANEL MAP ────────────────────────────────────────────────────
const PANEL_TITLES = {
  overview: 'Genel Bakış',
  users:    'Kullanıcılar',
  credits:  'Kredi Analizi',
  devices:  'Cihaz Analizi',
  activity: 'Büyüme Trendi',
  support:  'Destek Talepleri',
};

// ─── SHA-256 ──────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── HELPERS ──────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('tr-TR');
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function destroyChart(key) {
  if (chartRefs[key]) {
    chartRefs[key].destroy();
    chartRefs[key] = null;
  }
}

const CHART_COLORS = [
  '#2563eb','#ea4335','#10b981','#f59e0b','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#64748b'
];

// ─── LOGIN ────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl  = document.getElementById('login-error');
  const btn    = e.target.querySelector('.btn-login');
  const u      = document.getElementById('u-user').value.trim();
  const p      = document.getElementById('u-pass').value.trim();

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Doğrulanıyor…';

  try {
    const combined = u + ':' + p;
    const hash     = await sha256(combined);

    // Supabase'deki admin_tokens tablosunu kontrol et
    const { data, error } = await db.rpc('admin_get_stats', { p_token_hash: hash });
    if (error) throw new Error('Geçersiz kullanıcı adı veya şifre.');

    AUTH_TOKEN_HASH = hash;
    sessionStorage.setItem('gt_admin_hash', hash);
    enterDashboard();
  } catch (err) {
    errEl.textContent = err.message || 'Giriş başarısız.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
});

function enterDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  loadPanel('overview');
  startClock();
}

// ─── SESSION RESTORE ──────────────────────────────────────────────
(async () => {
  const saved = sessionStorage.getItem('gt_admin_hash');
  if (saved) {
    try {
      const { error } = await db.rpc('admin_get_stats', { p_token_hash: saved });
      if (!error) {
        AUTH_TOKEN_HASH = saved;
        enterDashboard();
        return;
      }
    } catch (_) {}
    sessionStorage.removeItem('gt_admin_hash');
  }
})();

// ─── LOGOUT ──────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  AUTH_TOKEN_HASH = null;
  sessionStorage.removeItem('gt_admin_hash');
  Object.keys(chartRefs).forEach(k => destroyChart(k));
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('u-pass').value = '';
});

// ─── CLOCK ───────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('topbar-time');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('tr-TR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ─── NAVIGATION ──────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const panel = item.dataset.panel;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('topbar-title').textContent = PANEL_TITLES[panel] || panel;
    loadPanel(panel);
  });
  item.addEventListener('keydown', e => { if (e.key === 'Enter') item.click(); });
});

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + id);
  if (target) target.classList.add('active');
}

// ─── PANEL LOADER ─────────────────────────────────────────────────
async function loadPanel(name) {
  showPanel(name);
  switch (name) {
    case 'overview': return loadOverview();
    case 'users':    return loadUsers(0);
    case 'credits':  return loadCredits();
    case 'devices':  return loadDevices();
    case 'activity': return loadActivity();
    case 'support':  return loadSupport();
  }
}

// ─── HELPER: SUPABASE RPC CALL ────────────────────────────────────
async function callAdmin(fn, extra = {}) {
  const { data, error } = await db.rpc(fn, {
    p_token_hash: AUTH_TOKEN_HASH,
    ...extra
  });
  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════════════════════
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════════
async function loadOverview() {
  const statsEl = document.getElementById('overview-stats');
  statsEl.innerHTML = '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div><span>Yükleniyor…</span></div>';

  try {
    const [stats, trend, cats] = await Promise.all([
      callAdmin('admin_get_stats'),
      callAdmin('admin_get_signup_trend'),
      callAdmin('admin_get_device_categories'),
    ]);

    statsEl.innerHTML = `
      ${statCard('Toplam Kullanıcı', fmt(stats.total_users), 'icon-blue', svgUsers(), `7 günde +${fmt(stats.new_users_7d)}`)}
      ${statCard('Toplam Cihaz', fmt(stats.total_devices), 'icon-amber', svgDevice(), `${fmt(stats.users_with_devices)} kullanıcı cihaz ekledi`)}
      ${statCard('Toplam Kredi', fmt(Math.round(stats.total_credits_sum)), 'icon-green', svgCredit(), `Ort. ${fmt(Math.round(stats.avg_credits_per_user))} / kullanıcı`)}
      ${statCard('Destek Talebi', fmt(stats.support_tickets_total), 'icon-red', svgSupport(), `Son 7 günde ${fmt(stats.support_tickets_7d)} yeni`)}
    `;

    // Trend chart
    destroyChart('signupTrend');
    const trendCtx = document.getElementById('chart-signup-trend').getContext('2d');
    chartRefs.signupTrend = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: (trend || []).map(r => r.date),
        datasets: [{
          label: 'Yeni Kullanıcı',
          data: (trend || []).map(r => r.count),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,.08)',
          fill: true, tension: .45,
          pointRadius: 3, pointBackgroundColor: '#2563eb',
        }]
      },
      options: lineOpts('Yeni Kullanıcı'),
    });

    // Categories doughnut
    destroyChart('catOverview');
    const catCtx = document.getElementById('chart-categories-overview').getContext('2d');
    const catData = cats || [];
    chartRefs.catOverview = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: catData.map(r => categoryLabel(r.category)),
        datasets: [{ data: catData.map(r => r.count), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }
    });

  } catch (err) {
    statsEl.innerHTML = `<div class="error-state" style="grid-column:1/-1">Hata: ${err.message}</div>`;
  }
}

function statCard(label, value, iconClass, iconSvg, sub) {
  return `
    <div class="stat-card">
      <div class="stat-icon ${iconClass}">${iconSvg}</div>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════════
async function loadUsers(offset = 0) {
  usersPage = offset;
  const tbody = document.getElementById('users-tbody');
  const label = document.getElementById('users-count-label');
  tbody.innerHTML = '<tr><td colspan="6"><div class="loading-state"><div class="spinner"></div><span>Yükleniyor…</span></div></td></tr>';

  try {
    const rows = await callAdmin('admin_get_users', { p_limit: PAGE_SIZE, p_offset: offset }) || [];

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">Kullanıcı bulunamadı</td></tr>';
      label.textContent = '0 kayıt';
      return;
    }

    tbody.innerHTML = rows.map(u => `
      <tr>
        <td><strong>${u.email || '—'}</strong></td>
        <td>${fmtDate(u.created_at)}</td>
        <td>${fmtDateTime(u.last_sign_in_at)}</td>
        <td><span class="badge ${u.credits > 0 ? 'badge-blue' : 'badge-muted'}">${fmt(u.credits)}</span></td>
        <td>${fmt(u.ad_watch_count)}</td>
        <td><span class="badge ${u.device_count > 0 ? 'badge-green' : 'badge-muted'}">${fmt(u.device_count)} cihaz</span></td>
      </tr>
    `).join('');

    label.textContent = `${offset + 1}–${offset + rows.length} arası gösteriliyor`;
    document.getElementById('users-prev').disabled = offset === 0;
    document.getElementById('users-next').disabled = rows.length < PAGE_SIZE;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="error-state">Hata: ${err.message}</div></td></tr>`;
  }
}

document.getElementById('users-prev').addEventListener('click', () => {
  if (usersPage >= PAGE_SIZE) loadUsers(usersPage - PAGE_SIZE);
});
document.getElementById('users-next').addEventListener('click', () => {
  loadUsers(usersPage + PAGE_SIZE);
});

// ═══════════════════════════════════════════════════════════════════
//  CREDITS
// ═══════════════════════════════════════════════════════════════════
async function loadCredits() {
  const summaryEl = document.getElementById('credit-summary-body');
  summaryEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const [stats, dist] = await Promise.all([
      callAdmin('admin_get_stats'),
      callAdmin('admin_get_credit_distribution'),
    ]);

    // Summary
    summaryEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.875rem">
        ${summaryRow('Toplam Kredi Miktarı', fmt(Math.round(stats.total_credits_sum || 0)))}
        ${summaryRow('Kullanıcı Başına Ortalama', fmt(Math.round(stats.avg_credits_per_user || 0)))}
      </div>`;

    // Distribution bar chart
    destroyChart('creditDist');
    const ctx = document.getElementById('chart-credit-dist').getContext('2d');
    const distData = dist || [];
    chartRefs.creditDist = new Chart(ctx, {
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
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  } catch (err) {
    summaryEl.innerHTML = `<div class="error-state">Hata: ${err.message}</div>`;
  }
}

function summaryRow(label, value) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:.75rem 0;border-bottom:1px solid var(--line-2)">
      <span style="font-size:.85rem;color:var(--muted)">${label}</span>
      <strong style="font-size:1.1rem;font-weight:700">${value}</strong>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  DEVICES
// ═══════════════════════════════════════════════════════════════════
async function loadDevices() {
  try {
    const cats = await callAdmin('admin_get_device_categories') || [];

    destroyChart('devPie');
    const pieCtx = document.getElementById('chart-devices-pie').getContext('2d');
    chartRefs.devPie = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: cats.map(r => categoryLabel(r.category)),
        datasets: [{ data: cats.map(r => r.count), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } } } }
    });

    destroyChart('devBar');
    const barCtx = document.getElementById('chart-devices-bar').getContext('2d');
    chartRefs.devBar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: cats.map(r => categoryLabel(r.category)),
        datasets: [{
          label: 'Cihaz Sayısı',
          data: cats.map(r => r.count),
          backgroundColor: CHART_COLORS,
          borderRadius: 6, borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: '#f1f5f9' }, beginAtZero: true },
          x: { grid: { display: false } }
        }
      }
    });
  } catch (err) {
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ACTIVITY (signup trend full view)
// ═══════════════════════════════════════════════════════════════════
async function loadActivity() {
  try {
    const trend = await callAdmin('admin_get_signup_trend') || [];

    destroyChart('actTrend');
    const ctx = document.getElementById('chart-activity-trend').getContext('2d');
    chartRefs.actTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trend.map(r => r.date),
        datasets: [{
          label: 'Yeni Kayıt',
          data: trend.map(r => r.count),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,.06)',
          fill: true, tension: .45,
          pointRadius: 4, pointBackgroundColor: '#2563eb',
        }]
      },
      options: lineOpts('Yeni Kayıt'),
    });
  } catch (err) {
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SUPPORT
// ═══════════════════════════════════════════════════════════════════
async function loadSupport() {
  const el = document.getElementById('support-stats');
  el.innerHTML = '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try {
    const stats = await callAdmin('admin_get_stats');
    el.innerHTML = `
      ${statCard('Toplam Destek Talebi', fmt(stats.support_tickets_total), 'icon-blue', svgSupport(), 'Tüm zamanlar')}
      ${statCard('Son 7 Gün', fmt(stats.support_tickets_7d), 'icon-amber', svgSupport(), 'Bu haftaki talepler')}
    `;
  } catch (err) {
    el.innerHTML = `<div class="error-state" style="grid-column:1/-1">Hata: ${err.message}</div>`;
  }
}

// ─── CHART DEFAULTS ───────────────────────────────────────────────
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';

function lineOpts(label) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} ${label}` } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
      y: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 11 } } }
    }
  };
}

// ─── CATEGORY LABELS ──────────────────────────────────────────────
function categoryLabel(cat) {
  const map = {
    tv: 'Televizyon', audio: 'Ses Sistemleri', computer: 'Bilgisayar',
    phone: 'Telefon', appliance: 'Beyaz Eşya', kitchen: 'Mutfak Aletleri',
    small_appliance: 'Küçük Ev Aleti', car: 'Otomotiv',
    personal: 'Kişisel Bakım', other: 'Diğer'
  };
  return map[cat] || cat;
}

// ─── SVG ICONS ────────────────────────────────────────────────────
function svgUsers() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
}
function svgDevice() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
}
function svgCredit() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
}
function svgSupport() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>`;
}
