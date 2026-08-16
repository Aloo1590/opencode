import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// OPTIONAL NICKNAMES: Add or remove your own shortcuts here.
// Anything NOT listed here will be passed directly as typed.
const CUSTOM_ALIASES = {
  // "flash": "opencode/deepseek-v4-flash-free",
  // "glm": "z-ai/glm-5.2",
};

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const incomingBody = req.body;
    let modelName = incomingBody.model || '';

    // Check optional aliases first
    if (CUSTOM_ALIASES[modelName.toLowerCase()]) {
      modelName = CUSTOM_ALIASES[modelName.toLowerCase()];
    }

    let targetUrl = '';
    let targetHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'curl/8.5.0',
      'Accept': '*/*'
    };

    // 1. ROUTE TO OPENCODE
    if (modelName.startsWith('opencode/') || modelName.endsWith('-free')) {
      targetUrl = 'https://opencode.ai/zen/v1/chat/completions';
      // Strip 'opencode/' prefix if entered
      modelName = modelName.replace(/^opencode\//i, '');

      if (process.env.OPENCODE_API_KEY) {
        targetHeaders['Authorization'] = `Bearer ${process.env.OPENCODE_API_KEY}`;
      }
    } 
    // 2. ROUTE TO NVIDIA NIM
    else {
      targetUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
      targetHeaders['Authorization'] = `Bearer ${process.env.NVIDIA_API_KEY}`;
    }

    const proxyBody = {
      ...incomingBody,
      model: modelName
    };

    const fetchResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify(proxyBody)
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
  console.log(`Pass-through Proxy running on port ${port}`);
});
