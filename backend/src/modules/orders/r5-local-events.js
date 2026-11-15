const database = require('../../db/pool');
const r4 = require('../events/events.service');
const { productEvents } = require('./r5-event-contract');
const { isProduction } = require('../../config/env');

// Same database: the outbox lock, R4 writes and acknowledgment commit together.
// A rollback (including process termination) leaves no event to duplicate on retry.
function createDispatcher({ db = database, record = r4.record, scopeUserId = null, allowTestEvents = false } = {}) {
  async function dispatchOne() {
    return db.withTransaction(async client => {
      const row = (await client.query(`SELECT * FROM r5_event_outbox
        WHERE delivered_at IS NULL AND next_attempt_at <= NOW()
          AND ($1::bigint IS NULL OR user_id = $1)
          AND ($2::boolean OR payload->'test_mode' IS DISTINCT FROM 'true'::jsonb)
        ORDER BY created_at,event_key FOR UPDATE SKIP LOCKED LIMIT 1`, [scopeUserId, allowTestEvents])).rows[0];
      if (!row) return { status: 'empty' };
      await client.query('SAVEPOINT r5_local_delivery');
      try {
        for (const { body } of productEvents(row)) {
          await record({ productId: body.product_id, eventType: body.event_type,
            sessionId: body.session_id, userId: Number(row.user_id) }, client);
        }
        await client.query(`UPDATE r5_event_outbox SET delivered_at=NOW(),attempts=attempts+1
          WHERE event_key=$1`, [row.event_key]);
        await client.query('RELEASE SAVEPOINT r5_local_delivery');
        return { status: 'delivered' };
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT r5_local_delivery');
        await client.query('RELEASE SAVEPOINT r5_local_delivery');
        await client.query(`UPDATE r5_event_outbox SET attempts=attempts+1,
          next_attempt_at=NOW()+INTERVAL '30 seconds' WHERE event_key=$1`, [row.event_key]);
        return { status: 'retry' };
      }
    });
  }
  return { dispatchOne };
}

function startWorker({ dispatcher = createDispatcher(), intervalMs = 1000, batchSize = 25 } = {}) {
  let running = null, stopped = false;
  function tick() {
    if (stopped || running) return;
    running = (async () => {
      for (let i = 0; i < batchSize && !stopped; i++) {
        if ((await dispatcher.dispatchOne()).status === 'empty') break;
      }
    })().catch(() => console.warn('R5_EVENT_DISPATCH_FAILED')).finally(() => { running = null; });
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async function stop() { stopped = true; clearInterval(timer); await running; };
}
function createRuntimeDispatcher({ production = isProduction, ...options } = {}) {
  return createDispatcher({...options,allowTestEvents:!production});
}
module.exports = { createDispatcher, createRuntimeDispatcher, startWorker };
