const express = require('express');
const cors = require('cors');
const pool = require('./db/connection');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   TEST ROUTE
========================= */
app.get('/api/test', (req, res) => {
  res.json({ message: "Server working" });
});

/* =========================
   LOGIN API (CONNECTED TO DB)
========================= */
app.post('/api/login', async (req, res) => {
  console.log("Incoming request:", req.body);

  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    console.log("DB result:", result.rows);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = result.rows[0];

    if (password !== user.password) {
      return res.status(401).json({ error: "Wrong password" });
    }

    res.json({
      message: "Login success",
      role: user.role,
      user_id: user.id
    });

  } catch (err) {
    console.error("FULL ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   SERVE FRONTEND
========================= */
app.use(express.static('public'));

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));