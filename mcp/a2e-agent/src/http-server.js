/*
 * http-server.js - HTTP/HTTPS server for AG-UI event communication
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * HTTP/HTTPS Server for AG-UI protocol events
 */
export class HttpServer {
  constructor(port, useHttps = false, debug = true) {
    this.port = port;
    this.useHttps = useHttps;
    this.debug = debug;
    this.server = null;
    this.clients = new Set();
    this.pendingToolResults = new Map();
    this.eventQueue = [];
  }

  /**
   * Generate self-signed certificate for HTTPS
   */
  _generateCertificate(certPath, keyPath) {
    logger.log("Generating self-signed HTTPS certificate...");

    try {
      const cmd = `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout "${keyPath}" -out "${certPath}" -days 365`;
      execSync(cmd, { stdio: "pipe" });
      logger.log("Certificate generated successfully");
    } catch (error) {
      throw new Error(
        "Failed to generate certificate. Please install OpenSSL:\n" +
        "  macOS: brew install openssl\n" +
        "  Linux: sudo apt-get install openssl\n" +
        "  Windows: https://slproweb.com/products/Win32OpenSSL.html"
      );
    }
  }

  /**
   * Start the HTTP/HTTPS server
   */
  async start() {
    return new Promise((resolve, reject) => {
      const requestHandler = (req, res) => {
        this._handleRequest(req, res);
      };

      if (this.useHttps) {
        const certPath = path.join(__dirname, "cert.pem");
        const keyPath = path.join(__dirname, "key.pem");

        // Auto-generate certificates if they don't exist
        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
          try {
            this._generateCertificate(certPath, keyPath);
          } catch (error) {
            reject(error);
            return;
          }
        }

        this.server = https.createServer({
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }, requestHandler);
      } else {
        this.server = http.createServer(requestHandler);
      }

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  async _handleRequest(req, res) {
    if (this.debug) {
      logger.log(`[HTTP] ${req.method} ${req.url}`);
    }

    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/events") {
      // SSE endpoint for streaming events to frontend
      this._handleEventStream(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/tool-result") {
      // Receive TOOL_CALL_RESULT from frontend
      await this._handleToolResult(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  }

  /**
   * Handle Server-Sent Events stream
   */
  _handleEventStream(req, res) {
    if (this.debug) {
      logger.log("[HTTP] SSE client connected");
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Add client to set
    const client = { req, res };
    this.clients.add(client);

    // Send queued events to new client
    this.eventQueue.forEach((event) => {
      this._writeSSE(res, event);
    });

    // Handle client disconnect
    req.on("close", () => {
      if (this.debug) {
        logger.log("[HTTP] SSE client disconnected");
      }
      this.clients.delete(client);
    });
  }

  /**
   * Handle tool result from frontend
   */
  async _handleToolResult(req, res) {
    const body = await this._readBody(req);

    if (this.debug) {
      logger.log("[HTTP] Received:", body);
    }

    try {
      const event = JSON.parse(body);

      if (event.type === "TOOL_CALL_RESULT") {
        const { tool_call_id, content } = event;

        if (this.debug) {
          logger.log(`[HTTP] Tool result for ${tool_call_id}:`, content);
        }

        // Resolve pending promise
        const pending = this.pendingToolResults.get(tool_call_id);
        if (pending) {
          pending.resolve(content);
          this.pendingToolResults.delete(tool_call_id);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));

    } catch (error) {
      if (this.debug) {
        logger.log("[HTTP] Error:", error.message);
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Read request body
   */
  _readBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
      req.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Send AG-UI event to all connected clients
   */
  async sendEvent(event) {
    if (this.debug) {
      logger.log("[HTTP] Sending event:", JSON.stringify(event));
    }

    // Add to queue (keep last 100 events for reconnecting clients)
    this.eventQueue.push(event);
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }

    // Send to all connected clients
    this.clients.forEach((client) => {
      this._writeSSE(client.res, event);
    });
  }

  /**
   * Write Server-Sent Event
   */
  _writeSSE(res, event) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * Wait for tool result from frontend
   */
  waitForToolResult(toolCallId, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingToolResults.delete(toolCallId);
        reject(new Error("Tool result timeout"));
      }, timeoutMs);

      this.pendingToolResults.set(toolCallId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject,
      });
    });
  }

  /**
   * Stop the HTTP/HTTPS server
   */
  async stop() {
    if (this.server) {
      // Close all SSE connections
      this.clients.forEach((client) => {
        client.res.end();
      });
      this.clients.clear();

      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * Restart the HTTP/HTTPS server
   */
  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * Change HTTPS mode and restart
   */
  async setHttps(enabled) {
    const wasRunning = this.server !== null;
    if (wasRunning) {
      await this.stop();
    }
    this.useHttps = enabled;
    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Set debug mode
   */
  setDebug(enabled) {
    this.debug = enabled;
    if (this.debug) {
      logger.log("[HTTP] Debug mode enabled");
    } else {
      logger.log("[HTTP] Debug mode disabled");
    }
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.server !== null,
      https: this.useHttps,
      debug: this.debug,
      port: this.port,
      clients: this.clients.size,
      protocol: this.useHttps ? "https" : "http",
      url: `${this.useHttps ? "https" : "http"}://localhost:${this.port}`,
    };
  }
}
