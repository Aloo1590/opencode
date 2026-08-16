import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const incomingBody = req.body;
    
    // Generate random UUIDs for each request to perfectly mimic the official CLI
    const sessionId = randomUUID();
    const projectId = randomUUID();
    const requestId = randomUUID();

    // Spoof the exact internal CLI headers that OpenCode Zen looks for
    let targetHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'opencode/latest/1.3.15/cli',
      'x-opencode-client': 'cli',
      'x-opencode-session': sessionId,
      'x-opencode-project': projectId,
      'x-opencode-request': requestId,
      'Accept': '*/*'
    };

    // Inject your OpenCode Zen API Key
    if (process.env.OPENCODE_API_KEY) {
      targetHeaders['Authorization'] = `Bearer ${process.env.OPENCODE_API_KEY}`;
    }

    // Forward the request to OpenCode Zen
    const fetchResponse = await fetch('https://opencode.ai/zen/v1/chat/completions', {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify(incomingBody)
    });

    fetchResponse.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });
    res.status(fetchResponse.status);

    if (fetchResponse.body) {
      Readable.fromWeb(fetchResponse.body).pipe(res);
    } else {
      res.end();
    }
    
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`OpenCode CLI-Spoofed Proxy listening on port ${port}`);
});
