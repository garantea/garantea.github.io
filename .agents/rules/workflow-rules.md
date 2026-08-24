# Garanmin İş Akışı Kuralları (Workflow Rules)

## 1. Otomatik Git Push (Sürekli Dağıtım)
- Garanmin reposunda (`garantea.github.io`) yapılan her başarılı kod değişikliğinin ardından (HTML/CSS/JS güncellemeleri, UI iyileştirmeleri vs.), kullanıcının açıkça söylemesine **gerek kalmadan** arka planda otomatik olarak `git add .`, `git commit` ve `git push` komutları çalıştırılacaktır.
- Kullanıcı "artık pushlama", "bekle" veya benzeri bir komut verene kadar bu kural her zaman geçerlidir.
- Değişiklikleri pushladıktan sonra kullanıcıya kısaca GitHub'a yüklendiği ve yayına alındığı bilgisi verilecektir.
