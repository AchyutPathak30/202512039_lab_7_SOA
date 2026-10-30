/**
 * Traffic Generator & Monitoring Validator for Lab 8
 * Generates API traffic across all microservices via the Kubernetes API Gateway
 * and observes Prometheus metrics changes.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:30080";
const REQUEST_COUNT = parseInt(process.env.REQUEST_COUNT, 10) || 50;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTraffic() {
  console.log("=================================================================");
  console.log(" LAB 8: KUBERNETES MONITORING TRAFFIC GENERATOR");
  console.log(` Target Gateway URL: ${GATEWAY_URL}`);
  console.log(` Request Count:      ${REQUEST_COUNT}`);
  console.log("=================================================================\n");

  const results = {
    total: 0,
    success2xx: 0,
    clientError4xx: 0,
    serverError5xx: 0
  };

  const startTime = Date.now();

  for (let i = 1; i <= REQUEST_COUNT; i++) {
    // 1. Health check traffic
    if (i % 5 === 0) {
      try {
        const res = await fetch(`${GATEWAY_URL}/health`);
        if (res.status >= 200 && res.status < 300) results.success2xx++;
        else results.serverError5xx++;
      } catch (e) {
        results.serverError5xx++;
      }
      results.total++;
    }

    // 2. Normal GET Users
    try {
      const res = await fetch(`${GATEWAY_URL}/users`);
      if (res.status >= 200 && res.status < 300) results.success2xx++;
      else results.serverError5xx++;
    } catch (e) {
      results.serverError5xx++;
    }
    results.total++;

    // 3. Normal GET Products
    try {
      const res = await fetch(`${GATEWAY_URL}/products`);
      if (res.status >= 200 && res.status < 300) results.success2xx++;
      else results.serverError5xx++;
    } catch (e) {
      results.serverError5xx++;
    }
    results.total++;

    // 4. Normal GET Orders
    try {
      const res = await fetch(`${GATEWAY_URL}/orders`);
      if (res.status >= 200 && res.status < 300) results.success2xx++;
      else results.serverError5xx++;
    } catch (e) {
      results.serverError5xx++;
    }
    results.total++;

    // 5. POST new order (inter-service communication test)
    if (i % 3 === 0) {
      try {
        const res = await fetch(`${GATEWAY_URL}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "101",
            productId: "501",
            quantity: 1
          })
        });
        if (res.status === 201) results.success2xx++;
        else results.serverError5xx++;
      } catch (e) {
        results.serverError5xx++;
      }
      results.total++;
    }

    // 6. Controlled invalid request (404 Not Found)
    if (i % 7 === 0) {
      try {
        const res = await fetch(`${GATEWAY_URL}/unmapped-endpoint-test`);
        if (res.status === 404) results.clientError4xx++;
      } catch (e) {
        results.serverError5xx++;
      }
      results.total++;
    }

    if (i % 10 === 0 || i === REQUEST_COUNT) {
      process.stdout.write(` Progress: ${i}/${REQUEST_COUNT} cycles sent (${results.total} total HTTP requests)\r`);
    }
    await sleep(50);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n\n=================================================================");
  console.log(" TRAFFIC GENERATION COMPLETE");
  console.log(` Total Requests Sent:   ${results.total}`);
  console.log(` Successful (2xx):      ${results.success2xx}`);
  console.log(` Client Errors (4xx):   ${results.clientError4xx}`);
  console.log(` Server Errors (5xx):   ${results.serverError5xx}`);
  console.log(` Total Duration:        ${durationSec}s`);
  console.log(` Effective Rate:        ${(results.total / durationSec).toFixed(1)} req/sec`);
  console.log("=================================================================");

  // Inspect Prometheus Metrics on Gateway
  try {
    const metricsRes = await fetch(`${GATEWAY_URL}/metrics`);
    if (metricsRes.ok) {
      const text = await metricsRes.text();
      console.log("\n--- Sample Scraped Metrics from Gateway /metrics ---");
      const sampleLines = text
        .split("\n")
        .filter((l) => l.startsWith("http_requests_total") || l.startsWith("campusconnect_gateway_process_cpu"))
        .slice(0, 10);
      console.log(sampleLines.join("\n"));
    }
  } catch (err) {
    console.log(` Note: Gateway metrics can also be queried directly at ${GATEWAY_URL}/metrics`);
  }
}

runTraffic();
