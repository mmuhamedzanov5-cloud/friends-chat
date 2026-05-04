const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

const users = new Map();
const messages = new Map();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log(`🔌 Новый пользователь: ${socket.id}`);

  socket.on('login', (data) => {
    const { username, avatar } = data;
    const existing = Array.from(users.values()).find(u => u.username === username);
    
    if (existing) {
      socket.emit('login_error', 'Этот ник занят');
      return;
    }

    socket.username = username;
    socket.avatar = avatar || '';
    users.set(socket.id, { username, avatar: avatar || '', online: true });

    broadcastUserList();
    socket.emit('login_success', { username, avatar: avatar || '' });
  });

  socket.on('private_message', (data) => {
    const { to, text } = data;
    const from = socket.username;
    if (!from || !to || !text) return;

    const room = [from, to].sort().join('_');
    if (!messages.has(room)) messages.set(room, []);
    
    const msg = { from, to, text, time: new Date().toISOString() };
    messages.get(room).push(msg);
    
    // Отправляем получателю
    const recipient = Array.from(users.entries()).find(([id, u]) => u.username === to);
    if (recipient) io.to(recipient[0]).emit('private_message', msg);
    
    // Подтверждение отправителю
    socket.emit('private_message', msg);
  });

  socket.on('load_history', (data) => {
    const { with: otherUser } = data;
    const room = [socket.username, otherUser].sort().join('_');
    socket.emit('history', messages.get(room) || []);
  });

  socket.on('typing', (data) => {
    const recipient = Array.from(users.entries()).find(([id, u]) => u.username === data.to);
    if (recipient) io.to(recipient[0]).emit('typing', { from: socket.username });
  });

  socket.on('stop_typing', (data) => {
    const recipient = Array.from(users.entries()).find(([id, u]) => u.username === data.to);
    if (recipient) io.to(recipient[0]).emit('stop_typing', { from: socket.username });
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    broadcastUserList();
  });
});

function broadcastUserList() {
  const list = Array.from(users.values()).map(u => ({
    username: u.username,
    avatar: u.avatar,
    online: true
  }));
  io.emit('user_list', list);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});