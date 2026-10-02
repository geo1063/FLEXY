const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path'); // 👈 добавили путь

const app = express();
const server = http.createServer(app);

// 🛑 Полный запрет кэширования
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Отдача статики
app.use(express.static(path.join(__dirname, 'public')));

// 🎯 Принудительно отдаем index.html при открытии сайта
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: { origin: "*" }
});

const TELEGRAM_BOT_TOKEN = '8957995967:AAHMGLzAEfC5UJL4CARs0TG_IK9K5TEWEMg';

let bot;
if (TELEGRAM_BOT_TOKEN) {
  try {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('🤖 Telegram бот запущен');
  } catch (e) {
    console.log(' Ошибка бота:', e.message);
  }
}

const pendingCodes = {};
const onlineUsers = {};

if (bot) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || `user_${msg.from.id}`;
    
    const authCode = Math.floor(1000 + Math.random() * 9000).toString();
    pendingCodes[authCode] = username.toLowerCase();
    setTimeout(() => delete pendingCodes[authCode], 5 * 60 * 1000);

    bot.sendMessage(chatId, `🔑 Ваш код для входа в FLEXY: *${authCode}*`, {
      parse_mode: 'Markdown'
    });
  });
}

io.on('connection', (socket) => {

  function registerUser(username) {
    const cleanUser = username.toLowerCase();
    socket.username = cleanUser;
    onlineUsers[cleanUser] = socket.id;
  }

  socket.on('verify_code', (code) => {
    const username = pendingCodes[code];
    if (username) {
      delete pendingCodes[code];
      registerUser(username);
      socket.emit('registered', { username });
    } else {
      socket.emit('auth_error', 'Неверный или истекший код.');
    }
  });

  socket.on('auto_login', (username) => {
    if (username) {
      registerUser(username);
      socket.emit('registered', { username: username.toLowerCase() });
    }
  });

  socket.on('private_message', ({ to, content, type }) => {
    const sender = socket.username;
    if (!sender) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = { sender, to: to.toLowerCase(), content, type, time };

    const targetSocketId = onlineUsers[to.toLowerCase()];
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_message', payload);
    }

    socket.emit('message_sent', payload);
  });

  socket.on('disconnect', () => {
    if (socket.username && onlineUsers[socket.username] === socket.id) {
      delete onlineUsers[socket.username];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер FLEXY запущен на порту ${PORT}`);
});
