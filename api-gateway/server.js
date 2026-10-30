/**
 * CampusConnect API Gateway & Service Discovery
 * Lab 7 - Web Services & SOA Laboratory
 * Roll Number: 202512039
 *
 * Single entry point for all client requests.
 * Routes traffic to User, Product, and Order microservices based on externalized config.
 * Handles centralized logging, health checks, and 502/503 error handling.
 */

const express = require("express");
const cors = require("cors");
const { createProxyMiddleware, fixRequestBody } = require("http-proxy-middleware");
const client = require("prom-client");
const config = require("./config");

// Initialize Prometheus Registry & Default Metrics
client.collectDefaultMetrics({ prefix: "campusconnect_gateway_" });

// Custom Prometheus Metrics
const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total count of HTTP requests handled by API Gateway",
  labelNames: ["method", "route", "status"]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Histogram of HTTP request durations in seconds through API Gateway",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const app = express();
const PORT = config.port;

// Enable CORS for all incoming client traffic
app.use(cors());

// Parse JSON bodies for gateway native routes (e.g. if any)
app.use(express.json());

// Centralized Request Logger and Prometheus Metrics recorder
app.use((req, res, next) => {
  req._startTime = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - req._startTime;
    const durationSec = durationMs / 1000;
    const target = req._targetService || "Gateway (Local)";
    const route = req.baseUrl || req.path || req.originalUrl.split("?")[0];
    
    // Record Prometheus metrics
    httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) });
    httpRequestDuration.observe({ method: req.method, route, status: String(res.statusCode) }, durationSec);

    console.log(
      `[API-GATEWAY] ${new Date().toISOString()} | ${req.method.padEnd(6)} ${req.originalUrl.padEnd(20)} -> ${target.padEnd(16)} | Status: ${res.statusCode} | ${durationMs}ms`
    );
  });
  next();
});

// Root Endpoint - API Gateway overview & routing summary
app.get("/", (req, res) => {
  res.status(200).json({
    service: "CampusConnect API Gateway",
    version: "1.0.0",
    port: PORT,
    timestamp: new Date().toISOString(),
    description: "Single entry point for microservices (User, Product, Order)",
    routingTable: config.getRoutingTable(),
    endpoints: {
      "GET /health": "Gateway health status & dynamic service registry",
      "GET /metrics": "Prometheus metric collection endpoint",
      "GET/POST/PUT/DELETE /users/*": "User Service reverse-proxy",
      "GET/POST/PUT/DELETE /products/*": "Product Service reverse-proxy",
      "GET/POST /orders/*": "Order Service reverse-proxy"
    }
  });
});

// Health check endpoint (reports gateway status and registered routes)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "api-gateway",
    version: "1.0.0",
    port: PORT,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    serviceRegistry: config.getRoutingTable()
  });
});

// Prometheus Metrics endpoint for scraping
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Register dynamic reverse-proxy routes from Service Registry Configuration
Object.values(config.services).forEach((service) => {
  console.log(`[SERVICE REGISTRY] Registering route ${service.prefix}/* -> ${service.name} (${service.url})`);

  const proxyMiddleware = createProxyMiddleware({
    target: service.url,
    changeOrigin: true,
    timeout: config.timeoutMs,
    proxyTimeout: config.timeoutMs,
    pathRewrite: (path, req) => req.originalUrl,
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Tag downstream requests with tracing headers
        proxyReq.setHeader("X-Forwarded-Host", req.headers.host || "");
        proxyReq.setHeader("X-Gateway-Request-Id", `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
        proxyReq.setHeader("X-Gateway-Timestamp", new Date().toISOString());

        // Ensure POST/PUT request bodies are properly streamed
        fixRequestBody(proxyReq, req);
      },
      error: (err, req, res) => {
        const duration = Date.now() - req._startTime;
        const statusCode = (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") ? 502 : 503;
        const statusText = statusCode === 502 ? "Bad Gateway" : "Service Unavailable";

        console.error(
          `[API-GATEWAY] UPSTREAM ERROR | ${req.method} ${req.originalUrl} -> ${service.name} (${service.url}) | Code: ${err.code || "UNKNOWN"} | Msg: ${err.message} | ${duration}ms`
        );

        if (!res.headersSent) {
          res.status(statusCode).json({
            timestamp: new Date().toISOString(),
            status: statusCode,
            error: statusText,
            service: "api-gateway",
            targetService: service.name,
            targetUrl: service.url,
            message: `Target service '${service.name}' is unreachable at ${service.url}.`,
            details: err.code || err.message
          });
        }
      }
    }
  });

  // Mount reverse-proxy at service prefix
  app.use(service.prefix, (req, res, next) => {
    req._targetService = service.name;
    req._targetUrl = service.url;
    proxyMiddleware(req, res, next);
  });
});

// Fallback 404 for unmapped gateway paths
app.use((req, res) => {
  res.status(404).json({
    timestamp: new Date().toISOString(),
    status: 404,
    error: "Not Found",
    service: "api-gateway",
    message: `Cannot ${req.method} ${req.originalUrl}. No route mapped in API Gateway.`,
    availablePrefixes: Object.values(config.services).map((s) => s.prefix)
  });
});

// Start Gateway
const server = app.listen(PORT, () => {
  console.log("===============================================================");
  console.log(` CAMPUSCONNECT API GATEWAY STARTED ON PORT ${PORT}`);
  console.log(` Service Discovery Mode: Configuration-Based (Environment Variables)`);
  console.log(" Active Routing Table:");
  for (const [prefix, route] of Object.entries(config.getRoutingTable())) {
    console.log(`   ${prefix.padEnd(12)} -> ${route.name.padEnd(16)} (${route.targetUrl})`);
  }
  console.log("===============================================================");
});

module.exports = { app, server };
