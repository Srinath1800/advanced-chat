
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// Replace 'YOUR_MONGO_URI' with your Atlas connection string below or use the env variable:
mongoose.connect(process.env.MONGODB_URI || 'YOUR_MONGO_URI', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch((e) => console.error(e));

const MessageSchema = new mongoose.Schema({
  user: String,
  text: String,
  time: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on('connection', socket => {
  Message.find().sort({ time: 1 }).limit(20).then(messages => {
    socket.emit('chatHistory', messages);
  });
  socket.on('message', msg => {
    const m = new Message(msg);
    m.save().then(() => io.emit('message', msg));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server ready on port", PORT));
