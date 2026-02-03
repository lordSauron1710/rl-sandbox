#!/bin/bash
# Comprehensive backend API test for RL Gym Visualizer.
# Requires backend running at http://localhost:8000.

set -u

API_BASE="${API_BASE:-http://localhost:8000/api/v1}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/health}"
PASSED=0
FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

json_get() {
  local json="$1"
  local query="$2"
  echo "$json" | jq -r "$query"
}

wait_for_run_status() {
  local run_id="$1"
  local timeout_secs="${2:-30}"
  local started_at
  started_at=$(date +%s)
  while true; do
    local payload
    payload=$(curl -s --max-time 5 "$API_BASE/runs/$run_id")
    local status
    status=$(json_get "$payload" '.status // "unknown"')
    if [ "$status" != "pending" ] && [ "$status" != "training" ] && [ "$status" != "evaluating" ]; then
      echo "$status"
      return 0
    fi
    if [ "$(($(date +%s) - started_at))" -ge "$timeout_secs" ]; then
      echo "$status"
      return 1
    fi
    sleep 1
  done
}

require_cmd curl
require_cmd jq

echo "================================"
echo "RL GYM VISUALIZER - COMPREHENSIVE TEST"
echo "================================"
echo ""

echo "=== 1. HEALTH + ENVIRONMENTS ==="
echo ""

info "Health check"
HEALTH_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 --max-time 3 "$HEALTH_URL" || echo "000")
if [ "$HEALTH_HTTP" = "200" ]; then
  pass "Health endpoint reachable"
else
  fail "Health endpoint unreachable (HTTP $HEALTH_HTTP)"
  echo ""
  echo "Cannot continue comprehensive test without backend."
  exit 1
fi

info "List environments"
ENVS_PAYLOAD=$(curl -s --max-time 5 "$API_BASE/environments")
ENVS=$(json_get "$ENVS_PAYLOAD" '.environments[]?.id')
if [ -n "$ENVS" ]; then
  pass "List environments"
  echo "   Environments: $(echo "$ENVS" | tr '\n' ' ' | sed 's/ $//')"
else
  fail "List environments returned empty"
  exit 1
fi
echo ""

echo "=== 2. PREVIEW ENDPOINTS ==="
echo ""
for ENV in $ENVS; do
  info "Preview $ENV"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_BASE/environments/$ENV/preview" || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Preview $ENV"
  else
    fail "Preview $ENV (HTTP $HTTP_CODE)"
  fi
done
echo ""

echo "=== 3. RUN LIFECYCLE (CartPole-v1 + PPO) ==="
echo ""

info "Create run"
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {
      "learning_rate": 0.0003,
      "total_timesteps": 6000
    }
  }')

RUN_ID=$(json_get "$CREATE_RESPONSE" '.id // empty')
if [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ]; then
  pass "Create run ($RUN_ID)"
else
  fail "Create run"
  echo "   Response: $CREATE_RESPONSE"
  exit 1
fi

info "Start training"
START_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$RUN_ID/start")
START_STATUS=$(json_get "$START_RESPONSE" '.status // empty')
if [ "$START_STATUS" = "training" ]; then
  pass "Start training"
else
  fail "Start training (status: $START_STATUS)"
  echo "   Response: $START_RESPONSE"
fi

info "Check metrics SSE endpoint"
SSE_RESULT=$(curl -sN --max-time 3 "$API_BASE/runs/$RUN_ID/stream/metrics" || true)
if echo "$SSE_RESULT" | grep -q "event:"; then
  pass "Metrics stream emits SSE data"
else
  fail "Metrics stream did not emit SSE data"
fi

info "Check events SSE endpoint"
EVENTS_SSE_RESULT=$(curl -sN --max-time 3 "$API_BASE/runs/$RUN_ID/stream/events" || true)
if echo "$EVENTS_SSE_RESULT" | grep -q "event: event"; then
  pass "Events stream emits event log data"
else
  fail "Events stream did not emit event log data"
fi

info "Stop training"
STOP_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$RUN_ID/stop")
STOP_STATUS=$(json_get "$STOP_RESPONSE" '.status // empty')
STOP_ERROR_CODE=$(json_get "$STOP_RESPONSE" '.detail.error.code // empty')
STOP_CURRENT_STATUS=$(json_get "$STOP_RESPONSE" '.detail.error.details.current_status // empty')
if [ "$STOP_STATUS" = "stopping" ] || [ "$STOP_STATUS" = "stopped" ]; then
  pass "Stop request accepted ($STOP_STATUS)"
elif [ "$STOP_ERROR_CODE" = "not_running" ] && [ "$STOP_CURRENT_STATUS" = "completed" ]; then
  pass "Stop not needed because run already completed"
else
  fail "Stop training (status: $STOP_STATUS)"
  echo "   Response: $STOP_RESPONSE"
fi

info "Wait for terminal status"
FINAL_STATUS=$(wait_for_run_status "$RUN_ID" 30)
if [ "$FINAL_STATUS" = "stopped" ] || [ "$FINAL_STATUS" = "completed" ] || [ "$FINAL_STATUS" = "failed" ]; then
  pass "Run reached terminal status ($FINAL_STATUS)"
else
  fail "Run did not reach terminal status in time (last: $FINAL_STATUS)"
fi
echo ""

echo "=== 4. ARTIFACT ENDPOINTS ==="
echo ""

info "Get run config artifact"
CONFIG_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$RUN_ID/artifacts/config")
if [ "$CONFIG_HTTP" = "200" ]; then
  pass "Config artifact endpoint"
else
  fail "Config artifact endpoint (HTTP $CONFIG_HTTP)"
fi

info "Get metrics artifact"
METRICS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$RUN_ID/artifacts/metrics")
if [ "$METRICS_HTTP" = "200" ]; then
  pass "Metrics artifact endpoint"
else
  fail "Metrics artifact endpoint (HTTP $METRICS_HTTP)"
fi

info "Get events list endpoint"
EVENTS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$RUN_ID/events")
if [ "$EVENTS_HTTP" = "200" ]; then
  pass "Events endpoint"
else
  fail "Events endpoint (HTTP $EVENTS_HTTP)"
fi

info "No evaluation summary before TEST run"
PRE_EVAL_SUMMARY_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$RUN_ID/evaluate/latest")
if [ "$PRE_EVAL_SUMMARY_HTTP" = "404" ]; then
  pass "No evaluation summary before evaluation"
else
  fail "Expected no pre-eval summary (HTTP $PRE_EVAL_SUMMARY_HTTP)"
fi

info "No evaluation video before TEST run"
PRE_EVAL_VIDEO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$RUN_ID/artifacts/eval/latest.mp4")
if [ "$PRE_EVAL_VIDEO_HTTP" = "404" ]; then
  pass "No evaluation video before evaluation"
else
  fail "Expected no pre-eval video (HTTP $PRE_EVAL_VIDEO_HTTP)"
fi
echo ""

echo "=== 5. EVALUATION FLOW ==="
echo ""

if [ "$FINAL_STATUS" = "stopped" ] || [ "$FINAL_STATUS" = "completed" ]; then
  info "Trigger evaluation"
  EVAL_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$RUN_ID/evaluate" \
    -H "Content-Type: application/json" \
    -d '{"num_episodes": 2, "stream_frames": true, "target_fps": 15}')
  EVAL_STATUS=$(json_get "$EVAL_RESPONSE" '.status // empty')
  if [ "$EVAL_STATUS" = "evaluating" ]; then
    pass "Evaluation started"
  else
    fail "Evaluation start failed (status: $EVAL_STATUS)"
    echo "   Response: $EVAL_RESPONSE"
  fi

  info "Wait for evaluation to finish"
  EVAL_FINAL=$(wait_for_run_status "$RUN_ID" 60)
  if [ "$EVAL_FINAL" = "stopped" ] || [ "$EVAL_FINAL" = "completed" ]; then
    pass "Evaluation finished and run status restored ($EVAL_FINAL)"
  else
    fail "Evaluation did not finish in time (last: $EVAL_FINAL)"
  fi

  info "Fetch latest evaluation summary"
  SUMMARY_RESPONSE=$(curl -s --max-time 5 "$API_BASE/runs/$RUN_ID/evaluate/latest")
  SUMMARY_NUM_EPISODES=$(json_get "$SUMMARY_RESPONSE" '.num_episodes // 0')
  SUMMARY_MEAN_REWARD=$(json_get "$SUMMARY_RESPONSE" '.mean_reward // empty')
  SUMMARY_VIDEO_PATH=$(json_get "$SUMMARY_RESPONSE" '.video_path // empty')
  if [ "$SUMMARY_NUM_EPISODES" -ge 1 ] && [ -n "$SUMMARY_MEAN_REWARD" ] && [ "$SUMMARY_VIDEO_PATH" != "null" ] && [ -n "$SUMMARY_VIDEO_PATH" ]; then
    pass "Evaluation summary endpoint"
  else
    fail "Evaluation summary endpoint payload"
    echo "   Response: $SUMMARY_RESPONSE"
  fi

  info "Fetch latest evaluation video"
  VIDEO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_BASE/runs/$RUN_ID/artifacts/eval/latest.mp4")
  if [ "$VIDEO_HTTP" = "200" ]; then
    pass "Latest evaluation video endpoint"
  else
    fail "Latest evaluation video endpoint (HTTP $VIDEO_HTTP)"
  fi

  info "Verify evaluation lifecycle events"
  EVAL_EVENTS=$(curl -s --max-time 5 "$API_BASE/runs/$RUN_ID/events?limit=100")
  HAS_EVAL_STARTED=$(echo "$EVAL_EVENTS" | jq -r '[.events[]? | select(.event_type=="evaluation_started")] | length')
  HAS_EVAL_COMPLETED=$(echo "$EVAL_EVENTS" | jq -r '[.events[]? | select(.event_type=="evaluation_completed")] | length')
  if [ "$HAS_EVAL_STARTED" -ge 1 ] && [ "$HAS_EVAL_COMPLETED" -ge 1 ]; then
    pass "Evaluation started/completed events recorded"
  else
    fail "Evaluation events missing"
    echo "   Started events: $HAS_EVAL_STARTED  Completed events: $HAS_EVAL_COMPLETED"
  fi
else
  fail "Skipping evaluation flow because run ended as $FINAL_STATUS"
fi
echo ""

echo "=== 6. VALIDATION + ERROR PATHS ==="
echo ""

info "Reject unsupported algorithm/environment combo (DQN + BipedalWalker-v3)"
INVALID_RUN_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "BipedalWalker-v3",
    "algorithm": "DQN",
    "hyperparameters": {"learning_rate": 0.0003, "total_timesteps": 5000}
  }')
if [ "$INVALID_RUN_HTTP" = "400" ]; then
  pass "Unsupported algorithm rejected"
else
  fail "Unsupported algorithm expected HTTP 400, got $INVALID_RUN_HTTP"
fi

info "Invalid environment preview returns 404"
INVALID_ENV_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/environments/InvalidEnv-v1/preview")
if [ "$INVALID_ENV_HTTP" = "404" ]; then
  pass "Invalid environment preview returns 404"
else
  fail "Invalid environment preview expected 404, got $INVALID_ENV_HTTP"
fi

info "Unknown run returns 404"
UNKNOWN_RUN_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/00000000-0000-0000-0000-000000000000")
if [ "$UNKNOWN_RUN_HTTP" = "404" ]; then
  pass "Unknown run returns 404"
else
  fail "Unknown run expected 404, got $UNKNOWN_RUN_HTTP"
fi
echo ""

echo "=== 7. CREATE RUN FOR ALL REGISTERED ENVS ==="
echo ""

for ENV in $ENVS; do
  ALGO="PPO"
  if [ "$ENV" != "BipedalWalker-v3" ]; then
    ALGO="DQN"
  fi

  info "Create $ALGO run for $ENV"
  CREATE_ENV_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
    -H "Content-Type: application/json" \
    -d "{
      \"env_id\": \"$ENV\",
      \"algorithm\": \"$ALGO\",
      \"hyperparameters\": {
        \"learning_rate\": 0.0003,
        \"total_timesteps\": 5000
      }
    }")
  CREATE_ENV_ID=$(json_get "$CREATE_ENV_RESPONSE" '.id // empty')
  if [ -n "$CREATE_ENV_ID" ] && [ "$CREATE_ENV_ID" != "null" ]; then
    pass "Create run for $ENV"
  else
    fail "Create run for $ENV"
    echo "   Response: $CREATE_ENV_RESPONSE"
  fi
done
echo ""

echo "=== 8. PRESET MAPPING + BOUNDS VALIDATION ==="
echo ""

info "List preset tables"
PRESETS_RESPONSE=$(curl -s --max-time 5 "$API_BASE/runs/presets")
PRESETS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/presets")
HAS_PPO_PRESETS=$(echo "$PRESETS_RESPONSE" | jq -r '[.algorithms[]? | select(.algorithm=="PPO")] | length')
HAS_DQN_PRESETS=$(echo "$PRESETS_RESPONSE" | jq -r '[.algorithms[]? | select(.algorithm=="DQN")] | length')
if [ "$PRESETS_HTTP" = "200" ] && [ "$HAS_PPO_PRESETS" -ge 1 ] && [ "$HAS_DQN_PRESETS" -ge 1 ]; then
  pass "Preset tables endpoint"
else
  fail "Preset tables endpoint"
  echo "   Response: $PRESETS_RESPONSE"
fi

info "Create run with DQN fast preset + override"
PRESET_RUN_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "DQN",
    "preset": "fast",
    "hyperparameters": {
      "total_timesteps": 250000
    }
  }')
PRESET_RUN_ID=$(json_get "$PRESET_RUN_RESPONSE" '.id // empty')
PRESET_NAME=$(json_get "$PRESET_RUN_RESPONSE" '.config.preset // empty')
PRESET_STEPS=$(json_get "$PRESET_RUN_RESPONSE" '.config.hyperparameters.total_timesteps // 0')
if [ -n "$PRESET_RUN_ID" ] && [ "$PRESET_RUN_ID" != "null" ] && [ "$PRESET_NAME" = "fast" ] && [ "$PRESET_STEPS" = "250000" ]; then
  pass "Preset applied with explicit override"
else
  fail "Preset applied with explicit override"
  echo "   Response: $PRESET_RUN_RESPONSE"
fi

if [ -n "$PRESET_RUN_ID" ] && [ "$PRESET_RUN_ID" != "null" ]; then
  info "Run config artifact includes preset"
  PRESET_CONFIG_RESPONSE=$(curl -s --max-time 5 "$API_BASE/runs/$PRESET_RUN_ID/artifacts/config")
  PRESET_CONFIG_NAME=$(json_get "$PRESET_CONFIG_RESPONSE" '.preset // empty')
  if [ "$PRESET_CONFIG_NAME" = "fast" ]; then
    pass "Config artifact returns preset"
  else
    fail "Config artifact returns preset"
    echo "   Response: $PRESET_CONFIG_RESPONSE"
  fi
fi

info "Reject timesteps below configured minimum bound"
LOW_STEPS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {"total_timesteps": 1000}
  }')
if [ "$LOW_STEPS_HTTP" = "422" ]; then
  pass "Timesteps lower bound validation"
else
  fail "Timesteps lower bound validation expected 422, got $LOW_STEPS_HTTP"
fi

info "Reject invalid PPO batch_size > n_steps"
PPO_RELATION_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {"batch_size": 512, "n_steps": 256}
  }')
PPO_RELATION_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {"batch_size": 512, "n_steps": 256}
  }')
PPO_RELATION_CODE=$(echo "$PPO_RELATION_RESPONSE" | jq -r '.detail.error.code // empty' 2>/dev/null || true)
if [ "$PPO_RELATION_HTTP" = "422" ] && [ "$PPO_RELATION_CODE" = "invalid_hyperparameters" ]; then
  pass "PPO relationship validation"
else
  fail "PPO relationship validation"
  echo "   Response: $PPO_RELATION_RESPONSE"
fi

info "Reject invalid DQN buffer_size < batch_size"
DQN_RELATION_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "DQN",
    "hyperparameters": {"batch_size": 1024, "buffer_size": 512}
  }')
DQN_RELATION_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "DQN",
    "hyperparameters": {"batch_size": 1024, "buffer_size": 512}
  }')
DQN_RELATION_CODE=$(echo "$DQN_RELATION_RESPONSE" | jq -r '.detail.error.code // empty' 2>/dev/null || true)
if [ "$DQN_RELATION_HTTP" = "422" ] && [ "$DQN_RELATION_CODE" = "invalid_hyperparameters" ]; then
  pass "DQN relationship validation"
else
  fail "DQN relationship validation"
  echo "   Response: $DQN_RELATION_RESPONSE"
fi

info "Reject unknown hyperparameter key"
UNKNOWN_PARAM_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {"unknown_key": 1}
  }')
if [ "$UNKNOWN_PARAM_HTTP" = "422" ]; then
  pass "Unknown hyperparameter rejected"
else
  fail "Unknown hyperparameter expected 422, got $UNKNOWN_PARAM_HTTP"
fi
echo ""

echo "================================"
echo "TEST SUMMARY"
echo "================================"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
fi

echo -e "${RED}✗ SOME TESTS FAILED${NC}"
exit 1
