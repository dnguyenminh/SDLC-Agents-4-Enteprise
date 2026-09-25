
import Docker from 'dockerode';
import pino from 'pino';

const logger = pino({ level: 'info' });
const docker = new Docker();

async function debugNetwork() {
  console.log('\n--- TC-18 Debug: Network Isolation ---');
  try {
    const container = await docker.createContainer({
      Image: 'node:alpine',
      Cmd: ['curl', '-I', 'https://google.com'],
      HostConfig: { NetworkMode: 'none' },
    });
    const id = container.id;
    console.log(`Created container ${id} with NetworkMode: 'none'`);
    
    const inspect = await container.inspect();
    console.log('HostConfig.NetworkMode:', inspect.HostConfig.NetworkMode);
    console.log('NetworkSettings.Networks:', JSON.stringify(inspect.NetworkSettings.Networks));
    
    const exec = await container.exec({
      Cmd: ['curl', '-I', 'https://google.com'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start();
    
    const output = await new Promise<string>((resolve) => {
      let data = '';
      stream.on('data', chunk => data += chunk.toString());
      stream.on('end', () => resolve(data));
    });
    
    const insp = await exec.inspect();
    console.log('Exit Code:', insp.ExitCode);
    console.log('Output:', output);
    
    await container.remove({ force: true });
  } catch (e) {
    console.error('Network Debug Error:', e);
  }
}

async function debugOOM() {
  console.log('\n--- TC-09 Debug: OOM Kill ---');
  try {
    const memLimit = 64 * 1024 * 1024; // 64MB
    const container = await docker.createContainer({
      Image: 'node:alpine',
      Cmd: ['node', '-e', 'const a=[]; while(true){a.push(Buffer.alloc(1<<20));}'],
      HostConfig: { 
        Memory: memLimit, 
        MemorySwap: memLimit 
      },
    });
    const id = container.id;
    console.log(`Created container ${id} with Memory limit: ${memLimit} bytes`);
    
    await container.start();
    
    // Monitor stats for a bit
    const stats = await container.stats({ stream: false });
    console.log('Initial Memory Usage:', stats.memory_stats.usage, '/', stats.memory_stats.limit);
    
    // Wait for OOM
    let exitCode = -1;
    for (let i = 0; i < 10; i++) {
      const state = await container.inspect();
      if (state.State.ExitCode !== null) {
        exitCode = state.State.ExitCode;
        break;
      }
      console.log(`Waiting for OOM... (attempt ${i+1})`);
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('Final Exit Code:', exitCode);
    if (exitCode === 137) console.log('SUCCESS: OOM Kill detected (137)');
    else console.log('FAILURE: Process did not exit with 137');
    
    await container.remove({ force: true });
  } catch (e) {
    console.error('OOM Debug Error:', e);
  }
}

async function debugNpm() {
  console.log('\n--- TC-04 Debug: npm install ---');
  try {
    const container = await docker.createContainer({
      Image: 'node:alpine',
      Cmd: ['tail', '-f', '/dev/null'],
      User: 'root',
      ReadonlyRootfs: false,
      WorkingDir: '/workspace',
    });
    await container.start();
    
    const exec = await container.exec({
      Cmd: ['npm', 'install', 'lodash'],
      AttachStdout: true,
      AttachStderr: true,
    });
    
    const stream = await exec.start();
    const output = await new Promise<string>((resolve) => {
      let data = '';
      stream.on('data', chunk => data += chunk.toString());
      stream.on('end', () => resolve(data));
    });
    
    const insp = await exec.inspect();
    console.log('Exit Code:', insp.ExitCode);
    console.log('Full Output (stdout/stderr):', output);
    
    await container.remove({ force: true });
  } catch (e) {
    console.error('npm Debug Error:', e);
  }
}

async function run() {
  await debugNetwork();
  await debugOOM();
  await debugNpm();
}

run().catch(console.error);
