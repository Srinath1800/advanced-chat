const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'YOUR_SUPER_SECRET_STRING'; // change this for your deployment

// MongoDB setup
mongoose.connect('mongodb+srv://srinathraikunta5:cUFqjqSlwjY247xC@cluster0.vzaw76j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(error => console.error('MongoDB connection error:', error));

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,  // hashed
  createdAt: { type: Date, default: Date.now }
});
const MessageSchema = new mongoose.Schema({
  user: String,
  room: String,
  text: String,
  time: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

// Auth APIs
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).send({ error: "Username and password required." });
  const hash = await bcrypt.hash(password, 10);
  try {
    await User.create({ username, password: hash });
    res.send({ success: true });
  } catch (e) {
    res.status(400).send({ error: "Username taken." });
  }
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(400).send({ error: "Invalid username/password." });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
  res.send({ token, username });
});

// JWT auth middleware
function authMiddleware(req, res, next) {
  if (!req.headers.authorization) return res.status(401).send({ error: "No token" });
  try {
    req.user = jwt.verify(req.headers.authorization, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).send({ error: "Token invalid" });
  }
}

// Admin clear messages route
app.delete('/clear-messages/:room', authMiddleware, async (req, res) => {
  // Optionally add admin username check: if (req.user.username !== "admin") return res.status(403).send({error:"Admin only"});
  await Message.deleteMany({ room: req.params.room });
  io.to(req.params.room).emit('chatHistory', []);
  res.send({ success: true });
});

// Health check root
app.get('/', (req, res) => {
  res.send('Advanced Chat Server running!');
});

// Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const onlineUsers = {};

io.on('connection', socket => {
  socket.on('join', async ({ username, room, token }) => {
    try {
      jwt.verify(token, JWT_SECRET);
      socket.username = username;
      socket.room = room;
      socket.join(room);

      // Fetch last 50 messages for the room
      const messages = await Message.find({ room }).sort({ time: 1 }).limit(50);
      socket.emit('chatHistory', messages);

      // Track online users per room
      onlineUsers[room] = onlineUsers[room] || new Set();
      onlineUsers[room].add(username);
      io.to(room).emit('usersOnline', onlineUsers[room].size);
    } catch (e) {
      socket.emit('authError', "Unauthorized");
    }
  });

  socket.on('message', async ({ user, room, text }) => {
    const msg = { user, room, text, time: new Date() };
    await Message.create(msg);
    io.to(room).emit('message', msg);
  });

  socket.on('typing', ({room, user}) => {
    socket.broadcast.to(room).emit('typing', user);
  });
  socket.on('stopTyping', ({room, user}) => {
    socket.broadcast.to(room).emit('stopTyping', user);
  });

  socket.on('disconnect', () => {
    if (socket.room && socket.username) {
      onlineUsers[socket.room]?.delete(socket.username);
      io.to(socket.room).emit('usersOnline', onlineUsers[socket.room]?.size || 0);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server ready on port", PORT));
