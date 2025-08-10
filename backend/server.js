// backend/server.js

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const Message = require('./models/Message');

const app = express();
app.use(cors());
app.use(express.json());

// Mongo connection string loaded from environment variable for safety!
const mongoURL = process.env.MONGODB_URI || 
  'mongodb+srv://your-user:your-password@cluster0.mongodb.net/?retryWrites=true&w=majority';

mongoose.connect(mongoURL, {
    useNewUrlParser: true, useUnifiedTopology: true
  })
  .then(() => console.log('MongoDB connected'))
  .catch(error => console.error('MongoDB connection error:', error));

app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', socket => {
  // Send last 20 messages to the new client
  Message.find().sort({ time: 1 }).limit(20).then(messages => {
    socket.emit('chatHistory', messages);
  });
  // On client message send, save & broadcast
  socket.on('message', msg => {
    const m = new Message({
      user: msg.user,
      text: msg.text,
      time: new Date()
    });
    m.save().then(savedMsg => io.emit('message', savedMsg));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server ready on port", PORT));
