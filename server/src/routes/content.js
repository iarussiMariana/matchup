// src/routes/content.js - Rotas públicas de conteúdo (pickup lines, stickers, interesses)
const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/content/interests
router.get('/interests', async (req, res) => {
  try {
    const db = await getDb();
    const r = db.exec("SELECT DISTINCT interest FROM user_interests UNION ALL SELECT DISTINCT interest FROM (SELECT '🎸 Música' AS interest UNION SELECT '🎬 Cinema' UNION SELECT '🎮 Games' UNION SELECT '📚 Leitura' UNION SELECT '✈️ Viagens' UNION SELECT '🏋️ Academia' UNION SELECT '🍳 Culinária' UNION SELECT '🐕 Cachorros' UNION SELECT '🐱 Gatos' UNION SELECT '☕ Café' UNION SELECT '🍺 Bar' UNION SELECT '🎨 Arte' UNION SELECT '📷 Fotografia' UNION SELECT '🌸 Plantas' UNION SELECT '🏄 Surfe' UNION SELECT '🧘 Yoga' UNION SELECT '🎭 Teatro' UNION SELECT '🏀 Basquete' UNION SELECT '⚽ Futebol' UNION SELECT '🎹 Piano' UNION SELECT '💻 Tecnologia' UNION SELECT '🚴 Ciclismo' UNION SELECT '🏕️ Acampamento' UNION SELECT '🍣 Sushi' UNION SELECT '🎵 Dança' UNION SELECT '📝 Escrita' UNION SELECT '🧑‍🍳 Gastronomia' UNION SELECT '🎧 Podcasts' UNION SELECT '🏛️ Museus' UNION SELECT '🌅 Pôr do sol')");
    const interests = r.length > 0 ? [...new Set(r[0].values.flat())] : [];
    res.json(interests);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar interesses' });
  }
});

// GET /api/content/lines
router.get('/lines', async (req, res) => {
  try {
    const db = await getDb();
    const r = db.exec('SELECT id, cat, text FROM pickup_lines ORDER BY cat, id');
    const lines = r.length > 0 ? r[0].values.map(l => ({ id: l[0], cat: l[1], text: l[2] })) : [];
    res.json(lines);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar cantadas' });
  }
});

// GET /api/content/stickers
router.get('/stickers', async (req, res) => {
  try {
    const db = await getDb();
    const r = db.exec('SELECT id, emoji FROM stickers');
    const stickers = r.length > 0 ? r[0].values.map(s => ({ id: s[0], emoji: s[1] })) : [];
    res.json(stickers);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar stickers' });
  }
});

module.exports = router;