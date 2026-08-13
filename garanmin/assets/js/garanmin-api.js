/**
 * GARANMIN — ortak istemci katmanı.
 *
 * Bütün sayfalar Supabase'e buradan konuşuyor, iskeleti (kenar menü + üst çubuk)
 * buradan alıyor ve oturumu buradan kontrol ediyor.
 *
 * ─── NEDEN TEK DOSYA ──────────────────────────────────────────────────────
 *
 * Panel statik HTML sayfalarından oluşuyor. Menü her sayfaya kopyalansaydı yeni bir
 * sayfa eklemek on dosyayı birden düzenlemek olurdu ve biri unutulduğunda kullanıcı
 * menüde görünmeyen bir sayfada kalırdı. Menü tek yerde üretiliyor; sayfalar yalnızca
 * kendi içeriğini yazıyor.
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
    her `garanmin_*` fonksiyonu ilk satırında jetonu doğruluyor (`garanmin_guard`).
    Anahtarla tek başına hiçbir veri okunamıyor.
  */
  anonKey: 'sb_publishable_OQXQZLhb_4coBQvG6AM2TQ_qtyl59LY',

  /*
    JETON `sessionStorage`'DA — `localStorage`'da DEĞİL.

    `localStorage` sekme kapanınca da kalıyor; ortak kullanılan bir bilgisayarda bu,
    tarayıcıyı kapatıp giden yöneticinin oturumunu bir sonrakine devretmek demek.
    `sessionStorage` sekmeyle birlikte siliniyor. Sunucuda da 8 saatlik ömür var,
    yani iki taraf birden sınırlıyor.
  */
  tokenKey: 'garanmin_token',
  userKey:  'garanmin_user',
  expKey:   'garanmin_exp',
};

/* ══════════════════════════════════════════════════════════════════════════
   OTURUM
   ══════════════════════════════════════════════════════════════════════════ */

function garanminToken() { return sessionStorage.getItem(GARANMIN.tokenKey); }
function garanminUser()  { return sessionStorage.getItem(GARANMIN.userKey) || 'yonetici'; }
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
/* Eski adıyla da çağrılabilsin diye korunuyor. */
function garanminSetToken(t) { sessionStorage.setItem(GARANMIN.tokenKey, t); }

function garanminClearToken() {
  sessionStorage.removeItem(GARANMIN.tokenKey);
  sessionStorage.removeItem(GARANMIN.userKey);
  sessionStorage.removeItem(GARANMIN.expKey);
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
   MENÜ TANIMI
   ══════════════════════════════════════════════════════════════════════════

   GRUPLU VE İKİ SEVİYELİ. Düz bir liste, sayfa sayısı altıyı geçtiğinde
   "hangisi neredeydi" sorusunu doğuruyor; gruplama, aranan şeyin hangi başlık
   altında olacağını tahmin edilebilir kılıyor.
   ══════════════════════════════════════════════════════════════════════════ */

const GARANMIN_MENU = [
  { ad: 'Genel', ikon: 'bx-grid-alt', alt: [
    { href: 'garanmin-dashboard.html', ad: 'Ozet' },
    { href: 'garanmin-sistem.html',    ad: 'Sistem Durumu' },
  ]},
  { ad: 'Veri Tabani', ikon: 'bx-data', alt: [
    { href: 'garanmin-db.html',   ad: 'Tablolar' },
    { href: 'garanmin-akis.html', ad: 'Zaman Akisi' },
  ]},
  { ad: 'Kullanicilar', ikon: 'bx-group', alt: [
    { href: 'garanmin-users.html', ad: 'Liste' },
    { href: 'garanmin-user.html',  ad: 'Kullanici Detayi' },
  ]},
  { ad: 'Cihazlar', ikon: 'bx-devices', alt: [
    { href: 'garanmin-devices.html',     ad: 'Kirilimlar' },
    { href: 'garanmin-devices-son.html', ad: 'Son Eklenenler' },
  ]},
  { ad: 'Gelir Gider', ikon: 'bx-wallet', alt: [
    { href: 'garanmin-ekonomi.html', ad: 'Kredi Ekonomisi' },
  ]},
  { ad: 'Destek', ikon: 'bx-support', alt: [
    { href: 'garanmin-support.html', ad: 'Talepler' },
  ]},
];

/* GaranTea logosu — fincan ve yükselen buhar. Animasyon CSS'te (`.g-logo`). */
const GARANMIN_LOGO = `
<svg class="g-logo" viewBox="0 0 64 64" aria-hidden="true">
  <g class="buhar b1"><rect x="24" y="8"  width="3" height="10" rx="1.5" fill="#93c5fd"/></g>
  <g class="buhar b2"><rect x="31" y="5"  width="3" height="13" rx="1.5" fill="#60a5fa"/></g>
  <g class="buhar b3"><rect x="38" y="9"  width="3" height="9"  rx="1.5" fill="#93c5fd"/></g>
  <ellipse cx="32" cy="52" rx="21" ry="5" fill="#1e40af" opacity=".35"/>
  <path d="M14 26h33v12a16 16 0 0 1-16 16h-1a16 16 0 0 1-16-16z" fill="#2563eb"/>
  <path d="M14 26h33v5H14z" fill="#1d4ed8"/>
  <path d="M47 30h4a7 7 0 0 1 0 14h-4" fill="none" stroke="#2563eb" stroke-width="4"/>
  <rect x="27" y="18" width="10" height="14" rx="2" fill="#dc2626"/>
  <rect x="29" y="21" width="6" height="1.6" rx=".8" fill="#fecaca"/>
  <rect x="29" y="24" width="6" height="1.6" rx=".8" fill="#fecaca"/>
  <rect x="29" y="27" width="4" height="1.6" rx=".8" fill="#fecaca"/>
</svg>`;

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
 */
function garanminShell(aktif, baslik) {
  const menuHtml = GARANMIN_MENU.map((g, i) => {
    const grupAktif = g.alt.some(a => a.href === aktif);
    return `
      <div class="g-grup ${grupAktif ? 'acik aktif-grup' : ''}" data-grup="${i}">
        <div class="g-grup-bas" onclick="garanminGrupAc(${i})" title="${g.ad}">
          <i class="bx ${g.ikon}"></i>
          <span class="g-metin-gizle">${g.ad}</span>
          <i class="bx bx-chevron-right ok g-metin-gizle"></i>
        </div>
        <div class="g-alt">
          ${g.alt.map(a => `<a href="${a.href}" class="${a.href === aktif ? 'aktif' : ''}">${a.ad}</a>`).join('')}
        </div>
      </div>`;
  }).join('');

  document.getElementById('garanmin-menu').innerHTML = `
    <div class="g-marka">
      ${GARANMIN_LOGO}
      <span class="g-marka-yazi"><span class="a">Garan</span><span class="b">min</span></span>
    </div>
    <nav class="g-menu">${menuHtml}</nav>`;

  const bas = garanminUser().slice(0, 2).toUpperCase();
  document.getElementById('garanmin-navbar').innerHTML = `
    <button class="g-katla" onclick="garanminKatla()" title="Menuyu ac/kapat" aria-label="Menuyu ac/kapat">
      <i class="bx bx-menu"></i>
    </button>
    <h1 class="g-baslik">${gEsc(baslik || '')}</h1>
    <div class="g-sag">
      <span class="g-canli" id="g-canli" title="Veritabani baglantisi">
        <span class="g-nokta"></span><span id="g-canli-yazi">baglaniyor</span>
      </span>
      <div class="g-saat"><div class="s" id="g-saat">--:--:--</div><div class="t" id="g-tarih">-</div></div>
      <div class="g-kullanici" title="Oturum: ${gEsc(garanminUser())}">
        <span class="g-avatar">${gEsc(bas)}</span>
        <span><span class="ad">${gEsc(garanminUser())}</span><br><span class="rol" id="g-oturum">yonetici</span></span>
      </div>
      <button class="btn btn-sm btn-outline-secondary" onclick="garanminLogout()" title="Cikis">
        <i class="bx bx-log-out"></i>
      </button>
    </div>`;

  garanminKatlaUygula(localStorage.getItem('garanmin_dar') === '1');
  garanminSaatBaslat();
  garanminNabizBaslat();
}

/**
 * Bir grubu açıp diğerlerini kapatır (akordiyon).
 *
 * HEPSİ AYNI ANDA AÇIK OLABİLİRDİ ama o zaman menü, kenar çubuğundan uzun olur ve
 * içeride ayrıca kaydırma gerekirdi — "her şey tek ekranda" kuralının menüde
 * bozulması demek.
 */
function garanminGrupAc(i) {
  // Simge durumundayken tıklamak menüyü açıyor: kapalı bir menüde alt başlıkları
  // göstermenin yeri yok, o yüzden önce genişliyor.
  if (document.getElementById('g-app').classList.contains('dar')) {
    garanminKatlaUygula(false);
  }
  const hedef = document.querySelector('.g-grup[data-grup="' + i + '"]');
  const zatenAcik = hedef && hedef.classList.contains('acik');
  document.querySelectorAll('.g-grup').forEach(el => el.classList.remove('acik'));
  // Açık olana tekrar tıklamak kapatıyor; başkasına tıklamak öbürünü kapatıp bunu açıyor.
  if (hedef && !zatenAcik) hedef.classList.add('acik');
}

function garanminKatla() {
  const dar = !document.getElementById('g-app').classList.contains('dar');
  garanminKatlaUygula(dar);
}

/** Menü durumunu uygular ve HATIRLAR — her sayfada yeniden açmak gerekmesin. */
function garanminKatlaUygula(dar) {
  document.getElementById('g-app').classList.toggle('dar', !!dar);
  localStorage.setItem('garanmin_dar', dar ? '1' : '0');
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
    // Oturumun kalan süresi de burada: 8 saatlik ömür sessizce dolup kullanıcıyı
    // beklenmedik bir anda girişe atmasın.
    const exp = garanminExp();
    const o = document.getElementById('g-oturum');
    if (exp && o) {
      const kalan = Math.max(0, Math.round((new Date(exp) - d) / 60000));
      o.textContent = kalan > 60
        ? 'oturum ' + Math.floor(kalan / 60) + ' sa ' + (kalan % 60) + ' dk'
        : 'oturum ' + kalan + ' dk';
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
  el.classList.toggle('ok', !!ok);
  el.classList.toggle('hata', !ok);
  yazi.textContent = ok ? (not || 'canli') : 'baglanti yok';
  if (not) el.title = not;
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
  if (!el) { console.error(mesaj); return; }
  el.innerHTML = `<div class="alert alert-danger py-2 mb-0">
    <i class="bx bx-error-circle me-1"></i> ${gEsc(mesaj)}</div>`;
}

/** Veri yokken kartın içine yazılan not. Boş bir grafik yerine açık bir cümle. */
function gBos(el, veri) {
  if (veri && veri.length) return false;
  const d = document.getElementById(el);
  if (d) d.innerHTML = '<div class="g-bos">Gosterilecek veri yok</div>';
  return true;
}

/** Kategori kodlarını okunur Türkçeye çevirir (uygulamadaki `DeviceCategory` ile aynı). */
const GARANMIN_KATEGORI = {
  tv: 'Televizyon', audio: 'Ses', computer: 'Bilgisayar', phone: 'Telefon',
  appliance: 'Beyaz Esya', kitchen: 'Mutfak', small_appliance: 'Kucuk Ev Aleti',
  car: 'Arac', personal: 'Kisisel', other: 'Diger',
};
function gKategori(k) { return GARANMIN_KATEGORI[k] || k || 'Diger'; }

/** Garanti durumu → etiket + renk. Uygulamadaki rozetlerle aynı anlam. */
const GARANMIN_DURUM = {
  active:        { ad: 'Aktif',            renk: '#2563eb', sinif: 'mavi' },
  expiring_soon: { ad: 'Yakinda bitiyor',  renk: '#f59e0b', sinif: 'turuncu' },
  expired:       { ad: 'Suresi dolmus',    renk: '#dc2626', sinif: 'kirmizi' },
};
function gDurum(k) { return GARANMIN_DURUM[k] || { ad: k, renk: '#6b7280', sinif: '' }; }

/** ApexCharts için ortak ayarlar — grafikler birbirine benzesin diye tek yerde. */
const G_RENK = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#64748b'];
function gGrafikTemel(yukseklik) {
  return {
    chart: { height: yukseklik || '100%', toolbar: { show: false }, fontFamily: 'inherit',
             animations: { easing: 'easeout', speed: 500 } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#eef0f6', strokeDashArray: 4 },
    tooltip: { theme: 'light' },
  };
}
