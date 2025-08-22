const mysql = require("mysql2");
const fs = require("fs");

const db = mysql.createConnection({
  host: process.env.DB_HOST, // ex: mysql-xxx.aivencloud.com
  port: process.env.DB_PORT, // ex: 13729
  user: process.env.DB_USER, // biasanya avnadmin
  password: process.env.DB_PASS,
  database: process.env.DB_NAME, // defaultdb
  ssl: {
    ca: fs.readFileSync("./ca.pem"), // sertifikat dari Aiven
  },
});

db.connect((err) => {
  if (err) {
    console.error("❌ Koneksi ke DB gagal:", err);
  } else {
    console.log("✅ Terkoneksi ke database MySQL Aiven");
  }
});

module.exports = db;
