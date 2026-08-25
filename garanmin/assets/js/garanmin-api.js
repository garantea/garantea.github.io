/**
 * GARANMIN — ortak istemci katmanı.
 *
 * Bütün sayfalar Supabase'e buradan konuşuyor, iskeleti (kenar menü + üst çubuk)
 * buradan alıyor ve oturumu buradan kontrol ediyor.
 *
 * ─── ARAYÜZ: ADMINATOR ────────────────────────────────────────────────────
 *
 * Panel, puikinsh/Adminator-admin-dashboard şablonunun DERLENMİŞ stil dosyası
 * üzerine kuruldu (assets/adminator/adminator.css, MIT). Şablonun sınıf adları
 * olduğu gibi kullanılıyor — `.shell`, `.d-sidebar`, `.d-topbar`, `.card`,
 * `.kpi-card`, `.table`, `.badge`, `.btn`… Kendi karşılıklarını yazmak yerine
 * şablonun kendi sınıflarını kullanmak, şablonun bir sonraki sürümüne geçmeyi
 * dosya değiştirmek kadar basit tutuyor.
 *
 * İKONLAR SVG, İKON YAZI TİPİ DEĞİL. Şablonun bütün ikon kuralları
 * `.nav-link > svg`, `.kpi-icon svg`, `.btn svg` gibi seçicilerle yazılmış;
 * boxicons'ın `<i class="bx">` etiketleri bu kuralların hiçbirine uymuyordu.
 * `gIkon()` şablonun kullandığı çizgi (feather) ailesinden satır içi SVG üretiyor.
 *
 * ─── NEDEN TEK DOSYA ──────────────────────────────────────────────────────
 *
 * Panel statik HTML sayfalarından oluşuyor. Menü her sayfaya kopyalansaydı yeni
 * bir sayfa eklemek on dosyayı birden düzenlemek olurdu ve biri unutulduğunda
 * kullanıcı menüde görünmeyen bir sayfada kalırdı. Menü tek yerde üretiliyor.
 */

/* ══════════════════════════════════════════════════════════════════════════
   YAPILANDIRMA
   ══════════════════════════════════════════════════════════════════════════ */
(function() {
  const t = localStorage.getItem('garanmin_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

const GARANMIN = {
  supabaseUrl: 'https://mcsygnkhdjnkmqcntwvh.supabase.co',

  /*
    ANON ANAHTARI — GİZLİ DEĞİL, gizli olması da beklenmiyor.

    Aynı anahtar mobil uygulamanın içinde de dağıtılıyor; tarayıcıdan okunabilir
    olması yeni bir açık üretmiyor. Verinin kapısı bu anahtar değil, sunucudaki
    oturum kontrolü: her `garanmin_*` fonksiyonu ilk satırında jetonu doğruluyor
    (`garanmin_guard`). Anahtarla tek başına hiçbir veri okunamıyor.
  */
  anonKey: 'sb_publishable_OQXQZLhb_4coBQvG6AM2TQ_qtyl59LY',

  /*
    JETON `sessionStorage`'DA — `localStorage`'da DEĞİL.

    `localStorage` sekme kapanınca da kalıyor; ortak kullanılan bir bilgisayarda
    bu, tarayıcıyı kapatıp giden yöneticinin oturumunu bir sonrakine devretmek
    demek. `sessionStorage` sekmeyle birlikte siliniyor. Sunucuda da 8 saatlik
    ömür var, yani iki taraf birden sınırlıyor.
  */
  tokenKey: 'garanmin_token',
  userKey:  'garanmin_user',
  expKey:   'garanmin_exp',
};

/* ══════════════════════════════════════════════════════════════════════════
   OTURUM
   ══════════════════════════════════════════════════════════════════════════ */

function garanminToken() { return sessionStorage.getItem(GARANMIN.tokenKey); }
function garanminUser()  { return sessionStorage.getItem(GARANMIN.userKey) || 'yönetici'; }
function garanminExp()   { return sessionStorage.getItem(GARANMIN.expKey); }

/**
 * Girişten dönen oturumu saklar.
 *
 * KULLANICI ADI ve BİTİŞ ZAMANI da saklanıyor: üst çubuk "kim giriş yapmış" ve
 * "oturum ne zaman bitiyor" sorularını sunucuya yeniden sormadan cevaplayabilsin.
 * İkisi de sırrı olmayan bilgiler; jetonun kendisi zaten aynı yerde duruyor.
 */
function garanminSetSession(s) {
  sessionStorage.setItem(GARANMIN.tokenKey, s.token);
  if (s.username)   sessionStorage.setItem(GARANMIN.userKey, s.username);
  if (s.expires_at) sessionStorage.setItem(GARANMIN.expKey, s.expires_at);
}

function garanminClearToken() {
  sessionStorage.removeItem(GARANMIN.tokenKey);
  sessionStorage.removeItem(GARANMIN.userKey);
  sessionStorage.removeItem(GARANMIN.expKey);
}

/**
 * Supabase RPC çağrısı.
 *
 * HATA MESAJI OLDUĞU GİBİ AKTARILIYOR: sunucudan gelen "Oturum gecersiz veya
 * suresi dolmus" gibi mesajlar kullanıcıya söylenecek şeyin ta kendisi. Genel bir
 * "bir hata oluştu" metnine çevirmek, sebebi yalnızca ağ sekmesinde görünür
 * kılardı.
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
      OTURUM HATASI AYRI İŞARETLENİYOR. Çağıran taraf bunu görünce kullanıcıyı
      giriş sayfasına yolluyor; başka bir hatada sayfada kalıp mesajı gösteriyor.
      İkisi ayrılmasaydı geçici bir ağ hatası da kullanıcıyı oturumdan atardı.
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
    const sonuc = await garanminRpc(fn, { p_token: token, ...params });
    garanminCanli(true);
    return sonuc;
  } catch (e) {
    if (e.oturumBitti) { garanminClearToken(); garanminGoLogin(); }
    else garanminCanli(false, e.message);
    throw e;
  }
}

function garanminGoLogin() {
  if (!location.pathname.endsWith('garanmin.html')) location.href = 'garanmin.html';
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
  if (token) garanminRpc('garanmin_logout', { p_token: token }).catch(() => {});
  location.href = 'garanmin.html';
}

/* ══════════════════════════════════════════════════════════════════════════
   İKONLAR
   ══════════════════════════════════════════════════════════════════════════

   Şablonun ikon kuralları `svg` seçicileri üzerine kurulu; ikon yazı tipi
   (boxicons) bu kuralların hiçbirine uymuyor ve hizalama/boyut şablondan
   kopuyordu. Buradaki yollar şablonun kullandığı çizgi ailesinden.
   ══════════════════════════════════════════════════════════════════════════ */

const G_IKON = {
  grid:      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  database:  '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  users:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  monitor:   '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  wallet:    '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  support:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24m0-14.14-4.24 4.24m-5.66 5.66-4.24 4.24"/>',
  server:    '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  activity:  '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  chart:     '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  bar:       '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  pie:       '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  layers:    '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 17 9 5 9-5"/><path d="m3 12 9 5 9-5"/>',
  shield:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  check:     '<path d="M20 6 9 17l-5-5"/>',
  clock:     '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert:     '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  x:         '<path d="M18 6 6 18M6 6l12 12"/>',
  star:      '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  tv:        '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
  tag:       '<path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  box:       '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  home:      '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  userPlus:  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>',
  run:       '<path d="M13 4a2 2 0 1 0 0-.01"/><path d="m8 21 3-6 3 2 2 4"/><path d="m5 12 3-5 4 2 3 3 3 1"/>',
  trend:     '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  minus:     '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  calc:      '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h8"/>',
  trophy:    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 2h12v7a6 6 0 0 1-12 0z"/><path d="M9 22h6M12 15v7"/>',
  list:      '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  hdd:       '<rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6.5 18h.01M10 18h.01"/><path d="m5 14 2.5-8h9L19 14"/>',
  calendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  login:     '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
  menu:      '<path d="M3 12h18M3 6h18M3 18h18"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  chevLeft:  '<path d="m15 18-6-6 6-6"/>',
  info:      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  message:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  file:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  idCard:    '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="12" r="2.5"/><path d="M14 10h5M14 14h5M4 17c.7-1.7 2.2-2.5 4-2.5s3.3.8 4 2.5"/>',
  refresh:   '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  sun:       '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon:      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  bell:      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
};

/**
 * Satır içi SVG ikon.
 *
 * @param ad     G_IKON anahtarı
 * @param sinif  isteğe bağlı ek sınıf
 */
function gIkon(ad, sinif) {
  const yol = G_IKON[ad] || G_IKON.info;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
    + ' stroke-linecap="round" stroke-linejoin="round"'
    + (sinif ? ' class="' + sinif + '"' : '') + ' aria-hidden="true">' + yol + '</svg>';
}

/* ══════════════════════════════════════════════════════════════════════════
   MENÜ TANIMI
   ══════════════════════════════════════════════════════════════════════════

   GRUPLU VE İKİ SEVİYELİ. Düz bir liste, sayfa sayısı altıyı geçtiğinde
   "hangisi neredeydi" sorusunu doğuruyor; gruplama, aranan şeyin hangi başlık
   altında olacağını tahmin edilebilir kılıyor.
   ══════════════════════════════════════════════════════════════════════════ */

const GARANMIN_MENU = [
  { ad: 'Genel', ikon: 'grid', alt: [
    { href: 'garanmin-dashboard.html', ad: 'Özet' },
    { href: 'garanmin-akis.html', ad: 'Zaman Akışı' },
    { href: 'garanmin-users.html', ad: 'Kullanıcı Listesi' },
  ]},
  { ad: 'Veri Tabanı', ikon: 'database', alt: [
    { href: 'garanmin-db.html',   ad: 'Tablolar' },
    { href: 'garanmin-sistem.html',    ad: 'Sistem Durumu' },
  ]},
  { ad: 'Cihazlar', ikon: 'monitor', alt: [
    { href: 'garanmin-devices.html',     ad: 'Kırılımlar' },
    { href: 'garanmin-devices-son.html', ad: 'Son Eklenenler' },
  ]},
  { ad: 'Gelir Gider', ikon: 'wallet', alt: [
    { href: 'garanmin-ekonomi.html', ad: 'Kredi Ekonomisi' },
  ]},
  { ad: 'Uygulama Etkileşimi', ikon: 'message', alt: [
    { href: 'garanmin-support.html', ad: 'Destek Talepleri' },
    { href: 'garanmin-notifications.html', ad: 'Bildirimler' },
    { href: 'garanmin-send-credits.html', ad: 'Kredi Transferi' },
  ]},
];

/**
 * GaranTea simgesi — UYGULAMANIN SVG'SİNİN BİREBİR KOPYASI.
 *
 * Kaynak: `GaranTea-App/src/components/GaranTeaLogo.tsx`. Aynı 200x200 viewBox,
 * aynı degradeler, aynı geometri. Yeniden çizilmedi çünkü "benzer" bir logo,
 * yan yana konduğunda gözle ayırt edilen bir logodur ve panel uygulamanın parçası.
 *
 * Animasyon CSS'te (`.g-logo`), zamanlaması `src/lib/logoTimeline.ts` ile aynı:
 * belge yukarıdan gelip fincanın içine iniyor (4 saniyelik tur), ardından beş
 * buhar çubuğu kademeli olarak yükseliyor.
 *
 * MASKE YOK — uygulamada da yok. Belgeyi gizleyen şey boyama sırası: fincanın ön
 * gövdesi belgeden SONRA çiziliyor, dolayısıyla üstünü örtüyor.
 */
function garanminLogo() {
  return `
<svg class="g-logo" viewBox="0 0 200 200" style="overflow:visible" aria-hidden="true">
  <defs>
    <linearGradient id="docFade" x1="0" y1="80" x2="0" y2="105" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="white" />
      <stop offset="100%" stop-color="black" />
    </linearGradient>
    <linearGradient id="cupGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#053582" />
      <stop offset="20%" stop-color="#0B57D0" />
      <stop offset="80%" stop-color="#4285F4" />
      <stop offset="100%" stop-color="#8ab4f8" />
    </linearGradient>
    <linearGradient id="insideCupGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#03204e" />
      <stop offset="20%" stop-color="#053582" />
      <stop offset="80%" stop-color="#0B57D0" />
      <stop offset="100%" stop-color="#1a73e8" />
    </linearGradient>
    <linearGradient id="saucerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1a73e8" />
      <stop offset="100%" stop-color="#0f4185" />
    </linearGradient>
    <linearGradient id="docGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA4335" />
      <stop offset="100%" stop-color="#B31412" />
    </linearGradient>
    <mask id="fadeMask" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
      <rect x="0" y="0" width="200" height="200" fill="url(#docFade)" />
    </mask>
  </defs>

  <style>
    .g-anim-doc { animation: docAnim 4s linear infinite; }
    .g-anim-st1 { animation: st1 4s infinite; }
    .g-anim-st2 { animation: st2 4s infinite; }
    .g-anim-st3 { animation: st3 4s infinite; }
    .g-anim-st4 { animation: st4 4s infinite; }
    .g-anim-st5 { animation: st5 4s infinite; }

    @keyframes docAnim {
      0% { transform: translate(75px, 5px); opacity: 0; }
      5% { transform: translate(75px, 5px); opacity: 1; }
      45% { transform: translate(75px, 110px); opacity: 1; }
      100% { transform: translate(75px, 110px); opacity: 0; }
    }
    @keyframes st1 {
      0%, 45% { transform: translateY(15px); opacity: 0; height: 14px; }
      75% { transform: translateY(-15px); opacity: 0.7; height: 22px; }
      100% { transform: translateY(-15px); opacity: 0; height: 22px; }
    }
    @keyframes st2 {
      0%, 40% { transform: translateY(15px); opacity: 0; height: 20px; }
      80% { transform: translateY(-25px); opacity: 0.85; height: 32px; }
      100% { transform: translateY(-25px); opacity: 0; height: 32px; }
    }
    @keyframes st3 {
      0%, 45% { transform: translateY(15px); opacity: 0; height: 26px; }
      85% { transform: translateY(-35px); opacity: 0.95; height: 42px; }
      100% { transform: translateY(-35px); opacity: 0; height: 42px; }
    }
    @keyframes st4 {
      0%, 50% { transform: translateY(15px); opacity: 0; height: 20px; }
      90% { transform: translateY(-25px); opacity: 0.85; height: 32px; }
      100% { transform: translateY(-25px); opacity: 0; height: 32px; }
    }
    @keyframes st5 {
      0%, 42% { transform: translateY(15px); opacity: 0; height: 14px; }
      72% { transform: translateY(-15px); opacity: 0.7; height: 22px; }
      100% { transform: translateY(-15px); opacity: 0; height: 22px; }
    }
  </style>

  <ellipse cx="100" cy="176" rx="65" ry="8" fill="rgba(255,255,255,0.2)" />
  <ellipse cx="100" cy="165" rx="80" ry="16" fill="url(#saucerGradient)" />
  <ellipse cx="100" cy="165" rx="50" ry="10" fill="#1558b0" opacity="0.6" />
  <ellipse cx="100" cy="165" rx="49" ry="9" fill="none" stroke="#8ab4f8" stroke-width="1.5" />
  <ellipse cx="100" cy="165" rx="40" ry="8" fill="#0f4185" opacity="0.5" />

  <path d="M 156 106 C 188 106, 185 146, 145 148" fill="none" stroke="url(#cupGradient)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />

  <ellipse cx="100" cy="95" rx="60" ry="16" fill="url(#insideCupGradient)" />
  <ellipse cx="100" cy="95" rx="60" ry="16" fill="none" stroke="url(#cupGradient)" stroke-width="2.5" />

  <g mask="url(#fadeMask)">
    <g class="g-anim-doc">
      <rect x="0" y="0" width="50" height="70" rx="6" fill="url(#docGradient)" />
      <rect x="0" y="0" width="50" height="2" rx="1" fill="#ffffff" opacity="0.4" />
      <rect x="10" y="16" width="30" height="4" rx="2" fill="#ffffff" />
      <rect x="10" y="28" width="20" height="4" rx="2" fill="#ffffff" />
      <rect x="10" y="40" width="25" height="4" rx="2" fill="#ffffff" />
      <rect x="10" y="52" width="15" height="4" rx="2" fill="#ffffff" />
    </g>
  </g>

  <path d="M 40 95 A 60 16 0 0 0 160 95 C 160 150, 135 165, 100 165 C 65 165, 40 150, 40 95 Z" fill="url(#cupGradient)" stroke="url(#cupGradient)" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M 40 95 A 60 16 0 0 0 160 95" fill="none" stroke="url(#cupGradient)" stroke-width="2.5" />

  <g>
    <rect x="70" y="65" width="6" height="14" rx="3" fill="#8ab4f8" class="g-anim-st1" />
    <rect x="84" y="60" width="6" height="20" rx="3" fill="#669df6" class="g-anim-st2" />
    <rect x="97" y="55" width="6" height="26" rx="3" fill="#4285f4" class="g-anim-st3" />
    <rect x="110" y="60" width="6" height="20" rx="3" fill="#669df6" class="g-anim-st4" />
    <rect x="124" y="65" width="6" height="14" rx="3" fill="#8ab4f8" class="g-anim-st5" />
  </g>
</svg>`;
}

const GARANMIN_LOGO = garanminLogo();

/* ══════════════════════════════════════════════════════════════════════════
   İSKELET
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Kenar menüyü ve üst çubuğu sayfaya yerleştirir.
 *
 * @param aktif  o an açık olan sayfanın dosya adı — menüde vurgulanıyor ve grubu
 *               kendiliğinden açılıyor. `location` üzerinden de bulunabilirdi ama
 *               dosya yerel diskten (file://) açıldığında yol biçimi işletim
 *               sistemine göre değişiyor; parametre geçmek her ortamda aynı.
 * @param baslik üst çubuktaki sayfa başlığı.
 * @param ustBil başlığın üstündeki küçük etiket (şablonun `.eyebrow`'u).
 */
function garanminShell(aktif, baslik, ustBil) {
  const menuHtml = GARANMIN_MENU.map((g, i) => {
    const grupAktif = g.alt.some(a => a.href === aktif);
    return `
      <div class="nav-item-group is-open" data-grup="${i}">
        <a class="nav-link${grupAktif ? ' is-active' : ''}" href="javascript:void(0)"
           onclick="garanminGrupAc(${i})" title="${gEsc(g.ad)}">
          ${gIkon(g.ikon)}
          <span>${gEsc(g.ad)}</span>
          ${gIkon('chevRight', 'chev')}
        </a>
        <div class="nav-submenu">
          ${g.alt.map(a => `<a href="${a.href}" class="${a.href === aktif ? 'is-active' : ''}">${gEsc(a.ad)}</a>`).join('')}
        </div>
      </div>`;
  }).join('');

  document.getElementById('garanmin-menu').innerHTML = `
    <div class="g-marka">
      ${GARANMIN_LOGO}
      <span class="g-marka-yazi"><span class="a">Garan</span><span class="b">min</span></span>
    </div>
    <nav class="nav-section">
      <div class="nav-label">Panel</div>
      ${menuHtml}
    </nav>
    <div class="sidebar-footer">
      <div class="eyebrow" style="margin-bottom:6px">Oturum</div>
      <div style="font-size:12.5px;color:var(--t-base)">${gEsc(garanminUser())}</div>
      <div class="g-kalan" id="g-oturum">-</div>
    </div>`;

  const bas = garanminUser().slice(0, 2).toUpperCase();
  document.getElementById('garanmin-navbar').innerHTML = `
    <div class="g-ust-sol">
      <button class="icon-btn" onclick="garanminKatla()" title="Menuyu ac/kapat"
              aria-label="Menuyu ac/kapat">${gIkon('menu')}</button>
      <div class="g-ust-baslik">
        <span class="eyebrow">${gEsc(ustBil || 'Garanmin')}</span>
        <h1>${gEsc(baslik || '')}</h1>
      </div>
    </div>
    <div class="topbar-actions">
      <span class="badge dot" id="g-canli" title="Veritabanı baglantisi">
        <span id="g-canli-yazi">baglaniyor</span>
      </span>
      <div class="g-saat">
        <div class="s" id="g-saat">--:--:--</div>
        <div class="t" id="g-tarih">-</div>
      </div>
      <button class="icon-btn" id="g-tema-btn" onclick="garanminTemaDegistir()" title="Tema Degistir" aria-label="Tema">
        ${gIkon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon')}
      </button>
      <div style="position:relative; display:inline-block;">
        <button class="icon-btn" id="g-bildirim-btn" onclick="garanminBildirimAc()" title="Bildirimler" aria-label="Bildirimler">
          ${gIkon('bell')}<span class="badge danger" id="g-bell-badge" style="position:absolute; top:4px; right:4px; width:8px; height:8px; padding:0; border-radius:50%; display:none;"></span>
        </button>
        <div id="g-bildirim-kutu" style="display:none; position:absolute; right:0; top:40px; width:280px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; box-shadow:var(--shadow-lg); z-index:100; padding:10px; text-align:left;">
          <div class="eyebrow" style="margin-bottom:8px;">Son Dakika</div>
          <div id="g-bildirim-liste" style="font-size:12.5px; color:var(--t-base); max-height:200px; overflow-y:auto;">Henuz bildirim yok.</div>
        </div>
      </div>
      <button class="icon-btn" onclick="location.reload()" title="Yenile"
              aria-label="Yenile">${gIkon('refresh')}</button>
      <button class="icon-btn" onclick="garanminLogout()" title="Çıkış"
              aria-label="Çıkış">${gIkon('logout')}</button>
      <span class="avatar" title="Oturum: ${gEsc(garanminUser())}">${gEsc(bas)}</span>
    </div>`;

  garanminKatlaUygula(localStorage.getItem('garanmin_dar') === '1');
  garanminSaatBaslat();
  garanminNabizBaslat();
  if (typeof garanminGrafikGozlemci === 'function') garanminGrafikGozlemci();
  garanminMockBildirimBaslat();
}

/**
 * Bir grubu açıp diğerlerini kapatır (akordiyon).
 *
 * HEPSİ AYNI ANDA AÇIK OLABİLİRDİ ama o zaman menü, kenar çubuğundan uzun olur ve
 * içeride ayrıca kaydırma gerekirdi.
 */
function garanminGrupAc(i) {
  // Simge durumundayken tıklamak menüyü açıyor: kapalı bir menüde alt başlıkları
  // göstermenin yeri yok, o yüzden önce genişliyor.
  if (document.getElementById('g-app').classList.contains('dar')) {
    garanminKatlaUygula(false);
  }
  const hedef = document.querySelector('.nav-item-group[data-grup="' + i + '"]');
  if (hedef) hedef.classList.toggle('is-open');
}

function garanminKatla() {
  const dar = !document.getElementById('g-app').classList.contains('dar');
  garanminKatlaUygula(dar);
}

/**
 * Menü durumunu uygular ve HATIRLAR — her sayfada yeniden açmak gerekmesin.
 *
 * ─── SONDAKİ `resize` NEDEN GEREKLİ ───────────────────────────────────────
 *
 * Menü katlanınca içerik alanı ~176 piksel genişliyor. ApexCharts kendi boyutunu
 * yalnızca PENCERE yeniden boyutlandığında hesaplıyor; pencere değişmediği için
 * grafikler eski genişlikte kalıyor ve kartın sağında boş bir şerit bırakıyordu.
 * Geçiş bittikten sonra yapay bir `resize` olayı, grafiklerin kendini yeniden
 * ölçmesini sağlıyor. 240 ms, CSS'teki geçişten biraz uzun: geçiş sırasında ölçüm
 * alınırsa grafik ARADAKİ genişliğe göre çizilir ve sorun aynen kalır.
 */
function garanminKatlaUygula(dar) {
  document.getElementById('g-app').classList.toggle('dar', !!dar);
  localStorage.setItem('garanmin_dar', dar ? '1' : '0');
  setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 240);
}

function garanminTemaDegistir() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('garanmin_theme', next);
  const btn = document.getElementById('g-tema-btn');
  if (btn) btn.innerHTML = gIkon(next === 'light' ? 'moon' : 'sun');
}

function garanminBildirimAc() {
  const kutu = document.getElementById('g-bildirim-kutu');
  if (!kutu) return;
  kutu.style.display = kutu.style.display === 'none' ? 'block' : 'none';
  const badge = document.getElementById('g-bell-badge');
  if (badge) badge.style.display = 'none';
}

function garanminMockBildirimBaslat() {
  setInterval(function() {
    const badge = document.getElementById('g-bell-badge');
    if (badge) {
      badge.style.display = 'block';
      const liste = document.getElementById('g-bildirim-liste');
      const msgList = [
        'Ahmet yeni bir cihaz ekledi.',
        'Yeni bir destek talebi geldi.',
        'Sistem yedegi alindi.',
        'Kredi transferi gerceklesti.',
        'Yeni bir kullanici kaydoldu.'
      ];
      const msg = msgList[Math.floor(Math.random() * msgList.length)];
      if (liste.innerText.includes('yok')) liste.innerHTML = '';
      const saatStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute:'2-digit' });
      liste.innerHTML = '<div style="padding:8px 0; border-bottom:1px solid var(--border-soft); display:flex; gap:8px;">' 
                      + '<div style="color:var(--primary); margin-top:2px;">' + gIkon('info') + '</div>'
                      + '<div><div style="font-weight:500;">' + msg + '</div><div style="font-size:10px; color:var(--t-muted);">' + saatStr + '</div></div>'
                      + '</div>' + liste.innerHTML;
    }
  }, 30000);
}

/* ══════════════════════════════════════════════════════════════════════════
   ÜST ÇUBUK — saat ve canlılık
   ══════════════════════════════════════════════════════════════════════════ */

/** Saniye saniye işleyen saat + tarih. */
function garanminSaatBaslat() {
  const gunler = ['Pazar','Pazartesi','Sali','Carsamba','Persembe','Cuma','Cumartesi'];
  function tik() {
    const d = new Date();
    const s = document.getElementById('g-saat');
    const t = document.getElementById('g-tarih');
    if (!s) return;
    s.textContent = d.toLocaleTimeString('tr-TR');
    t.textContent = d.toLocaleDateString('tr-TR') + ' · ' + gunler[d.getDay()];
    // Oturumun kalan süresi: 8 saatlik ömür sessizce dolup kullanıcıyı beklenmedik
    // bir anda girişe atmasın.
    const exp = garanminExp();
    const o = document.getElementById('g-oturum');
    if (exp && o) {
      const kalan = Math.max(0, Math.round((new Date(exp) - d) / 60000));
      o.textContent = kalan > 60
        ? Math.floor(kalan / 60) + ' sa ' + (kalan % 60) + ' dk kaldi'
        : kalan + ' dk kaldi';
    }
  }
  tik();
  setInterval(tik, 1000);
}

/**
 * CANLI GÖSTERGESİ.
 *
 * ─── NEDEN AYRI BİR SORGU ATIYOR ──────────────────────────────────────────
 *
 * Sayfa açılışındaki veri çağrıları da bağlantıyı kanıtlıyor, ama yalnızca O ANDA.
 * Kullanıcı paneli açık bırakıp bir saat sonra baktığında ekrandaki sayılar hâlâ
 * duruyor ve bağlantının kopmuş olduğunu hiçbir şey söylemiyor. Otuz saniyede bir
 * atılan bu ucuz sorgu (`garanmin_health` yalnızca sunucu saatini döndürüyor),
 * göstergeyi gerçekten canlı tutuyor.
 *
 * Aynı sorgu SUNUCU SAATİNİ de getiriyor; tarayıcı saatiyle arasında 2 dakikadan
 * fazla fark varsa uyarı veriliyor. Bu fark önemli: garanti hesapları tarihe bağlı
 * ve saati kaymış bir makinede panel, yanlış ama tutarlı görünen bir tablo gösterir.
 */
let GARANMIN_NABIZ = null;
function garanminNabizBaslat() {
  async function kontrol() {
    try {
      const h = await garanminRpc('garanmin_health', { p_token: garanminToken() });
      const fark = Math.abs(new Date(h.server_time) - new Date()) / 1000;
      garanminCanli(true, fark > 120 ? 'saat farki ' + Math.round(fark) + ' sn' : null);
      window.GARANMIN_SAGLIK = h;
    } catch (e) {
      garanminCanli(false, e.message);
    }
  }
  kontrol();
  if (GARANMIN_NABIZ) clearInterval(GARANMIN_NABIZ);
  GARANMIN_NABIZ = setInterval(kontrol, 30000);
}

function garanminCanli(ok, not) {
  const el = document.getElementById('g-canli');
  const yazi = document.getElementById('g-canli-yazi');
  if (!el || !yazi) return;
  el.className = 'badge dot ' + (ok ? 'success g-nabiz' : 'danger');
  yazi.textContent = ok ? (not || 'canli') : 'baglanti yok';
  if (not) el.title = not;
}

/* ══════════════════════════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Modalı açar.
 *
 * ESC VE PERDEYE TIKLAMA İLE DE KAPANIYOR. Yalnızca çarpı düğmesi bırakılsaydı,
 * kapatmanın tek yolu ekranın sağ üst köşesindeki küçük bir hedefe nişan almak
 * olurdu; ikisi de kullanıcının refleksle denediği yollar.
 */
function garanminModalAc(baslikHtml, govdeHtml) {
  let p = document.getElementById('g-modal-perde');
  if (!p) {
    p = document.createElement('div');
    p.id = 'g-modal-perde';
    p.className = 'g-modal-perde';
    p.innerHTML = `
      <div class="modal-demo g-modal" id="g-modal">
        <div class="modal-head" id="g-modal-bas"></div>
        <div class="modal-body g-modal-govde" id="g-modal-govde"></div>
      </div>`;
    document.body.appendChild(p);

    // Perdeye tıklamak kapatıyor; modalın İÇİNE tıklamak kapatmıyor.
    p.addEventListener('click', function (e) { if (e.target === p) garanminModalKapat(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') garanminModalKapat();
    });
  }
  document.getElementById('g-modal-bas').innerHTML = baslikHtml
    + '<button class="icon-btn" onclick="garanminModalKapat()" aria-label="Kapat">'
    + gIkon('x') + '</button>';
  document.getElementById('g-modal-govde').innerHTML = govdeHtml;
  p.classList.add('acik');
}

function garanminModalKapat() {
  const p = document.getElementById('g-modal-perde');
  if (p) p.classList.remove('acik');
}

/* ══════════════════════════════════════════════════════════════════════════
   BİLEŞEN ÜRETİCİLERİ — şablonun sınıflarıyla
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * KPI kartı — şablonun `.kpi-card` yapısı.
 *
 * `c-<renk>` sınıfı kartın köşesindeki yumuşak parıltıyı da o renge boyuyor
 * (şablonda `.kpi-card:before` `currentColor` kullanıyor), bu yüzden ikon rengi
 * ile kart rengi AYRI DEĞİL, tek bir değerden geliyor.
 */
function gKpi(liste) {
  return liste.map(function (k) {
    const renk = k.renk || 'primary';
    return '<div class="kpi-card c-' + renk + '">'
      +   '<div class="kpi-top">'
      +     '<div class="kpi-identity" style="display:flex;align-items:center">'
      +       '<div class="kpi-icon ' + renk + '">' + gIkon(k.ikon) + '</div>'
      +       '<div class="kpi-label">' + gEsc(k.etiket) + '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="kpi-value">' + k.deger + '</div>'
      +   (k.alt ? '<div class="kpi-compare">' + k.alt + '</div>' : '')
      + '</div>';
  }).join('');
}

/** KPI şeridini hedef kaba yazar. */
function gKpiYaz(hedef, liste) {
  const el = document.getElementById(hedef);
  if (el) el.innerHTML = gKpi(liste);
}

/** Kart başlığı — şablonun `.card-head` yapısı. */
function gKartBas(ustBil, baslik, sag) {
  return '<div class="card-head">'
    +   '<div class="card-title-wrap">'
    +     '<span class="eyebrow">' + gEsc(ustBil) + '</span>'
    +     '<h2 class="card-title">' + gEsc(baslik) + '</h2>'
    +   '</div>'
    +   (sag ? '<div>' + sag + '</div>' : '')
    + '</div>';
}

/** Anahtar/değer satırı (profil, sistem bilgileri). */
function gKv(etiket, deger, not) {
  return '<div class="g-kv"><div class="g-kv-satir">'
    + '<span class="g-kv-etiket">' + etiket + '</span>'
    + '<span class="g-kv-deger">' + deger + '</span></div>'
    + (not ? '<div class="g-kv-not">' + not + '</div>' : '') + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════════
   BİÇİMLENDİRME
   ══════════════════════════════════════════════════════════════════════════ */

function gNum(v) {
  const n = Number(v || 0);
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

function gBayt(v) {
  const n = Number(v || 0);
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}



/**
 * Tablo verilerini CSV formatında dışa aktarır.
 *
 * @param dosyaAdi  Indirilecek dosyanin adi (orn: "kullanicilar.csv")
 * @param basliklar Sütun başlıkları dizisi (orn: ['E-posta', 'Kayıt Tarihi'])
 * @param veriler   Satırlar dizisi, her satır da hücreler dizisinden oluşur
 */
function garanminExportCSV(dosyaAdi, basliklar, veriler) {
  let csv = basliklar.join(',') + '\n';
  veriler.forEach(function(satir) {
    csv += satir.map(function(hucre) {
      let t = (hucre === null || hucre === undefined) ? '' : String(hucre);
      t = t.replace(/"/g, '""'); // CSV'de tırnakları escape et
      if (t.search(/("|,|\n)/g) >= 0) t = '"' + t + '"'; // virgül veya satır sonu varsa tırnak içine al
      return t;
    }).join(',') + '\n';
  });
  
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' }); // BOM ekle (Türkçe karakterler için)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', dosyaAdi);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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

/** "3 gun once" gibi göreli zaman — son giriş sütununda tarihten daha okunur. */
function gGoreli(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return '-';
  const sn = (Date.now() - d) / 1000;
  if (sn < 60) return 'az once';
  if (sn < 3600) return Math.floor(sn / 60) + ' dk once';
  if (sn < 86400) return Math.floor(sn / 3600) + ' sa once';
  if (sn < 2592000) return Math.floor(sn / 86400) + ' gun once';
  return d.toLocaleDateString('tr-TR');
}

/**
 * HTML KAÇIŞI — tabloya basılan HER kullanıcı verisi buradan geçiyor.
 *
 * Cihaz adı, marka ve destek mesajı KULLANICININ YAZDIĞI metin. Doğrudan
 * `innerHTML`'e konsaydı, adına `<img onerror=...>` yazan bir kullanıcı
 * yöneticinin tarayıcısında kod çalıştırabilirdi — ve o tarayıcıda geçerli bir
 * yönetici oturumu duruyor.
 */
function gEsc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Hata kutusu — sayfa içeriğinin yerine geçmeden, üstte gösteriliyor. */
function gError(mesaj) {
  const el = document.getElementById('garanmin-error');
  if (!el) { console.error(mesaj); return; }
  el.innerHTML = '<div class="g-uyari danger">' + gIkon('alert') + '<span>'
    + gEsc(mesaj) + '</span></div>';
}

/** Veri yokken kartın içine yazılan not. Boş bir grafik yerine açık bir cümle. */
function gBos(el, veri) {
  if (veri && veri.length) return false;
  const d = document.getElementById(el);
  if (d) d.innerHTML = '<div class="g-bos">' + gIkon('info') + '<span>Gosterilecek veri yok</span></div>';
  return true;
}

/**
 * Grafik kabını çizimden ÖNCE boşaltır ve döndürür.
 *
 * Aralık düğmesiyle yeniden yüklenen sayfalarda kap daha önce `gBos` tarafından
 * "Gosterilecek veri yok" yazısıyla doldurulmuş olabiliyor. ApexCharts kabı
 * temizlemeden kendi öğesini EKLİYOR; sonuç, grafiğin üstünde asılı kalmış eski
 * bir "veri yok" satırı oluyordu.
 */
function gKap(id) {
  const d = document.getElementById(id);
  if (d) d.innerHTML = '';
  return d;
}

/** Kategori kodlarını okunur Türkçeye çevirir (uygulamadaki `DeviceCategory` ile aynı). */
const GARANMIN_KATEGORI = {
  tv: 'Televizyon', audio: 'Ses', computer: 'Bilgisayar', phone: 'Telefon',
  appliance: 'Beyaz Esya', kitchen: 'Mutfak', small_appliance: 'Kucuk Ev Aleti',
  car: 'Arac', personal: 'Kisisel', other: 'Diger',
};
function gKategori(k) { return GARANMIN_KATEGORI[k] || k || 'Diger'; }

/**
 * Garanti durumu → etiket + renk + rozet sınıfı.
 *
 * Renkler ŞABLONUN değişkenlerinden alınmış değerler; rozet sınıfı da şablonun
 * `.badge.success` / `.badge.warning` / `.badge.danger` ailesinden. Grafikteki
 * renk ile rozetteki renk aynı olsun diye ikisi tek yerde tanımlı.
 */
const GARANMIN_DURUM = {
  active:        { ad: 'Aktif',           renk: '#10b981', sinif: 'success' },
  expiring_soon: { ad: 'Yakinda bitiyor', renk: '#f59e0b', sinif: 'warning' },
  expired:       { ad: 'Suresi dolmus',   renk: '#ef4444', sinif: 'danger' },
};
function gDurum(k) { return GARANMIN_DURUM[k] || { ad: k, renk: '#64748b', sinif: '' }; }

/**
 * Bir cihazın garanti durumu — UYGULAMANIN KURALININ AYNISI.
 *
 * Eşik "%90 tüketildi", "30 gün kaldı" DEĞİL (`lib/warranty.ts`). İki taraf farklı
 * sayarsa panel, kullanıcının telefonunda gördüğünden başka bir tablo gösterir ve
 * hangisinin doğru olduğu anlaşılmaz.
 */
function gGarantiDurum(alim, bitis) {
  if (!bitis) return 'active';
  const b = new Date(bitis), bugun = new Date();
  if (b < bugun) return 'expired';
  if (!alim) return 'active';
  const a = new Date(alim), toplam = b - a;
  if (toplam <= 0) return 'active';
  return ((bugun - a) / toplam) > 0.9 ? 'expiring_soon' : 'active';
}

/* ══════════════════════════════════════════════════════════════════════════
   GRAFİKLER
   ══════════════════════════════════════════════════════════════════════════ */

/** Şablonun vurgu renkleri — CSS değişkenleriyle aynı değerler. */
const G_RENK = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#14b8a6'];

/*
  EKSEN/IZGARA BİÇİMİ `window.Apex` İLE VERİLİYOR.

  Sayfalar seçenekleri `Object.assign(temel, ayar)` ile birleştiriyor ve bu SIĞ
  bir birleştirme: bir sayfa kendi `xaxis: { categories: [...] }` nesnesini
  verdiğinde temeldeki `xaxis` tamamen SİLİNİYOR. ApexCharts `window.Apex`'i her
  grafiğe DERİN birleştirdiği için biçim burada güvende.
*/
window.Apex = {
  chart: {
    fontFamily: 'inherit', toolbar: { show: false },
    animations: { easing: 'easeout', speed: 500 },
    /*
      `parentHeightOffset` VARSAYILAN 15 — SIFIRLANMASI ŞART.

      ApexCharts, yüksekliği `'100%'` verilen bir grafiği kabın yüksekliğine 15
      piksel EKLEYEREK çiziyor. Kabın (`.g-grafik`) yüksekliği sabit olduğu için
      bu 15 piksel kabın dışına, oradan da kartın beyaz alanının dışına taşıyordu:
      grafik "kartından büyük" görünüyordu. Sıfırlanınca grafik tam kabına oturuyor.

      `redrawOnParentResize` de açık tutuluyor: kenar çubuğu katlanınca kart
      genişliyor ve grafik kendini yeniden ölçmek zorunda.
    */
    parentHeightOffset: 0,
    redrawOnParentResize: true,
    redrawOnWindowResize: true,
  },
  dataLabels: { enabled: false },
  stroke: { lineCap: 'round' },
  grid: { borderColor: '#eef1f5', strokeDashArray: 4, padding: { left: 6, right: 6 } },
  xaxis: {
    axisBorder: { show: false }, axisTicks: { show: false },
    labels: { style: { colors: '#94a3b8', fontSize: '10.5px' }, rotate: -45, rotateAlways: false, hideOverlappingLabels: true },
  },
  yaxis: { labels: { style: { colors: '#94a3b8', fontSize: '10.5px' } } },
  legend: {
    fontSize: '12px', fontWeight: 500, labels: { colors: '#64748b' },
    markers: { radius: 12, width: 9, height: 9 }, itemMargin: { horizontal: 7, vertical: 2 },
  },
  tooltip: { theme: 'light', style: { fontSize: '12px' } },
};

function gGrafikTemel(yukseklik) {
  return { 
    chart: { height: yukseklik || '100%', width: '100%' }, 
    colors: G_RENK,
    tooltip: {
      fixed: {
        enabled: true,
        position: 'topLeft',
        offsetY: 0,
        offsetX: 0
      }
    }
  };
}

/*
  ══════════════════════════════════════════════════════════════════════════
  GRAFİKLERİ KABINA ZORLA OTURTAN GÖZLEMCİ
  ══════════════════════════════════════════════════════════════════════════

  ApexCharts kendi genişliğini ÇİZİM ANINDA bir kez ölçüyor ve sonuç piksel
  olarak sabitleniyor. Ölçüm sırasında düzen henüz oturmamışsa (yazı tipi geç
  geliyor, kenar çubuğu geçişi sürüyor, kart animasyonu bitmemiş) grafik yanlış
  bir genişlikte kalıyor ve kartın dışına taşıyor. Pencere boyutu değişmediği
  için de kendiliğinden hiç düzelmiyor.

  `ResizeObserver` içerik alanını izliyor: genişlik her değiştiğinde bir `resize`
  olayı üretiliyor ve ApexCharts bütün grafikleri yeniden ölçüyor. Gecikme
  (120 ms) art arda gelen ölçümleri tek bir yeniden çizime indiriyor — geçiş
  sırasında her karede yeniden çizmek gözle görülür şekilde takılıyordu.
*/
function garanminGrafikGozlemci() {
  const hedef = document.querySelector('.content');
  if (!hedef) return;

  let zaman = null;
  function olc() {
    clearTimeout(zaman);
    zaman = setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 60);
  }

  /*
    ─── ÖLÇÜM 1: KAP GENİŞLİĞİ DEĞİŞTİĞİNDE ────────────────────────────────
    Kenar çubuğu katlandığında ya da pencere değiştiğinde.
  */
  if (typeof ResizeObserver !== 'undefined') {
    let sonGenislik = 0;
    new ResizeObserver(function (kayitlar) {
      const g = kayitlar[0].contentRect.width;
      if (Math.abs(g - sonGenislik) < 2) return;   // küçük dalgalanmaları (1px altı/üstü) yoksay
      sonGenislik = g;
      olc();
    }).observe(hedef);
  }

  /*
    ─── ÖLÇÜM 2: GRAFİK SAYFAYA GİRDİĞİ ANDA ───────────────────────────────

    ASIL DÜZELTME BURASI. Yukarıdaki gözlemci sayfa açılışında bir kez tetikleniyor
    ama o an henüz hiçbir grafik çizilmemiş oluyor — veri ağdan geliyor, grafikler
    yüzlerce milisaniye sonra doğuyor. Ondan sonra kabın genişliği bir daha
    değişmediği için gözlemci bir daha hiç çalışmıyordu.

    Sonuç: grafik kendi genişliğini ÇİZİM ANINDA bir kez ölçüp piksel olarak
    sabitliyor ve o ölçüm yanlışsa (yazı tipi henüz inmemiş, kart animasyonu
    sürüyor) öyle kalıyordu — kabından geniş çizilen grafik de kırpılıyordu.

    `MutationObserver` her yeni `.apexcharts-canvas` düğümünü yakalayıp yeniden
    ölçüm tetikliyor: artık ölçüm, düzen oturduktan SONRA da bir kez daha yapılıyor.
  */
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (kayitlar) {
      for (const k of kayitlar) {
        for (const d of k.addedNodes) {
          if (d.nodeType === 1 &&
              (d.classList.contains('apexcharts-canvas') || d.querySelector?.('.apexcharts-canvas'))) {
            olc();
            return;
          }
        }
      }
    }).observe(hedef, { childList: true, subtree: true });
  }

  /* Yazı tipleri geç indiğinde metin genişlikleri değişiyor ve eksen etiketleri
     kayıyor; yüklenme sözü verildiğinde son bir ölçüm daha. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(olc);
}
