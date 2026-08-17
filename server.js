// Generate these ONCE per worker isolate (Mimics a stable, long CLI session)
const staticSessionId = crypto.randomUUID();
const staticProjectId = crypto.randomUUID();

export default {
  async fetch(request, env) {
    // 1. Handle CORS for Janitor AI
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const incomingBody = await request.json();
      
      // 2. Generate a new request ID for this specific message
      const requestId = crypto.randomUUID();

      let targetHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'opencode/latest/1.3.15/cli',
        'x-opencode-client': 'cli',
        'x-opencode-session': staticSessionId,
        'x-opencode-project': staticProjectId,
        'x-opencode-request': requestId,
        'Accept': '*/*'
      };

      // 3. Dynamic Auth: Use Janitor AI's API key field, or fallback to Cloudflare Secret
      const incomingAuth = request.headers.get('authorization');
      
      if (incomingAuth && incomingAuth.trim() !== '' && !incomingAuth.includes('dummy')) {
        targetHeaders['Authorization'] = incomingAuth;
      } else if (env.OPENCODE_API_KEY) {
        targetHeaders['Authorization'] = `Bearer ${env.OPENCODE_API_KEY}`;
      }

      // 4. Forward to OpenCode Zen
      const fetchResponse = await fetch('https://opencode.ai/zen/v1/chat/completions', {
        method: 'POST',
        headers: targetHeaders,
        body: JSON.stringify(incomingBody)
      });

      // 5. Stream response back to Janitor AI
      const responseHeaders = new Headers(fetchResponse.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(fetchResponse.body, {
        status: fetchResponse.status,
        headers: responseHeaders
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
};
