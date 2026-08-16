import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for Janitor AI browser requests
app.use(cors());
// 50mb limit to handle massive context sizes and chat histories
app.use(express.json({ limit: '50mb' }));

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const incomingBody = req.body;
    
    // Prepare headers, spoofing a CLI client to bypass browser CORS blocks
    let targetHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'curl/8.5.0',
      'Accept': '*/*'
    };

    // Inject your OpenCode Zen API Key
    // You MUST add OPENCODE_API_KEY to your Render Environment Variables for Zen to work
    if (process.env.OPENCODE_API_KEY) {
      targetHeaders['Authorization'] = `Bearer ${process.env.OPENCODE_API_KEY}`;
    }

    // Forward the exact payload directly to the OpenCode Zen endpoint
    const fetchResponse = await fetch('https://opencode.ai/zen/v1/chat/completions', {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify(incomingBody)
    });

    // Copy OpenCode's response headers back to the client
    fetchResponse.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });
    res.status(fetchResponse.status);

    // Stream the response chunks directly to Janitor AI
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
  console.log(`OpenCode Zen Proxy listening on port ${port}`);
});
