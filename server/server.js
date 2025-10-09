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

// Храним соответствие peerId -> socket.id и имена пользователей
const rooms = {};
const peerToSocket = {};
const peerNames = {}; // Новое: храним имена пользователей

app.use(express.static(path.join(__dirname, 'build')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId, peerId, userName) => {
    if (!roomId || !peerId) {
      socket.emit('error', { message: 'Invalid roomId or peerId' });
      return;
    }

    if (rooms[roomId]?.peers.includes(peerId)) {
      socket.emit('error', { message: 'This peerId is already in use' });
      return;
    }

    // Сохраняем связь peerId -> socket.id и имя пользователя
    peerToSocket[peerId] = socket.id;
    peerNames[peerId] = userName || `User ${peerId.substr(0, 6)}`;
    socket.peerId = peerId;
    socket.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = { owner: peerId, peers: [] };
    }
    rooms[roomId].peers.push(peerId);
    socket.join(roomId);

    // Получаем список существующих пиров с их именами
    const existingPeers = rooms[roomId].peers.filter(id => id !== peerId);
    const peersWithNames = existingPeers.map(id => ({
      peerId: id,
      userName: peerNames[id]
    }));

    // Отправляем новому пользователю info о комнате
    socket.emit('room-info', {
      owner: rooms[roomId].owner,
      existingPeers: peersWithNames
    });

    // Уведомляем существующих о новом пире с его именем
    socket.to(roomId).emit('peer-joined', {
      peerId,
      userName: peerNames[peerId]
    });
    
    console.log(`${peerId} (${peerNames[peerId]}) joined room ${roomId}. Owner: ${rooms[roomId].owner}`);
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

  socket.on('answer', ({ answer, to }) => {
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

  socket.on('ice-candidate', ({ candidate, to}) => {
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

  // Новые события для команд owner'а
  socket.on('mute-peer', ({ targetPeerId, type, mute }) => {
    const roomId = socket.roomId;
    const peerId = socket.peerId;
    if (!roomId || !rooms[roomId] || rooms[roomId].owner !== peerId) {
      console.log(`Unauthorized mute attempt from ${peerId}`);
      return;
    }
    const targetSocketId = peerToSocket[targetPeerId];
    if (targetSocketId && rooms[roomId].peers.includes(targetPeerId)) {
      io.to(targetSocketId).emit('mute-command', { type, mute });
      // Отправляем обновление всем в комнате, включая владельца
      io.in(roomId).emit('mute-update', { peerId: targetPeerId, type, mute });
      console.log(`Owner ${peerId} muted ${type} for ${targetPeerId} (mute: ${mute})`);
    } else {
      console.log(`Target peer ${targetPeerId} not found`);
    }
  });

  socket.on('kick-peer', ({ targetPeerId }) => {
    const roomId = socket.roomId;
    const peerId = socket.peerId;
    if (!roomId || !rooms[roomId] || rooms[roomId].owner !== peerId) {
      console.log(`Unauthorized kick attempt from ${peerId}`);
      return;
    }
    const targetSocketId = peerToSocket[targetPeerId];
    if (targetSocketId && rooms[roomId].peers.includes(targetPeerId)) {
      io.to(targetSocketId).emit('kicked');
      rooms[roomId].peers = rooms[roomId].peers.filter(id => id !== targetPeerId);
      delete peerToSocket[targetPeerId];
      delete peerNames[targetPeerId]; // Удаляем имя
      io.in(roomId).emit('peer-left', targetPeerId);
      console.log(`Owner ${peerId} kicked ${targetPeerId} from room ${roomId}`);
      if (rooms[roomId].peers.length === 0) {
        delete rooms[roomId];
      }
    } else {
      console.log(`Target peer ${targetPeerId} not found`);
    }
  });

  socket.on('leave-room', (roomId, peerId) => {
    if (rooms[roomId]) {
      rooms[roomId].peers = rooms[roomId].peers.filter(id => id !== peerId);
      if (rooms[roomId].owner === peerId) {
        rooms[roomId].owner = rooms[roomId].peers[0] || null;
        if (rooms[roomId].owner) {
          console.log(`New owner for room ${roomId}: ${rooms[roomId].owner}`);
          io.in(roomId).emit('new-owner', rooms[roomId].owner);
        }
      }
      delete peerToSocket[peerId];
      delete peerNames[peerId]; // Удаляем имя
      socket.to(roomId).emit('peer-left', peerId);
      socket.leave(roomId);
      console.log(`${peerId} left room ${roomId}`);
      if (rooms[roomId].peers.length === 0) {
        delete rooms[roomId];
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const { roomId, peerId } = socket;
    if (roomId && rooms[roomId] && peerId) {
      rooms[roomId].peers = rooms[roomId].peers.filter(id => id !== peerId);
      if (rooms[roomId].owner === peerId) {
        rooms[roomId].owner = rooms[roomId].peers[0] || null;
        if (rooms[roomId].owner) {
          console.log(`New owner for room ${roomId}: ${rooms[roomId].owner}`);
          io.in(roomId).emit('new-owner', rooms[roomId].owner);
        }
      }
      delete peerToSocket[peerId];
      delete peerNames[peerId]; // Удаляем имя
      io.in(roomId).emit('peer-left', peerId);
      console.log(`${peerId} disconnected from room ${roomId}`);
      if (rooms[roomId].peers.length === 0) {
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