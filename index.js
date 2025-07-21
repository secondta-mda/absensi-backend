require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API Absensi aktif');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (results.length === 0) return res.status(401).json({ message: 'Username tidak ditemukan' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ message: 'Password salah' });

    // Login berhasil
    res.json({
      id: user.id,
      username: user.username,
      role: user.role
    });
  });
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
