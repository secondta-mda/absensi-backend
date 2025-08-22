const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bcrypt = require('bcrypt');

// Import database connection
const db = require('../../db');

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",    // saat development React
      "https://absensi-mda.netlify.app",   // domain produksi React
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // kalau nanti pakai cookie/session
  })
);
app.use(express.json());

// Fungsi helper untuk menghitung selisih jam dalam format desimal
function hitungSelisihJam(jamMasuk, jamPulang) {
  const masuk = new Date(jamMasuk);
  const pulang = new Date(jamPulang);
  const selisihMs = pulang.getTime() - masuk.getTime();
  const selisihJam = selisihMs / (1000 * 60 * 60); // konversi ke jam
  return selisihJam;
}

// Fungsi helper untuk mengkonversi jam ke format decimal (08:00 -> 8.0)
function jamKeDesimal(jamString) {
  const [hours, minutes] = jamString.split(":");
  return parseInt(hours) + parseInt(minutes) / 60;
}

// Fungsi helper untuk format jam dari decimal ke string (8.5 -> "8 jam 30 menit")
function formatJamDesimal(jamDesimal) {
  const jam = Math.floor(Math.abs(jamDesimal));
  const menit = Math.round((Math.abs(jamDesimal) - jam) * 60);

  if (jam === 0) {
    return `${menit} menit`;
  } else if (menit === 0) {
    return `${jam} jam`;
  } else {
    return `${jam} jam ${menit} menit`;
  }
}

app.get("/api", (req, res) => {
  res.send("API Absensi aktif");
});

app.get("/api/test-db", (req, res) => {
  db.query("SELECT COUNT(*) as total FROM users", (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ 
        success: false, 
        error: "Database connection failed",
        details: err.message 
      });
    }
    
    res.json({
      success: true,
      message: "Database connected successfully",
      total_users: results[0].total
    });
  });
});

app.get("/api/debug-users", (req, res) => {
  db.query("SELECT id, username FROM users LIMIT 5", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ users: results });
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (results.length === 0)
        return res.status(401).json({ message: "Username tidak ditemukan" });

      const user = results[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) return res.status(401).json({ message: "Password salah" });

      // Login berhasil - kirim juga jam_masuk, jam_pulang, dan jam_kerja
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        jam_masuk: user.jam_masuk,
        jam_pulang: user.jam_pulang,
        jam_kerja: user.jam_kerja, // pastikan kolom ini ada di database
      });
    }
  );
});

app.post("/api/absen", (req, res) => {
  try {
    const { user_id, type, image_url, jam_masuk_user, jam_pulang_user } =
      req.body;
    const waktu = new Date();

    console.log("Received data:", {
      user_id,
      type,
      image_url,
      waktu,
      jam_masuk_user,
      jam_pulang_user,
    });

    if (!user_id || !type) {
      return res
        .status(400)
        .json({ success: false, error: "user_id dan type wajib diisi" });
    }

    if (type === "masuk") {
      // ... (kode untuk absen masuk tetap sama)
      // Gunakan jam_masuk dari user jika tersedia, jika tidak gunakan default 08:00
      const jamMasukDefault = jam_masuk_user || "08:00:00";
      const [hours, minutes, seconds] = jamMasukDefault.split(":");
      const jamMasukLimit = parseInt(hours) * 60 + parseInt(minutes);

      const jamSekarang = waktu.getHours() * 60 + waktu.getMinutes();
      const keterangan_masuk =
        jamSekarang > jamMasukLimit ? "terlambat" : "tepat waktu";

      // Hitung detail keterlambatan jika terlambat
      let detail_keterangan = null;
      if (keterangan_masuk === "terlambat") {
        const selisihMenit = jamSekarang - jamMasukLimit;
        const jam = Math.floor(selisihMenit / 60);
        const menit = selisihMenit % 60;

        if (jam > 0) {
          detail_keterangan = `Terlambat ${jam} jam ${menit} menit`;
        } else {
          detail_keterangan = `Terlambat ${menit} menit`;
        }
      }

      db.query(
        `INSERT INTO absensi (user_id, jam_masuk, keterangan_masuk, detail_keterangan, image_url_masuk) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          user_id,
          waktu,
          keterangan_masuk,
          detail_keterangan,
          image_url || null,
        ],
        (err) => {
          if (err) {
            console.error("MySQL Error:", err);
            return res.status(500).json({
              success: false,
              error: "Gagal menyimpan data ke database",
            });
          }
          return res.json({
            success: true,
            message: "Absen masuk berhasil",
            data: {
              keterangan: keterangan_masuk,
              detail_keterangan,
              image_url,
              jam_masuk: waktu.toTimeString().split(" ")[0],
            },
          });
        }
      );
    } else if (type === "pulang") {
      // Ambil data jam masuk hari ini terlebih dahulu
      db.query(
        `SELECT jam_masuk FROM absensi 
         WHERE user_id = ? AND DATE(jam_masuk) = CURDATE() AND jam_pulang IS NULL`,
        [user_id],
        (err, results) => {
          if (err) {
            console.error("MySQL Error:", err);
            return res
              .status(500)
              .json({ success: false, error: "Gagal mengambil data masuk" });
          }

          if (results.length === 0) {
            return res.status(400).json({
              success: false,
              error: "Tidak ada record masuk hari ini atau sudah pulang",
            });
          }

          const jamMasukHariIni = results[0].jam_masuk;

          // Hitung total jam kerja aktual
          const totalJamKerjaAktual = hitungSelisihJam(jamMasukHariIni, waktu);

          // Hitung jam kerja yang diharapkan dari selisih jam_masuk_user dan jam_pulang_user
          let jamKerjaExpected = 8; // default 8 jam

          if (jam_masuk_user && jam_pulang_user) {
            try {
              // Parse jam dari format "HH:MM:SS"
              const [startHours, startMinutes] = jam_masuk_user
                .split(":")
                .map(Number);
              const [endHours, endMinutes] = jam_pulang_user
                .split(":")
                .map(Number);

              // Hitung selisih dalam jam desimal
              const startTotalMinutes = startHours * 60 + startMinutes;
              const endTotalMinutes = endHours * 60 + endMinutes;
              jamKerjaExpected = (endTotalMinutes - startTotalMinutes) / 60;

              console.log(
                "Jam kerja expected dari localStorage:",
                jamKerjaExpected,
                "jam"
              );
            } catch (error) {
              console.error(
                "Error parsing jam kerja dari localStorage:",
                error
              );
              // Tetap gunakan default 8 jam jika parsing gagal
              jamKerjaExpected = 8;
            }
          }

          // Hitung selisih jam kerja
          const selisihJamKerja = totalJamKerjaAktual - jamKerjaExpected;

          let keterangan_pulang;
          let detail_keterangan;

          if (Math.abs(selisihJamKerja) < 0.1) {
            // toleransi 6 menit
            keterangan_pulang = "tepat waktu";
            detail_keterangan = `Total jam kerja: ${formatJamDesimal(
              totalJamKerjaAktual
            )}`;
          } else if (selisihJamKerja < 0) {
            keterangan_pulang = "jam kerja kurang";
            detail_keterangan = `Kurang ${formatJamDesimal(
              Math.abs(selisihJamKerja)
            )} (Total Jam Kerja: ${formatJamDesimal(totalJamKerjaAktual)})`;
          } else {
            keterangan_pulang = "jam kerja lebih";
            detail_keterangan = `Lebih ${formatJamDesimal(
              selisihJamKerja
            )} (Total Jam Kerja: ${formatJamDesimal(totalJamKerjaAktual)})`;
          }

          // Update record absensi
          db.query(
            `UPDATE absensi SET 
             jam_pulang = ?, 
             image_url_pulang = ?, 
             keterangan_pulang = ?,
             detail_keterangan = CONCAT(COALESCE(detail_keterangan, ''), CASE WHEN detail_keterangan IS NULL THEN '' ELSE ' | ' END, ?)
             WHERE user_id = ? AND DATE(jam_masuk) = CURDATE() AND jam_pulang IS NULL`,
            [waktu, image_url, keterangan_pulang, detail_keterangan, user_id],
            (err, result) => {
              if (err) {
                console.error("MySQL Error:", err);
                return res
                  .status(500)
                  .json({ success: false, error: "Gagal update data pulang" });
              }

              return res.json({
                success: true,
                message: "Absen pulang berhasil",
                data: {
                  image_url,
                  jam_pulang: waktu.toTimeString().split(" ")[0],
                  keterangan: keterangan_pulang,
                  detail_keterangan,
                  total_jam_kerja: formatJamDesimal(totalJamKerjaAktual),
                  jam_kerja_expected: formatJamDesimal(jamKerjaExpected),
                  selisih:
                    selisihJamKerja > 0
                      ? `+${formatJamDesimal(selisihJamKerja)}`
                      : formatJamDesimal(selisihJamKerja),
                },
              });
            }
          );
        }
      );
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Type harus 'masuk' atau 'pulang'" });
    }
  } catch (error) {
    console.error("Server Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Terjadi kesalahan server" });
  }
});

// Endpoint untuk mendapatkan riwayat absensi hari ini
app.get("/api/absensi/hari-ini/:user_id", (req, res) => {
  const { user_id } = req.params;

  db.query(
    `SELECT 
      *,
      CASE 
        WHEN jam_masuk IS NOT NULL AND jam_pulang IS NOT NULL 
        THEN TIME_FORMAT(TIMEDIFF(jam_pulang, jam_masuk), '%H jam %i menit')
        ELSE NULL 
      END as total_jam_kerja_hari
     FROM absensi 
     WHERE user_id = ? AND DATE(jam_masuk) = CURDATE()
     ORDER BY jam_masuk DESC`,
    [user_id],
    (err, results) => {
      if (err) {
        console.error("MySQL Error:", err);
        return res
          .status(500)
          .json({
            success: false,
            error: "Gagal mengambil data absensi hari ini",
          });
      }
      return res.json({
        success: true,
        data: results,
      });
    }
  );
});

// Endpoint untuk mendapatkan riwayat absensi
app.get("/api/absensi/:user_id", (req, res) => {
  const { user_id } = req.params;

  db.query(
    `SELECT 
      *,
      CASE 
        WHEN jam_masuk IS NOT NULL AND jam_pulang IS NOT NULL 
        THEN TIME_FORMAT(TIMEDIFF(jam_pulang, jam_masuk), '%H jam %i menit')
        ELSE NULL 
      END as total_jam_kerja_hari
     FROM absensi 
     WHERE user_id = ? 
     ORDER BY jam_masuk DESC 
     LIMIT 30`,
    [user_id],
    (err, results) => {
      if (err) {
        console.error("MySQL Error:", err);
        return res
          .status(500)
          .json({ success: false, error: "Gagal mengambil data absensi" });
      }
      return res.json({
        success: true,
        data: results,
      });
    }
  );
});

// Endpoint untuk cek status absensi hari ini
app.get("/api/absensi/status/:user_id", (req, res) => {
  const { user_id } = req.params;

  db.query(
    `SELECT 
        jam_masuk, 
        jam_pulang,
        keterangan_masuk,
        keterangan_pulang,
        detail_keterangan,
        image_url_masuk,
        image_url_pulang,
        CASE 
          WHEN jam_masuk IS NOT NULL AND jam_pulang IS NOT NULL 
          THEN TIME_FORMAT(TIMEDIFF(jam_pulang, jam_masuk), '%H jam %i menit')
          ELSE NULL 
        END as total_jam_kerja
     FROM absensi 
     WHERE user_id = ? AND DATE(jam_masuk) = CURDATE()`,
    [user_id],
    (err, results) => {
      if (err) {
        console.error("MySQL Error:", err);
        return res
          .status(500)
          .json({ success: false, error: "Gagal mengambil status absensi" });
      }

      const status = {
        sudah_masuk: results.length > 0 && results[0].jam_masuk !== null,
        sudah_pulang: results.length > 0 && results[0].jam_pulang !== null,
        data: results.length > 0 ? results[0] : null,
      };

      return res.json({
        success: true,
        data: status,
      });
    }
  );
});

// Export serverless function
module.exports.handler = serverless(app);
