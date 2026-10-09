// src/routes/upload.js
const express = require('express');
const upload = require('../middleware/upload');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// POST /api/upload - Upload de foto de perfil
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const url = `/uploads/${req.file.filename}`;
    const db = await getDb();

    // Atualizar avatar_url no perfil
    db.run('UPDATE users SET avatar_url = ?, atualizado_em = datetime(\'now\') WHERE id = ?', [url, req.userId]);

    // Adicionar à galeria de fotos
    const ordem = req.body.ordem || 0;
    db.run('INSERT INTO user_photos (user_id, url, ordem) VALUES (?, ?, ?)', [req.userId, url, ordem]);

    saveDb();

    res.json({
      url,
      message: 'Foto enviada com sucesso',
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (err.message && err.message.includes('Tipo de arquivo')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// POST /api/upload/photos - Upload múltiplo
router.post('/photos', upload.array('photos', 6), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const db = await getDb();
    const urls = [];

    req.files.forEach((file, i) => {
      const url = `/uploads/${file.filename}`;
      urls.push(url);
      db.run('INSERT INTO user_photos (user_id, url, ordem) VALUES (?, ?, ?)', [req.userId, url, i]);
    });

    // Primeira foto vira avatar principal se não tiver
    const existing = db.exec('SELECT avatar_url FROM users WHERE id = ?', [req.userId]);
    if (existing.length > 0 && !existing[0].values[0]?.[0]) {
      db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [urls[0], req.userId]);
    }

    saveDb();
    res.json({ urls, message: `${urls.length} foto(s) enviada(s)` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar fotos' });
  }
});

// DELETE /api/upload/:photoId - Remover foto
router.delete('/:photoId', async (req, res) => {
  try {
    const db = await getDb();
    const pId = parseInt(req.params.photoId);
    db.run('DELETE FROM user_photos WHERE id = ? AND user_id = ?', [pId, req.userId]);
    saveDb();
    res.json({ message: 'Foto removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover foto' });
  }
});

module.exports = router;