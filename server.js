const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Настройка Socket.IO с поддержкой CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Раздача статических файлов (если есть папка public)
app.use(express.static('public'));

// Главная страница для проверки работы сервера
app.get('/', (req, res) => {
  res.send('Сервер успешно работает!');
});

// Логика Socket.IO: переменная socket доступна ТОЛЬКО внутри io.on('connection')
io.on('connection', (socket) => {
  console.log('Новый пользователь подключился:', socket.id);

  // Пример обработки событий от клиента
  socket.on('message', (data) => {
    console.log('Получено сообщение:', data);
    // Отправляем сообщение всем подключенным пользователям
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
  });
});

// Настройка порта для Render (process.env.PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
