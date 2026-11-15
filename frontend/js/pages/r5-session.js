// Same storage format/key and idle period as R1 events.js; this never sends events.
let memory=null;
export function getR5SessionId(now=Date.now()) {
  let saved;
  try {saved=JSON.parse(localStorage.getItem('mdr_session'));} catch { /* optional storage */ }
  let session=saved||memory;
  if(!session||typeof session.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(session.id)||typeof session.last!=='number'||now<session.last||now-session.last>1800000)
    session={id:crypto.randomUUID()};
  session.last=now;memory=session;
  try {localStorage.setItem('mdr_session',JSON.stringify(session));} catch { /* memory fallback */ }
  return session.id;
}
