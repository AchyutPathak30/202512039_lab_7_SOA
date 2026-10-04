/**
 * Product Service - CampusConnect Microservices
 * Port: 3002
 * Manages product catalog, inventory, and pricing.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PRODUCT_SERVICE_PORT || process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// In-memory data store for Product Service (isolated database)
let products = [
  {
    id: "501",
    name: "Data Structures & Algorithms Textbook",
    category: "Books",
    price: 49.99,
    stock: 35
  },
  {
    id: "502",
    name: "Campus Hoodie (Navy Blue)",
    category: "Apparel",
    price: 39.50,
    stock: 100
  },
  {
    id: "503",
    name: "Scientific Calculator FX-991EX",
    category: "Stationery",
    price: 25.00,
    stock: 50
  }
];

// Request logger
app.use((req, res, next) => {
  console.log(`[PRODUCT-SERVICE] ${new Date().toISOString()} | ${req.method} ${req.originalUrl}`);
  next();
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Product Service",
    version: "1.0.0",
    port: PORT,
    endpoints: {
      "GET /health": "Health check",
      "GET /products": "Retrieve all products",
      "GET /products/:id": "Retrieve a single product by ID",
      "POST /products": "Create a new product",
      "PUT /products/:id": "Update an existing product",
      "DELETE /products/:id": "Delete a product"
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "product-service",
    timestamp: new Date().toISOString()
  });
});

// GET /products - Retrieve all products
app.get("/products", (req, res) => {
  res.status(200).json(products);
});

// GET /products/:id - Retrieve product by ID
app.get("/products/:id", (req, res) => {
  const product = products.find(p => String(p.id) === String(req.params.id));
  if (!product) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `Product with ID '${req.params.id}' not found.`
    });
  }
  res.status(200).json(product);
});

// POST /products - Create new product
app.post("/products", (req, res) => {
  const { name, category, price, stock } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Fields 'name' and 'price' are required."
    });
  }

  const nextId = String(products.length > 0 ? Math.max(...products.map(p => parseInt(p.id) || 500)) + 1 : 501);
  const newProduct = {
    id: req.body.id ? String(req.body.id) : nextId,
    name: name.trim(),
    category: category || "General",
    price: parseFloat(price) || 0.0,
    stock: parseInt(stock, 10) || 0
  };

  products.push(newProduct);
  res.status(201).json(newProduct);
});

// PUT /products/:id - Update existing product
app.put("/products/:id", (req, res) => {
  const index = products.findIndex(p => String(p.id) === String(req.params.id));
  if (index === -1) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `Product with ID '${req.params.id}' not found.`
    });
  }

  const { name, category, price, stock } = req.body;
  products[index] = {
    ...products[index],
    ...(name !== undefined && { name: name.trim() }),
    ...(category !== undefined && { category: category }),
    ...(price !== undefined && { price: parseFloat(price) }),
    ...(stock !== undefined && { stock: parseInt(stock, 10) })
  };

  res.status(200).json(products[index]);
});

// DELETE /products/:id - Delete product
app.delete("/products/:id", (req, res) => {
  const index = products.findIndex(p => String(p.id) === String(req.params.id));
  if (index === -1) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `Product with ID '${req.params.id}' not found.`
    });
  }

  const deletedProduct = products.splice(index, 1)[0];
  res.status(200).json({
    message: `Product with ID '${req.params.id}' deleted successfully.`,
    product: deletedProduct
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    timestamp: new Date().toISOString(),
    status: 404,
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.originalUrl} not found on Product Service.`
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
  console.error("[PRODUCT-SERVICE] Unhandled error:", err);
  res.status(500).json({
    timestamp: new Date().toISOString(),
    status: 500,
    error: "Internal Server Error",
    message: err.message
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`===============================================`);
  console.log(` [PRODUCT-SERVICE] listening on port ${PORT}`);
  console.log(` Health:   http://localhost:${PORT}/health`);
  console.log(` Products: http://localhost:${PORT}/products`);
  console.log(`===============================================`);
});

module.exports = app;
