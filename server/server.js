const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpsServer = https.createServer({
  key: fs.readFileSync(path.join(__dirname, '192.168.0.108+1-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '192.168.0.108+1.pem'))
}, app);

const httpApp = express();
const httpServer = http.createServer(httpApp);

httpApp.use((req, res) => {
  res.redirect(`https://${req.headers.host}${req.url}`);
});

const io = new Server(httpsServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  path: '/socket.io/'
});

// Храним соответствие peerId -> socket.id
const rooms = {};
const peerToSocket = {};

app.use(express.static(path.join(__dirname, 'build')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId, peerId) => {
    if (!roomId || !peerId) {
      socket.emit('error', { message: 'Invalid roomId or peerId' });
      return;
    }

    if (rooms[roomId]?.includes(peerId)) {
      socket.emit('error', { message: 'This peerId is already in use' });
      return;
    }

    // Сохраняем связь peerId -> socket.id
    peerToSocket[peerId] = socket.id;
    socket.peerId = peerId;
    socket.roomId = roomId;

    // Получаем список существующих пиров в комнате
    const existingPeers = rooms[roomId] || [];
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(peerId);
    socket.join(roomId);

    // Отправляем новому пользователю список существующих пиров
    socket.emit('existing-peers', existingPeers);

    // Уведомляем существующих пользователей о новом пире
    socket.to(roomId).emit('peer-joined', peerId);
    console.log(`${peerId} joined room ${roomId}. Existing peers:`, existingPeers);
  });

  socket.on('offer', ({ offer, to, roomId }) => {
    if (!to || !offer) {
      console.log('Invalid offer data');
      return;
    }
    const targetSocketId = peerToSocket[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('offer', { offer, fromPeerId: socket.peerId });
      console.log(`Forwarding offer from ${socket.peerId} to ${to} (socket ${targetSocketId})`);
    } else {
      console.log(`Target peer ${to} not found`);
    }
  });

  socket.on('answer', ({ answer, to, roomId }) => {
    if (!to || !answer) {
      console.log('Invalid answer data');
      return;
    }
    const targetSocketId = peerToSocket[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', { answer, fromPeerId: socket.peerId });
      console.log(`Forwarding answer from ${socket.peerId} to ${to} (socket ${targetSocketId})`);
    } else {
      console.log(`Target peer ${to} not found`);
    }
  });

  socket.on('ice-candidate', ({ candidate, to, roomId }) => {
    if (!to || !candidate) {
      console.log('Invalid ICE candidate data');
      return;
    }
    const targetSocketId = peerToSocket[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate, fromPeerId: socket.peerId });
      console.log(`Forwarding ICE candidate from ${socket.peerId} to ${to}`);
    } else {
      console.log(`Target peer ${to} not found for ICE candidate`);
    }
  });

  socket.on('leave-room', (roomId, peerId) => {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(id => id !== peerId);
      delete peerToSocket[peerId];
      socket.to(roomId).emit('peer-left', peerId);
      socket.leave(roomId);
      console.log(`${peerId} left room ${roomId}`);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const { roomId, peerId } = socket;
    if (roomId && rooms[roomId] && peerId) {
      rooms[roomId] = rooms[roomId].filter(id => id !== peerId);
      delete peerToSocket[peerId];
      socket.to(roomId).emit('peer-left', peerId);
      console.log(`${peerId} disconnected from room ${roomId}`);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
const HTTP_PORT = process.env.HTTP_PORT || 80;

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTPS Server running on https://0.0.0.0:${PORT}`);
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP Server running on http://0.0.0.0:${HTTP_PORT} (redirecting to HTTPS)`);
});