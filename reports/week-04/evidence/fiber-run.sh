#!/usr/bin/env bash
# Drive a full Fiber payment-channel lifecycle across two local nodes and
# print the evidence (channel id, funding tx, balances, closing tx).
set -uo pipefail

N1=http://127.0.0.1:21714
N2=http://127.0.0.1:21715
CKB=http://127.0.0.1:8114
OUT=/private/tmp/claude-501/-Users-chizaa-Documents-projects-ckb/0bfa51bf-c626-4f2f-a6d3-f9193b3c9fe7/scratchpad/fiber-evidence.txt

rpc() { # rpc <url> <method> <params-json>
  curl -s -X POST "$1" -H 'content-type: application/json' \
    --data "{\"id\":42,\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":$3}" --max-time 30
}

jqr() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

gen_blocks() { for _ in $(seq "${1:-4}"); do rpc "$CKB" generate_block '[]' >/dev/null; done; }

log() { echo "$@" | tee -a "$OUT"; }

: > "$OUT"
log "=== Fiber two-node channel lifecycle (fnn v0.8.1, ckb_dev) ==="

N1_PUB=$(rpc "$N1" node_info '[]' | jqr "['result']['pubkey']")
N2_PUB=$(rpc "$N2" node_info '[]' | jqr "['result']['pubkey']")
N2_ADDR=$(rpc "$N2" node_info '[]' | jqr "['result']['addresses'][0]")
N1_LOCK=$(rpc "$N1" node_info '[]' | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['result']['default_funding_lock_script']))")
log "node1 pubkey : $N1_PUB"
log "node2 pubkey : $N2_PUB"
log "node2 address: $N2_ADDR"

log ""
log "--- 1. connect peer ---"
rpc "$N1" connect_peer "[{\"address\":\"$N2_ADDR\"}]"; echo
sleep 3
log "node1 peers_count: $(rpc "$N1" node_info '[]' | jqr "['result']['peers_count']")"

log ""
log "--- 2. open channel (node1 funds 500 CKB) ---"
OPEN=$(rpc "$N1" open_channel "[{\"peer_id\":\"\",\"pubkey\":\"$N2_PUB\",\"funding_amount\":\"0xba43b7400\",\"public\":true}]")
log "open_channel -> $OPEN"
TEMP_ID=$(echo "$OPEN" | jqr "['result']['temporary_channel_id']")
log "temporary_channel_id: $TEMP_ID"

log ""
log "--- 3. mine until the funding transaction confirms ---"
CH_ID=""; CH_OUTPOINT=""; STATE=""
for i in $(seq 40); do
  gen_blocks 3
  sleep 2
  CH=$(rpc "$N1" list_channels "[{\"pubkey\":\"$N2_PUB\"}]")
  STATE=$(echo "$CH" | jqr "['result']['channels'][0]['state']['state_name']")
  CH_ID=$(echo "$CH" | jqr "['result']['channels'][0]['channel_id']")
  CH_OUTPOINT=$(echo "$CH" | jqr "['result']['channels'][0]['channel_outpoint']")
  echo "  attempt $i: state=$STATE outpoint=$CH_OUTPOINT"
  [ "$STATE" = "CHANNEL_READY" ] && break
done
log "channel_id      : $CH_ID"
log "channel_outpoint: $CH_OUTPOINT   (funding tx hash ++ output index)"
log "state           : $STATE"

FUNDING_TX="${CH_OUTPOINT%????????}"
log ""
log "--- 4. funding transaction on chain ---"
rpc "$CKB" get_transaction "[\"$FUNDING_TX\"]" | python3 -c "
import sys,json
d=json.load(sys.stdin)['result']
tx=d['transaction']
print('  tx_hash :',tx['hash'])
print('  status  :',d['tx_status']['status'])
print('  inputs  :',len(tx['inputs']),' outputs:',len(tx['outputs']))
for i,o in enumerate(tx['outputs']):
    print(f\"  out[{i}] capacity={int(o['capacity'],16)/1e8:.2f} CKB lock.code_hash={o['lock']['code_hash']}\")
" | tee -a "$OUT"

log ""
log "--- 5. balances before payment ---"
bal() {
  rpc "$1" list_channels "[{\"pubkey\":\"$2\"}]" | python3 -c "
import sys,json
c=json.load(sys.stdin)['result']['channels'][0]
print(f\"  local={int(c['local_balance'],16)/1e8:.4f} CKB  remote={int(c['remote_balance'],16)/1e8:.4f} CKB\")
"
}
log "node1: $(bal "$N1" "$N2_PUB")"
log "node2: $(bal "$N2" "$N1_PUB")"

log ""
log "--- 6. node2 issues an invoice for 1 CKB, node1 pays it off-chain ---"
PREIMAGE="0x$(python3 -c "print('a5'*32)")"
INV=$(rpc "$N2" new_invoice "[{\"amount\":\"0x5f5e100\",\"currency\":\"Fibd\",\"description\":\"week-04 test payment\",\"expiry\":\"0xe10\",\"hash_algorithm\":\"sha256\",\"payment_preimage\":\"$PREIMAGE\"}]")
ENCODED=$(echo "$INV" | jqr "['result']['invoice_address']")
PAY_HASH=$(echo "$INV" | jqr "['result']['invoice']['data']['payment_hash']")
log "invoice   : $ENCODED"
log "payment_hash: $PAY_HASH"

sleep 3
PAY=$(rpc "$N1" send_payment "[{\"invoice\":\"$ENCODED\"}]")
log "send_payment -> $PAY"
PAY_ID=$(echo "$PAY" | jqr "['result']['payment_hash']")

for i in $(seq 20); do
  sleep 2
  ST=$(rpc "$N1" get_payment "[{\"payment_hash\":\"$PAY_ID\"}]" | jqr "['result']['status']")
  echo "  payment status: $ST"
  [ "$ST" = "Success" ] && break
done
log "final payment status: $ST"

log ""
log "--- 7. balances after payment (no on-chain transaction) ---"
log "node1: $(bal "$N1" "$N2_PUB")"
log "node2: $(bal "$N2" "$N1_PUB")"
log "tip before close: $(rpc "$CKB" get_tip_block_number '[]' | jqr "['result']")"

log ""
log "--- 8. cooperative close from node1 ---"
SHUT=$(rpc "$N1" shutdown_channel "[{\"channel_id\":\"$CH_ID\",\"close_script\":$N1_LOCK,\"fee_rate\":\"0x3FC\"}]")
log "shutdown_channel -> $SHUT"

for i in $(seq 30); do
  gen_blocks 3
  sleep 2
  CH=$(rpc "$N1" list_channels "[{\"pubkey\":\"$N2_PUB\",\"include_closed\":true}]")
  STATE=$(echo "$CH" | jqr "['result']['channels'][0]['state']['state_name']")
  echo "  attempt $i: state=$STATE"
  case "$STATE" in CLOSED|*Closed*) break;; esac
done
log "final channel state: $STATE"
rpc "$N1" list_channels "[{\"pubkey\":\"$N2_PUB\",\"include_closed\":true}]" | python3 -m json.tool | tee -a "$OUT" | tail -40

log ""
log "=== evidence written to $OUT ==="
