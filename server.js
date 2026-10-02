const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

//8957995967:AAHMGLzAEfC5UJL4CARs0TG_IK9K5TEWEMg;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();        // username -> socket.id
const socketToUser = new Map(); // socket.id -> username
const pendingCodes = new Map(); // username -> 4-digit code

io.on('connection', (socket) => {

  // Запрос кода подтверждения
  socket.on('request_code', async (tgUsername) => {
    const cleanUser = tgUsername.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUser) return;

    // Генерируем 4-значный код
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    pendingCodes.set(cleanUser, code);

    try {
      // Отправляем сообщение через Telegram Bot API
      const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: `@${cleanUser}`,
          text: `🔐 Ваш код подтверждения для входа в FLEXY: ${code}`
        })
      });

      const data = await response.json();

      if (data.ok) {
        socket.emit('code_sent', { success: true });
      } else {
        socket.emit('code_sent', { 
          success: false, 
          error: 'Сначала напишите боту /start в Telegram, чтобы он мог прислать вам код!' 
        });
      }
    } catch (err) {
      socket.emit('code_sent', { success: false, error: 'Ошибка отправки кода в Telegram.' });
    }
  });

  // Проверка кода и вход
  socket.on('verify_code', ({ username, code }) => {
    const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
    const savedCode = pendingCodes.get(cleanUser);

    if (savedCode && savedCode === code.trim()) {
      pendingCodes.delete(cleanUser);
      users.set(cleanUser, socket.id);
      socketToUser.set(socket.id, cleanUser);
      socket.emit('registered', { username: cleanUser });
    } else {
      socket.emit('auth_error', 'Неверный код подтверждения!');
    }
  });

  // Отправка сообщений
  socket.on('private_message', ({ to, content, type }) => {
    const sender = socketToUser.get(socket.id);
    const targetSocketId = users.get(to.toLowerCase().replace(/^@/, ''));

    const payload = {
      sender,
      to,
      content,
      type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_message', payload);
    }
    socket.emit('message_sent', payload);
  });

  socket.on('disconnect', () => {
    const username = socketToUser.get(socket.id);
    if (username) {
      users.delete(username);
      socketToUser.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`FLEXY server started on ${PORT}`));
