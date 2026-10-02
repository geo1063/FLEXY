const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
const socketToUser = new Map();

io.on('connection', (socket) => {
  socket.on('register', (username) => {
    const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUser) return;
    users.set(cleanUser, socket.id);
    socketToUser.set(socket.id, cleanUser);
    socket.emit('registered', { username: cleanUser });
  });

  socket.on('search_user', (targetUsername) => {
    const cleanTarget = targetUsername.trim().toLowerCase().replace(/^@/, '');
    const exists = users.has(cleanTarget);
    const currentUser = socketToUser.get(socket.id);
    socket.emit('search_result', {
      username: cleanTarget,
      exists: exists && cleanTarget !== currentUser
    });
  });

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
server.listen(PORT, () => console.log(`Server started on ${PORT}`));
