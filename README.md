# Minecraft AFK Bot Manager

Minecraft botlarinizi tek bir yerden yonetmek icin gelistirilmis coklu hesap yoneticisi.
Botlar Minecraft sunucusuna baglanir; siz Telegram, Discord veya konsoldan komut gonderirsiniz.

Bu proje su amacla tasarlandi:
- Coklu hesapla AFK kalmak
- Uzak mesafeden bot kontrol etmek
- Tehlike durumlarinda (oyuncu yakinligi/lobby) koruma aksiyonlari almak

## 0) 5 dakikada hizli baslangic

Hic bilmeyen biri icin en kisa kurulum akisi:

1. Node.js kur (18+ / onerilen 22 LTS) ve `node -v` ile kontrol et.
2. Projeyi indir: `git clone ...` ve klasore gir.
3. `npm install` calistir.
4. `config.example.json` dosyasini `config.json` yapip duzenle.
5. `npm start` calistir.
6. Telegram/Discord uzerinden `/account add` ile hesap ekle.

Hepsi bu kadar. Ayrintilar asagida.

## 1) Neler yapar?

- Slot bazli coklu hesap (1, 2, 3...)
- Telegram ve Discord uzaktan komut destegi
- Otomatik reconnect
- Anti-AFK hareketleri
- Otomatik yemek yeme
- Envanter ve arac dayaniklilik uyarilari
- Proximity alarmi
- AFK anchor kaydi (`/afkset <slot>`) + 20 blok uzaklasmada hizli lobby algilama
- Lobby algilama + geri donus denemesi (`/home sp` gibi, 2 dakikada bir)
- Spawner koruma protokolu
- Slot bazli `/protect` ac/kapat

`/protect <slot>` ile ilgili not:
- Bu komut ilgili slot icin korumayi acip/kapatir (toggle).
- `/protect <slot> on` veya `/protect <slot> off` ile net durum verilebilir.
- Koruma kapaliyken diger ozellikler (yon verme, AFK, /say, yemek yeme vb.) calismaya devam eder.

## 2) Gereksinimler

- Node.js 18+ (onerilen: Node.js 22 LTS)
- npm
- Microsoft Minecraft hesabi
- (Opsiyonel) Telegram bot token
- (Opsiyonel) Discord bot token

Sunucu/VDS icin pratik minimum:
- 2 vCPU
- 2-4 GB RAM (hesap sayisina gore artirabilirsiniz)
- Ubuntu 20.04+

Node kontrol komutlari:

```bash
node -v
npm -v
```

Node.js yoksa:
- Windows: https://nodejs.org adresinden LTS surumunu yukleyin.
- Ubuntu:

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3) Kurulum (Sifirdan)

### 3.1 Projeyi indir

```bash
git clone https://github.com/BenOnur/Minecraft-AFK-Bot-Manager.git
cd Minecraft-AFK-Bot-Manager
```

### 3.2 Bagimliliklari yukle

```bash
npm install
```

### 3.3 `config.json` olustur

Linux/macOS:
```bash
cp config.example.json config.json
```

Windows (PowerShell):
```powershell
Copy-Item config.example.json config.json
```

### 3.4 `config.json` duzenle

En azindan su alanlari doldurun:
- `minecraft.server.host`
- `minecraft.server.port`
- `minecraft.server.version`
- Telegram/Discord kullanacaksaniz token ve allowedUsers

Ornek:

```json
{
  "minecraft": {
    "server": {
      "host": "play.sunucuadresin.com",
      "port": 25565,
      "version": "1.21.11"
    },
    "accounts": []
  },
  "telegram": {
    "enabled": true,
    "token": "TELEGRAM_BOT_TOKEN",
    "allowedUsers": [123456789]
  },
  "discord": {
    "enabled": false,
    "token": "DISCORD_BOT_TOKEN",
    "allowedUsers": ["123456789012345678"],
    "guildId": "123456789012345678",
    "logChannelId": "123456789012345678"
  },
  "settings": {
    "autoReconnect": true,
    "reconnectDelay": 5000,
    "maxReconnectAttempts": 10,
    "antiAfkEnabled": true,
    "antiAfkInterval": 30000,
    "proximityAlertEnabled": true,
    "alertDistance": 96,
    "alertCooldown": 300000,
    "alertWhitelist": [],
    "lobbyReturnCommand": "/home sp",
    "protection": {
      "enabled": false,
      "emergencyDistance": 10,
      "blockType": "spawner",
      "radius": 64,
      "breakDelay": 300
    }
  }
}
```

Onemli guvenlik notu:
- `allowedUsers` bos olursa kod mantigi geregi herkes komut gonderebilir.
- Mutlaka kendi Telegram ID/Discord ID degerlerinizi girin.

## 4) Ilk calistirma

```bash
npm start
```

Uygulama baslayinca:
- Telegram/Discord botlari aktifse komut alir.
- `minecraft.accounts` doluysa yalnizca `autoStart: true` olan slotlar baglanmayi dener.
- Hesap yoksa `/account add` ile hesap ekleyebilirsiniz.

## 5) Microsoft hesap ekleme (`/account add`)

1. Telegram/Discord'dan `/account add` gonderin.
2. Gelen Microsoft linkini acin.
3. Verilen kodu girip hesaba giris yapin.
4. Islem tamamlaninca hesap yeni bir slot olarak kaydedilir.
5. Gerekirse `/account list` ile kontrol edin.

Oturum verileri `sessions/` klasorunde tutulur. Bu klasoru silerseniz tekrar giris gerekebilir.

## 6) Komutlar

### 6.1 Mesajlasma

- `/say <slot|1,2,3|1-3|all> <mesaj>`
- `/all <mesaj>`

### 6.2 Durum ve bilgi

- `/status`
- `/status <slot>` (kisayol: `/s <slot>`)
- `/stats`
- `/stats <slot>`
- `/inv <slot>`
- `/help`

### 6.3 Bot kontrolu

- `/start <slot>`
- `/stop <slot>` (alias: `/disconnect <slot>`)
- `/restart <slot|all>` (alias: `/reconnect <slot|all>`)
- `/pause <slot>`
- `/resume <slot>`

Not:
- `/stop <slot>` komutu o slotu kalici olarak `autoStart: false` yapar.
- `/start <slot>` veya `/restart <slot>` komutu tekrar `autoStart: true` yapar.

### 6.4 Hesap yonetimi

- `/account add`
- `/account remove <slot>`
- `/account list`

### 6.5 Hareket

- `/forward <slot|1,2|1-3|all> <blok>` (alias: `/f`)
- `/back <slot|1,2|1-3|all> <blok>` (alias: `/b`, `/backward`)
- `/left <slot|1,2|1-3|all> <blok>` (alias: `/l`)
- `/right <slot|1,2|1-3|all> <blok>` (alias: `/r`)

### 6.6 Esya

- `/drop <slot> all`
- `/drop <slot> <esya> [adet]`
- `/take <slot> <esya> <adet>` (su an kodda tam uygulanmamis)

### 6.7 Guvenlik

- `/whitelist add <oyuncu>`
- `/whitelist remove <oyuncu>`
- `/whitelist list`
- `/protect <slot>` (toggle)
- `/protect <slot> on`
- `/protect <slot> off`
- `/afkset <slot>`

Koruma acik oldugunda:
- Proximity kontrolu aktif olur
- Lobby algilama ve geri donus denemesi aktif olur
- Tehditte spawner koruma protokolu devreye girebilir
- Stacked spawner sunucularinda ayni koordinattaki spawner stack'i 64'luk chunk'lar halinde bitene kadar kirilmaya devam eder
- Spawnerlar tamamen temizlenirse bot rastgele `/spawn 1-5` gider ve 10 saniye sonra kapanir

`/afkset <slot>` notu:
- Slotun o anki AFK noktasi `minecraft.accounts[].afkProfile.anchor` alanina kaydedilir.
- `settings.protection.radius` icindeki spawner koordinatlari `afkProfile.spawners` listesine yazilir.
- Stacked kirma chunk boyutu `settings.protection.stackBatchSize` (varsayilan `64`) ile ayarlanabilir.
- Koruma tamamlandi karari `settings.protection.protectionClearConfirmMs` (varsayilan `180000`) sureli bos tarama onayi ile verilir.
- AFK kayitli hedeflerde gorunur spawner bir an kaybolursa bot hemen geri donmez; `settings.protection.stackedDepletionConfirmMs` (varsayilan `30000`) suresi boyunca ayni noktayi tekrar tarar.
- Son kirmadan hemen sonra target gorunmezse erken retreat engeli icin `settings.protection.stackedExhaustionIdleMs` (varsayilan `300000`) boyunca tekrar deneme yapar.
- Tek bir hedef anlik kayboldugunda o hedefte kisa sureli bekleme penceresi `settings.protection.stackedTargetMissingConfirmMs` (varsayilan `8000`) ile yonetilir.
- Envantere gain dusmeyen art arda denemelerde anti-ghost backoff uygulanir: `stackedNoGainBackoffAfter` ve `stackedNoGainRetryDelay`.
- Surekli kirma hissi icin varsayilanlar hizlandirildi: `inventoryConfirmPollInterval=100`, `stackedFastGraceMs=900`, `stackedNoGainRetryDelay=350`, `stackedNoGainBackoffAfter=8`.
- Kirma denemeleri arasinda insan-benzeri rastgele gecikme vardir; `settings.protection.randomBreakIntervalMaxMs` en fazla `800ms` olacak sekilde uygulanir.
- Koruma sirasinda her basarili spawner kiriminda Telegram/Discord bildirim gider; tum hedefler temizlenince `/spawn 1-5` oncesi tamamlandi bildirimi gonderilir.
- Slot AFK anchor'dan 20+ blok uzaklasirsa lobby kabul edilir.
- Lobby modundayken bot `/home sp` komutunu hemen, sonrasinda 2 dakikada bir yollar.

## 7) Telegram kurulum notlari

1. Telegram'da `@BotFather` acin.
2. `/newbot` ile bot olusturun.
3. Token degerini alin, `config.json -> telegram.token` alanina girin.
4. Kendi Telegram user ID'nizi ogrenin (`@userinfobot` gibi botlarla).
5. Bu ID'yi `telegram.allowedUsers` listesine ekleyin.

Telegram ozel komutu:
- `/logs` -> log akisina baslat/durdur

## 8) Discord kurulum notlari

1. https://discord.com/developers/applications adresinden app olusturun.
2. Bot token alin, `config.json -> discord.token` alanina girin.
3. Bot intent olarak "Message Content Intent" acik olsun.
4. Botu sunucuya davet edin.
5. Discord user ID ve (opsiyonel) guild ID degerlerini girin.

Discord'da komutlar:
- `!status`, `!start 1`, `!protect 1 on` gibi `!` veya `/` ile kullanabilirsiniz.
- `!logs` ile log akisina baslat/durdur.

## 9) Ubuntu VDS + PM2 ile calistirma

### 9.1 PM2 kur

```bash
sudo npm install -g pm2
```

### 9.2 Uygulamayi PM2 ile baslat

```bash
pm2 start index.js --name afk-bot
pm2 logs afk-bot
```

### 9.3 Sunucu yeniden acilinca otomatik baslat

```bash
pm2 startup
pm2 save
```

## 10) Mevcut kurulumu guncelleme (senin senaryon)

Kod zaten VDS'te calisiyorsa:

```bash
cd ~/Minecraft-AFK-Bot-Manager
git pull origin main
npm install
pm2 restart afk-bot --update-env
pm2 save
```

Canli log:
```bash
pm2 logs afk-bot
```

## 11) Sorun giderme

### Bot baglanmiyor
- `host`, `port`, `version` degerlerini kontrol edin.
- Sunucuya VDS'ten erisim var mi test edin:

```bash
ping <host>
nc -zv <host> <port>
```

### "Unauthorized" hatasi
- Telegram/Discord ID'niz `allowedUsers` listesinde mi kontrol edin.
- `guildId` kullaniyorsaniz dogru sunucudan komut gonderdiginizden emin olun.

### Surekli Microsoft girisi istiyor
- `sessions/` klasorunun silinmedigini kontrol edin.
- Hesabi kaldirip tekrar eklemek gerekebilir: `/account remove <slot>` sonra `/account add`.

### PM2 calisiyor ama bot cevap vermiyor
- `pm2 logs afk-bot` ile hata kontrol edin.
- Gerekirse:

```bash
pm2 restart afk-bot --update-env
```

## 12) Guvenlik

- `config.json` dosyasini herkese acik bir yerde paylasmayin.
- Token ve kullanici ID bilgilerini gizli tutun.
- `sessions/` klasoru hesap erisimi acisindan hassastir, yedek alirken dikkat edin.

## 13) Lisans

MIT
