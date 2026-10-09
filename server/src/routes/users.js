// src/routes/users.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// GET /api/users/me - Perfil do usuário logado
router.get('/me', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(
      `SELECT id, email, nome, idade, genero, interessado_em, cidade, bio,
              avatar_emoji, avatar_url, verificado, is_premium, premium_expires_at,
              discovery_enabled, invisible_mode, criado_em
       FROM users WHERE id = ?`,
      [req.userId]
    );

    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const u = results[0].values[0];
    const interests = db.exec('SELECT interest FROM user_interests WHERE user_id = ?', [req.userId]);
    const interestValues = interests.length > 0 ? interests[0].values.flat() : [];
    const photos = db.exec('SELECT id, url, ordem FROM user_photos WHERE user_id = ? ORDER BY ordem', [req.userId]);
    const photoValues = photos.length > 0 ? photos[0].values.map(p => ({ id: p[0], url: p[1], ordem: p[2] })) : [];
    const filters = db.exec('SELECT min_age, max_age, max_distance, gender_filter, verified_only FROM user_filters WHERE user_id = ?', [req.userId]);
    const filterValues = filters.length > 0 ? filters[0].values[0] : [18, 55, 50, 'todos', 0];

    res.json({
      id: u[0], email: u[1], nome: u[2], idade: u[3], genero: u[4],
      interessado_em: u[5], cidade: u[6], bio: u[7],
      avatar_emoji: u[8], avatar_url: u[9],
      verificado: !!u[10], is_premium: !!u[11],
      premium_expires_at: u[12],
      discovery_enabled: !!u[13], invisible_mode: !!u[14],
      criado_em: u[15],
      interesses: interestValues,
      fotos: photoValues,
      filters: {
        min_age: filterValues[0], max_age: filterValues[1],
        max_distance: filterValues[2], gender_filter: filterValues[3],
        verified_only: !!filterValues[4],
      },
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// PUT /api/users/me - Atualizar perfil
router.put('/me', async (req, res) => {
  try {
    const { nome, idade, genero, interessado_em, cidade, bio, avatar_emoji, interesses } = req.body;
    const db = await getDb();

    db.run(
      `UPDATE users SET nome = COALESCE(?, nome), idade = COALESCE(?, idade),
       genero = COALESCE(?, genero), interessado_em = COALESCE(?, interessado_em),
       cidade = COALESCE(?, cidade), bio = COALESCE(?, bio),
       avatar_emoji = COALESCE(?, avatar_emoji),
       atualizado_em = datetime('now')
       WHERE id = ?`,
      [nome, idade, genero, interessado_em, cidade, bio, avatar_emoji, req.userId]
    );

    if (interesses && Array.isArray(interesses)) {
      db.run('DELETE FROM user_interests WHERE user_id = ?', [req.userId]);
      const insert = db.prepare('INSERT INTO user_interests (user_id, interest) VALUES (?, ?)');
      interesses.forEach(i => insert.run([req.userId, i]));
    }

    saveDb();
    res.json({ message: 'Perfil atualizado' });
  } catch (err) {
    console.error('Update me error:', err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// PUT /api/users/me/onboarding - Completar onboarding
router.put('/me/onboarding', async (req, res) => {
  try {
    const { nome, idade, genero, interessado_em, cidade, bio, interesses, avatar_emoji } = req.body;
    if (!nome || !idade || !genero || !interessado_em) {
      return res.status(400).json({ error: 'Nome, idade, gênero e interesse são obrigatórios' });
    }
    const db = await getDb();
    db.run(
      `UPDATE users SET nome = ?, idade = ?, genero = ?, interessado_em = ?,
       cidade = COALESCE(?, cidade), bio = COALESCE(?, bio),
       avatar_emoji = COALESCE(?, avatar_emoji), atualizado_em = datetime('now')
       WHERE id = ?`,
      [nome, idade, genero, interessado_em, cidade, bio, avatar_emoji, req.userId]
    );
    if (interesses && Array.isArray(interesses)) {
      db.run('DELETE FROM user_interests WHERE user_id = ?', [req.userId]);
      const insert = db.prepare('INSERT INTO user_interests (user_id, interest) VALUES (?, ?)');
      interesses.forEach(i => insert.run([req.userId, i]));
    }
    saveDb();
    res.json({ message: 'Onboarding concluído' });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Erro ao salvar onboarding' });
  }
});

// PUT /api/users/me/settings - Atualizar configurações
router.put('/me/settings', async (req, res) => {
  try {
    const { discovery_enabled, invisible_mode } = req.body;
    const db = await getDb();
    db.run(
      'UPDATE users SET discovery_enabled = COALESCE(?, discovery_enabled), invisible_mode = COALESCE(?, invisible_mode) WHERE id = ?',
      [discovery_enabled !== undefined ? (discovery_enabled ? 1 : 0) : null,
       invisible_mode !== undefined ? (invisible_mode ? 1 : 0) : null,
       req.userId]
    );
    saveDb();
    res.json({ message: 'Configurações atualizadas' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

// PUT /api/users/me/filters - Atualizar filtros
router.put('/me/filters', async (req, res) => {
  try {
    const { min_age, max_age, max_distance, gender_filter, verified_only } = req.body;
    const db = await getDb();
    db.run(
      `UPDATE user_filters SET
       min_age = COALESCE(?, min_age), max_age = COALESCE(?, max_age),
       max_distance = COALESCE(?, max_distance), gender_filter = COALESCE(?, gender_filter),
       verified_only = COALESCE(?, verified_only)
       WHERE user_id = ?`,
      [min_age, max_age, max_distance, gender_filter,
       verified_only !== undefined ? (verified_only ? 1 : 0) : null,
       req.userId]
    );
    saveDb();
    res.json({ message: 'Filtros atualizados' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar filtros' });
  }
});

// PUT /api/users/me/location
router.put('/me/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'Lat e lng são obrigatórios' });
    const db = await getDb();
    const existing = db.exec('SELECT user_id FROM user_location WHERE user_id = ?', [req.userId]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run('UPDATE user_location SET lat = ?, lng = ?, atualizado_em = datetime(\'now\') WHERE user_id = ?', [lat, lng, req.userId]);
    } else {
      db.run('INSERT INTO user_location (user_id, lat, lng) VALUES (?, ?, ?)', [req.userId, lat, lng]);
    }
    saveDb();
    res.json({ message: 'Localização atualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar localização' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(
      `SELECT id, nome, idade, genero, cidade, bio, avatar_emoji, avatar_url,
              verificado, is_premium, criado_em
       FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (results.length === 0 || results[0].values.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const u = results[0].values[0];
    const iResults = db.exec('SELECT interest FROM user_interests WHERE user_id = ?', [req.params.id]);
    const interests = iResults.length > 0 ? iResults[0].values.flat() : [];
    const pResults = db.exec('SELECT id, url, ordem FROM user_photos WHERE user_id = ? ORDER BY ordem', [req.params.id]);
    const photos = pResults.length > 0 ? pResults[0].values.map(p => ({ id: p[0], url: p[1], ordem: p[2] })) : [];

    res.json({ id: u[0], nome: u[1], idade: u[2], genero: u[3], cidade: u[4], bio: u[5], avatar_emoji: u[6], avatar_url: u[7], verificado: !!u[8], is_premium: !!u[9], criado_em: u[10], interesses: interests, fotos: photos });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

module.exports = router;