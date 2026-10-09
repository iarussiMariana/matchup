// src/routes/match.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// GET /api/match - Listar matches do usuário
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(
      `SELECT m.id as match_id,
              CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END as partner_id,
              u.nome, u.avatar_emoji, u.avatar_url, u.cidade, u.online_status,
              (SELECT content FROM messages WHERE match_id = m.id ORDER BY enviado_em DESC LIMIT 1) as last_msg,
              (SELECT enviado_em FROM messages WHERE match_id = m.id ORDER BY enviado_em DESC LIMIT 1) as last_time,
              (SELECT COUNT(*) FROM messages WHERE match_id = m.id AND sender_id != ? AND lida = 0) as unread
       FROM matches m
       JOIN users u ON u.id = CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END
       WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.active = 1
       ORDER BY last_time DESC NULLS LAST`,
      [req.userId, req.userId, req.userId, req.userId, req.userId]
    );

    const matches = results.length > 0 ? results[0].values.map(r => ({
      matchId: r[0], partnerId: r[1], nome: r[2], avatar_emoji: r[3],
      avatar_url: r[4], cidade: r[5], online: !!r[6],
      lastMessage: r[7], lastTime: r[8], unread: r[9] || 0,
    })) : [];

    res.json(matches);
  } catch (err) {
    console.error('Match list error:', err);
    res.status(500).json({ error: 'Erro ao listar matches' });
  }
});

// GET /api/match/:matchId - Detalhes de um match específico
router.get('/:matchId', async (req, res) => {
  try {
    const db = await getDb();
    const mId = parseInt(req.params.matchId);

    const results = db.exec(
      `SELECT m.id, m.user1_id, m.user2_id, m.criado_em,
              u1.nome as nome1, u1.avatar_emoji as avatar1,
              u2.nome as nome2, u2.avatar_emoji as avatar2
       FROM matches m
       JOIN users u1 ON m.user1_id = u1.id
       JOIN users u2 ON m.user2_id = u2.id
       WHERE m.id = ? AND (m.user1_id = ? OR m.user2_id = ?) AND m.active = 1`,
      [mId, req.userId, req.userId]
    );

    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(404).json({ error: 'Match não encontrado' });
    }

    const [id, u1, u2, date, n1, a1, n2, a2] = results[0].values[0];
    const partnerId = u1 === req.userId ? u2 : u1;
    const partnerName = u1 === req.userId ? n2 : n1;
    const partnerAvatar = u1 === req.userId ? a2 : a1;

    const msgs = db.exec(
      'SELECT id, sender_id, content, type, enviado_em, lida FROM messages WHERE match_id = ? ORDER BY enviado_em',
      [mId]
    );
    const messages = msgs.length > 0 ? msgs[0].values.map(m => ({
      id: m[0], senderId: m[1], content: m[2], type: m[3],
      time: m[4], read: !!m[5], isMine: m[1] === req.userId,
    })) : [];

    // Marcar mensagens como lidas
    db.run('UPDATE messages SET lida = 1 WHERE match_id = ? AND sender_id != ?', [mId, req.userId]);

    saveDb();
    res.json({
      matchId: id, partnerId, partnerName, partnerAvatar, createdAt: date, messages,
    });
  } catch (err) {
    console.error('Match detail error:', err);
    res.status(500).json({ error: 'Erro ao buscar match' });
  }
});

// DELETE /api/match/:matchId - Desfazer match
router.delete('/:matchId', async (req, res) => {
  try {
    const db = await getDb();
    const mId = parseInt(req.params.matchId);

    db.run('UPDATE matches SET active = 0 WHERE id = ? AND (user1_id = ? OR user2_id = ?)', [mId, req.userId, req.userId]);
    saveDb();
    res.json({ message: 'Match desfeito' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desfazer match' });
  }
});

module.exports = router;