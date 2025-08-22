const mysql = require("mysql2");

// hanya load .env kalau di lokal (development)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// handle ca.pem dari ENV (bukan file)
let sslConfig = undefined;
if (process.env.DB_CA) {
  sslConfig = {
    ca: process.env.DB_CA.replace(/\\n/g, "\n"),
    rejectUnauthorized: true
  };
}

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: sslConfig,
});

db.connect((err) => {
  if (err) {
    console.error("❌ Koneksi ke DB gagal:", err);
  } else {
    console.log("✅ Terkoneksi ke database MySQL");
  }
});

module.exports = db;
