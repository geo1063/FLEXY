const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);

// Настройка Socket.io с поддержкой отправки файлов (до 100 МБ)
// и устойчивым соединением для мобильных устройств
const io = new Server(server, {
  maxHttpBufferSize: 1e8, // 100 MB
  pingTimeout: 60000,
  pingInterval: 25000
});

// Токен бота
const TELEGRAM_BOT_TOKEN = '8957995967:AAHMGLzAEfC5UJL4CARs0TG_IK9K5TEWEMg'; 

let bot;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'ВАШ_TELEGRAM_BOT_TOKEN') {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  console.log('🤖 Telegram бот успешно запущен');
} else {
  console.log('⚠️ Токен Telegram бота не указан в server.js!');
}

// Хранилище сгенерированных кодов авторизации { "1234": "username" }
const pendingCodes = {};
// Активные сокеты онлайн-пользователей { "username": "socket_id" }
const onlineUsers = {};

// 1. Обработка команды /start в Telegram Ботe
if (bot) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || `user_${msg.from.id}`;
    
    // Генерация случайного 4-значного кода
    const authCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Код действителен 5 минут
    pendingCodes[authCode] = username.toLowerCase();
    setTimeout(() => delete pendingCodes[authCode], 5 * 60 * 1000);

    // Отправка кода пользователю в диалог с ботом
    bot.sendMessage(chatId, `🔑 Ваш код для входа в FLEXY: *${authCode}*`, {
      parse_mode: 'Markdown'
    });
  });
}

// Раздача статичных файлов из папки public
app.use(express.static('public'));

// 2. Обработка Socket.io соединений
io.on('connection', (socket) => {

  // Привязка логина пользователя к текущему сокету
  function registerUser(username) {
    const cleanUser = username.toLowerCase();
    socket.username = cleanUser;
    onlineUsers[cleanUser] = socket.id;
  }

  // Вход по 4-значному коду из Telegram
  socket.on('verify_code', (code) => {
    const username = pendingCodes[code];
    
    if (username) {
      delete pendingCodes[code]; // Одноразовое использование
      registerUser(username);
      socket.emit('registered', { username });
    } else {
      socket.emit('auth_error', 'Неверный или истекший код. Отправьте /start боту еще раз.');
    }
  });

  // Автоматический вход / повторная авторизация при переподключении
  socket.on('auto_login', (username) => {
    if (username) {
      registerUser(username);
      socket.emit('registered', { username: username.toLowerCase() });
    }
  });

  // Отправка личных сообщений и фотографий
  socket.on('private_message', ({ to, content, type }) => {
    const sender = socket.username;
    if (!sender) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = { 
      sender, 
      to: to.toLowerCase(), 
      content, 
      type, 
      time 
    };

    // Отправляем получателю, если он сейчас онлайн
    const targetSocketId = onlineUsers[to.toLowerCase()];
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_message', payload);
    }

    // Подтверждаем отправку отправителю
    socket.emit('message_sent', payload);
  });

  // Обработка отключения
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
