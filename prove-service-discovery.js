/**
 * Part B: Configuration-Based Service Discovery Demonstration
 * Proves that microservice locations can be reconfigured dynamically via environment variables
 * WITHOUT touching any application code in the API Gateway.
 */

const http = require("http");
const { fork } = require("child_process");
const path = require("path");

async function proveServiceDiscovery() {
  console.log("=================================================================");
  console.log(" PART B: CONFIGURATION-BASED SERVICE DISCOVERY DEMONSTRATION");
  console.log("=================================================================\n");

  // 1. Spin up an alternative mock user service using native Node.js HTTP on an arbitrary port (e.g. 4001)
  const MOCK_PORT = 4001;
  const mockServer = http.createServer((req, res) => {
    if (req.url === "/users") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          source: "MOCK_USER_SERVICE_INSTANCE_V2",
          discoveredAtPort: MOCK_PORT,
          message: "Traffic successfully received at new discovered endpoint!",
          users: [{ id: "901", name: "Dynamic Config User", role: "Researcher" }]
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => mockServer.listen(MOCK_PORT, resolve));
  console.log(`[1] Alternative User Service instance running on port ${MOCK_PORT}`);

  // 2. Start the API Gateway on port 3999 with environment override: USER_SERVICE_URL pointing to port 4001
  console.log(`[2] Starting API Gateway on port 3999 with environment override:`);
  console.log(`    USER_SERVICE_URL=http://localhost:${MOCK_PORT}`);
  console.log(`    (NO GATEWAY CODE CHANGES - PURE CONFIGURATION VIA ENV VAR)\n`);

  const gatewayEnv = {
    ...process.env,
    PORT: "3999",
    GATEWAY_PORT: "3999",
    USER_SERVICE_URL: `http://localhost:${MOCK_PORT}`,
    NODE_PATH: path.join(__dirname, "api-gateway", "node_modules")
  };

  const gatewayProcess = fork(path.join(__dirname, "api-gateway", "server.js"), [], {
    env: gatewayEnv,
    cwd: path.join(__dirname, "api-gateway"),
    stdio: "pipe"
  });

  gatewayProcess.stdout.on("data", (data) => {
    const text = data.toString().trim();
    if (text.includes("CAMPUSCONNECT API GATEWAY") || text.includes("/users")) {
      console.log(`   [GATEWAY-LOG] ${text}`);
    }
  });

  gatewayProcess.stderr.on("data", (data) => {
    console.error(`   [GATEWAY-STDERR] ${data.toString()}`);
  });

  // Give gateway 2 seconds to initialize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // 3. Query Gateway Health to verify updated routing table
    console.log("\n[3] Verifying Dynamic Service Registry in Gateway Health (/health):");
    const healthRes = await fetch("http://127.0.0.1:3999/health");
    const healthData = await healthRes.json();
    console.log("   Health Response Service Registry:", JSON.stringify(healthData.serviceRegistry, null, 2));

    const targetUrl = healthData.serviceRegistry["/users"]?.targetUrl;
    if (targetUrl === `http://localhost:${MOCK_PORT}`) {
      console.log(`    [PASS] Gateway routing table reflects new target location (${targetUrl}) from environment configuration!`);
    } else {
      console.error(`   ❌ [FAIL] Routing table did not update! (Expected: http://localhost:${MOCK_PORT}, Got: ${targetUrl})`);
    }

    // 4. Send request through Gateway to verify traffic is dispatched to the new location
    console.log("\n[4] Querying GET /users through API Gateway (http://127.0.0.1:3999/users):");
    const usersRes = await fetch("http://127.0.0.1:3999/users");
    const usersData = await usersRes.json();
    console.log("   Received Response:", JSON.stringify(usersData, null, 2));

    if (usersData.source === "MOCK_USER_SERVICE_INSTANCE_V2" && usersData.discoveredAtPort === MOCK_PORT) {
      console.log("\n=================================================================");
      console.log(" [SUCCESS] CONFIGURATION-BASED SERVICE DISCOVERY PROVEN!");
      console.log(" Traffic successfully routed to new location strictly via configuration.");
      console.log("=================================================================\n");
    } else {
      console.error("❌ [FAIL] Traffic was not routed to the new location.");
    }
  } catch (err) {
    console.error("Error during demonstration:", err);
  } finally {
    gatewayProcess.kill();
    mockServer.close();
  }
}

proveServiceDiscovery();
