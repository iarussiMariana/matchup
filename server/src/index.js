// src/index.js - Ponto de entrada do servidor Spark
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { getDb } = require('./db/database');
const migrate = require('./db/migrate');
const authMiddleware = require('./middleware/auth');
const { setupSocket } = require('./socket/chat');

// Rotas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const discoverRoutes = require('./routes/discover');
const matchRoutes = require('./routes/match');
const chatRoutes = require('./routes/chat');
const reportRoutes = require('./routes/report');
const notificationRoutes = require('./routes/notification');
const premiumRoutes = require('./routes/premium');
const uploadRoutes = require('./routes/upload');
const contentRoutes = require('./routes/content');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));
// Serve front-end static files
app.use(express.static(path.join(__dirname, '..', '..')));

// Rotas públicas
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);

// Rotas protegidas
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/discover', authMiddleware, discoverRoutes);
app.use('/api/match', authMiddleware, matchRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/report', authMiddleware, reportRoutes);
app.use('/api/notification', authMiddleware, notificationRoutes);
app.use('/api/premium', authMiddleware, premiumRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);

// Socket.IO
setupSocket(server);

// Health check
app.get('/api/health', async (req, res) => {
  const db = await getDb();
  const users = db.exec('SELECT COUNT(*) as count FROM users');
  const count = users[0]?.values[0]?.[0] || 0;
  res.json({ status: 'ok', users: count });
});

// Inicialização
async function start() {
  await migrate();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Spark server running on http://0.0.0.0:${PORT}`);
    console.log(`   Local:    http://localhost:${PORT}`);
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`   Network:  http://${net.address}:${PORT}`);
        }
      }
    }
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});