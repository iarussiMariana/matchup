// src/routes/premium.js
const express = require('express');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// GET /api/premium - Status premium do usuário
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const r = db.exec('SELECT is_premium, premium_expires_at FROM users WHERE id = ?', [req.userId]);
    if (r.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const [isPremium, expires] = r[0].values[0];
    const plans = db.exec('SELECT id, name, duration_months, price_brl, features FROM premium_plans ORDER BY price_brl');

    res.json({
      is_premium: !!isPremium,
      premium_expires_at: expires,
      plans: plans[0]?.values.map(p => ({
        id: p[0], name: p[1], durationMonths: p[2], priceBrl: p[3], features: p[4],
      })) || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar status premium' });
  }
});

// POST /api/premium/subscribe - Assinar premium (mock - sem pagamento real)
router.post('/subscribe', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId é obrigatório' });

    const db = await getDb();
    const plan = db.exec('SELECT id, duration_months FROM premium_plans WHERE id = ?', [planId]);
    if (plan.length === 0 || plan[0].values.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    const [pid, duration] = plan[0].values[0];
    const expiresAt = new Date(Date.now() + duration * 30 * 86400000).toISOString();

    db.run('UPDATE users SET is_premium = 1, premium_expires_at = ? WHERE id = ?', [expiresAt, req.userId]);
    db.run('INSERT INTO user_premium_history (user_id, plan_id, expires_at) VALUES (?, ?, ?)', [req.userId, pid, expiresAt]);

    saveDb();
    res.json({
      message: 'Assinatura premium ativada! (mock)',
      is_premium: true,
      premium_expires_at: expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao ativar premium' });
  }
});

// GET /api/premium/likes - Ver quem curtiu (exclusivo premium)
router.get('/likes', async (req, res) => {
  try {
    const db = await getDb();
    const premium = db.exec('SELECT is_premium FROM users WHERE id = ?', [req.userId]);
    if (!premium[0]?.values[0]?.[0]) {
      // Se não é premium, retorna só 3 previews
      const likes = db.exec(
        `SELECT s.swiper_id, u.nome, u.avatar_emoji, u.idade, u.cidade
         FROM swipes s JOIN users u ON s.swiper_id = u.id
         WHERE s.swiped_id = ? AND s.direction IN ('like', 'super')
         ORDER BY s.criado_em DESC LIMIT 3`,
        [req.userId]
      );
      const previews = likes[0]?.values.map(r => ({ userId: r[0], nome: r[1], avatar_emoji: r[2], idade: r[3], cidade: r[4] })) || [];
      const total = db.exec("SELECT COUNT(*) FROM swipes WHERE swiped_id = ? AND direction IN ('like', 'super')", [req.userId]);
      return res.json({ previews, total: total[0]?.values[0]?.[0] || 0, is_premium: false });
    }

    // Premium: retorna todos
    const likes = db.exec(
      `SELECT s.swiper_id, u.nome, u.avatar_emoji, u.idade, u.cidade, u.verificado, u.bio
       FROM swipes s JOIN users u ON s.swiper_id = u.id
       WHERE s.swiped_id = ? AND s.direction IN ('like', 'super')
       ORDER BY s.criado_em DESC`,
      [req.userId]
    );
    const all = likes[0]?.values.map(r => ({
      userId: r[0], nome: r[1], avatar_emoji: r[2], idade: r[3],
      cidade: r[4], verificado: !!r[5], bio: r[6],
    })) || [];

    res.json({ likes: all, total: all.length, is_premium: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar likes' });
  }
});

module.exports = router;