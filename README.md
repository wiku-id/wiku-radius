<h1 align="center">🛡️ Wiku Radius</h1>

**Open Source RADIUS Server dengan Dashboard Modern**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

Wiku Radius adalah server RADIUS ringan yang dirancang untuk berjalan di Mini PC, Raspberry Pi, atau server kecil. Cocok untuk ISP kecil, RT/RW Net, Kafe, Hotel, dan Kampus.

<p align="center">
  <img src="https://wiku.my.id/img/logo/favicon-192x192.png" alt="Wiku Radius" width="150">
</p>

## ✨ Fitur

- 🔐 **Authentication Server** (Port 1812)
  - PAP, CHAP, MS-CHAP, MS-CHAPv2
  - MikroTik Vendor Specific Attributes
- 📊 **Accounting Server** (Port 1813)
  - Session tracking
  - Bandwidth usage monitoring
- 🖥️ **Dashboard Web Modern**
  - Dark / Light Mode 🌓
  - User management
  - NAS/Router management
  - Real-time session monitoring
  - Bandwidth statistics
- 💾 **Database SQLite**
  - Zero configuration
  - Single file backup
  - Ringan untuk Mini PC

---

## 🚀 Instalasi & Cara Menjalankan

### Persyaratan Sistem

| Komponen | Minimum               |
| -------- | --------------------- |
| Node.js  | >= 18.0.0             |
| RAM      | 512 MB                |
| Storage  | 100 MB                |
| OS       | Linux, macOS, Windows |

### Langkah 1: Download/Clone Repository

```bash
# Clone dari GitHub
git clone https://github.com/wiku-id/wiku-radius.git
cd wiku-radius

# ATAU download dan extract ZIP
```

### Langkah 2: Install Dependencies

```bash
npm install
```

### Langkah 3: Konfigurasi Environment

```bash
# Copy file contoh konfigurasi
cp .env.example .env

# Edit konfigurasi sesuai kebutuhan (opsional)
nano .env
```

**Konfigurasi default:**

```env
# Port RADIUS
RADIUS_AUTH_PORT=1812
RADIUS_ACCT_PORT=1813
DASHBOARD_PORT=3000

# RADIUS Secret (ganti untuk production!)
DEFAULT_SECRET=wiku-radius-secret

# Database
DATABASE_PATH=./data/wiku-radius.db

# Dashboard Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# JWT Secret (ganti untuk production!)
JWT_SECRET=change-this-to-random-secret-key
```

### Langkah 4: Jalankan Server

```bash
# Mode Production
npm start

# Mode Development (auto-restart saat file berubah)
npm run dev
```

### Langkah 5: Akses Dashboard

Buka browser dan akses:

```
http://localhost:3000
```

**Login Default:**

- **Username:** `admin`
- **Password:** `admin123`

> ⚠️ **PENTING:** Segera ganti password admin setelah login pertama!

---

## 🔧 Konfigurasi MikroTik

### 1. Tambah RADIUS Server

```
/radius
add address=IP_SERVER_WIKU_RADIUS secret=wiku-radius-secret service=hotspot,ppp
```

Ganti `IP_SERVER_WIKU_RADIUS` dengan IP server tempat Wiku Radius berjalan.

### 2. Aktifkan RADIUS di Hotspot Profile

```
/ip hotspot profile
set [find name=default] use-radius=yes radius-accounting=yes
```

### 3. (Opsional) Set Interim Update

```
/ip hotspot profile
set [find name=default] radius-interim-update=5m
```

### Contoh Konfigurasi Lengkap via Winbox:

1. Buka **RADIUS** di menu sidebar
2. Klik **+** untuk menambah RADIUS server baru
3. Isi:
   - **Address:** IP Server Wiku Radius
   - **Secret:** `wiku-radius-secret` (sesuaikan dengan .env)
   - **Service:** centang `hotspot` dan `ppp`
4. Klik **OK**
5. Buka **IP > Hotspot > Server Profiles**
6. Double click profile yang digunakan
7. Di tab **RADIUS**, centang **Use RADIUS** dan **Accounting**

---

## 📱 Menambahkan User dan NAS

### Via Dashboard

1. Login ke dashboard `http://localhost:3000`
2. Pilih menu **Users** > klik **Add User**
3. Isi username, password, dan profile
4. Pilih menu **NAS Clients** > klik **Add NAS**
5. Isi nama router, IP Address, dan RADIUS secret

### Default Profile

Profile bandwidth bisa ditambahkan di menu **Profiles** dengan format MikroTik:

| Profile Name | Rate Limit |
| ------------ | ---------- |
| 1Mbps        | 1M/1M      |
| 5Mbps        | 5M/5M      |
| 10Mbps       | 10M/10M    |
| Unlimited    | (kosong)   |

---

## 🐳 Docker (Opsional)

### Build Image

```bash
docker build -t wiku-radius .
```

### Jalankan Container

```bash
docker run -d \
  --name wiku-radius \
  -p 1812:1812/udp \
  -p 1813:1813/udp \
  -p 3000:3000 \
  -v wiku-data:/app/data \
  -v wiku-logs:/app/logs \
  wiku-radius
```

### Docker Compose

```yaml
version: "3.8"
services:
  wiku-radius:
    build: .
    container_name: wiku-radius
    ports:
      - "1812:1812/udp"
      - "1813:1813/udp"
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - ADMIN_PASSWORD=secure_password_here
      - JWT_SECRET=random_secret_here
    restart: unless-stopped
```

```bash
docker-compose up -d
```

---

## 🏗️ Struktur Project

```
wiku-radius/
├── src/
│   ├── core/           # RADIUS server core
│   │   ├── RadiusServer.js
│   │   └── Dashboard.js
│   ├── handlers/       # Request handlers
│   │   ├── auth.js     # Authentication handler
│   │   └── acct.js     # Accounting handler
│   ├── plugins/        # Database backends
│   │   └── sqlite.js
│   ├── utils/          # Utilities
│   │   ├── crypto.js   # MS-CHAP crypto
│   │   └── logger.js
│   ├── dictionary/     # RADIUS dictionaries
│   │   ├── dictionary
│   │   └── dictionary.mikrotik
│   └── index.js        # Entry point
├── public/             # Dashboard static files
│   ├── index.html
│   ├── css/
│   └── js/
├── data/               # SQLite database (auto-created)
├── logs/               # Log files (auto-created)
├── .env                # Environment config
├── .env.example        # Config template
├── package.json
└── README.md
```

---

## 🛠️ Troubleshooting

### Port 1812/1813 Already in Use

Pastikan tidak ada RADIUS server lain yang berjalan:

```bash
# Linux/Mac
sudo lsof -i :1812
sudo kill -9 <PID>

# Windows
netstat -ano | findstr :1812
taskkill /PID <PID> /F
```

### Database Locked

Jika muncul error "database is locked":

```bash
# Stop server
# Hapus file lock (jika ada)
rm -f data/*.lock

# Restart
npm start
```

### Permission Denied (Linux)

Port < 1024 memerlukan akses root. Gunakan port alternatif atau:

```bash
# Gunakan port > 1024 di .env
RADIUS_AUTH_PORT=18120
RADIUS_ACCT_PORT=18130

# ATAU jalankan dengan sudo (tidak direkomendasikan)
sudo npm start
```

---

## 📊 API Endpoints

| Method | Endpoint               | Description          |
| ------ | ---------------------- | -------------------- |
| POST   | `/api/auth/login`      | Login admin          |
| GET    | `/api/dashboard/stats` | Get statistics       |
| GET    | `/api/users`           | List users           |
| POST   | `/api/users`           | Create user          |
| DELETE | `/api/users/:id`       | Delete user          |
| GET    | `/api/nas`             | List NAS clients     |
| POST   | `/api/nas`             | Create NAS           |
| DELETE | `/api/nas/:id`         | Delete NAS           |
| GET    | `/api/sessions`        | List active sessions |
| GET    | `/api/profiles`        | List profiles        |
| POST   | `/api/profiles`        | Create profile       |

---

## 🤝 Contributing

Contributions are welcome!

1. Fork repository
2. Buat branch fitur (`git checkout -b fitur-baru`)
3. Commit perubahan (`git commit -m 'Tambah fitur baru'`)
4. Push ke branch (`git push origin fitur-baru`)
5. Buat Pull Request

---

## 📄 License

MIT License - silakan gunakan untuk keperluan pribadi maupun komersial.

---

## 🙏 Credits

Developed with ❤️ by [wiku.my.id](https://wiku.my.id)

---

## 💡 Need More Features?

Check out **[Wiku Cloud](https://wiku.my.id)** for enterprise features:

- ☁️ Cloud Management
- 📱 WhatsApp Notifications
- 💳 Payment Gateway Integration
- 📈 Advanced Analytics
- 🎫 Voucher Generator
- 👥 Multi-tenant Support
