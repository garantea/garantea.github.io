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
  /* Kullanici detayi MENUDE YOK: listeden bir satira tiklaninca MODAL olarak
     aciliyor. Ayri bir sayfa olsaydi geri donuldugunde arama kutusu bosalir,
     sayfa numarasi sifirlanir ve kullanici aradigi satiri yeniden bulmak
     zorunda kalirdi. */
  { ad: 'Kullanicilar', ikon: 'bx-group', alt: [
    { href: 'garanmin-users.html', ad: 'Liste' },
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
 * gövdesi belgeden SONRA çiziliyor, dolayısıyla üstünü örtüyor. (Uygulamada maske
 * bir dönem vardı ama react-native-svg'nin `Mask` desteği Android'de sessizce
 * çalışmadığı için kaldırılmıştı; tarayıcıda da gerek yok.)
 *
 * `gradyanEk` — aynı sayfada iki logo olduğunda degrade kimlikleri çakışmasın diye
 * son ek alıyor. SVG'de `id`ler belge genelinde benzersiz olmak zorunda; iki kopya
 * aynı kimliği kullansaydı ikincisi birincinin degradesini devralır ve renkler
 * beklenmedik şekilde değişirdi.
 */
function garanminLogo(gradyanEk) {
  const e = gradyanEk || 'a';
  return `
<svg class="g-logo" viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <linearGradient id="cup-${e}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#053582"/><stop offset="20%" stop-color="#0B57D0"/>
      <stop offset="80%" stop-color="#4285F4"/><stop offset="100%" stop-color="#8ab4f8"/>
    </linearGradient>
    <linearGradient id="ins-${e}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#03204e"/><stop offset="20%" stop-color="#053582"/>
      <stop offset="80%" stop-color="#0B57D0"/><stop offset="100%" stop-color="#1a73e8"/>
    </linearGradient>
    <linearGradient id="sau-${e}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1a73e8"/><stop offset="100%" stop-color="#0f4185"/>
    </linearGradient>
    <linearGradient id="doc-${e}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA4335"/><stop offset="100%" stop-color="#B31412"/>
    </linearGradient>
  </defs>

  <ellipse cx="100" cy="176" rx="65" ry="8" fill="#e2e8f0"/>
  <ellipse cx="100" cy="165" rx="80" ry="16" fill="url(#sau-${e})"/>
  <ellipse cx="100" cy="165" rx="50" ry="10" fill="#1558b0" opacity="0.6"/>
  <ellipse cx="100" cy="165" rx="49" ry="9" fill="none" stroke="#8ab4f8" stroke-width="1.5"/>
  <ellipse cx="100" cy="165" rx="40" ry="8" fill="#0f4185" opacity="0.5"/>

  <path d="M 155 105 C 190 105, 185 145, 140 148" fill="none" stroke="#1a73e8"
        stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>

  <ellipse cx="100" cy="95" rx="55" ry="13.5" fill="url(#ins-${e})"/>
  <ellipse cx="100" cy="95" rx="59" ry="15" fill="none" stroke="url(#cup-${e})" stroke-width="2.5"/>

  <g class="g-belge">
    <g transform="translate(75, 10)">
      <rect x="0" y="0" width="50" height="70" rx="6" fill="url(#doc-${e})"/>
      <rect x="0" y="0" width="50" height="2" rx="1" fill="#ffffff" opacity="0.4"/>
      <rect x="12" y="14" width="26" height="4" rx="2" fill="#ffffff"/>
      <rect x="12" y="24" width="16" height="4" rx="2" fill="#ffffff"/>
      <rect x="12" y="34" width="22" height="4" rx="2" fill="#ffffff"/>
      <rect x="12" y="44" width="12" height="4" rx="2" fill="#ffffff"/>
    </g>
  </g>

  <path d="M 41 95 A 59 15 0 0 0 159 95 C 159 150, 135 165, 100 165 C 65 165, 41 150, 41 95 Z"
        fill="url(#cup-${e})" stroke="url(#cup-${e})" stroke-width="2.5" stroke-linejoin="round"/>

  <rect class="b1" x="70"  y="65" width="6" height="14" rx="3" fill="#8ab4f8"/>
  <rect class="b2" x="84"  y="60" width="6" height="20" rx="3" fill="#669df6"/>
  <rect class="b3" x="97"  y="55" width="6" height="26" rx="3" fill="#4285f4"/>
  <rect class="b4" x="110" y="60" width="6" height="20" rx="3" fill="#669df6"/>
  <rect class="b5" x="124" y="65" width="6" height="14" rx="3" fill="#8ab4f8"/>
</svg>`;
}

/* Eski adıyla da kullanılabilsin (giriş sayfası bunu okuyor). */
const GARANMIN_LOGO = garanminLogo('menu');

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

/**
 * Menü durumunu uygular ve HATIRLAR — her sayfada yeniden açmak gerekmesin.
 *
 * ─── SONDAKİ `resize` NEDEN GEREKLİ ───────────────────────────────────────
 *
 * Menü katlanınca içerik alanı ~176 piksel genişliyor. ApexCharts kendi boyutunu
 * yalnızca PENCERE yeniden boyutlandığında hesaplıyor; pencere değişmediği için
 * grafikler eski genişlikte kalıyor ve kartın sağında boş bir şerit bırakıyordu
 * (açarken de tersi: grafik kartın dışına taşıyordu). Geçiş bittikten sonra
 * yapay bir `resize` olayı, grafiklerin kendi kendini yeniden ölçmesini sağlıyor.
 *
 * 240 ms, CSS'teki .2s geçişten biraz uzun: geçiş sırasında ölçüm alınırsa
 * grafik ARADAKİ genişliğe göre çizilir ve sorun aynen kalır.
 */
function garanminKatlaUygula(dar) {
  document.getElementById('g-app').classList.toggle('dar', !!dar);
  localStorage.setItem('garanmin_dar', dar ? '1' : '0');
  setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 240);
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
   MODAL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Modalı açar.
 *
 * ESC VE PERDEYE TIKLAMA İLE DE KAPANIYOR. Yalnızca çarpı düğmesi bırakılsaydı,
 * kapatmanın tek yolu ekranın sağ üst köşesindeki 30 piksellik bir hedefe nişan
 * almak olurdu; ikisi de kullanıcının refleksle denediği yollar.
 */
function garanminModalAc(baslikHtml, govdeHtml) {
  let p = document.getElementById('g-modal-perde');
  if (!p) {
    p = document.createElement('div');
    p.id = 'g-modal-perde';
    p.className = 'g-modal-perde';
    p.innerHTML = `
      <div class="g-modal" id="g-modal">
        <div class="g-modal-bas" id="g-modal-bas"></div>
        <div class="g-modal-govde" id="g-modal-govde"></div>
      </div>`;
    document.body.appendChild(p);

    // Perdeye tıklamak kapatıyor; modalın İÇİNE tıklamak kapatmıyor.
    p.addEventListener('click', function (e) { if (e.target === p) garanminModalKapat(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') garanminModalKapat();
    });
  }
  document.getElementById('g-modal-bas').innerHTML = baslikHtml
    + '<button class="g-modal-kapat" onclick="garanminModalKapat()" aria-label="Kapat">'
    + '<i class="bx bx-x"></i></button>';
  document.getElementById('g-modal-govde').innerHTML = govdeHtml;
  p.classList.add('acik');
}

function garanminModalKapat() {
  const p = document.getElementById('g-modal-perde');
  if (p) p.classList.remove('acik');
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

/** Garanti durumu → etiket + renk. Rozet sınıflarıyla AYNI renk ailesi. */
const GARANMIN_DURUM = {
  active:        { ad: 'Aktif',            renk: '#5D87FF', sinif: 'mavi' },
  expiring_soon: { ad: 'Yakinda bitiyor',  renk: '#FFAE1F', sinif: 'turuncu' },
  expired:       { ad: 'Suresi dolmus',    renk: '#FA896B', sinif: 'kirmizi' },
};
function gDurum(k) { return GARANMIN_DURUM[k] || { ad: k, renk: '#6b7280', sinif: '' }; }

/**
 * Grafik kabını çizimden ÖNCE boşaltır ve döndürür.
 *
 * Aralık düğmesiyle yeniden yüklenen sayfalarda (Zaman Akışı) kap daha önce
 * `gBos` tarafından "Gosterilecek veri yok" yazısıyla doldurulmuş olabiliyor.
 * ApexCharts kabı temizlemeden kendi öğesini EKLİYOR; sonuç, grafiğin üstünde
 * asılı kalmış eski bir "veri yok" satırı oluyordu.
 */
function gKap(id) {
  const d = document.getElementById(id);
  if (d) d.innerHTML = '';
  return d;
}

/**
 * ApexCharts için ortak ayarlar — grafikler birbirine benzesin diye tek yerde.
 *
 * PALET CSS'TEKİYLE AYNI. Grafik renkleri ayrı seçilseydi, aynı "yakında bitiyor"
 * kavramı rozette bir turuncu, halkada başka bir turuncu olurdu ve iki şeyden
 * bahsedildiği izlenimi doğardı.
 *
 * Eksen ve ızgara SOLUK: veri çizgisinden daha görünür bir ızgara, okunması
 * gereken şeyle yarışıyor.
 */
const G_RENK = ['#5D87FF', '#13DEB9', '#FFAE1F', '#FA896B', '#7C4DFF', '#49BEFF', '#7C8FAC'];

/*
  EKSEN/IZGARA BİÇİMİ `window.Apex` İLE VERİLİYOR — `gGrafikTemel` İÇİNDE DEĞİL.

  Sayfalar seçenekleri `Object.assign(temel, ayar)` ile birleştiriyor ve bu SIĞ
  bir birleştirme: bir sayfa kendi `xaxis: { categories: [...] }` nesnesini
  verdiğinde temeldeki `xaxis` tamamen SİLİNİYOR — etiket rengi, kaldırılmış
  eksen çizgisi, hepsi. Yani biçimi temele koymak, biçimi kullanan sayfalarda
  sessizce kaybetmek demekti.

  ApexCharts `window.Apex`'i her grafiğe DERİN birleştiriyor: sayfa yalnızca
  `categories`'i verse bile geri kalan biçim yerinde kalıyor. On sayfayı tek tek
  düzenlemeye de gerek kalmıyor.
*/
window.Apex = {
  chart: { fontFamily: 'inherit', toolbar: { show: false },
           animations: { easing: 'easeout', speed: 500 } },
  dataLabels: { enabled: false },
  stroke: { lineCap: 'round' },
  /* Izgara veri çizgisinden daha soluk: okunması gereken şeyle yarışmasın. */
  grid: { borderColor: '#EDF2F7', strokeDashArray: 4, padding: { left: 6, right: 6 } },
  xaxis: {
    axisBorder: { show: false }, axisTicks: { show: false },
    labels: { style: { colors: '#7C8FAC', fontSize: '11.5px' } },
  },
  yaxis: { labels: { style: { colors: '#7C8FAC', fontSize: '11.5px' } } },
  legend: {
    fontSize: '12.5px', fontWeight: 500, labels: { colors: '#5A6A85' },
    markers: { radius: 12, width: 10, height: 10 }, itemMargin: { horizontal: 7, vertical: 2 },
  },
  tooltip: { theme: 'light', style: { fontSize: '12.5px' } },
  plotOptions: { pie: { donut: { labels: { value: { color: '#2A3547' },
                                           total: { color: '#5A6A85' } } } } },
};

function gGrafikTemel(yukseklik) {
  return {
    chart: { height: yukseklik || '100%' },
    colors: G_RENK,
  };
}
