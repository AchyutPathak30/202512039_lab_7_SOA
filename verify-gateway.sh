#!/bin/bash
# =================================================================
# CampusConnect Lab 7: API Gateway & Service Discovery Verification
# Web Services & SOA Laboratory
# Roll Number: 202512039
# =================================================================

GATEWAY_URL=${GATEWAY_URL:-"http://localhost:3000"}
PASSED=0
FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local desc="$1"
  local status="$2"
  local expected="$3"
  if [ "$status" -eq "$expected" ]; then
    echo -e " ${GREEN}[PASS]${NC} $desc (HTTP $status)"
    PASSED=$((PASSED + 1))
  else
    echo -e "❌ ${RED}[FAIL]${NC} $desc (Expected $expected, got $status)"
    FAILED=$((FAILED + 1))
  fi
}

echo "================================================================="
echo " LAB 7: API GATEWAY & SERVICE DISCOVERY AUTOMATED TEST"
echo " Gateway URL: $GATEWAY_URL"
echo "================================================================="

echo -e "\n${BLUE}--- 1. Testing Gateway Health & Service Registry (:3000) ---${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health")
check "GET /health returns HTTP 200" "$HTTP_STATUS" 200
echo "Gateway Health Response:"
curl -s "$GATEWAY_URL/health"
echo ""

echo -e "\n${BLUE}--- 2. Testing User Service Routes via API Gateway ---${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/users")
check "GET /users routed via Gateway returns HTTP 200" "$HTTP_STATUS" 200

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/users/101")
check "GET /users/101 routed via Gateway returns HTTP 200" "$HTTP_STATUS" 200

RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$GATEWAY_URL/users" \
  -H "Content-Type: application/json" \
  -d '{"name":"Achyut Test","email":"achyut@campus.edu","role":"Student","department":"IT"}')
STATUS=$(echo "$RESP" | tail -n1 | cut -d: -f2)
check "POST /users routed via Gateway returns HTTP 201 Created" "$STATUS" 201

echo -e "\n${BLUE}--- 3. Testing Product Service Routes via API Gateway ---${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/products")
check "GET /products routed via Gateway returns HTTP 200" "$HTTP_STATUS" 200

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/products/501")
check "GET /products/501 routed via Gateway returns HTTP 200" "$HTTP_STATUS" 200

RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$GATEWAY_URL/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"Campus USB-C Hub","category":"Electronics","price":19.99,"stock":50}')
STATUS=$(echo "$RESP" | tail -n1 | cut -d: -f2)
check "POST /products routed via Gateway returns HTTP 201 Created" "$STATUS" 201

echo -e "\n${BLUE}--- 4. Testing Order Service & Inter-Service Coordination via Gateway ---${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/orders")
check "GET /orders routed via Gateway returns HTTP 200" "$HTTP_STATUS" 200

RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$GATEWAY_URL/orders" \
  -H "Content-Type: application/json" \
  -d '{"userId":"101","productId":"501","quantity":1}')
BODY=$(echo "$RESP" | sed -e '$d')
STATUS=$(echo "$RESP" | tail -n1 | cut -d: -f2)
check "POST /orders validates User + Product and returns HTTP 201" "$STATUS" 201
echo "Order Response Body:"
echo "$BODY"

echo -e "\n${BLUE}--- 5. Testing Invalid Resource Error Handling (404 Expected) ---${NC}"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$GATEWAY_URL/orders" \
  -H "Content-Type: application/json" \
  -d '{"userId":"99999","productId":"501","quantity":1}')
STATUS=$(echo "$RESP" | tail -n1 | cut -d: -f2)
check "POST /orders with non-existent userId returns 404 Not Found" "$STATUS" 404

echo -e "\n${BLUE}--- 6. Testing Unmapped Gateway Route (404 Expected) ---${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/unmapped-endpoint")
check "GET /unmapped-endpoint returns HTTP 404" "$HTTP_STATUS" 404

echo -e "\n${BLUE}--- 7. Testing Port Isolation (Internal Services Inaccessible) ---${NC}"
for PORT in 3001 3002 3003; do
  curl -s --connect-timeout 1 "http://localhost:$PORT/health" > /dev/null 2>&1
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo -e " ${GREEN}[PASS]${NC} Port :$PORT is isolated and blocked from external direct access"
    PASSED=$((PASSED + 1))
  else
    echo -e "❌ ${RED}[FAIL]${NC} Port :$PORT should not be exposed externally!"
    FAILED=$((FAILED + 1))
  fi
done

echo -e "\n${BLUE}--- 8. Testing Centralized Upstream Error Handling (502 Bad Gateway) ---${NC}"
echo "Stopping user-service container..."
docker compose stop user-service > /dev/null 2>&1

RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$GATEWAY_URL/users")
BODY=$(echo "$RESP" | sed -e '$d')
STATUS=$(echo "$RESP" | tail -n1 | cut -d: -f2)
check "GET /users returns clean 502/503 response when User Service is down" "$STATUS" 502
echo "Gateway Centralized Error Response:"
echo "$BODY"

echo -e "\n${BLUE}--- 9. Testing Service Recovery ---${NC}"
echo "Restarting user-service container..."
docker compose start user-service > /dev/null 2>&1
sleep 3

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/users")
check "GET /users returns HTTP 200 after User Service recovers" "$HTTP_STATUS" 200

echo -e "\n================================================================="
echo " SUMMARY: $PASSED Passed, $FAILED Failed"
echo "================================================================="

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
