# Minecraft AFK Bot Manager

VDS üzerinde çalışan, Telegram ve Discord üzerinden kontrol edilebilen çoklu Minecraft hesap yönetim sistemi.

## 🎮 Özellikler

- ✅ Çoklu Minecraft hesap desteği (slot bazlı)
- ✅ Telegram bot kontrolü
- ✅ Discord bot kontrolü
- ✅ Otomatik yeniden bağlanma
- ✅ Anti-AFK sistemi
- ✅ Envanter yönetimi
- ✅ Detaylı durum takibi
- ✅ Düşük kaynak kullanımı (VDS optimizasyonu)

## 📋 Gereksinimler

### Yerel Test için
- Node.js 18+ (LTS versiyonu)
- Minecraft hesapları (Microsoft)
- Telegram Bot Token (opsiyonel)
- Discord Bot Token (opsiyonel)

### VDS/Sunucu için
- Ubuntu 20.04+ (veya benzeri Linux)
- 2-3GB RAM (10 hesap için)
- 2 vCore CPU
- 10-20GB Disk

## 🚀 Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Konfigürasyon Dosyasını Oluştur

```bash
cp config.example.json config.json
```

### 3. `config.json` Dosyasını Düzenle

```json
{
  "minecraft": {
    "server": {
      "host": "play.yourserver.com",
      "port": 25565,
      "version": "1.20.1"
    },
    "accounts": [
      {
        "slot": 1,
        "username": "email@example.com",
        "auth": "microsoft"
      }
    ]
  },
  "telegram": {
    "enabled": true,
    "token": "YOUR_TOKEN",
    "allowedUsers": [123456789]
  },
  "discord": {
    "enabled": true,
    "token": "YOUR_TOKEN",
    "allowedUsers": ["YOUR_USER_ID"],
    "guildId": "YOUR_GUILD_ID"
  }
}
```

### 4. Telegram Bot Oluşturma

1. [@BotFather](https://t.me/BotFather) ile konuş
2. `/newbot` komutunu kullan
3. Bot adı ve kullanıcı adı belirle
4. Token'ı `config.json` içine yapıştır
5. Kendi Telegram ID'ni bul: [@userinfobot](https://t.me/userinfobot)
6. ID'ni `allowedUsers` listesine ekle

### 5. Discord Bot Oluşturma

1. [Discord Developer Portal](https://discord.com/developers/applications)'a git
2. "New Application" tıkla
3. "Bot" sekmesinden bot oluştur
4. "MESSAGE CONTENT INTENT" etkinleştir
5. Token'ı `config.json` içine yapıştır
6. OAuth2 > URL Generator: `bot` + `Send Messages`, `Read Messages` seç
7. URL ile botu sunucuna davet et
8. Kendi Discord User ID'ni al (Developer Mode açık olmalı, sağ tık > Copy ID)

### 6. Çalıştır

```bash
npm start
```

## 📱 Komutlar

### Mesajlaşma
- `/say 1 <mesaj>` - Slot 1'e mesaj gönder
- `/say [1] <mesaj>` - Alternatif format
- `/1 <mesaj>` - Kısa format
- `/say 1,3,5 <mesaj>` - Çoklu slot'a gönder
- `/say 1-3 <mesaj>` - Slot aralığına gönder
- `/all <mesaj>` - Tüm botlara gönder

### Durum
- `/status` - Tüm botların durumu
- `/status 1` - Slot 1'in durumu
- `/s` - `/status` kısayolu

### Bot Kontrolü
- `/restart 1` (veya `/reconnect 1`) - Slot 1'i yeniden başlat
- `/restart all` - Hepsini yeniden başlat
- `/stop 1` (veya `/disconnect 1`) - Slot 1'i durdur
- `/start 1` - Slot 1'i başlat
- `/pause 1` - Slot 1'i duraklat
- `/resume 1` - Slot 1'i devam ettir

### Envanter
- `/inv 1` - Slot 1'in envanterini göster
- `/drop 1 all` - Tüm envanteri at
- `/drop 1 <item> <miktar>` - Belirli item'ı at

### Yardım
- `/help` - Tüm komutları göster

## 🖥️ VDS'e Kurulum (Ubuntu)

### 1. Sunucuya Bağlan

```bash
ssh root@your-vds-ip
```

### 2. Node.js Kur

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. PM2 Kur

```bash
sudo npm install -g pm2
```

### 4. Projeyi Yükle

```bash
mkdir -p /home/minecraft-bot
cd /home/minecraft-bot

# Dosyaları SFTP ile yükle veya git clone kullan
```

### 5. Bağımlılıkları Yükle

```bash
npm install --production
```

### 6. Config Ayarla

```bash
nano config.json
# Gerekli ayarları yap
```

### 7. PM2 ile Başlat

```bash
pm2 start index.js --name minecraft-bot --max-memory-restart 2G
pm2 save
pm2 startup
```

### 8. Logları İzle

```bash
pm2 logs minecraft-bot
```

## 🔧 PM2 Komutları

```bash
pm2 status              # Durum
pm2 logs minecraft-bot  # Loglar
pm2 restart minecraft-bot  # Yeniden başlat
pm2 stop minecraft-bot  # Durdur
pm2 start minecraft-bot # Başlat
pm2 monit              # Monitoring
```

## 📊 Kaynak Kullanımı

| Bot Sayısı | RAM Kullanımı | CPU | Tavsiye VDS |
|------------|---------------|-----|-------------|
| 1-3        | 512MB-1GB     | 1 vCore | Vultr $2.50/ay |
| 4-6        | 1-2GB         | 1-2 vCore | Contabo €4.99/ay |
| 7-10       | 2-3GB         | 2 vCore | Contabo €4.99/ay |
| 10+        | 3-4GB         | 2 vCore | Contabo €4.99/ay |

## 🔐 Güvenlik

- `config.json` dosyasını **asla** Git'e eklemeyin
- Telegram/Discord bot token'larınızı paylaşmayın
- `allowedUsers` listesini mutlaka doldurun
- Firewall ayarlarınızı yapın (sadece SSH portu açık)

## 🐛 Sorun Giderme

### Bot bağlanamıyor

```bash
# Minecraft sunucu erişilebilir mi?
ping play.yourserver.com

# Port açık mı?
nc -zv play.yourserver.com 25565
```

### Telegram/Discord bot çalışmıyor

- Token'ları kontrol edin
- Bot'un gerekli izinlere sahip olduğundan emin olun
- `allowedUsers` listesini kontrol edin

### Yüksek bellek kullanımı

```bash
# PM2 memory limit'i azalt
pm2 delete minecraft-bot
pm2 start index.js --name minecraft-bot --max-memory-restart 1500M
```

## 📝 Lisans

MIT License

## 🤝 Katkıda Bulunma

Pull request'ler memnuniyetle karşılanır!

## ⚠️ Uyarı

Bu bot eğitim amaçlıdır. Minecraft sunucu kurallarına uymayan kullanımlardan sorumluluk kabul edilmez.
