# Garanmin UI/UX Design Rules

Bu kurallar, en popüler açık kaynaklı Admin Panel repolarından (Sneat, Tabler, Shadcn, Adminator) esinlenilerek Garanmin projesi için oluşturulmuş kalıcı yetenek ve tasarım standartlarıdır.

## 1. Temiz ve Minimalist Yapı (Shadcn & Tabler Yaklaşımı)
- Gereksiz çizgi ve sınırlardan (border) kaçının. İçeriği ayırmak için ince gölgeler (soft box-shadows) ve beyaz boşluklar (whitespace/padding) kullanın.
- Kart (Card) tasarımlarında köşe yuvarlaklığı (border-radius) modern standartlarda (genellikle 8px - 12px arası) tutulmalıdır.

## 2. Renk Hiyerarşisi ve Kontrast (Sneat Yaklaşımı)
- Siyah veya tam koyu gri yerine yumuşatılmış metin renkleri kullanın (Örn: Başlıklar için `#334155`, alt metinler için `#64748b`).
- Primary (Ana) aksiyon renkleri belirgin olmalı, ancak göz yormamalıdır (Örn: GaranTea mavisi veya hafif pastel tonlu kırmızılar).
- "Hover" ve "Active" durumlarında (butonlar, menü öğeleri) mutlaka pürüzsüz geçişler (`transition: all 0.2s ease-in-out`) kullanılmalıdır.

## 3. Kod Kalitesi (Adminator Yaklaşımı)
- jQuery veya ağır kütüphanelere bağımlı kalmadan **Vanilla JS** (Saf JavaScript) kullanılmalıdır.
- Performansı artırmak için karmaşık DOM manipülasyonlarından kaçınılmalı, modüler HTML yapısı korunmalıdır.
- CSS/HTML yazarken gereksiz "div çorbası" (div soup) oluşturmaktan kaçınılmalı, semantik HTML etiketleri tercih edilmelidir.

## 4. Cam Efekti ve Derinlik (Modern UI)
- Sabit başlıklar (header) veya modal pencereleri gibi katmanlı alanlarda yarı saydam arka planlar ve arka plan bulanıklığı (`backdrop-filter: blur(8px)`) kullanarak derinlik hissi yaratın.

*Not: Antigravity AI, Garanmin projesi üzerinde çalışırken her zaman bu standartları otomatik olarak göz önünde bulunduracaktır.*
