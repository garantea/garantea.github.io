/**
 * GARANMIN — ortak istemci katmanı.
 *
 * Bütün sayfalar Supabase'e buradan konuşuyor, iskeleti (kenar menü + üst çubuk)
 * buradan alıyor ve oturumu buradan kontrol ediyor.
 *
 * ─── NEDEN TEK DOSYA ──────────────────────────────────────────────────────
 *
 * Panel statik HTML sayfalarından oluşuyor; menü her sayfaya kopyalansaydı yeni bir
 * sayfa eklemek dört dosyayı birden düzenlemek demek olurdu ve biri unutulduğunda
 * kullanıcı menüde olmayan bir sayfada kalırdı. Menü tek yerde üretiliyor, sayfalar
 * yalnızca kendi içeriğini yazıyor.
 */

/* ══════════════════════════════════════════════════════════════════════════
   YAPILANDIRMA
   ══════════════════════════════════════════════════════════════════════════ */

const GARANMIN = {
  supabaseUrl: 'https://mcsygnkhdjnkmqcntwvh.supabase.co',

  /*
    ANON ANAHTARI — GİZLİ DEĞİL, gizli olması da beklenmiyor.

    Aynı anahtar mobil uygulamanın içinde de dağıtılıyor; tarayıcıdan okunabilir olması
    yeni bir açık üretmiyor. Verinin kapısı bu anahtar değil, sunucudaki oturum kontrolü:
    her `garanmin_*` fonksiyonu ilk satırında jetonu doğruluyor (bkz. garanmin_setup.sql
    içindeki `garanmin_guard`). Anahtarla tek başına hiçbir veri okunamıyor.
  */
  anonKey: 'sb_publishable_OQXQZLhb_4coBQvG6AM2TQ_qtyl59LY',

  /*
    JETON `sessionStorage`'DA — `localStorage`'da DEĞİL.

    `localStorage` sekme kapanınca da kalıyor; ortak kullanılan bir bilgisayarda bu,
    tarayıcıyı kapatıp giden yöneticinin oturumunu bir sonrakine devretmek demek.
    `sessionStorage` sekmeyle birlikte siliniyor. Sunucu tarafında da 8 saatlik ömür var,
    yani iki taraf birden sınırlıyor.
  */
  tokenKey: 'garanmin_token',
};

/* ══════════════════════════════════════════════════════════════════════════
   OTURUM
   ══════════════════════════════════════════════════════════════════════════ */

function garanminToken() {
  return sessionStorage.getItem(GARANMIN.tokenKey);
}

function garanminSetToken(token) {
  sessionStorage.setItem(GARANMIN.tokenKey, token);
}

function garanminClearToken() {
  sessionStorage.removeItem(GARANMIN.tokenKey);
}

/**
 * Supabase RPC çağrısı.
 *
 * HATA MESAJI OLDUĞU GİBİ AKTARILIYOR: sunucudan gelen "Oturum gecersiz veya suresi
 * dolmus" gibi mesajlar kullanıcıya söylenecek şeyin ta kendisi. Genel bir "bir hata
 * oluştu" metnine çevirmek, sebebi yalnızca ağ sekmesinde görünür kılardı.
 */
async function garanminRpc(fn, params = {}) {
  const res = await fetch(`${GARANMIN.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': GARANMIN.anonKey,
      'Authorization': `Bearer ${GARANMIN.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!res.ok) {
    const mesaj = (body && (body.message || body.hint)) || `Sunucu hatasi (${res.status})`;
    const hata = new Error(mesaj);
    /*
      OTURUM HATASI AYRI İŞARETLENİYOR. Çağıran taraf bunu görünce kullanıcıyı giriş
      sayfasına yolluyor; başka bir hatada sayfada kalıp mesajı gösteriyor. İkisi
      ayrılmasaydı geçici bir ağ hatası da kullanıcıyı oturumdan atardı.
    */
    hata.oturumBitti = /oturum|session|jwt|unauthor/i.test(mesaj);
    throw hata;
  }
  return body;
}

/** Jetonlu çağrı — her veri fonksiyonu bunu kullanıyor. */
async function garanminData(fn, params = {}) {
  const token = garanminToken();
  if (!token) { garanminGoLogin(); throw new Error('Oturum yok'); }
  try {
    return await garanminRpc(fn, { p_token: token, ...params });
  } catch (e) {
    if (e.oturumBitti) { garanminClearToken(); garanminGoLogin(); }
    throw e;
  }
}

function garanminGoLogin() {
  if (!location.pathname.endsWith('garanmin.html')) {
    location.href = 'garanmin.html';
  }
}

/** Sayfa açılışında oturum yoksa girişe yollar. Panel sayfalarının ilk satırı. */
function garanminGuardPage() {
  if (!garanminToken()) { garanminGoLogin(); return false; }
  return true;
}

async function garanminLogout() {
  const token = garanminToken();
  garanminClearToken();
  // Sunucudaki kaydı da silmeye çalışıyoruz ama BEKLEMİYORUZ: ağ kopuksa bile
  // kullanıcı çıkabilmeli. Jeton zaten tarayıcıdan silindi.
  if (token) { garanminRpc('garanmin_logout', { p_token: token }).catch(() => {}); }
  location.href = 'garanmin.html';
}

/* ══════════════════════════════════════════════════════════════════════════
   İSKELET (kenar menü + üst çubuk)
   ══════════════════════════════════════════════════════════════════════════ */

const GARANMIN_MENU = [
  { href: 'garanmin-dashboard.html', icon: 'bx bx-home-smile', label: 'Genel Bakis' },
  { href: 'garanmin-users.html',     icon: 'bx bx-user',      label: 'Kullanicilar' },
  { href: 'garanmin-devices.html',   icon: 'bx bx-devices',    label: 'Cihazlar' },
  { href: 'garanmin-support.html',   icon: 'bx bx-support',   label: 'Destek' },
];

/**
 * Menü ve üst çubuğu sayfaya yerleştirir.
 *
 * `aktif` — o an açık olan sayfanın dosya adı; menüde vurgulanıyor. Sayfanın kendisi
 * `location` üzerinden de bulunabilirdi ama dosya yerel diskten (file://) açıldığında
 * yol biçimi işletim sistemine göre değişiyor; parametre geçmek her ortamda aynı.
 */
function garanminShell(aktif) {
  const menuHtml = GARANMIN_MENU.map(m => `
    <li class="menu-item ${m.href === aktif ? 'active' : ''}">
      <a href="${m.href}" class="menu-link">
        <i class="menu-icon tf-icons ${m.icon}"></i>
        <div>${m.label}</div>
      </a>
    </li>`).join('');

  document.getElementById('garanmin-menu').innerHTML = `
    <div class="app-brand demo">
      <a href="garanmin-dashboard.html" class="app-brand-link">
        <span class="app-brand-text demo menu-text fw-bold" style="letter-spacing:-.5px">
          <span style="color:#2563eb">Garan</span><span style="color:#dc2626">min</span>
        </span>
      </a>
      <a href="javascript:void(0);" class="layout-menu-toggle menu-link text-large ms-auto">
        <i class="bx bx-x d-flex align-items-center align-middle"></i>
      </a>
    </div>
    <div class="menu-inner-shadow"></div>
    <ul class="menu-inner py-1">
      <li class="menu-header small text-uppercase"><span class="menu-header-text">Yonetim</span></li>
      ${menuHtml}
    </ul>`;

  document.getElementById('garanmin-navbar').innerHTML = `
    <div class="layout-menu-toggle navbar-nav align-items-xl-center me-3 me-xl-0 d-xl-none">
      <a class="nav-item nav-link px-0 me-xl-4" href="javascript:void(0)">
        <i class="bx bx-menu bx-sm"></i>
      </a>
    </div>
    <div class="navbar-nav-right d-flex align-items-center justify-content-end" id="navbar-collapse">
      <span class="text-muted small me-3" id="garanmin-updated"></span>
      <button class="btn btn-sm btn-outline-secondary" onclick="garanminLogout()">
        <i class="bx bx-log-out me-1"></i> Cikis
      </button>
    </div>`;
}

/** "Son güncelleme" damgası — verinin ne kadar taze olduğu görünsün. */
function garanminStampUpdated() {
  const el = document.getElementById('garanmin-updated');
  if (el) el.textContent = 'Guncellendi: ' + new Date().toLocaleTimeString('tr-TR');
}

/* ══════════════════════════════════════════════════════════════════════════
   BİÇİMLENDİRME
   ══════════════════════════════════════════════════════════════════════════ */

function gNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

function gDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? '-' : d.toLocaleDateString('tr-TR');
}

function gDateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? '-' : d.toLocaleString('tr-TR');
}

/**
 * HTML KAÇIŞI — tabloya basılan HER kullanıcı verisi buradan geçiyor.
 *
 * Cihaz adı, marka ve destek mesajı KULLANICININ YAZDIĞI metin. Doğrudan `innerHTML`'e
 * konsaydı, adına `<img onerror=...>` yazan bir kullanıcı yöneticinin tarayıcısında kod
 * çalıştırabilirdi — ve o tarayıcıda geçerli bir yönetici oturumu duruyor.
 */
function gEsc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Hata kutusu — sayfa içeriğinin yerine geçmeden, üstte gösteriliyor. */
function gError(mesaj) {
  const el = document.getElementById('garanmin-error');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-danger mb-4">
    <i class="bx bx-error-circle me-1"></i> ${gEsc(mesaj)}</div>`;
}

/** Kategori kodlarını okunur Türkçeye çevirir (uygulamadaki `DeviceCategory` ile aynı). */
const GARANMIN_KATEGORI = {
  tv: 'Televizyon', audio: 'Ses', computer: 'Bilgisayar', phone: 'Telefon',
  appliance: 'Beyaz Esya', kitchen: 'Mutfak', small_appliance: 'Kucuk Ev Aleti',
  car: 'Arac', personal: 'Kisisel', other: 'Diger',
};
function gKategori(k) { return GARANMIN_KATEGORI[k] || k || 'Diger'; }
