// src/routes/discover.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/discover - Perfis disponíveis para swipe
router.get('/', async (req, res) => {
  try {
    const db = await getDb();

    // Obter filtros do usuário
    const filters = db.exec('SELECT min_age, max_age, max_distance, gender_filter, verified_only FROM user_filters WHERE user_id = ?', [req.userId]);
    const [minAge, maxAge, maxDist, genderF, verifiedOnly] = filters.length > 0 ? filters[0].values[0] : [18, 55, 50, 'todos', 0];

    // Obter localização do usuário
    const myLoc = db.exec('SELECT lat, lng FROM user_location WHERE user_id = ?', [req.userId]);
    const myLat = myLoc.length > 0 ? myLoc[0].values[0]?.[0] : null;
    const myLng = myLoc.length > 0 ? myLoc[0].values[0]?.[1] : null;

    // IDs já swipados
    const swiped = db.exec('SELECT swiped_id FROM swipes WHERE swiper_id = ?', [req.userId]);
    const swipedIds = swiped.length > 0 ? swiped[0].values.flat() : [];

    // IDs bloqueados
    const blocked = db.exec('SELECT blocked_id FROM blocks WHERE blocker_id = ?', [req.userId]);
    const blockedIds = blocked.length > 0 ? blocked[0].values.flat() : [];

    // Buscar perfis disponíveis
    let query = `SELECT id, nome, idade, genero, cidade, bio, avatar_emoji, avatar_url, verificado
                 FROM users WHERE id != ? AND discovery_enabled = 1 AND invisible_mode = 0`;
    const params = [req.userId];

    if (minAge) { query += ' AND (idade >= ? OR idade IS NULL)'; params.push(minAge); }
    if (maxAge) { query += ' AND (idade <= ? OR idade IS NULL)'; params.push(maxAge); }
    if (genderF && genderF !== 'todos') { query += ' AND (genero = ? OR interessado_em = ?)'; params.push(genderF, genderF); }
    if (verifiedOnly) { query += ' AND verificado = 1'; }

    query += ' ORDER BY criado_em DESC LIMIT 30';

    const results = db.exec(query, params);
    let profiles = results.length > 0 ? results[0].values.map(r => ({
      id: r[0], nome: r[1], idade: r[2], genero: r[3], cidade: r[4],
      bio: r[5], avatar_emoji: r[6], avatar_url: r[7], verificado: !!r[8],
    })) : [];

    // Filtrar já swipados e bloqueados
    profiles = profiles.filter(p => !swipedIds.includes(p.id) && !blockedIds.includes(p.id));

    // Calcular distância e adicionar interesses
    const enriched = await Promise.all(profiles.map(async (p) => {
      const ints = db.exec('SELECT interest FROM user_interests WHERE user_id = ?', [p.id]);
      const interesses = ints.length > 0 ? ints[0].values.flat() : [];
      let distancia = null;
      if (myLat != null && myLng != null) {
        const loc = db.exec('SELECT lat, lng FROM user_location WHERE user_id = ?', [p.id]);
        if (loc.length > 0 && loc[0].values.length > 0) {
          const [pLat, pLng] = loc[0].values[0];
          distancia = Math.round(haversineDistance(myLat, myLng, pLat, pLng));
        }
      }

      // Filtrar por distância
      if (maxDist && distancia !== null && distancia > maxDist) return null;

      return { ...p, interesses, distancia };
    }));

    const filtered = enriched.filter(p => p !== null);

    // Buscar swipes que deram like no usuário (para likes screen)
    const likesOnMe = db.exec(
      `SELECT s.swiper_id, u.nome, u.avatar_emoji FROM swipes s
       JOIN users u ON s.swiper_id = u.id
       WHERE s.swiped_id = ? AND s.direction = 'like'
       ORDER BY s.criado_em DESC LIMIT 20`,
      [req.userId]
    );
    const likes = likesOnMe.length > 0 ? likesOnMe[0].values.map(r => ({
      userId: r[0], nome: r[1], avatar_emoji: r[2],
    })) : [];

    res.json({ profiles: filtered, likes });
  } catch (err) {
    console.error('Discover error:', err);
    res.status(500).json({ error: 'Erro ao buscar perfis' });
  }
});

// POST /api/discover/swipe - Registrar swipe
router.post('/swipe', async (req, res) => {
  try {
    const { targetId, direction } = req.body;
    if (!targetId || !['like', 'nope', 'super'].includes(direction)) {
      return res.status(400).json({ error: 'targetId e direction (like/nope/super) são obrigatórios' });
    }

    if (targetId === req.userId) {
      return res.status(400).json({ error: 'Não pode dar swipe em si mesmo' });
    }

    const db = await getDb();

    // Registrar swipe
    db.run(
      'INSERT OR REPLACE INTO swipes (swiper_id, swiped_id, direction) VALUES (?, ?, ?)',
      [req.userId, targetId, direction]
    );

    let matched = false;

    // Verificar match (só para like e super)
    if (direction === 'like' || direction === 'super') {
      const otherSwipe = db.exec(
        "SELECT id FROM swipes WHERE swiper_id = ? AND swiped_id = ? AND direction IN ('like', 'super')",
        [targetId, req.userId]
      );

      if (otherSwipe.length > 0 && otherSwipe[0].values.length > 0) {
        // Criar match
        const [u1, u2] = req.userId < targetId ? [req.userId, targetId] : [targetId, req.userId];
        const existing = db.exec('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?', [u1, u2]);

        if (existing.length === 0 || existing[0].values.length === 0) {
          db.run('INSERT INTO matches (user1_id, user2_id) VALUES (?, ?)', [u1, u2]);

          // Notificação para o outro usuário
          const myProfile = db.exec('SELECT nome FROM users WHERE id = ?', [req.userId]);
          const myName = myProfile[0]?.values[0]?.[0] || 'Alguém';
          db.run(
            'INSERT INTO notifications (user_id, type, title, body, from_user_id) VALUES (?, ?, ?, ?, ?)',
            [targetId, 'match', 'Novo Match! 🎉', `Você deu match com ${myName}!`, req.userId]
          );

          matched = true;
        }
      }

      // Notificação de like/super para o outro usuário
      if (!matched && direction === 'super') {
        const myProfile = db.exec('SELECT nome FROM users WHERE id = ?', [req.userId]);
        const myName = myProfile[0]?.values[0]?.[0] || 'Alguém';
        db.run(
          'INSERT INTO notifications (user_id, type, title, body, from_user_id) VALUES (?, ?, ?, ?, ?)',
          [targetId, 'super', 'Super Like! ⭐', `${myName} te deu um Super Like!`, req.userId]
        );
      }
    }

    saveDb();
    res.json({ matched, direction });
  } catch (err) {
    console.error('Swipe error:', err);
    res.status(500).json({ error: 'Erro ao registrar swipe' });
  }
});

module.exports = router;