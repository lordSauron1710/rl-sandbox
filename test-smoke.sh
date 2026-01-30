#!/bin/bash
# Minimal backend smoke test for CI — health, envs, create run, start, stop.
# No long sleeps, no preview (can crash on some systems). Run with backend up.

set -e
API_BASE="${API_BASE:-http://localhost:8000/api/v1}"
# Health is at origin, not under /api/v1
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/health}"
PASSED=0
FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; ((PASSED++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((FAILED++)); }

echo "=== Backend smoke test (CI) ==="

# Health (fail fast if backend down)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 --max-time 3 "$HEALTH_URL" 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then pass "Health"; else fail "Health (HTTP $HTTP)"; exit 1; fi

# List environments
ENVS=$(curl -s --connect-timeout 2 --max-time 5 "$API_BASE/environments" | jq -r '.environments[]? | .id' 2>/dev/null | tr '\n' ' ')
if [ -n "$ENVS" ]; then pass "List environments"; else fail "List environments"; exit 1; fi

# Create run
CREATE=$(curl -s --max-time 5 -X POST "$API_BASE/runs" -H "Content-Type: application/json" \
  -d '{"env_id":"CartPole-v1","algorithm":"PPO","hyperparameters":{"learning_rate":0.0003,"total_timesteps":5000}}')
RUN_ID=$(echo "$CREATE" | jq -r '.id')
if [ "$RUN_ID" != "null" ] && [ -n "$RUN_ID" ]; then pass "Create run"; else fail "Create run"; exit 1; fi

# Start training
START=$(curl -s --max-time 10 -X POST "$API_BASE/runs/$RUN_ID/start")
STATUS=$(echo "$START" | jq -r '.status')
if [ "$STATUS" = "training" ]; then pass "Start training"; else fail "Start training (status: $STATUS)"; exit 1; fi

# Stop training (brief wait so backend has accepted start)
sleep 1
STOP=$(curl -s --max-time 5 -X POST "$API_BASE/runs/$RUN_ID/stop")
STATUS=$(echo "$STOP" | jq -r '.status')
if [ "$STATUS" = "stopping" ] || [ "$STATUS" = "stopped" ]; then pass "Stop training"; else fail "Stop training (status: $STATUS)"; fi

echo ""
echo "Passed: $PASSED  Failed: $FAILED"
[ $FAILED -eq 0 ] && exit 0 || exit 1
