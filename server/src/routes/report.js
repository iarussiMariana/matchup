// src/routes/report.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// POST /api/report - Denunciar usuário
router.post('/', async (req, res) => {
  try {
    const { targetId, reason, description } = req.body;
    if (!targetId || !reason) {
      return res.status(400).json({ error: 'targetId e reason são obrigatórios' });
    }

    const db = await getDb();
    db.run(
      'INSERT INTO reports (reporter_id, reported_id, reason, description) VALUES (?, ?, ?, ?)',
      [req.userId, targetId, reason, description || null]
    );

    // Bloquear automaticamente ao denunciar
    db.run(
      'INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)',
      [req.userId, targetId]
    );

    // Desfazer match se existir
    db.run(
      'UPDATE matches SET active = 0 WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      [req.userId, targetId, targetId, req.userId]
    );

    saveDb();
    res.json({ message: 'Denúncia enviada' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar denúncia' });
  }
});

// POST /api/report/block - Bloquear usuário (sem denunciar)
router.post('/block', async (req, res) => {
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId é obrigatório' });

    const db = await getDb();
    db.run(
      'INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)',
      [req.userId, targetId]
    );
    db.run(
      'UPDATE matches SET active = 0 WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
      [req.userId, targetId, targetId, req.userId]
    );
    saveDb();
    res.json({ message: 'Usuário bloqueado' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao bloquear usuário' });
  }
});

// GET /api/report/blocks - Listar usuários bloqueados
router.get('/blocks', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(
      `SELECT u.id, u.nome, u.avatar_emoji, b.criado_em
       FROM blocks b JOIN users u ON b.blocked_id = u.id
       WHERE b.blocker_id = ? ORDER BY b.criado_em DESC`,
      [req.userId]
    );
    const blocks = results.length > 0 ? results[0].values.map(r => ({
      id: r[0], nome: r[1], avatar_emoji: r[2], blockedAt: r[3],
    })) : [];
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar bloqueios' });
  }
});

// DELETE /api/report/block/:userId - Desbloquear
router.delete('/block/:userId', async (req, res) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.userId, req.params.userId]);
    saveDb();
    res.json({ message: 'Usuário desbloqueado' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desbloquear' });
  }
});

module.exports = router;