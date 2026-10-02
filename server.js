const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');

const TG_BOT_TOKEN = '8957995967:AAHMGLzAEfC5UJL4CARs0TG_IK9K5TEWEMg';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

const users = new Map();        // username -> socket.id
const socketToUser = new Map(); // socket.id -> username
const pendingCodes = new Map(); // code -> username

// Нативный запрос к Telegram без сторонних библиотек и fetch
function tgRequest(endpoint, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request(`https://api.telegram.org/bot${TG_BOT_TOKEN}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

let lastUpdateId = 0;
async function pollTelegram() {
  try {
    const data = await tgRequest('getUpdates', { offset: lastUpdateId + 1, timeout: 5 });
    if (data && data.ok && data.result) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        if (update.message) {
          const chatId = update.message.chat.id;
          const username = update.message.from.username || `id_${chatId}`;
          const code = Math.floor(1000 + Math.random() * 9000).toString();
          
          pendingCodes.set(code, username.toLowerCase());

          await tgRequest('sendMessage', {
            chat_id: chatId,
            text: `🔐 Ваш код для входа в FLEXY: ${code}`
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

  socket.on('auto_login', (username) => {
    const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUser) return;
    users.set(cleanUser, socket.id);
    socketToUser.set(socket.id, cleanUser);
    socket.emit('registered', { username: cleanUser });
  });

  socket.on('private_message', ({ to, content, type }) => {
    const sender = socketToUser.get(socket.id);
    if (!sender) {
      return socket.emit('auth_error', 'Сессия истекла. Перезагрузите страницу.');
    }

    const payload = {
      sender,
      to: to.toLowerCase().replace(/^@/, ''),
      content,
      type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const targetSocketId = users.get(payload.to);

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
