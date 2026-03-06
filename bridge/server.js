/* -- Mirmi Bridge Server v2 ------------------------------------ */
/* Express API bridge between Chrome extension and Groq/Telegram  */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3131;
const MIRMI_API_KEY = process.env.MIRMI_API_KEY || 'mirmi-dev-key-2026';

// -- Groq client (OpenAI-compatible) ---------------------------
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

// -- Mirmi system prompt ----------------------------------------
const SYSTEM_PROMPT = `You are Mirmi, an AI assistant and digital familiar for the xix3D team.
You are helpful, direct, and have a personality. You're the glue connecting
all xix3D products. Be concise - this is a chat interface, not an essay.
Never use em dashes. Have opinions. Skip filler phrases.`;

// -- In-memory message store (Telegram sync) --------------------
const messages = [];
let sseClients = [];

// -- In-memory session store ------------------------------------
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [] });
  }
  return sessions.get(sessionId);
}

// -- Middleware --------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Auth check
function authMiddleware(req, res, next) {
  const key = req.headers['x-mirmi-key'] || req.query.key;
  if (key !== MIRMI_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// -- Routes -----------------------------------------------------

// POST /api/chat
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId required' });
  }

  const session = getSession(sessionId);

  // Add user message to history
  session.messages.push({
    role: 'user',
    content: message,
    ts: Date.now()
  });

  try {
    // Build messages array for Groq (OpenAI format)
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...session.messages.map(m => ({
        role: m.role === 'mirmi' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      messages: apiMessages
    });

    const reply = response.choices[0].message.content;

    // Determine mood from response
    let mood = 'idle';
    if (reply.includes('?')) mood = 'idle';

    // Store assistant response
    session.messages.push({
      role: 'mirmi',
      content: reply,
      ts: Date.now()
    });

    res.json({ reply, mood });
  } catch (err) {
    console.error('Groq API error:', err.message);
    res.status(500).json({ error: 'Failed to get response from Mirmi brain' });
  }
});

// GET /api/history
app.get('/api/history', authMiddleware, (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  const session = getSession(sessionId);
  res.json({ messages: session.messages });
});

// POST /api/speak -- ElevenLabs TTS
app.post('/api/speak', authMiddleware, async (req, res) => {
  const { text, sessionId } = req.body;

  if (!text || !sessionId) {
    return res.status(400).json({ error: 'text and sessionId required' });
  }

  try {
    const ttsRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/4oY1IDPyl98gaYZGim8n/stream', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('ElevenLabs error:', ttsRes.status, errText);
      return res.status(502).json({ error: 'TTS failed' });
    }

    res.set('Content-Type', 'audio/mpeg');
    const reader = ttsRes.body.getReader();
    const push = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        res.write(value);
      }
    };
    await push();
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS request failed' });
  }
});

// -- Telegram Real-Time Messaging --------------------------------

// POST /api/message -- ingest a Telegram message
app.post('/api/message', authMiddleware, (req, res) => {
  const { id, from, text, timestamp, chatId, replyTo, conversationId } = req.body;

  if (!id || !from || !text || !timestamp || !chatId) {
    return res.status(400).json({ error: 'id, from, text, timestamp, chatId required' });
  }

  const msg = { id, from, text, timestamp, chatId };
  if (replyTo) msg.replyTo = replyTo;
  if (conversationId) msg.conversationId = conversationId;

  messages.push(msg);
  if (messages.length > 100) messages.splice(0, messages.length - 100);

  // Broadcast to all SSE clients
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  sseClients.forEach(client => client.write(payload));

  res.json({ ok: true });
});

// GET /api/messages -- fetch messages since timestamp
app.get('/api/messages', authMiddleware, (req, res) => {
  const since = Number(req.query.since) || 0;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const conversationId = req.query.conversationId;

  let filtered = messages.filter(m => m.timestamp > since);
  if (conversationId) filtered = filtered.filter(m => m.conversationId === conversationId);
  filtered = filtered.slice(-limit);
  res.json({ messages: filtered });
});

// GET /api/messages/stream -- Server-Sent Events
app.get('/api/messages/stream', authMiddleware, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();

  sseClients.push(res);

  // Keep-alive ping every 25s
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// POST /api/upload-image — forward image to Telegram
app.post('/api/upload-image', authMiddleware, async (req, res) => {
  const { dataUrl, fileName, sessionId } = req.body;

  if (!dataUrl) {
    return res.status(400).json({ error: 'dataUrl required' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const threadId = process.env.TELEGRAM_THREAD_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Telegram not configured' });
  }

  try {
    // Extract base64 data
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine mime type
    const mimeMatch = dataUrl.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mimeType.split('/')[1] || 'png';
    const name = fileName || ('image.' + ext);

    // Build multipart form data manually
    const boundary = '----MirmiBoundary' + Date.now();
    const parts = [];

    // chat_id
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}`);

    // message_thread_id
    if (threadId) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${threadId}`);
    }

    // photo file
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${name}"\r\nContent-Type: ${mimeType}\r\n\r\n`);

    const header = Buffer.from(parts.join('\r\n') + '\r\n', 'utf-8');
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([header, buffer, footer]);

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString()
      },
      body: body
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error('Telegram sendPhoto error:', tgData);
      return res.status(502).json({ error: 'Telegram upload failed', detail: tgData.description });
    }

    // Try to get file URL
    let url = '';
    if (tgData.result && tgData.result.photo && tgData.result.photo.length > 0) {
      const largest = tgData.result.photo[tgData.result.photo.length - 1];
      const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${largest.file_id}`);
      const fileData = await fileRes.json();
      if (fileData.ok && fileData.result.file_path) {
        url = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
      }
    }

    res.json({ ok: true, url });
  } catch (err) {
    console.error('Upload image error:', err.message);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// GET /api/conversations — hardcoded conversation list
app.get('/api/conversations', authMiddleware, (req, res) => {
  res.json({
    conversations: [
      { id: 'group', name: 'Mirmi Group', icon: 'M', lastMessage: '', unread: 0 },
      { id: 'dm', name: 'Mirmi DM', icon: 'M', lastMessage: '', unread: 0 }
    ]
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'mirmi-bridge' });
});

// -- NEW: POST /api/upload-image --------------------------------
app.post('/api/upload-image', authMiddleware, async (req, res) => {
  const { dataUrl, fileName } = req.body;

  if (!dataUrl) {
    return res.status(400).json({ error: 'dataUrl required' });
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const TELEGRAM_TOPIC_ID = process.env.TELEGRAM_TOPIC_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: 'Telegram bot not configured' });
  }

  try {
    // Extract base64 data from data URL
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid dataUrl format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine file extension
    const ext = mimeType.split('/')[1] || 'jpg';
    const finalName = fileName || ('image.' + ext);

    // Build multipart form data manually
    const boundary = '----MirmiBoundary' + Date.now();
    const parts = [];

    // chat_id
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${TELEGRAM_CHAT_ID}`);

    // message_thread_id (topic)
    if (TELEGRAM_TOPIC_ID) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${parseInt(TELEGRAM_TOPIC_ID)}`);
    }

    // photo file
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${finalName}"\r\nContent-Type: ${mimeType}\r\n\r\n`);

    const header = Buffer.from(parts.join('\r\n') + '\r\n', 'utf-8');
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([header, buffer, footer]);

    const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString()
      },
      body: body
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error('Telegram sendPhoto error:', tgData);
      return res.status(502).json({ error: 'Telegram upload failed: ' + (tgData.description || 'unknown') });
    }

    res.json({ ok: true, telegramResult: tgData.result });
  } catch (err) {
    console.error('Upload image error:', err.message);
    res.status(500).json({ error: 'Image upload failed: ' + err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'mirmi-bridge', version: '2.0.0' });
});

// -- Start ------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mirmi bridge v2 running on port ${PORT}`);
  });
}

module.exports = app;
