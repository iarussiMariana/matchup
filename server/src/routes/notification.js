// src/routes/notification.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// GET /api/notification - Listar notificações
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(
      `SELECT n.id, n.type, n.title, n.body, n.from_user_id, n.read, n.criado_em,
              u.nome as from_name, u.avatar_emoji
       FROM notifications n
       LEFT JOIN users u ON n.from_user_id = u.id
       WHERE n.user_id = ?
       ORDER BY n.criado_em DESC LIMIT 50`,
      [req.userId]
    );

    const notifications = results.length > 0 ? results[0].values.map(r => ({
      id: r[0], type: r[1], title: r[2], body: r[3],
      fromUserId: r[4], read: !!r[5], createdAt: r[6],
      fromName: r[7], fromAvatar: r[8],
    })) : [];

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar notificações' });
  }
});

// PUT /api/notification/:id/read - Marcar como lida
router.put('/:id/read', async (req, res) => {
  try {
    const db = await getDb();
    db.run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.userId]);
    saveDb();
    res.json({ message: 'Notificação marcada como lida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar notificação' });
  }
});

// PUT /api/notification/read-all - Marcar todas como lidas
router.put('/read/all', async (req, res) => {
  try {
    const db = await getDb();
    db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.userId]);
    saveDb();
    res.json({ message: 'Todas as notificações marcadas como lidas' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar notificações' });
  }
});

// GET /api/notification/unread-count
router.get('/count/unread', async (req, res) => {
  try {
    const db = await getDb();
    const r = db.exec('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0', [req.userId]);
    const count = r.length > 0 ? r[0].values[0][0] : 0;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao contar notificações' });
  }
});

module.exports = router;