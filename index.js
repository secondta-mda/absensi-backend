require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API Absensi aktif');
});

app.post('/absen', (req, res) => {
  const { nama } = req.body;
  const waktu = new Date();

  db.query('INSERT INTO absensi (nama, waktu) VALUES (?, ?)', [nama, waktu], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ status: 'Absen berhasil' });
  });
});

app.get('/absen', (req, res) => {
  db.query('SELECT * FROM absensi ORDER BY waktu DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
});
