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
// and put your real OpenCode Go key in Janitor's API key field.

const express = require("express");
const fetch = require("node-fetch");
const crypto = require("crypto"); // Built-in Node module, no need to install

const app = express();
app.use(express.json({ limit: "10mb" }));

// --- CONFIG ---
const OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions";
const PORT = process.env.PORT || 3000;
// --------------

// Generate persistent IDs for this proxy instance using built-in crypto
const SESSION_ID = crypto.randomUUID();
const PROJECT_ID = crypto.randomUUID();

// Middleware to add CORS headers for browser-based clients like Janitor
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: { message: "Missing Authorization header" } });
    }

    const body = { ...req.body };

    // DeepSeek V4 Flash's thinking mode requires reasoning_content to be
    // echoed back on assistant messages in multi-turn requests.
    if (Array.isArray(body.messages)) {
      body.messages = body.messages.map((m) => {
        if (m.role === "assistant" && !m.reasoning_content) {
          return { ...m, reasoning_content: m.reasoning_content || "" };
        }
        return m;
      });
    }

    // --- KEY CHANGE: Inject OpenCode CLI Headers ---
    const opencodeHeaders = {
      "Content-Type": "application/json",
      Authorization: authHeader,
      "User-Agent": "opencode/latest/1.3.15/cli",
      "x-opencode-client": "cli",
      "x-opencode-session": SESSION_ID,
      "x-opencode-project": PROJECT_ID,
      "x-opencode-request": crypto.randomUUID(), // Generate a new ID for each request
    };

    const upstream = await fetch(OPENCODE_URL, {
      method: "POST",
      headers: opencodeHeaders,
      body: JSON.stringify(body),
    });

    // Stream support
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

// Optional: expose /v1/models
app.get("/v1/models", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: { message: "Missing Authorization header" } });
    }
    
    // --- Inject headers for models endpoint too ---
    const opencodeHeaders = {
      Authorization: authHeader,
      "User-Agent": "opencode/latest/1.3.15/cli",
      "x-opencode-client": "cli",
      "x-opencode-session": SESSION_ID,
      "x-opencode-project": PROJECT_ID,
      "x-opencode-request": crypto.randomUUID(),
    };

    const upstream = await fetch("https://opencode.ai/zen/v1/models", {
      headers: opencodeHeaders,
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`Relay listening on http://localhost:${PORT}`);
});
