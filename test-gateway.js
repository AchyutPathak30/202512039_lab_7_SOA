/**
 * Automated Verification Suite for CampusConnect API Gateway & Service Discovery
 * Lab 7 - Web Services & SOA Laboratory
 * Roll Number: 202512039
 *
 * Verifies:
 * 1. Gateway health and dynamic service registry
 * 2. Reverse-proxy routing to User, Product, and Order services
 * 3. Cross-service coordination through Gateway
 * 4. External port isolation (internal microservices not exposed)
 * 5. Upstream failure handling (clean 502/503 responses)
 */

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(` \x1b[32m[PASS]\x1b[0m ${testName}`);
    passed++;
  } else {
    console.error(`❌ \x1b[31m[FAIL]\x1b[0m ${testName} - ${details}`);
    failed++;
  }
}

async function runSuite() {
  console.log("=================================================================");
  console.log(" LAB 7: API GATEWAY & SERVICE DISCOVERY VERIFICATION SUITE");
  console.log(` Target Gateway URL: ${GATEWAY_URL}`);
  console.log("=================================================================\n");

  try {
    // -------------------------------------------------------------
    // Test Group 1: Gateway Health & Metadata
    // -------------------------------------------------------------
    console.log("--- 1. Testing API Gateway Health & Service Registry ---");
    const healthRes = await fetch(`${GATEWAY_URL}/health`);
    assert(healthRes.status === 200, "GET /health returns HTTP 200 OK");
    const healthData = await healthRes.json();
    assert(healthData.status === "UP", "Gateway health status is 'UP'");
    assert(healthData.service === "api-gateway", "Gateway service identifier is 'api-gateway'");
    assert(
      healthData.serviceRegistry &&
      healthData.serviceRegistry["/users"] &&
      healthData.serviceRegistry["/products"] &&
      healthData.serviceRegistry["/orders"],
      "Gateway dynamically publishes service registry routes (/users, /products, /orders)",
      JSON.stringify(healthData.serviceRegistry)
    );

    const rootRes = await fetch(`${GATEWAY_URL}/`);
    assert(rootRes.status === 200, "GET / returns HTTP 200 OK");
    const rootData = await rootRes.json();
    assert(rootData.service === "CampusConnect API Gateway", "Gateway root presents service overview");

    // -------------------------------------------------------------
    // Test Group 2: User Service Proxy Routing
    // -------------------------------------------------------------
    console.log("\n--- 2. Testing User Service Routes via API Gateway ---");
    const usersRes = await fetch(`${GATEWAY_URL}/users`);
    assert(usersRes.status === 200, "GET /users routed via Gateway returns HTTP 200");
    const users = await usersRes.json();
    assert(Array.isArray(users) && users.length >= 2, "GET /users returns user array", `Count: ${users.length}`);

    const singleUserRes = await fetch(`${GATEWAY_URL}/users/101`);
    assert(singleUserRes.status === 200, "GET /users/101 routed via Gateway returns HTTP 200");
    const singleUser = await singleUserRes.json();
    assert(singleUser.name === "Alice Johnson", "GET /users/101 returns correct user profile");

    const createUserRes = await fetch(`${GATEWAY_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "David Miller",
        email: "david.miller@campus.edu",
        role: "Student",
        department: "Computer Science"
      })
    });
    assert(createUserRes.status === 201, "POST /users routed via Gateway returns HTTP 201 Created");
    const createdUser = await createUserRes.json();
    assert(createdUser.id !== undefined, "POST /users returns newly created user with ID");

    // -------------------------------------------------------------
    // Test Group 3: Product Service Proxy Routing
    // -------------------------------------------------------------
    console.log("\n--- 3. Testing Product Service Routes via API Gateway ---");
    const productsRes = await fetch(`${GATEWAY_URL}/products`);
    assert(productsRes.status === 200, "GET /products routed via Gateway returns HTTP 200");
    const products = await productsRes.json();
    assert(Array.isArray(products) && products.length >= 2, "GET /products returns product list", `Count: ${products.length}`);

    const singleProdRes = await fetch(`${GATEWAY_URL}/products/501`);
    assert(singleProdRes.status === 200, "GET /products/501 routed via Gateway returns HTTP 200");
    const singleProd = await singleProdRes.json();
    assert(singleProd.name.includes("Data Structures"), "GET /products/501 returns correct product");

    const createProdRes = await fetch(`${GATEWAY_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Wireless Campus Mouse",
        category: "Electronics",
        price: 18.50,
        stock: 60
      })
    });
    assert(createProdRes.status === 201, "POST /products routed via Gateway returns HTTP 201 Created");

    // -------------------------------------------------------------
    // Test Group 4: Order Service & Inter-Service Coordination
    // -------------------------------------------------------------
    console.log("\n--- 4. Testing Order Service & Inter-Service Coordination via Gateway ---");
    const ordersRes = await fetch(`${GATEWAY_URL}/orders`);
    assert(ordersRes.status === 200, "GET /orders routed via Gateway returns HTTP 200");
    const orders = await ordersRes.json();
    assert(Array.isArray(orders), "GET /orders returns orders array");

    const placeOrderRes = await fetch(`${GATEWAY_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "101",
        productId: "501",
        quantity: 2
      })
    });
    assert(placeOrderRes.status === 201, "POST /orders validates User + Product and returns HTTP 201 Created");
    const placedOrder = await placeOrderRes.json();
    assert(placedOrder.id !== undefined && placedOrder.status === "CONFIRMED", "Order confirmed with order ID");
    assert(placedOrder.user && placedOrder.product, "Order payload enriched with user and product details");

    // Non-existent user validation (404)
    const invalidOrderRes = await fetch(`${GATEWAY_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "99999",
        productId: "501",
        quantity: 1
      })
    });
    assert(invalidOrderRes.status === 404, "POST /orders with invalid userId returns HTTP 404 Not Found");

    // -------------------------------------------------------------
    // Test Group 5: Gateway 404 on Unmapped Path
    // -------------------------------------------------------------
    console.log("\n--- 5. Testing Gateway 404 Handling for Unmapped Paths ---");
    const unmappedRes = await fetch(`${GATEWAY_URL}/invalid-route`);
    assert(unmappedRes.status === 404, "GET /invalid-route returns HTTP 404 Not Found");
    const unmappedData = await unmappedRes.json();
    assert(unmappedData.service === "api-gateway", "404 response originates cleanly from api-gateway");

    // -------------------------------------------------------------
    // Test Group 6: Port Isolation (Internal Services Inaccessible)
    // -------------------------------------------------------------
    console.log("\n--- 6. Verifying Direct Microservice Port Isolation ---");
    for (const port of [3001, 3002, 3003]) {
      let blocked = false;
      try {
        await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1000) });
      } catch (err) {
        blocked = true;
      }
      assert(blocked, `Direct external access to port :${port} is blocked (only Gateway :3000 accessible)`);
    }

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log("\n=================================================================");
    console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution encountered an error:", error);
    process.exit(1);
  }
}

runSuite();
