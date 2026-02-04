#!/bin/bash
# Comprehensive backend acceptance test for RL Gym Visualizer.
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
  echo "$json" | jq -r "$query" 2>/dev/null || true
}

status_in_list() {
  local status="$1"
  shift
  local allowed
  for allowed in "$@"; do
    if [ "$status" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

wait_for_status_in() {
  local run_id="$1"
  local timeout_secs="${2:-30}"
  shift 2
  local started_at
  started_at=$(date +%s)

  while true; do
    local payload
    payload=$(curl -s --max-time 5 "$API_BASE/runs/$run_id")
    local status
    status=$(json_get "$payload" '.status // "unknown"')

    if status_in_list "$status" "$@"; then
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

wait_for_terminal_status() {
  local run_id="$1"
  local timeout_secs="${2:-30}"
  wait_for_status_in "$run_id" "$timeout_secs" stopped completed failed
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
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "$API_BASE/environments/$ENV/preview" || echo "000")
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

BASE_RUN_ID=$(json_get "$CREATE_RESPONSE" '.id // empty')
if [ -n "$BASE_RUN_ID" ] && [ "$BASE_RUN_ID" != "null" ]; then
  pass "Create run ($BASE_RUN_ID)"
else
  fail "Create run"
  echo "   Response: $CREATE_RESPONSE"
  exit 1
fi

info "Start training"
START_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$BASE_RUN_ID/start")
START_STATUS=$(json_get "$START_RESPONSE" '.status // empty')
if [ "$START_STATUS" = "training" ]; then
  pass "Start training"
else
  fail "Start training (status: $START_STATUS)"
  echo "   Response: $START_RESPONSE"
fi

info "Check metrics SSE endpoint"
SSE_RESULT=$(curl -sN --max-time 3 "$API_BASE/runs/$BASE_RUN_ID/stream/metrics" || true)
if echo "$SSE_RESULT" | grep -q "event:"; then
  pass "Metrics stream emits SSE data"
else
  fail "Metrics stream did not emit SSE data"
fi

info "Check events SSE endpoint"
EVENTS_SSE_RESULT=$(curl -sN --max-time 3 "$API_BASE/runs/$BASE_RUN_ID/stream/events" || true)
if echo "$EVENTS_SSE_RESULT" | grep -q "event: event"; then
  pass "Events stream emits event log data"
else
  fail "Events stream did not emit event log data"
fi

info "Stop training"
STOP_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$BASE_RUN_ID/stop")
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
BASE_FINAL_STATUS=$(wait_for_terminal_status "$BASE_RUN_ID" 45)
if [ "$BASE_FINAL_STATUS" = "stopped" ] || [ "$BASE_FINAL_STATUS" = "completed" ] || [ "$BASE_FINAL_STATUS" = "failed" ]; then
  pass "Run reached terminal status ($BASE_FINAL_STATUS)"
else
  fail "Run did not reach terminal status in time (last: $BASE_FINAL_STATUS)"
fi

info "Verify completed run reports 100% training progress"
BASE_RUN_PAYLOAD=$(curl -s --max-time 5 "$API_BASE/runs/$BASE_RUN_ID")
BASE_PROGRESS_PERCENT=$(json_get "$BASE_RUN_PAYLOAD" '.progress.percent_complete // -1')
if [ "$BASE_FINAL_STATUS" = "completed" ]; then
  if [ "$BASE_PROGRESS_PERCENT" = "100" ] || [ "$BASE_PROGRESS_PERCENT" = "100.0" ]; then
    pass "Completed run progress is 100%"
  else
    fail "Completed run progress expected 100%, got $BASE_PROGRESS_PERCENT"
  fi
else
  pass "Skipped 100% progress check because run status is $BASE_FINAL_STATUS"
fi
echo ""

echo "=== 4. ARTIFACT ENDPOINTS ==="
echo ""

info "Get run config artifact"
CONFIG_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/artifacts/config")
if [ "$CONFIG_HTTP" = "200" ]; then
  pass "Config artifact endpoint"
else
  fail "Config artifact endpoint (HTTP $CONFIG_HTTP)"
fi

info "Get metrics artifact"
METRICS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/artifacts/metrics")
if [ "$METRICS_HTTP" = "200" ]; then
  pass "Metrics artifact endpoint"
else
  fail "Metrics artifact endpoint (HTTP $METRICS_HTTP)"
fi

info "Get metrics artifact with tail=1"
METRICS_TAIL_PAYLOAD=$(curl -s --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/artifacts/metrics?tail=1")
METRICS_TAIL_COUNT=$(json_get "$METRICS_TAIL_PAYLOAD" '.metrics | length')
if [ "$METRICS_TAIL_COUNT" -le 1 ]; then
  pass "Metrics tail query returns <= 1 item"
else
  fail "Metrics tail query expected <= 1 item, got $METRICS_TAIL_COUNT"
fi

info "Reject invalid metrics tail (tail=0)"
METRICS_TAIL_INVALID_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/artifacts/metrics?tail=0")
if [ "$METRICS_TAIL_INVALID_HTTP" = "422" ]; then
  pass "Metrics tail validation"
else
  fail "Metrics tail validation expected 422, got $METRICS_TAIL_INVALID_HTTP"
fi

info "Get events list endpoint"
EVENTS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/events")
if [ "$EVENTS_HTTP" = "200" ]; then
  pass "Events endpoint"
else
  fail "Events endpoint (HTTP $EVENTS_HTTP)"
fi

info "No evaluation summary before TEST run"
PRE_EVAL_SUMMARY_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/evaluate/latest")
if [ "$PRE_EVAL_SUMMARY_HTTP" = "404" ]; then
  pass "No evaluation summary before evaluation"
else
  fail "Expected no pre-eval summary (HTTP $PRE_EVAL_SUMMARY_HTTP)"
fi

info "No evaluation video before TEST run"
PRE_EVAL_VIDEO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/artifacts/eval/latest.mp4")
if [ "$PRE_EVAL_VIDEO_HTTP" = "404" ]; then
  pass "No evaluation video before evaluation"
else
  fail "Expected no pre-eval video (HTTP $PRE_EVAL_VIDEO_HTTP)"
fi
echo ""

echo "=== 5. EVALUATION FLOW (COMPLETE PATH) ==="
echo ""

if [ "$BASE_FINAL_STATUS" = "stopped" ] || [ "$BASE_FINAL_STATUS" = "completed" ]; then
  info "Trigger evaluation"
  EVAL_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$BASE_RUN_ID/evaluate" \
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
  EVAL_FINAL=$(wait_for_status_in "$BASE_RUN_ID" 60 stopped completed)
  if [ "$EVAL_FINAL" = "stopped" ] || [ "$EVAL_FINAL" = "completed" ]; then
    pass "Evaluation finished and run status restored ($EVAL_FINAL)"
  else
    fail "Evaluation did not finish in time (last: $EVAL_FINAL)"
  fi

  info "Fetch latest evaluation summary"
  SUMMARY_RESPONSE=$(curl -s --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/evaluate/latest")
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
  VIDEO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_BASE/runs/$BASE_RUN_ID/artifacts/eval/latest.mp4")
  if [ "$VIDEO_HTTP" = "200" ]; then
    pass "Latest evaluation video endpoint"
  else
    fail "Latest evaluation video endpoint (HTTP $VIDEO_HTTP)"
  fi

  info "Verify evaluation lifecycle events"
  EVAL_EVENTS=$(curl -s --max-time 5 "$API_BASE/runs/$BASE_RUN_ID/events?limit=100")
  HAS_EVAL_STARTED=$(echo "$EVAL_EVENTS" | jq -r '[.events[]? | select(.event_type=="evaluation_started")] | length')
  HAS_EVAL_COMPLETED=$(echo "$EVAL_EVENTS" | jq -r '[.events[]? | select(.event_type=="evaluation_completed")] | length')
  if [ "$HAS_EVAL_STARTED" -ge 1 ] && [ "$HAS_EVAL_COMPLETED" -ge 1 ]; then
    pass "Evaluation started/completed events recorded"
  else
    fail "Evaluation events missing"
    echo "   Started events: $HAS_EVAL_STARTED  Completed events: $HAS_EVAL_COMPLETED"
  fi
else
  fail "Skipping evaluation flow because run ended as $BASE_FINAL_STATUS"
fi
echo ""

echo "=== 6. STATE TRANSITION MATRIX ==="
echo ""

info "Create long-running run for state transition checks"
STATE_RUN_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {
      "learning_rate": 0.0003,
      "total_timesteps": 250000
    }
  }')
STATE_RUN_ID=$(json_get "$STATE_RUN_RESPONSE" '.id // empty')
if [ -n "$STATE_RUN_ID" ] && [ "$STATE_RUN_ID" != "null" ]; then
  pass "Create state-transition run ($STATE_RUN_ID)"
else
  fail "Create state-transition run"
  echo "   Response: $STATE_RUN_RESPONSE"
  exit 1
fi

info "Reject stop training when run is pending"
PENDING_STOP_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs/$STATE_RUN_ID/stop")
PENDING_STOP_BODY=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/stop")
PENDING_STOP_CODE=$(json_get "$PENDING_STOP_BODY" '.detail.error.code // empty')
if [ "$PENDING_STOP_HTTP" = "409" ] && [ "$PENDING_STOP_CODE" = "not_running" ]; then
  pass "Pending run cannot be stopped as training"
else
  fail "Pending stop validation"
  echo "   Response: $PENDING_STOP_BODY"
fi

info "Reject evaluation when run is pending"
PENDING_EVAL_BODY=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"num_episodes": 2, "stream_frames": false, "target_fps": 10}')
PENDING_EVAL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"num_episodes": 2, "stream_frames": false, "target_fps": 10}')
PENDING_EVAL_CODE=$(json_get "$PENDING_EVAL_BODY" '.detail.error.code // empty')
if [ "$PENDING_EVAL_HTTP" = "409" ] && [ "$PENDING_EVAL_CODE" = "invalid_status" ]; then
  pass "Pending run cannot be evaluated"
else
  fail "Pending evaluation validation"
  echo "   Response: $PENDING_EVAL_BODY"
fi

info "No evaluation progress before evaluation starts"
NO_EVAL_PROGRESS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/$STATE_RUN_ID/evaluate/progress")
if [ "$NO_EVAL_PROGRESS_HTTP" = "404" ]; then
  pass "Evaluation progress returns 404 when not evaluating"
else
  fail "Evaluation progress expected 404, got $NO_EVAL_PROGRESS_HTTP"
fi

info "Start training for state-transition run"
STATE_START_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/start")
STATE_START_STATUS=$(json_get "$STATE_START_RESPONSE" '.status // empty')
if [ "$STATE_START_STATUS" = "training" ]; then
  pass "State-transition run started"
else
  fail "State-transition run did not start"
  echo "   Response: $STATE_START_RESPONSE"
fi

sleep 1

info "Reject duplicate start while already training"
DUP_START_BODY=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/start")
DUP_START_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs/$STATE_RUN_ID/start")
DUP_START_CODE=$(json_get "$DUP_START_BODY" '.detail.error.code // empty')
if [ "$DUP_START_HTTP" = "409" ] && [ "$DUP_START_CODE" = "conflict" ]; then
  pass "Duplicate start rejected"
else
  fail "Duplicate start validation"
  echo "   Response: $DUP_START_BODY"
fi

info "Reject evaluation while training is active"
TRAINING_EVAL_BODY=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"num_episodes": 2, "stream_frames": false, "target_fps": 10}')
TRAINING_EVAL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"num_episodes": 2, "stream_frames": false, "target_fps": 10}')
TRAINING_EVAL_CODE=$(json_get "$TRAINING_EVAL_BODY" '.detail.error.code // empty')
if [ "$TRAINING_EVAL_HTTP" = "409" ] && [ "$TRAINING_EVAL_CODE" = "invalid_status" ]; then
  pass "Training run cannot be evaluated"
else
  fail "Training evaluation validation"
  echo "   Response: $TRAINING_EVAL_BODY"
fi

info "Stop state-transition training run"
STATE_STOP_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/stop")
STATE_STOP_STATUS=$(json_get "$STATE_STOP_RESPONSE" '.status // empty')
if [ "$STATE_STOP_STATUS" = "stopping" ] || [ "$STATE_STOP_STATUS" = "stopped" ]; then
  pass "Stop accepted for state-transition run"
else
  fail "Stop not accepted for state-transition run"
  echo "   Response: $STATE_STOP_RESPONSE"
fi

info "Wait for state-transition run terminal status"
STATE_TERMINAL_STATUS=$(wait_for_terminal_status "$STATE_RUN_ID" 60)
if [ "$STATE_TERMINAL_STATUS" = "stopped" ] || [ "$STATE_TERMINAL_STATUS" = "completed" ]; then
  pass "State-transition run reached terminal status ($STATE_TERMINAL_STATUS)"
else
  fail "State-transition run did not reach terminal status (last: $STATE_TERMINAL_STATUS)"
fi

if [ "$STATE_TERMINAL_STATUS" = "stopped" ]; then
  info "Restart training from stopped state"
  RESTART_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/start")
  RESTART_STATUS=$(json_get "$RESTART_RESPONSE" '.status // empty')
  if [ "$RESTART_STATUS" = "training" ]; then
    pass "Restart from stopped state succeeded"
  else
    fail "Restart from stopped state failed"
    echo "   Response: $RESTART_RESPONSE"
  fi

  sleep 1
  info "Stop restarted training"
  RESTOP_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/stop")
  RESTOP_STATUS=$(json_get "$RESTOP_RESPONSE" '.status // empty')
  if [ "$RESTOP_STATUS" = "stopping" ] || [ "$RESTOP_STATUS" = "stopped" ]; then
    pass "Stop accepted after restart"
  else
    fail "Stop after restart failed"
    echo "   Response: $RESTOP_RESPONSE"
  fi

  info "Wait for post-restart terminal status"
  POST_RESTART_STATUS=$(wait_for_terminal_status "$STATE_RUN_ID" 60)
  if [ "$POST_RESTART_STATUS" = "stopped" ] || [ "$POST_RESTART_STATUS" = "completed" ]; then
    pass "Post-restart run reached terminal status ($POST_RESTART_STATUS)"
  else
    fail "Post-restart run did not reach terminal status (last: $POST_RESTART_STATUS)"
  fi
fi
echo ""

echo "=== 7. EVALUATION STOP + PROGRESS STATES ==="
echo ""

info "Trigger long evaluation run"
EVAL_STOP_RESPONSE=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"num_episodes": 80, "stream_frames": false, "target_fps": 15}')
EVAL_STOP_STATUS=$(json_get "$EVAL_STOP_RESPONSE" '.status // empty')
if [ "$EVAL_STOP_STATUS" = "evaluating" ]; then
  pass "Long evaluation started"
else
  fail "Long evaluation did not start"
  echo "   Response: $EVAL_STOP_RESPONSE"
fi

sleep 1

info "Fetch evaluation progress while evaluating"
EVAL_PROGRESS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/$STATE_RUN_ID/evaluate/progress")
EVAL_PROGRESS_BODY=$(curl -s "$API_BASE/runs/$STATE_RUN_ID/evaluate/progress")
EVAL_PROGRESS_RUNNING=$(json_get "$EVAL_PROGRESS_BODY" '.is_running // false')
if [ "$EVAL_PROGRESS_HTTP" = "200" ] && [ "$EVAL_PROGRESS_RUNNING" = "true" ]; then
  pass "Evaluation progress endpoint reports active run"
else
  fail "Evaluation progress endpoint while evaluating"
  echo "   Response: $EVAL_PROGRESS_BODY"
fi

info "Request evaluation stop"
EVAL_STOP_REQUEST=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate/stop")
EVAL_STOP_REQUEST_STATUS=$(json_get "$EVAL_STOP_REQUEST" '.status // empty')
EVAL_STOP_REQUEST_CODE=$(json_get "$EVAL_STOP_REQUEST" '.detail.error.code // empty')
EVAL_STOP_REQUEST_CURRENT=$(json_get "$EVAL_STOP_REQUEST" '.detail.error.details.current_status // empty')
if [ "$EVAL_STOP_REQUEST_STATUS" = "stopping" ]; then
  pass "Evaluation stop accepted"
elif [ "$EVAL_STOP_REQUEST_CODE" = "not_evaluating" ] && { [ "$EVAL_STOP_REQUEST_CURRENT" = "completed" ] || [ "$EVAL_STOP_REQUEST_CURRENT" = "stopped" ]; }; then
  pass "Evaluation already completed before stop request"
else
  fail "Evaluation stop request failed"
  echo "   Response: $EVAL_STOP_REQUEST"
fi

info "Wait for status restored after evaluation"
EVAL_STOP_FINAL_STATUS=$(wait_for_status_in "$STATE_RUN_ID" 120 stopped completed)
if [ "$EVAL_STOP_FINAL_STATUS" = "stopped" ] || [ "$EVAL_STOP_FINAL_STATUS" = "completed" ]; then
  pass "Status restored after evaluation stop/completion ($EVAL_STOP_FINAL_STATUS)"
else
  fail "Run status not restored after evaluation (last: $EVAL_STOP_FINAL_STATUS)"
fi

info "Reject evaluation stop when not evaluating"
NO_EVAL_STOP_BODY=$(curl -s -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate/stop")
NO_EVAL_STOP_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs/$STATE_RUN_ID/evaluate/stop")
NO_EVAL_STOP_CODE=$(json_get "$NO_EVAL_STOP_BODY" '.detail.error.code // empty')
if [ "$NO_EVAL_STOP_HTTP" = "409" ] && [ "$NO_EVAL_STOP_CODE" = "not_evaluating" ]; then
  pass "Evaluation stop rejected when not evaluating"
else
  fail "Expected not_evaluating after eval completion"
  echo "   Response: $NO_EVAL_STOP_BODY"
fi

info "Evaluation progress returns 404 after evaluation ends"
POST_EVAL_PROGRESS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/$STATE_RUN_ID/evaluate/progress")
if [ "$POST_EVAL_PROGRESS_HTTP" = "404" ]; then
  pass "Evaluation progress unavailable after completion"
else
  fail "Post-evaluation progress expected 404, got $POST_EVAL_PROGRESS_HTTP"
fi
echo ""

echo "=== 8. VALIDATION + ERROR PATHS ==="
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

info "Invalid run ID format rejected on artifact endpoint"
INVALID_RUN_ID_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/not-a-uuid/artifacts/config")
if [ "$INVALID_RUN_ID_HTTP" = "400" ]; then
  pass "Invalid run ID format validation"
else
  fail "Invalid run ID format expected 400, got $INVALID_RUN_ID_HTTP"
fi

info "Invalid eval filename format rejected"
INVALID_FILENAME_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/$BASE_RUN_ID/artifacts/eval/not_a_video.mp4")
if [ "$INVALID_FILENAME_HTTP" = "400" ]; then
  pass "Invalid eval filename validation"
else
  fail "Invalid eval filename expected 400, got $INVALID_FILENAME_HTTP"
fi

info "Missing named evaluation video returns 404"
MISSING_VIDEO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/runs/$BASE_RUN_ID/artifacts/eval/eval_2099-01-01T00-00-00.mp4")
if [ "$MISSING_VIDEO_HTTP" = "404" ]; then
  pass "Missing named evaluation video returns 404"
else
  fail "Missing named evaluation video expected 404, got $MISSING_VIDEO_HTTP"
fi
echo ""

echo "=== 9. CREATE RUN FOR ALL REGISTERED ENVS ==="
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

echo "=== 10. PRESET MAPPING + BOUNDS VALIDATION ==="
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

info "Reject DQN-only hyperparameters when algorithm is PPO"
PPO_INVALID_FIELD_RESPONSE=$(curl -s -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {"buffer_size": 200000}
  }')
PPO_INVALID_FIELD_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "env_id": "CartPole-v1",
    "algorithm": "PPO",
    "hyperparameters": {"buffer_size": 200000}
  }')
PPO_INVALID_FIELD_CODE=$(echo "$PPO_INVALID_FIELD_RESPONSE" | jq -r '.detail.error.code // empty' 2>/dev/null || true)
if [ "$PPO_INVALID_FIELD_HTTP" = "422" ] && [ "$PPO_INVALID_FIELD_CODE" = "invalid_hyperparameters" ]; then
  pass "Algorithm-specific hyperparameter validation"
else
  fail "Algorithm-specific hyperparameter validation"
  echo "   Response: $PPO_INVALID_FIELD_RESPONSE"
fi
echo ""

echo "=== 11. LIST RUNS FILTERING + PAGINATION ==="
echo ""

info "List runs with limit=1"
RUNS_LIMIT_PAYLOAD=$(curl -s --max-time 5 "$API_BASE/runs?limit=1&offset=0")
RUNS_LIMIT_COUNT=$(json_get "$RUNS_LIMIT_PAYLOAD" '.runs | length')
if [ "$RUNS_LIMIT_COUNT" -le 1 ]; then
  pass "Runs pagination limit respected"
else
  fail "Runs pagination expected <=1 item, got $RUNS_LIMIT_COUNT"
fi

info "List runs filtered by status=completed"
RUNS_COMPLETED_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs?status=completed&limit=20")
if [ "$RUNS_COMPLETED_HTTP" = "200" ]; then
  pass "Runs status filter endpoint"
else
  fail "Runs status filter endpoint (HTTP $RUNS_COMPLETED_HTTP)"
fi

info "Reject invalid runs limit > 100"
RUNS_LIMIT_INVALID_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/runs?limit=101")
if [ "$RUNS_LIMIT_INVALID_HTTP" = "422" ]; then
  pass "Runs list validation for limit"
else
  fail "Runs list limit validation expected 422, got $RUNS_LIMIT_INVALID_HTTP"
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
