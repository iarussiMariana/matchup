// src/routes/chat.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// GET /api/chat - Lista de conversas (alias para /api/match)
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(
      `SELECT m.id as match_id,
              CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END as partner_id,
              u.nome, u.avatar_emoji, u.avatar_url,
              (SELECT content FROM messages WHERE match_id = m.id ORDER BY enviado_em DESC LIMIT 1) as last_msg,
              (SELECT enviado_em FROM messages WHERE match_id = m.id ORDER BY enviado_em DESC LIMIT 1) as last_time,
              (SELECT COUNT(*) FROM messages WHERE match_id = m.id AND sender_id != ? AND lida = 0) as unread
       FROM matches m
       JOIN users u ON u.id = CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END
       WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.active = 1
       ORDER BY last_time DESC NULLS LAST`,
      [req.userId, req.userId, req.userId, req.userId, req.userId]
    );

    const chats = results.length > 0 ? results[0].values.map(r => ({
      matchId: r[0], partnerId: r[1], nome: r[2], avatar_emoji: r[3],
      avatar_url: r[4], lastMessage: r[5], lastTime: r[6], unread: r[7] || 0,
    })) : [];

    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// GET /api/chat/:matchId/messages - Mensagens de uma conversa
router.get('/:matchId/messages', async (req, res) => {
  try {
    const db = await getDb();
    const mId = parseInt(req.params.matchId);

    // Verificar se o match pertence ao usuário
    const match = db.exec(
      'SELECT id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND active = 1',
      [mId, req.userId, req.userId]
    );
    if (match.length === 0 || match[0].values.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const msgs = db.exec(
      'SELECT id, sender_id, content, type, enviado_em, lida FROM messages WHERE match_id = ? ORDER BY enviado_em',
      [mId]
    );
    const messages = msgs.length > 0 ? msgs[0].values.map(m => ({
      id: m[0], senderId: m[1], content: m[2], type: m[3],
      time: m[4], read: !!m[5], isMine: m[1] === req.userId,
    })) : [];

    // Marcar como lidas
    db.run('UPDATE messages SET lida = 1 WHERE match_id = ? AND sender_id != ?', [mId, req.userId]);
    saveDb();

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// POST /api/chat/:matchId/messages - Enviar mensagem
router.post('/:matchId/messages', async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    if (!content) return res.status(400).json({ error: 'Conteúdo da mensagem é obrigatório' });

    const mId = parseInt(req.params.matchId);
    const db = await getDb();

    // Verificar match
    const match = db.exec(
      'SELECT id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND active = 1',
      [mId, req.userId, req.userId]
    );
    if (match.length === 0 || match[0].values.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    db.run(
      'INSERT INTO messages (match_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
      [mId, req.userId, content, type]
    );

    // Notificação para o parceiro
    const partner = db.exec(
      'SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END FROM matches WHERE id = ?',
      [req.userId, mId]
    );
    if (partner.length > 0) {
      const partnerId = partner[0].values[0][0];
      const myName = db.exec('SELECT nome FROM users WHERE id = ?', [req.userId]);
      const name = myName[0]?.values[0]?.[0] || 'Alguém';
      const preview = type === 'sticker' ? '📱 Sticker' : (content.length > 30 ? content.slice(0, 30) + '...' : content);
      db.run(
        'INSERT INTO notifications (user_id, type, title, body, from_user_id) VALUES (?, ?, ?, ?, ?)',
        [partnerId, 'message', name, preview, req.userId]
      );
    }

    saveDb();

    // Retornar a mensagem criada para o Socket.IO enviar ao parceiro
    const lastMsg = db.exec('SELECT id, sender_id, content, type, enviado_em FROM messages ORDER BY id DESC LIMIT 1');
    const msg = lastMsg[0]?.values[0];
    const newMessage = msg ? { id: msg[0], senderId: msg[1], content: msg[2], type: msg[3], time: msg[4], isMine: true } : null;

    res.status(201).json(newMessage);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

module.exports = router;