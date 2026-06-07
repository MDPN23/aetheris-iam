# Aetheris IAM — System Explanation & Analogy

Below is an easy-to-understand explanation of the Aetheris IAM architecture using the analogy of a **High-Security Research Facility**.

---

## 🌐 English: International Version

### 🏢 The Analogy: A High-Security Research Facility

Imagine a high-security research facility containing different locked rooms (**Microservice A** and **Microservice B**). To manage who can go where and when, the facility uses an automated security system:

#### 1. Keycloak — The Badge & Passport Office
*   **What it does**: Before you do anything, you must visit the Badge Office. They verify your identity (username/password) and hand you a **Digital Security Badge (OIDC JWT Token)**. 
*   **Inside the Badge**: It contains your name, your roles (e.g., *Reader*, *Writer*, *Admin*), and when the badge expires.

#### 2. Ory Oathkeeper — The Front Gate Guard (IAP)
*   **What it does**: Stand at the entrance of the facility. Every single request must go through this guard. 
*   **The check**: The guard checks if you have a badge and verifies that the badge's digital signature is authentic (not forged). If you have no badge or a fake one, you are kicked out immediately (HTTP 401).

#### 3. OPA Adapter — The Intelligent Security Concierge (The Brain)
*   The guard at the gate is strong but doesn't know the exact room rules. Instead, the guard hands your badge to the **Security Concierge (OPA Adapter)** and asks: *"Can this person enter Room A to delete files?"* 
*   The Concierge performs **3 critical checks**:
    *   **Check A: Did you log out? (Session Revocation)**: The Concierge calls the Badge Office to ask: *"Is this specific badge still active, or did the owner log out / report it lost?"* If it was deactivated, you are blocked immediately (fail-closed 403).
    *   **Check B: Is your behavior suspicious? (CARA Risk Engine)**: The Concierge checks the behavior scanner (**CARA**). If you are logging in from an unusual location or device (elevated risk score $\ge 0.6$), the Concierge says: *"Wait, this is risky! We need an extra fingerprint scan (Step-Up MFA) before you can proceed."*
    *   **Check C: Do your roles match the room? (OPA Rules)**: The Concierge opens the Facility Rulebook (**OPA**) to check if your role (*Reader*) is allowed to perform that action (*Delete*). Since Readers cannot delete, you are blocked (HTTP 403).

#### 4. Microservices A & B — The Secure Rooms
*   If the Guard, the Concierge, the Rulebook, and the Risk Engine all give the green light, the Guard opens the door, and you successfully access the room.

---

## 🇮🇩 Bahasa Indonesia: Info untuk Tim Lokal

### 🏢 Analogi: Gedung Fasilitas Riset dengan Pengamanan Super Ketat

Bayangkan sebuah gedung riset rahasia yang memiliki berbagai ruangan terkunci (**Microservice A** dan **Microservice B**). Untuk mengelola siapa saja yang boleh masuk dan apa yang boleh mereka lakukan, gedung ini menggunakan sistem keamanan terintegrasi:

#### 1. Keycloak — Kantor Pembuatan Kartu Identitas
*   **Perannya**: Sebelum masuk gedung, Anda wajib ke Kantor Pembuat Kartu untuk memverifikasi identitas Anda (dengan password). Kantor ini akan menerbitkan **Kartu Pengenal Digital (Token JWT)** untuk Anda bawa.
*   **Isi Kartu**: Kartu ini mencantumkan siapa Anda, jabatan/peran Anda (misalnya: *Reader*, *Writer*, *Admin*), dan masa berlaku kartu tersebut.

#### 2. Ory Oathkeeper — Satpam Gerbang Utama (IAP)
*   **Perannya**: Berdiri di pintu masuk utama gedung. Semua pengunjung wajib melewati Satpam ini.
*   **Pemeriksaan**: Satpam memeriksa apakah Anda membawa kartu pengenal dan memastikan tanda tangan digital pada kartu tersebut asli (tidak dipalsu). Jika tidak bawa kartu, Anda langsung diusir (HTTP 401).

#### 3. OPA Adapter — Resepsionis & Asisten Keamanan Pintar (Otak Sistem)
*   Satpam di gerbang depan itu tegas, tapi dia tidak tahu detail aturan masuk setiap ruangan. Satpam akan menyerahkan kartu Anda ke **Resepsionis (OPA Adapter)** dan bertanya: *"Apakah orang ini boleh masuk ke Ruang A untuk menghapus data?"*
*   Resepsionis melakukan **3 pemeriksaan cepat**:
    *   **Cek 1: Apakah Kartu Sudah Dinonaktifkan? (Session Revocation)**: Resepsionis menelpon Kantor Pembuat Kartu untuk bertanya: *"Apakah kartu ini masih aktif atau pemiliknya sudah logout / melaporkan kartunya hilang?"* Jika kartu sudah dinonaktifkan, Anda langsung ditolak (HTTP 403).
    *   **Cek 2: Apakah Perilaku Anda Mencurigakan? (CARA Risk Engine)**: Resepsionis memantau sensor perilaku (**CARA**). Jika Anda terdeteksi mengakses dari lokasi atau perangkat yang tidak biasa (skor risiko tinggi $\ge 0.6$), Resepsionis berkata: *"Tunggu, ini berisiko! Minta dia verifikasi sidik jari tambahan (MFA) dahulu sebelum masuk."*
    *   **Cek 3: Apakah Jabatan Anda Sesuai Aturan Ruangan? (OPA Rules)**: Resepsionis membuka Buku Aturan Gedung (**OPA**) untuk mengecek apakah peran Anda (*Reader*) diizinkan melakukan tindakan tersebut (*Delete*). Jika aturan melarang, Anda akan ditolak (HTTP 403).

#### 4. Microservices A & B — Ruangan Riset
*   Jika Satpam, Resepsionis, Buku Aturan, dan Sensor Perilaku semuanya memberikan lampu hijau, pintu ruangan akan terbuka dan Anda bisa melakukan pekerjaan Anda di dalam.
