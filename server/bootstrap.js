import { initDb } from './db.js';
if(process.env.CONFIRM_EMPTY_DB!=='yes') { console.error('Bootstrap is only for a new, empty database. Set CONFIRM_EMPTY_DB=yes after checking the target.'); process.exit(1); }
await initDb({bootstrap:true});
console.log('Schema and four official communities created.');
process.exit(0);
