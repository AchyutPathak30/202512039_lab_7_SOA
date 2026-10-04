/**
 * User Service - CampusConnect Microservices
 * Port: 3001
 * Manages user accounts, profiles, and roles.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.USER_SERVICE_PORT || process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory data store for User Service (isolated database)
let users = [
  {
    id: "101",
    name: "Alice Johnson",
    email: "alice.johnson@campus.edu",
    role: "Student",
    department: "Computer Science"
  },
  {
    id: "102",
    name: "Bob Smith",
    email: "bob.smith@campus.edu",
    role: "Student",
    department: "Electrical Engineering"
  },
  {
    id: "103",
    name: "Prof. Charles Xavier",
    email: "charles.xavier@campus.edu",
    role: "Faculty",
    department: "Computer Science"
  }
];

// Request logger
app.use((req, res, next) => {
  console.log(`[USER-SERVICE] ${new Date().toISOString()} | ${req.method} ${req.originalUrl}`);
  next();
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "User Service",
    version: "1.0.0",
    port: PORT,
    endpoints: {
      "GET /health": "Health check",
      "GET /users": "Retrieve all users",
      "GET /users/:id": "Retrieve a single user by ID",
      "POST /users": "Create a new user",
      "PUT /users/:id": "Update an existing user",
      "DELETE /users/:id": "Delete a user"
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "user-service",
    timestamp: new Date().toISOString()
  });
});

// GET /users - Retrieve all users
app.get("/users", (req, res) => {
  res.status(200).json(users);
});

// GET /users/:id - Retrieve user by ID
app.get("/users/:id", (req, res) => {
  const user = users.find(u => String(u.id) === String(req.params.id));
  if (!user) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `User with ID '${req.params.id}' not found.`
    });
  }
  res.status(200).json(user);
});

// POST /users - Create new user
app.post("/users", (req, res) => {
  const { name, email, role, department } = req.body;
  if (!name || !email) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Fields 'name' and 'email' are required."
    });
  }

  // Generate unique ID
  const nextId = String(users.length > 0 ? Math.max(...users.map(u => parseInt(u.id) || 100)) + 1 : 101);
  const newUser = {
    id: req.body.id ? String(req.body.id) : nextId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role || "Student",
    department: department || "General"
  };

  users.push(newUser);
  res.status(201).json(newUser);
});

// PUT /users/:id - Update existing user
app.put("/users/:id", (req, res) => {
  const index = users.findIndex(u => String(u.id) === String(req.params.id));
  if (index === -1) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `User with ID '${req.params.id}' not found.`
    });
  }

  const { name, email, role, department } = req.body;
  users[index] = {
    ...users[index],
    ...(name !== undefined && { name: name.trim() }),
    ...(email !== undefined && { email: email.trim().toLowerCase() }),
    ...(role !== undefined && { role: role }),
    ...(department !== undefined && { department: department })
  };

  res.status(200).json(users[index]);
});

// DELETE /users/:id - Delete user
app.delete("/users/:id", (req, res) => {
  const index = users.findIndex(u => String(u.id) === String(req.params.id));
  if (index === -1) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `User with ID '${req.params.id}' not found.`
    });
  }

  const deletedUser = users.splice(index, 1)[0];
  res.status(200).json({
    message: `User with ID '${req.params.id}' deleted successfully.`,
    user: deletedUser
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    timestamp: new Date().toISOString(),
    status: 404,
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.originalUrl} not found on User Service.`
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
  console.error("[USER-SERVICE] Unhandled error:", err);
  res.status(500).json({
    timestamp: new Date().toISOString(),
    status: 500,
    error: "Internal Server Error",
    message: err.message
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`===============================================`);
  console.log(` [USER-SERVICE] listening on port ${PORT}`);
  console.log(` Health: http://localhost:${PORT}/health`);
  console.log(` Users:  http://localhost:${PORT}/users`);
  console.log(`===============================================`);
});

module.exports = app;
