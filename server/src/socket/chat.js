// src/socket/chat.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getDb, saveDb } = require('../db/database');

const onlineUsers = new Map(); // userId -> Set<socketId>

function setupSocket(server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token não fornecido'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;

    // Registrar online
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Atualizar status online no banco
    try {
      (async () => {
        const db = await getDb();
        db.run('UPDATE users SET online_status = 1 WHERE id = ?', [userId]);
        saveDb();

        // Emitir para matches que o usuário está online
        const matches = db.exec(
          `SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END FROM matches WHERE (user1_id = ? OR user2_id = ?) AND active = 1`,
          [userId, userId, userId]
        );
        if (matches.length > 0) {
          matches[0].values.flat().forEach(partnerId => {
            io.to(partnerId).emit('user:online', { userId });
          });
        }
      })();
    } catch (e) { /* ignore */ }

    // Entrar em salas de match
    socket.on('chat:join', async (matchId) => {
      socket.join(`match:${matchId}`);
    });

    // Enviar mensagem via Socket.IO
    socket.on('chat:message', async (data) => {
      const { matchId, content, type = 'text' } = data;
      if (!matchId || !content) return;

      try {
        const db = await getDb();

        // Verificar que o match existe e o usuário pertence
        const match = db.exec(
          'SELECT id, user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND active = 1',
          [matchId, userId, userId]
        );
        if (match.length === 0 || match[0].values.length === 0) return;

        const [mId, u1, u2] = match[0].values[0];
        const partnerId = u1 === userId ? u2 : u1;

        // Salvar mensagem
        db.run(
          'INSERT INTO messages (match_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
          [matchId, userId, content, type]
        );
        saveDb();

        const lastMsg = db.exec('SELECT id, sender_id, content, type, enviado_em FROM messages ORDER BY id DESC LIMIT 1');
        const msg = lastMsg[0]?.values[0];
        const messageData = msg ? {
          id: msg[0], senderId: msg[1], content: msg[2],
          type: msg[3], time: msg[4], isMine: false,
        } : null;

        if (messageData) {
          // Enviar para todos na sala (inclui o remetente)
          messageData.isMine = false;
          io.to(`match:${matchId}`).emit('chat:message', messageData);

          // Enviar também como notificação para o parceiro
          messageData.isMine = true;
          socket.emit('chat:message', messageData);

          // Notificar parceiro se offline
          if (!onlineUsers.has(partnerId) || onlineUsers.get(partnerId).size === 0) {
            const myName = db.exec('SELECT nome FROM users WHERE id = ?', [userId]);
            const name = myName[0]?.values[0]?.[0] || 'Alguém';
            const preview = type === 'sticker' ? '📱 Sticker' : (content.length > 30 ? content.slice(0, 30) + '...' : content);
            db.run(
              'INSERT INTO notifications (user_id, type, title, body, from_user_id) VALUES (?, ?, ?, ?, ?)',
              [partnerId, 'message', name, preview, userId]
            );
            saveDb();
          }
        }
      } catch (e) {
        console.error('Socket message error:', e);
      }
    });

    // Indicador de digitação
    socket.on('chat:typing', (data) => {
      const { matchId } = data;
      socket.to(`match:${matchId}`).emit('chat:typing', { userId, matchId });
    });

    socket.on('chat:stop-typing', (data) => {
      const { matchId } = data;
      socket.to(`match:${matchId}`).emit('chat:stop-typing', { userId, matchId });
    });

    // Novo match via socket (disparado pelo servidor na rota de swipe)
    socket.on('match:notify', (data) => {
      const { matchId, targetId } = data;
      // Notificar o outro usuário sobre o match
      io.to(targetId).emit('match:new', { matchId, withUserId: userId });
    });

    socket.on('disconnect', async () => {
      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);
        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);

          // Atualizar status offline
          try {
            const db = await getDb();
            db.run('UPDATE users SET online_status = 0 WHERE id = ?', [userId]);
            saveDb();

            const matches = db.exec(
              `SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END FROM matches WHERE (user1_id = ? OR user2_id = ?) AND active = 1`,
              [userId, userId, userId]
            );
            if (matches.length > 0) {
              matches[0].values.flat().forEach(partnerId => {
                io.to(partnerId).emit('user:offline', { userId });
              });
            }
          } catch (e) { /* ignore */ }
        }
      }
    });
  });

  console.log('🔌 Socket.IO ready');
  return io;
}

module.exports = { setupSocket };