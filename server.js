// Simple relay proxy: exposes an OpenAI-compatible endpoint that Janitor
// (or any other OpenAI-compatible client) can call, and forwards requests
// to your OpenCode Go subscription on the backend.
//
// Setup:
//   npm init -y
//   npm install express node-fetch
//   node opencode-relay.js
//
// Then in Janitor, set the API URL to:  http://<your-host>:3000/v1
// and put your real OpenCode Go key in Janitor's API key field —
// this relay just forwards whatever Authorization header it receives,
// it doesn't store a key itself.

const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json({ limit: "10mb" }));

// --- CONFIG ---
const OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions";
const PORT = process.env.PORT || 3000;
// --------------

app.post("/v1/chat/completions", async (req, res) => {
  try {
    // Pass through whatever Authorization header the caller sent
    // (e.g. curl -H "Authorization: Bearer <key>", or Janitor's key field).
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: { message: "Missing Authorization header" } });
    }

    const body = { ...req.body };

    // DeepSeek V4 Flash's thinking mode requires reasoning_content to be
    // echoed back on assistant messages in multi-turn requests. Some
    // clients (like Janitor) won't know to include this field, so we
    // patch it in here if it's missing but a previous assistant message
    // has a 'reasoning' or similar field available.
    if (Array.isArray(body.messages)) {
      body.messages = body.messages.map((m) => {
        if (m.role === "assistant" && !m.reasoning_content) {
          return { ...m, reasoning_content: m.reasoning_content || "" };
        }
        return m;
      });
    }

    const upstream = await fetch(OPENCODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    // Stream support: if the client requested streaming, pipe it straight through.
    if (body.stream && upstream.body) {
      res.status(upstream.status);
      res.setHeader("Content-Type", "text/event-stream");
      upstream.body.pipe(res);
      return;
    }

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Relay error:", err);
    res.status(500).json({ error: { message: err.message } });
  }
});

// Optional: expose /v1/models so clients that check model availability first don't choke
app.get("/v1/models", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: { message: "Missing Authorization header" } });
    }
    const upstream = await fetch("https://opencode.ai/zen/v1/models", {
      headers: { Authorization: authHeader },
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`Relay listening on http://localhost:${PORT}`);
  console.log(`Point Janitor's API URL to http://<your-host>:${PORT}/v1`);
});
