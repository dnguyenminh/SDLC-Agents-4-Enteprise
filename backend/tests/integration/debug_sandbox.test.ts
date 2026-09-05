
import { describe, it, expect, beforeAll from 'vitest';
import Docker from 'dockerode';
import pino from 'pino';

const logger = pino({ level: 'info' });
const docker = new Docker();

describe('Sandbox Debugging Suite', () => {
  it('TC-18 Debug: Network Isolation', async () => {
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
      expect(insp.ExitCode).not.toBe(0);
    } catch (e) {
      console.error('Network Debug Error:', e);
      throw e;
    }
  });

  it('TC-09 Debug: OOM Kill', async () => {
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
      
      const stats = await container.stats({ stream: false });
      console.log('Initial Memory Usage:', stats.memory_stats.usage, '/', stats.memory_stats.limit);
      
      let exitCode = -1;
      for (let i = 0; i < 15; i++) {
        const state = await container.inspect();
        if (state.State.ExitCode !== null) {
          exitCode = state.State.ExitCode;
          break;
        }
        console.log(`Waiting for OOM... (attempt ${i+1})`);
        await new Promise(r => setTimeout(r, 2000));
      }
      
      console.log('Final Exit Code:', exitCode);
      await container.remove({ force: true });
      expect(exitCode).toBe(137);
    } catch (e) {
      console.error('OOM Debug Error:', e);
      throw e;
    }
  });

  it('TC-04 Debug: npm install', async () => {
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
      expect(insp.ExitCode).toBe(0);
    } catch (e) {
      console.error('npm Debug Error:', e);
      throw e;
    }
  });
});
