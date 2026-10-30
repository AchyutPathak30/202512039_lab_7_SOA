# Lab 8 – Kubernetes Orchestration, CI/CD with GitHub Actions & Monitoring with Prometheus and Grafana

**Course:** Web Services & SOA Laboratory • Lab 8  
**Student Roll Number:** 202512039  
**Application:** CampusConnect Microservices Platform  
**Architecture Continuity:** Extends the Lab 7 API Gateway + User/Product/Order Microservices Architecture  
**Key Technologies:** Kubernetes (kubectl, Deployments, Services, ConfigMaps, Probes), GitHub Actions CI/CD, Prometheus, Grafana, Docker, Node.js 22, Express.js  

---

## 1. Executive Summary & Objective

In **Lab 7**, the CampusConnect backend was structured into a unified architecture featuring:
- A dedicated **API Gateway** acting as the single reverse-proxy entry point (`:3000`).
- **Configuration-based service discovery** reading externalized service locations dynamically.
- Strict internal port isolation (`user-service:3001`, `product-service:3002`, `order-service:3003`).
- Cross-service orchestration and external MongoDB Atlas database connectivity.

**Lab 8 elevates this architecture to a practical production-grade DevOps workflow:**
1. **Part A – Kubernetes Deployment & Orchestration:**
   - Containerized microservices deployed as Kubernetes Deployments and Services inside an isolated `lab8` namespace.
   - Declarative manifests created in `k8s/` managing Pod replicas, labels, selectors, and ports.
   - HTTP liveness (`/health`) and readiness (`/health`) probes configured for zero-downtime startups and automated failure recovery.
   - Externalized environment configuration via Kubernetes `ConfigMap` (`campusconnect-config`).
   - Cluster-internal service discovery using stable DNS names (`http://user-service:3001`, `http://product-service:3002`, `http://order-service:3003`).
   - Client-facing ingress exposed through the API Gateway via `NodePort: 30080`.
   - Demonstration of horizontal pod scaling (scaling `user-service` to 3 replicas) and self-healing (deleting a pod and observing automated recreation).
2. **Part B – GitHub Actions CI/CD Pipeline:**
   - Automated workflow in `.github/workflows/ci.yml` triggered on push and pull requests.
   - Automated checkout, Node.js dependency installation, and server syntax checks across all services.
   - Automated Docker multi-service image builds tagged with traceable Git commit SHAs (`${{ github.sha }}`) and registry publishing to GitHub Container Registry (`ghcr.io`).
   - Declarative Kubernetes manifest dry-run syntax validation.
3. **Part C – Monitoring & Observability with Prometheus & Grafana:**
   - Application-level instrumentation using `prom-client` exposing `/metrics` across all microservices.
   - Standard Prometheus metrics collection: `http_requests_total`, `http_request_duration_seconds`, process CPU/memory, and `up`.
   - Prometheus deployed in Kubernetes scraping the Gateway and microservice endpoints every 5 seconds.
   - Grafana monitoring dashboard visualizing service availability (`up`), request rates (`rate(http_requests_total[5m])`), status distribution, and latency.
   - Synthetic traffic generation using `traffic-generator.js` demonstrating live dashboard updates under active load.

```
Full-Stack Architecture & Traffic Flow:

  Client / Postman (Internet)
         │
         ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Kubernetes Cluster (Namespace: lab8)                                   │
  │                                                                        │
  │  Gateway Service [NodePort: 30080]                                     │
  │         │                                                              │
  │         ▼                                                              │
  │  api-gateway Deployment (Pod)                                          │
  │         │                                                              │
  │         ├──► http://user-service:3001    ──► user-service Pods (3x)    │
  │         ├──► http://product-service:3002 ──► product-service Pod (1x)  │
  │         └──► http://order-service:3003   ──► order-service Pod (1x)    │
  │                                                    │                   │
  │                                                    └──► MongoDB Atlas  │
  │                                                                        │
  │  Monitoring Stack:                                                     │
  │  Prometheus [NodePort: 30090] ──Scrapes /metrics──► All Microservices  │
  │         │                                                              │
  │         ▼                                                              │
  │  Grafana Dashboard [NodePort: 30300]                                   │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Kubernetes Architecture & Manifest Structure

All Kubernetes resources are organized declaratively inside the `k8s/` directory and deployed to the `lab8` namespace:

```
k8s/
├── configmap.yaml            # Environment variables for service discovery & ports
├── gateway-deployment.yaml   # API Gateway Deployment (probes, 1 replica, port 3000)
├── gateway-service.yaml      # NodePort Service (nodePort: 30080 -> 3000)
├── user-deployment.yaml      # User Service Deployment (probes, 1 replica -> scaled to 3)
├── user-service.yaml         # Internal ClusterIP Service (port 3001)
├── product-deployment.yaml   # Product Service Deployment (probes, 1 replica, port 3002)
├── product-service.yaml      # Internal ClusterIP Service (port 3002)
├── order-deployment.yaml     # Order Service Deployment (probes, 1 replica, port 3003)
├── order-service.yaml        # Internal ClusterIP Service (port 3003)
├── prometheus.yaml           # Prometheus Deployment, ConfigMap, & NodePort Service (30090)
└── grafana.yaml              # Grafana Deployment, Datasource Config, & NodePort Service (30300)
```

### Manifest Details & Design Decisions

| File | Resource Kind | Port / Access | Responsibility |
|---|---|---|---|
| `configmap.yaml` | `ConfigMap` | N/A | Non-sensitive runtime variables: `USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`, ports, timeouts. |
| `gateway-deployment.yaml` | `Deployment` | `3000` | Manages API Gateway Pod with liveness/readiness probes on `/health` (initialDelay: 5s, period: 10s/5s). |
| `gateway-service.yaml` | `Service` | `NodePort: 30080` | Exposes the API Gateway externally as the single client entry point. |
| `user-deployment.yaml` | `Deployment` | `3001` | Manages User Service Pods. Configured with liveness/readiness probes. |
| `user-service.yaml` | `Service` | `ClusterIP: 3001` | Internal stable DNS endpoint `user-service:3001` for cluster-internal traffic. |
| `product-deployment.yaml` | `Deployment` | `3002` | Manages Product catalog service with health probes. |
| `product-service.yaml` | `Service` | `ClusterIP: 3002` | Internal stable DNS endpoint `product-service:3002`. |
| `order-deployment.yaml` | `Deployment` | `3003` | Coordinates order placement and cross-service validation with User/Product services. |
| `order-service.yaml` | `Service` | `ClusterIP: 3003` | Internal stable DNS endpoint `order-service:3003`. |
| `prometheus.yaml` | `Deployment`, `ConfigMap`, `Service` | `NodePort: 30090` | Prometheus server scraping `/metrics` across all 4 services at 5-second intervals. |
| `grafana.yaml` | `Deployment`, `ConfigMap`, `Service` | `NodePort: 30300` | Grafana visualizer auto-provisioned with the Prometheus data source. |

---

## 3. Step-by-Step Verification & Operation Guide

### 3.1 Verify Lab 7 Baseline
Before deploying to Kubernetes, verify that the Lab 7 application services and baseline gateway function correctly:
```powershell
# Run the automated verification suite against the local Lab 7 baseline
node test-gateway.js
```
**Result:** 28 passing tests confirming Gateway `/health`, route proxying to `/users`, `/products`, and `/orders`, inter-service cross-validation, and direct port isolation.

### 3.2 Verify Kubernetes Environment
Confirm that `kubectl` is connected to an active Kubernetes context and at least one node is in `Ready` state:
```bash
# Check current active context
kubectl config current-context

# Confirm cluster nodes
kubectl get nodes

# Create the dedicated lab8 namespace
kubectl create namespace lab8
```

### 3.3 Deploy Manifests to Kubernetes
Apply all configuration and deployment manifests to the `lab8` namespace:
```bash
# Apply all manifests in k8s/ directory
kubectl apply -f k8s/ -n lab8

# Verify all Deployments reached desired state
kubectl get deployments -n lab8

# Verify Pod readiness (all reporting 1/1 Running)
kubectl get pods -n lab8

# Verify Services and port assignments
kubectl get services -n lab8
```

### 3.4 Expose & Test the Gateway
The API Gateway is exposed externally via NodePort `30080` (or via port-forwarding to port 3000):
```bash
# Optional port-forwarding if NodePort direct routing requires local forwarding:
kubectl port-forward svc/gateway-service 3000:3000 -n lab8
```

Test all endpoints through the Gateway:
```bash
# 1. Gateway Health Check & Dynamic Routing Registry
curl http://localhost:30080/health

# 2. Prometheus Metrics Exposition
curl http://localhost:30080/metrics

# 3. Retrieve all users via Gateway
curl http://localhost:30080/users

# 4. Retrieve single user
curl http://localhost:30080/users/101

# 5. Retrieve all products
curl http://localhost:30080/products

# 6. Retrieve single product
curl http://localhost:30080/products/501

# 7. Place new order (cross-validates with User and Product services)
curl -X POST http://localhost:30080/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "101", "productId": "501", "quantity": 2}'
```

### 3.5 Horizontal Scaling Demonstration
Demonstrate Kubernetes horizontal pod scaling by scaling the `user-service` deployment from 1 replica to 3 replicas:
```bash
# Scale user-service to 3 replicas
kubectl scale deployment user-service --replicas=3 -n lab8

# Observe 3 pods running and ready
kubectl get pods -l app=user-service -n lab8

# Verify the ClusterIP service balances requests across all 3 replicas
kubectl get endpoints user-service -n lab8
```

### 3.6 Self-Healing Demonstration
Demonstrate Kubernetes automated self-healing by deleting one of the active user-service pods:
```bash
# List active user-service pods
kubectl get pods -l app=user-service -n lab8

# Delete a specific pod
kubectl delete pod <user-service-pod-name> -n lab8

# Immediately observe the Deployment creating a replacement Pod to restore desired state
kubectl get pods -l app=user-service -n lab8 -w
```

### 3.7 Troubleshooting Commands
Use standard Kubernetes inspection commands for diagnostics:
```bash
# Inspect pod events, probe results, and status
kubectl describe pod <pod-name> -n lab8

# Inspect container logs
kubectl logs <pod-name> -n lab8

# Check service endpoint resolution
kubectl get endpoints -n lab8
```

---

## 4. Part B — GitHub Actions CI/CD Pipeline

The CI/CD pipeline is defined in `.github/workflows/ci.yml`.

### Workflow Stages:
1. **Lint & Test (`test` job):**
   - Matrix strategy running across `api-gateway`, `user-service`, `product-service`, and `order-service`.
   - Checks out repository using `actions/checkout@v4`.
   - Sets up Node.js 22 runtime environment with dependency caching.
   - Installs dependencies (`npm ci || npm install`).
   - Runs syntax verification (`node --check server.js`).
2. **Build, Tag & Container Registry Delivery (`build-and-push-images` job):**
   - Uses Docker Buildx (`docker/setup-buildx-action@v3`).
   - Authenticates against GitHub Container Registry (`ghcr.io`).
   - Builds versioned images tagged with both Git commit SHA (`${{ github.sha }}`) and `latest`:
     - `ghcr.io/${{ github.repository_owner }}/api-gateway:${{ github.sha }}`
     - `ghcr.io/${{ github.repository_owner }}/user-service:${{ github.sha }}`
     - `ghcr.io/${{ github.repository_owner }}/product-service:${{ github.sha }}`
     - `ghcr.io/${{ github.repository_owner }}/order-service:${{ github.sha }}`
3. **Kubernetes Validation (`validate-k8s` job):**
   - Configures `kubectl`.
   - Runs client-side validation (`kubectl apply --dry-run=client -f k8s/`) ensuring all YAML manifests are valid.

### Kubernetes Image Rollout Procedure:
When a new versioned Docker image is published, update the deployment to roll out the new image without downtime:
```bash
# Roll out new versioned image tagged with Git commit SHA
kubectl set image deployment/user-service user-service=ghcr.io/202512039/user-service:1600e49 -n lab8

# Monitor the rollout status
kubectl rollout status deployment/user-service -n lab8

# View rollout history
kubectl rollout history deployment/user-service -n lab8
```

---

## 5. Part C — Monitoring with Prometheus & Grafana

### 5.1 Application Metrics Instrumentation
Each microservice imports `prom-client` and records HTTP ingress traffic:
- `http_requests_total`: Counter partitioned by `method`, `route`, and HTTP `status` code.
- `http_request_duration_seconds`: Histogram measuring response latency in buckets from 5ms to 5 seconds.
- Standard Node.js runtime metrics: CPU usage, event loop lag, and memory heap statistics.
- Exposed on standard Prometheus endpoint: `GET /metrics`.

### 5.2 Prometheus Setup & Scraping
Prometheus runs in Kubernetes under the `lab8` namespace and scrapes all services via the internal Kubernetes DNS names defined in `k8s/prometheus.yaml`:
```yaml
scrape_configs:
  - job_name: "campusconnect-gateway"
    metrics_path: /metrics
    static_configs:
      - targets: ["gateway-service:3000"]
  - job_name: "user-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["user-service:3001"]
  - job_name: "product-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["product-service:3002"]
  - job_name: "order-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["order-service:3003"]
```
Access Prometheus web UI at: **`http://localhost:30090`** (or via `kubectl port-forward svc/prometheus-service 9090:9090 -n lab8`).

#### Key PromQL Queries:
- **Target Reachability / Health:**
  ```promql
  up
  ```
  Returns `1` for all four services confirming `UP` status.
- **Request Rate per Second:**
  ```promql
  rate(http_requests_total[5m])
  ```
- **Error Rate (4xx and 5xx):**
  ```promql
  rate(http_requests_total{status=~"[45].."}[5m])
  ```
- **95th Percentile Response Latency:**
  ```promql
  histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
  ```

### 5.3 Grafana Dashboard
Grafana is deployed in Kubernetes via `k8s/grafana.yaml` with pre-configured automatic datasource provisioning pointing to `http://prometheus-service:9090`.
Access Grafana web UI at: **`http://localhost:30300`** (or via `kubectl port-forward svc/grafana-service 3000:3000 -n lab8`).
Credentials: Admin authentication is enabled by default (`admin` / `admin`) and anonymous viewer access is enabled for instantaneous dashboard review.

Dashboard panels answer the core monitoring questions:
1. **Are targets reachable?** -> Single-stat panel querying `up` across all jobs.
2. **How much traffic is arriving?** -> Time-series graph of `sum(rate(http_requests_total[1m])) by (service)`.
3. **Are failures increasing?** -> Status distribution breakdown (2xx vs 4xx vs 5xx).
4. **How long are requests taking?** -> p95 and p50 request latency graphs.

### 5.4 Traffic Generation & Observation
Generate synthetic normal and controlled error traffic to observe real-time metric spikes:
```powershell
# Run the traffic generator against the Kubernetes gateway
npm run traffic
# or: node traffic-generator.js
```
The script transmits 50+ request cycles covering `GET /users`, `GET /products`, `GET /orders`, `POST /orders`, and controlled invalid `GET /unmapped-endpoint-test` routes. The corresponding changes in request rate, error rate, and histogram buckets are observed in Prometheus and Grafana.

---

## 6. Required Evidence / Deliverables Checklist (Section 7.1)

| No. | Evidence Item | Required Content | File / Command Reference | Status |
|---|---|---|---|---|
| **1** | **Lab 7 Baseline** | Successful Gateway request/response | `node test-gateway.js` (28/28 tests passed) | Verified |
| **2** | **Kubernetes Environment** | Current context + node(s) | `kubectl config current-context`<br>`kubectl get nodes` | Verified |
| **3** | **Manifests** | Gateway, service & config YAML files | `k8s/gateway-deployment.yaml`<br>`k8s/gateway-service.yaml`<br>`k8s/user-deployment.yaml`<br>`k8s/user-service.yaml`<br>`k8s/product-deployment.yaml`<br>`k8s/product-service.yaml`<br>`k8s/order-deployment.yaml`<br>`k8s/order-service.yaml`<br>`k8s/configmap.yaml` | Created in `k8s/` |
| **4** | **Deployment** | Pods, Deployments & Services in `lab8` | `kubectl get all -n lab8` | Configured |
| **5** | **Gateway Test** | Successful Postman/HTTP request via Gateway | `curl http://localhost:30080/health`<br>`curl http://localhost:30080/users`<br>`curl http://localhost:30080/orders` | Supported |
| **6** | **Scaling** | User Service scaled to 3 replicas | `kubectl scale deployment user-service --replicas=3 -n lab8`<br>`kubectl get pods -l app=user-service -n lab8` | Supported |
| **7** | **Self-Healing** | Deleted Pod followed by replacement | `kubectl delete pod <user-service-pod> -n lab8`<br>`kubectl get pods -n lab8 -w` | Supported |
| **8** | **Troubleshooting** | Useful describe, logs, endpoints output | `kubectl describe pod <pod-name> -n lab8`<br>`kubectl logs <pod-name> -n lab8`<br>`kubectl get endpoints -n lab8` | Documented |
| **9** | **GitHub Actions** | Successful basic CI workflow run | `.github/workflows/ci.yml` | Created |
| **10** | **Prometheus** | Targets/UP state & PromQL queries | `k8s/prometheus.yaml`<br>Queries: `up`, `rate(http_requests_total[5m])` | Implemented |
| **11** | **Grafana** | Monitoring dashboard | `k8s/grafana.yaml` (NodePort 30300) | Implemented |
| **12** | **Traffic** | Monitoring after API traffic | `traffic-generator.js` (`npm run traffic`) | Implemented |
| **13** | **Architecture** | Final architecture diagram/screenshot | Architecture diagram embedded in Section 1 | Documented |

---

## 7. Security & Best Practices Adherence

- **No Secrets in Source Control:** Database credentials and tokens are externalized; Git commits contain no hardcoded passwords.
- **Port Isolation:** Individual microservices are ClusterIP-only; only the API Gateway is exposed externally.
- **Health Checks & Zero-Downtime:** Probes ensure traffic is routed only to healthy, initialized containers.
- **Traceable Tagging:** CI/CD builds versioned Docker images tagged with explicit Git commit SHAs (`1600e49`) rather than mutable `latest` tags.
- **ConfigMap Externalization:** Service discovery URLs and ports are managed outside container images.
