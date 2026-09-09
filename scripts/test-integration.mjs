import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const freePort = () => new Promise((resolve,reject) => {
  const server = createServer(); server.once('error',reject);
  server.listen(0,'127.0.0.1',() => { const port=server.address().port; server.close(() => resolve(port)); });
});
const run = (args, env) => new Promise((resolve,reject) => {
  const child = spawn(process.execPath,args,{env,stdio:'inherit'});
  child.on('error',reject); child.on('exit',code => code===0 ? resolve() : reject(new Error(`Command failed (${code})`)));
});
const directory = await mkdtemp(join(tmpdir(),'mini-duel-postgres-'));
const dbPort=await freePort(), appPort=await freePort();
const password=randomBytes(18).toString('hex');
const database=new EmbeddedPostgres({databaseDir:join(directory,'database'),user:'postgres',password,port:dbPort,persistent:true,initdbFlags:['--locale=C','--encoding=UTF8'],onLog:()=>{},onError:()=>{}});
const env={...process.env,DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${dbPort}/postgres`,MINI_TEST_URL:`http://127.0.0.1:${appPort}`,NEXT_TELEMETRY_DISABLED:'1'};
let server;
let failed = false;
try {
  await database.initialise(); await database.start();
  await run(['scripts/migrate.mjs'],env);
  await run(['scripts/migrate.mjs'],env);
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{env,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',()=>{});
  server.stderr.on('data',chunk=>process.stderr.write(chunk));
  let ready=false;
  for(let attempt=0;attempt<100;attempt++) {
    try { const response=await fetch(env.MINI_TEST_URL); if(response.ok){ready=true;break;} } catch {}
    if(server.exitCode!==null) throw new Error('Next.js test server exited');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready) throw new Error('Next.js test server did not start');
  await run(['--experimental-strip-types','--test','tests/game.test.ts'],env);
} catch(error) { console.error(error instanceof Error ? error.message : 'Integration test failed'); failed=true; }
finally {
  if(server && server.exitCode===null) { const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped; }
  await database.stop().catch(()=>{});
  await rm(directory,{recursive:true,force:true});
  if(failed) process.exitCode=1;
}
process.exit(failed ? 1 : 0);

// #checked 9/9/2025
