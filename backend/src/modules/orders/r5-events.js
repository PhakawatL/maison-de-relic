const dbDefault=require('../../db/pool');
const {productEvents}=require('./r5-event-contract');

// Transport is constructor-only until R4 agrees on endpoint, auth and payload.
// There is no HTTP endpoint or environment option to activate this dispatcher.
function createEvents({db=dbDefault,transport=null,timeoutMs=2000,scopeUserId=null,r4Transport=null,receiverDeduplicates=false,allowTestEvents=false,warn=()=>console.warn('R5_EVENT_ENQUEUE_FAILED')}={}) {
  async function enqueue(client,event) {
    // Analytics failure must not roll back the cart or a verified paid order.
    await client.query('SAVEPOINT r5_event');
    try {
      await client.query(`INSERT INTO r5_event_outbox(event_key,event_type,user_id,order_id,payload)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`,
      [event.key,event.type,event.userId,event.orderId??null,event.payload]);
      await client.query('RELEASE SAVEPOINT r5_event');
      return true;
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT r5_event');
      await client.query('RELEASE SAVEPOINT r5_event');
      try { warn(); } catch { /* Monitoring cannot break the purchase. */ }
      return false;
    }
  }
  async function dispatchOne() {
    const perProduct=typeof r4Transport==='function';
    if(!perProduct&&typeof transport!=='function')return {status:'disabled'};
    if(perProduct&&!receiverDeduplicates)return {status:'contract_pending'};
    return db.withTransaction(async client=>{
      const row=(await client.query(`SELECT * FROM r5_event_outbox
        WHERE delivered_at IS NULL AND next_attempt_at<=NOW()
          AND ($1::bigint IS NULL OR user_id=$1)
          AND ($2::boolean OR payload->'test_mode' IS DISTINCT FROM 'true'::jsonb)
        ORDER BY created_at,event_key FOR UPDATE SKIP LOCKED LIMIT 1`,[scopeUserId,!perProduct||allowTestEvents])).rows[0];
      if(!row)return {status:'empty'};
      async function bounded(send) {
        const controller=new AbortController();let timer;
        try { return await Promise.race([Promise.resolve().then(()=>send(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('event delivery timeout'));},timeoutMs);})]); }
        finally {clearTimeout(timer);}
      }
      try {
        if(perProduct) {
          const acknowledged=new Set(row.delivered_product_ids.map(Number));
          for(const event of productEvents(row)) {
            if(acknowledged.has(event.body.product_id))continue;
            // Identity is transport metadata, never an untrusted user_id in the R4 body.
            const response=await bounded(signal=>r4Transport(event.body,{signal,idempotencyKey:event.key,userId:Number(row.user_id)}));
            if(![201,204].includes(response?.status))throw new Error('event not acknowledged');
            await client.query('UPDATE r5_event_outbox SET delivered_product_ids=array_append(delivered_product_ids,$2::bigint) WHERE event_key=$1',[row.event_key,event.body.product_id]);
          }
        } else {
          const acknowledgement=await bounded(signal=>transport({event_key:row.event_key,event_type:row.event_type,payload:row.payload,occurred_at:row.created_at},{signal}));
          if(acknowledgement?.accepted!==true)throw new Error('event not acknowledged');
        }
        await client.query('UPDATE r5_event_outbox SET delivered_at=NOW(),attempts=attempts+1 WHERE event_key=$1',[row.event_key]);
        return {status:'delivered',key:row.event_key};
      } catch {
        // Never persist/log transport errors, headers, credentials or response bodies.
        await client.query(`UPDATE r5_event_outbox SET attempts=attempts+1,
          next_attempt_at=NOW()+INTERVAL '30 seconds' WHERE event_key=$1`,[row.event_key]);
        return {status:'retry',key:row.event_key};
      }
    });
  }
  return {enqueue,dispatchOne};
}
module.exports={...createEvents(),createEvents};
