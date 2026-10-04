/**
 * Order Service - CampusConnect Microservices
 * Port: 3003
 * Coordinates order placement, cross-validates with User and Product services via REST APIs.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT || process.env.PORT || 3003;

// Configurable service URLs (defaults to Docker service names, fallbacks to localhost for local testing)
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3001";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://localhost:3002";
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 3500;

app.use(cors());
app.use(express.json());

// In-memory data store for Order Service (isolated database)
let orders = [
  {
    id: "ord-1001",
    userId: "101",
    productId: "501",
    quantity: 1,
    totalPrice: 49.99,
    status: "CONFIRMED",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    user: {
      id: "101",
      name: "Alice Johnson",
      email: "alice.johnson@campus.edu"
    },
    product: {
      id: "501",
      name: "Data Structures & Algorithms Textbook",
      price: 49.99
    }
  }
];

// Request logger
app.use((req, res, next) => {
  console.log(`[ORDER-SERVICE] ${new Date().toISOString()} | ${req.method} ${req.originalUrl}`);
  next();
});

// Helper for inter-service communication with timeout & controlled error mapping
async function fetchService(url, serviceName) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });
    clearTimeout(timer);

    if (response.status === 404) {
      const err = new Error(`${serviceName} resource not found`);
      err.statusCode = 404;
      err.service = serviceName;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(`${serviceName} returned error HTTP ${response.status}`);
      err.statusCode = 503;
      err.service = serviceName;
      throw err;
    }

    return await response.json();
  } catch (error) {
    if (error.statusCode === 404) {
      throw error;
    }

    // Inter-service network / timeout / unavailable failure
    console.error(`[ORDER-SERVICE -> ${serviceName}] Communication failure at ${url}: ${error.message}`);
    const serviceError = new Error(`${serviceName} is currently unavailable.`);
    serviceError.statusCode = 503;
    serviceError.service = serviceName;
    serviceError.targetUrl = url;
    serviceError.cause = error.message;
    throw serviceError;
  }
}

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Order Service",
    version: "1.0.0",
    port: PORT,
    dependencies: {
      userServiceUrl: USER_SERVICE_URL,
      productServiceUrl: PRODUCT_SERVICE_URL
    },
    endpoints: {
      "GET /health": "Health check",
      "GET /orders": "Retrieve all orders",
      "GET /orders/:id": "Retrieve a single order by ID",
      "POST /orders": "Create a new order (validates user & product via REST APIs)"
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "order-service",
    dependencies: {
      userServiceUrl: USER_SERVICE_URL,
      productServiceUrl: PRODUCT_SERVICE_URL
    },
    timestamp: new Date().toISOString()
  });
});

// GET /orders - Retrieve all orders
app.get("/orders", (req, res) => {
  res.status(200).json(orders);
});

// GET /orders/:id - Retrieve order by ID
app.get("/orders/:id", (req, res) => {
  const order = orders.find(o => String(o.id) === String(req.params.id));
  if (!order) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `Order with ID '${req.params.id}' not found.`
    });
  }
  res.status(200).json(order);
});

// POST /orders - Create order (inter-service communication to User and Product services)
app.post("/orders", async (req, res) => {
  const { userId, productId, quantity } = req.body;

  // Basic validation
  if (!userId || !productId) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Both 'userId' and 'productId' are required to place an order."
    });
  }

  const orderQty = parseInt(quantity, 10) || 1;
  if (orderQty <= 0) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Order 'quantity' must be greater than zero."
    });
  }

  let user = null;
  let product = null;

  // 1. Inter-service call: Order Service -> User Service
  const userUrl = `${USER_SERVICE_URL}/users/${userId}`;
  console.log(`[ORDER-SERVICE] Validating user via: GET ${userUrl}`);
  try {
    user = await fetchService(userUrl, "User Service");
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        timestamp: new Date().toISOString(),
        status: 404,
        error: "Not Found",
        message: `User with ID '${userId}' not found. Cannot place order for non-existent user.`
      });
    }
    // Controlled 503 Error Response
    return res.status(503).json({
      timestamp: new Date().toISOString(),
      status: 503,
      error: "Service Unavailable",
      message: "User Service is currently unavailable. Order could not be validated.",
      targetService: "User Service",
      targetUrl: userUrl,
      details: error.cause || error.message
    });
  }

  // 2. Inter-service call: Order Service -> Product Service
  const productUrl = `${PRODUCT_SERVICE_URL}/products/${productId}`;
  console.log(`[ORDER-SERVICE] Validating product via: GET ${productUrl}`);
  try {
    product = await fetchService(productUrl, "Product Service");
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        timestamp: new Date().toISOString(),
        status: 404,
        error: "Not Found",
        message: `Product with ID '${productId}' not found. Cannot place order for non-existent product.`
      });
    }
    // Controlled 503 Error Response
    return res.status(503).json({
      timestamp: new Date().toISOString(),
      status: 503,
      error: "Service Unavailable",
      message: "Product Service is currently unavailable. Order could not be validated.",
      targetService: "Product Service",
      targetUrl: productUrl,
      details: error.cause || error.message
    });
  }

  // 3. Compute totals and assemble order
  const unitPrice = parseFloat(product.price) || 0.0;
  const totalPrice = parseFloat((unitPrice * orderQty).toFixed(2));

  const nextOrderId = `ord-${orders.length + 1001}`;
  const newOrder = {
    id: req.body.id || nextOrderId,
    userId: String(userId),
    productId: String(productId),
    quantity: orderQty,
    totalPrice: totalPrice,
    status: "CONFIRMED",
    createdAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department || undefined
    },
    product: {
      id: product.id,
      name: product.name,
      price: unitPrice,
      category: product.category || undefined
    }
  };

  orders.push(newOrder);
  console.log(`[ORDER-SERVICE] Order ${newOrder.id} created successfully for User ${user.id} (${user.name}) and Product ${product.id} (${product.name}).`);

  return res.status(201).json(newOrder);
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    timestamp: new Date().toISOString(),
    status: 404,
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.originalUrl} not found on Order Service.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Malformed JSON payload in request body."
    });
  }
  console.error("[ORDER-SERVICE] Unhandled error:", err);
  res.status(500).json({
    timestamp: new Date().toISOString(),
    status: 500,
    error: "Internal Server Error",
    message: err.message
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`===============================================`);
  console.log(` [ORDER-SERVICE] listening on port ${PORT}`);
  console.log(` Health:   http://localhost:${PORT}/health`);
  console.log(` Orders:   http://localhost:${PORT}/orders`);
  console.log(` Target User Service URL:    ${USER_SERVICE_URL}`);
  console.log(` Target Product Service URL: ${PRODUCT_SERVICE_URL}`);
  console.log(`===============================================`);
});

module.exports = app;
