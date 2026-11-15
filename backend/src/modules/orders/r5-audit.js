const fs=require('node:fs');
const path=require('node:path');
// Stable shared schema before R1 merge; use R1 helper as soon as it is present.
async function log(client,entry) {
  const filename=path.join(__dirname,'../support/action-log.service.js');
  if(fs.existsSync(filename))return require(filename).logAdminAction(client,entry);
  return client.query('INSERT INTO admin_action_log(admin_id,action_type,target_type,target_id,note) VALUES($1,$2,$3,$4,$5)',[entry.adminId,entry.actionType,entry.targetType,entry.targetId,entry.note]);
}
module.exports={log};
