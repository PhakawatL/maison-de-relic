// Opt-in local fixtures for manually trying R5 Cart. Does not run with db:seed.
const db=require('../src/db/pool');
const env=require('../src/config/env');
async function main(){
  const host=new URL(env.databaseUrl).hostname;
  if(env.isProduction || !['localhost','127.0.0.1','db'].includes(host))
    throw new Error('R5 demo products are only allowed in the local development database');
  await db.withTransaction(async client=>{
    const admin=(await client.query(`SELECT a.user_id FROM admin a JOIN "user" u ON u.user_id=a.user_id
      WHERE u.username='staff' AND u.is_active=true`)).rows[0];
    if(!admin)throw new Error('Run local user seeds first: staff account is required');
    const samples=[
      ['[TEST R5] Labubu Macaron','art-toys',590,10,'/assets/images/p-labubu.jpg'],
      ['[TEST R5] Collector Card','trading-cards',125.50,3,'/assets/images/p-charizard-base.jpg'],
      ['[TEST R5] Model Limited Stock','model-kits',1499,1,'/assets/images/p-gundam.jpg'],
    ];
    await client.query("SELECT pg_advisory_xact_lock(hashtext('r5-demo-products'))");
    for(const [title,slug,price,stock,image] of samples){
      const existing=(await client.query(`SELECT product_id FROM product WHERE title=$1 AND attributes->>'r5_demo'='true'`,[title])).rows[0];
      if(existing){console.log(`Already present: ${existing.product_id} ${title}`);continue;}
      const category=(await client.query('SELECT category_id FROM category WHERE slug=$1',[slug])).rows[0];
      if(!category)throw new Error('Missing local demo category');
      const row=(await client.query(`INSERT INTO product(category_id,created_by,title,description,price,condition,status,stock_quantity,cover_image_url,attributes)
        VALUES($1,$2,$3,'สินค้าสำหรับทดลอง Cart ของ R5 เท่านั้น ไม่ใช่รายการขายจริง',$4,'new','available',$5,$6,'{"r5_demo":true}') RETURNING product_id`,
      [category.category_id,admin.user_id,title,price,stock,image])).rows[0];
      console.log(`Created: ${row.product_id} ${title}`);
    }
  });
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
