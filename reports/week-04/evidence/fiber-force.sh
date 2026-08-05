#!/usr/bin/env bash
# Open a second channel, move money, then FORCE close it after disconnecting
# the peer — so the commitment transaction actually lands on chain.
set -uo pipefail

N1=http://127.0.0.1:21714
N2=http://127.0.0.1:21715
CKB=http://127.0.0.1:8114
OUT=/private/tmp/claude-501/-Users-chizaa-Documents-projects-ckb/0bfa51bf-c626-4f2f-a6d3-f9193b3c9fe7/scratchpad/fiber-force-evidence.txt

rpc() {
  curl -s -X POST "$1" -H 'content-type: application/json' \
    --data "{\"id\":42,\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":$3}" --max-time 30
}
jqr() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
gen_blocks() { for _ in $(seq "${1:-4}"); do rpc "$CKB" generate_block '[]' >/dev/null; done; }
log() { echo "$@" | tee -a "$OUT"; }

: > "$OUT"
log "=== Fiber FORCE close (commitment transaction hits the chain) ==="

N1_PUB=$(rpc "$N1" node_info '[]' | jqr "['result']['pubkey']")
N2_PUB=$(rpc "$N2" node_info '[]' | jqr "['result']['pubkey']")
N2_ADDR=$(rpc "$N2" node_info '[]' | jqr "['result']['addresses'][0]")
N2_PEER=$(echo "$N2_ADDR" | awk -F'/p2p/' '{print $2}')

rpc "$N1" connect_peer "[{\"address\":\"$N2_ADDR\"}]" >/dev/null; sleep 3

log ""
log "--- open a second channel (500 CKB) ---"
rpc "$N1" open_channel "[{\"peer_id\":\"\",\"pubkey\":\"$N2_PUB\",\"funding_amount\":\"0xba43b7400\",\"public\":true}]" >/dev/null

CH_ID=""; OUTP=""
for i in $(seq 40); do
  gen_blocks 3; sleep 2
  CH=$(rpc "$N1" list_channels "[{\"pubkey\":\"$N2_PUB\"}]")
  read -r CH_ID OUTP STATE <<<"$(echo "$CH" | python3 -c "
import sys,json
chs=[c for c in json.load(sys.stdin)['result']['channels'] if c['state']['state_name']!='Closed']
print(chs[0]['channel_id'],chs[0]['channel_outpoint'],chs[0]['state']['state_name']) if chs else print('- - -')
")"
  echo "  attempt $i: $STATE"
  [ "$STATE" = "ChannelReady" ] && break
done
log "channel_id      : $CH_ID"
log "channel_outpoint: $OUTP"

log ""
log "--- move 2 CKB across it ---"
PRE="0x$(python3 -c "print('b7'*32)")"
INV=$(rpc "$N2" new_invoice "[{\"amount\":\"0xbebc200\",\"currency\":\"Fibd\",\"description\":\"force close test\",\"expiry\":\"0xe10\",\"hash_algorithm\":\"sha256\",\"payment_preimage\":\"$PRE\"}]")
ENC=$(echo "$INV" | jqr "['result']['invoice_address']")
sleep 2
PH=$(rpc "$N1" send_payment "[{\"invoice\":\"$ENC\"}]" | jqr "['result']['payment_hash']")
for i in $(seq 20); do
  sleep 2
  ST=$(rpc "$N1" get_payment "[{\"payment_hash\":\"$PH\"}]" | jqr "['result']['status']")
  [ "$ST" = "Success" ] && break
done
log "payment status: $ST"

COMMIT=$(rpc "$N1" list_channels "[{\"pubkey\":\"$N2_PUB\"}]" | python3 -c "
import sys,json
chs=[c for c in json.load(sys.stdin)['result']['channels'] if c['channel_id']=='$CH_ID']
print(chs[0]['latest_commitment_transaction_hash'])
")
log "latest_commitment_transaction_hash (still off-chain): $COMMIT"

log ""
log "--- disconnect the peer, then force close ---"
rpc "$N1" disconnect_peer "[{\"peer_id\":\"$N2_PEER\"}]"; echo
sleep 3
rpc "$N1" shutdown_channel "[{\"channel_id\":\"$CH_ID\",\"force\":true}]"; echo
for i in $(seq 30); do
  gen_blocks 3; sleep 2
  R=$(rpc "$N1" list_channels "[{\"pubkey\":\"$N2_PUB\",\"include_closed\":true}]" | python3 -c "
import sys,json
chs=[c for c in json.load(sys.stdin)['result']['channels'] if c['channel_id']=='$CH_ID']
c=chs[0]
print(c['state']['state_name'],c['state'].get('state_flags'),c.get('shutdown_transaction_hash'))
")
  echo "  attempt $i: $R"
  case "$R" in Closed*) break;; esac
done
log "final: $R"

CLOSE_TX=$(echo "$R" | awk '{print $3}')
log ""
log "--- the force-close transaction on chain ---"
rpc "$CKB" get_transaction "[\"$CLOSE_TX\"]" | python3 -c "
import sys,json
d=json.load(sys.stdin)['result']
if not d or not d.get('transaction'):
    print('  not on chain:',d['tx_status']['status']); raise SystemExit
tx=d['transaction']
print('  tx_hash:',tx['hash'],' status:',d['tx_status']['status'])
for i,inp in enumerate(tx['inputs']):
    print(f\"  in[{i}]  since={inp['since']}  prev={inp['previous_output']['tx_hash']}\")
for i,o in enumerate(tx['outputs']):
    print(f\"  out[{i}] {int(o['capacity'],16)/1e8:.4f} CKB lock.code_hash={o['lock']['code_hash']}\")
    print(f\"         lock.args={o['lock']['args']}\")
" | tee -a "$OUT"

log ""
log "=== written to $OUT ==="
