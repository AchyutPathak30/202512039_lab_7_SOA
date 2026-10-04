/**
 * Service Registry & Gateway Configuration
 * Part B - Service Discovery (Configuration-Based)
 *
 * Microservice network locations are externalized into environment variables
 * and dynamically loaded at startup. Application routing logic references these
 * configuration values rather than literal hard-coded hostnames or ports.
 */

require("dotenv").config();

const config = {
  port: parseInt(process.env.GATEWAY_PORT || process.env.PORT, 10) || 3000,
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || process.env.PROXY_TIMEOUT_MS, 10) || 5000,
  services: {
    user: {
      name: "User Service",
      prefix: "/users",
      url: process.env.USER_SERVICE_URL || "http://user-service:3001",
      description: "Manages student and faculty profiles, roles, and identity"
    },
    product: {
      name: "Product Service",
      prefix: "/products",
      url: process.env.PRODUCT_SERVICE_URL || "http://product-service:3002",
      description: "Manages campus catalog, items, pricing, and inventory stock"
    },
    order: {
      name: "Order Service",
      prefix: "/orders",
      url: process.env.ORDER_SERVICE_URL || "http://order-service:3003",
      description: "Handles purchase order transactions and cross-service validation"
    }
  },
  getRoutingTable() {
    const table = {};
    for (const [key, svc] of Object.entries(this.services)) {
      table[svc.prefix] = {
        name: svc.name,
        targetUrl: svc.url
      };
    }
    return table;
  }
};

module.exports = config;
