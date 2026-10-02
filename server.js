const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Токен бота сгенерирован и подставлен
const TG_BOT_TOKEN = '8957995967:AAHMGLzAEfC5UJL4CARs0TG_IK9K5TEWEMg';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();        // username -> socket.id
const socketToUser = new Map(); // socket.id -> username
const pendingCodes = new Map(); // code -> username

// Бот проверяет сообщения в Telegram
let lastUpdateId = 0;
async function pollTelegram() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`);
    const data = await res.json();
    if (data.ok && data.result) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        if (update.message) {
          const chatId = update.message.chat.id;
          const username = update.message.from.username || `id_${chatId}`;
          
          // Генерируем 4-значный код
          const code = Math.floor(1000 + Math.random() * 9000).toString();
          pendingCodes.set(code, username.toLowerCase());

          // Отправляем код пользователю в Telegram
          await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🔐 Ваш код для входа в FLEXY: ${code}`
            })
          });
        }
      }
    }
  } catch (e) {
    console.error('Ошибка бота:', e);
  }
  setTimeout(pollTelegram, 2000);
}

pollTelegram();

io.on('connection', (socket) => {
  // Проверка кода
  socket.on('verify_code', (code) => {
    const username = pendingCodes.get(code.trim());
    if (username) {
      pendingCodes.delete(code.trim());
      users.set(username, socket.id);
      socketToUser.set(socket.id, username);
      socket.emit('registered', { username });
    } else {
      socket.emit('auth_error', 'Неверный или устаревший код!');
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
server.listen(PORT, () => console.log(`FLEXY запущен на порту ${PORT}`));
