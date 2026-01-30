#!/bin/bash
# Comprehensive test script for RL Gym Visualizer

API_BASE="http://localhost:8000/api/v1"
PASSED=0
FAILED=0

echo "================================"
echo "RL GYM VISUALIZER - COMPREHENSIVE TEST"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

info() {
    echo -e "${YELLOW}→${NC} $1"
}

echo "=== 1. ENVIRONMENT ENDPOINTS ==="
echo ""

# Test list environments
info "Testing GET /environments"
ENVS=$(curl -s "$API_BASE/environments" | jq -r '.environments[] | .id')
if [ $? -eq 0 ] && [ -n "$ENVS" ]; then
    pass "List environments"
    echo "   Environments: $(echo "$ENVS" | tr '\n' ' ' | sed 's/ $//')"
else
    fail "List environments"
fi
echo ""

# Test environment previews
info "Testing environment previews"
for ENV in $ENVS; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/environments/$ENV/preview")
    if [ "$HTTP_CODE" = "200" ]; then
        pass "Preview $ENV (HTTP $HTTP_CODE)"
    else
        fail "Preview $ENV (HTTP $HTTP_CODE)"
    fi
done
echo ""

echo "=== 2. RUN LIFECYCLE (CartPole-v1) ==="
echo ""

# Create a run
info "Creating run (CartPole-v1, PPO)"
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
    -H "Content-Type: application/json" \
    -d '{
        "env_id": "CartPole-v1",
        "algorithm": "PPO",
        "hyperparameters": {
            "learning_rate": 0.0003,
            "total_timesteps": 10000
        }
    }')

RUN_ID=$(echo $CREATE_RESPONSE | jq -r '.id')
if [ "$RUN_ID" != "null" ] && [ -n "$RUN_ID" ]; then
    pass "Create run (ID: $RUN_ID)"
else
    fail "Create run"
    echo "   Response: $CREATE_RESPONSE"
    exit 1
fi
echo ""

# Start training
info "Starting training"
START_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$RUN_ID/start")
START_STATUS=$(echo $START_RESPONSE | jq -r '.status')
if [ "$START_STATUS" = "training" ]; then
    pass "Start training"
else
    fail "Start training (status: $START_STATUS)"
fi
echo ""

# Wait for training to process
info "Waiting 5 seconds for training to initialize..."
sleep 5

# Check run status
info "Checking run status"
RUN_STATUS=$(curl -s "$API_BASE/runs/$RUN_ID" | jq -r '.status')
if [ "$RUN_STATUS" = "training" ]; then
    pass "Run status: training"
elif [ "$RUN_STATUS" = "completed" ]; then
    pass "Run status: completed"
else
    fail "Run status: $RUN_STATUS"
fi
echo ""

# Test metrics stream (just check if endpoint exists)
info "Testing metrics stream endpoint"
HTTP_CODE=$(timeout 2 curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/$RUN_ID/stream/metrics" || echo "timeout")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "timeout" ]; then
    pass "Metrics stream endpoint accessible"
else
    fail "Metrics stream endpoint (HTTP $HTTP_CODE)"
fi
echo ""

# Stop training
info "Stopping training"
STOP_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$RUN_ID/stop")
STOP_STATUS=$(echo $STOP_RESPONSE | jq -r '.status')
if [ "$STOP_STATUS" = "stopped" ]; then
    pass "Stop training"
else
    fail "Stop training (status: $STOP_STATUS)"
fi
echo ""

echo "=== 3. EVALUATION TEST ==="
echo ""

# Create and complete a quick training run for evaluation
info "Creating quick training run for evaluation test"
EVAL_RUN_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
    -H "Content-Type: application/json" \
    -d '{
        "env_id": "CartPole-v1",
        "algorithm": "PPO",
        "hyperparameters": {
            "learning_rate": 0.001,
            "total_timesteps": 5000
        }
    }')

EVAL_RUN_ID=$(echo $EVAL_RUN_RESPONSE | jq -r '.id')
if [ "$EVAL_RUN_ID" != "null" ] && [ -n "$EVAL_RUN_ID" ]; then
    pass "Create evaluation run (ID: $EVAL_RUN_ID)"
    
    # Start training
    curl -s -X POST "$API_BASE/runs/$EVAL_RUN_ID/start" > /dev/null
    
    # Wait for some training
    info "Waiting 10 seconds for training..."
    sleep 10
    
    # Trigger evaluation
    info "Triggering evaluation"
    EVAL_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$EVAL_RUN_ID/evaluate" \
        -H "Content-Type: application/json" \
        -d '{"num_episodes": 3, "stream_frames": true, "target_fps": 15}')
    
    EVAL_STATUS=$(echo $EVAL_RESPONSE | jq -r '.status')
    if [ "$EVAL_STATUS" = "evaluating" ] || [ "$EVAL_STATUS" = "completed" ]; then
        pass "Trigger evaluation"
    else
        fail "Trigger evaluation (status: $EVAL_STATUS)"
    fi
    
    # Stop the run
    curl -s -X POST "$API_BASE/runs/$EVAL_RUN_ID/stop" > /dev/null
else
    fail "Create evaluation run"
fi
echo ""

echo "=== 4. ALL ENVIRONMENTS TEST ==="
echo ""

# Test creating runs for each environment
for ENV in $ENVS; do
    info "Testing $ENV"
    
    # Determine algorithm (BipedalWalker only supports PPO)
    if [ "$ENV" = "BipedalWalker-v3" ]; then
        ALGO="PPO"
    else
        ALGO="PPO"
    fi
    
    # Create run
    TEST_RUN=$(curl -s -X POST "$API_BASE/runs" \
        -H "Content-Type: application/json" \
        -d "{
            \"env_id\": \"$ENV\",
            \"algorithm\": \"$ALGO\",
            \"hyperparameters\": {
                \"learning_rate\": 0.0003,
                \"total_timesteps\": 5000
            }
        }")
    
    TEST_RUN_ID=$(echo $TEST_RUN | jq -r '.id')
    if [ "$TEST_RUN_ID" != "null" ] && [ -n "$TEST_RUN_ID" ]; then
        pass "Create run for $ENV"
        
        # Clean up - don't actually start it
        # Just verify we can create runs for all envs
    else
        fail "Create run for $ENV"
        echo "   Response: $TEST_RUN"
    fi
done
echo ""

echo "=== 5. ERROR HANDLING ==="
echo ""

# Test invalid environment
info "Testing invalid environment ID"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/environments/InvalidEnv-v1/preview")
if [ "$HTTP_CODE" = "404" ]; then
    pass "Invalid environment returns 404"
else
    fail "Invalid environment (HTTP $HTTP_CODE, expected 404)"
fi

# Test invalid run ID
info "Testing invalid run ID"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/invalid-uuid-here")
if [ "$HTTP_CODE" = "404" ]; then
    pass "Invalid run ID returns 404"
else
    fail "Invalid run ID (HTTP $HTTP_CODE, expected 404)"
fi
echo ""

echo "================================"
echo "TEST SUMMARY"
echo "================================"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    exit 1
fi
