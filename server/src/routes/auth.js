// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getDb, saveDb } = require('../db/database');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, nome } = req.body;

    if (!email || !password || !nome) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const db = await getDb();

    const existing = db.exec('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const id = uuid();
    const hash = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (id, email, password_hash, nome) VALUES (?, ?, ?, ?)',
      [id, email, hash, nome]
    );

    // Cria filtros padrão
    db.run('INSERT INTO user_filters (user_id) VALUES (?)', [id]);

    const token = jwt.sign({ userId: id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    saveDb();

    const user = db.exec('SELECT id, email, nome, avatar_emoji, is_premium, verificado FROM users WHERE id = ?', [id]);
    const u = user[0].values[0];

    res.status(201).json({
      token,
      user: {
        id: u[0],
        email: u[1],
        nome: u[2],
        avatar_emoji: u[3],
        is_premium: !!u[4],
        verificado: !!u[5],
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const db = await getDb();

    const results = db.exec(
      'SELECT id, email, password_hash, nome, avatar_emoji, is_premium, verificado FROM users WHERE email = ?',
      [email]
    );

    if (results.length === 0 || results[0].values.length === 0) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const [id, userEmail, hash, nome, avatar, premium, verified] = results[0].values[0];

    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const token = jwt.sign({ userId: id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({
      token,
      user: {
        id, email: userEmail, nome, avatar_emoji: avatar,
        is_premium: !!premium, verificado: !!verified,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

module.exports = router;