/**
 * KSA-112: Validate that a .node binding file can be loaded by the current runtime.
 * Uses process.dlopen() test to catch MODULE_VERSION mismatch before actual use.
 * Returns true if loadable, false if mismatch or other error.
 */

import * as fs from 'fs';
import pino from 'pino';

const logger = pino({ name: 'native-addon-resolver' });

async function validateBinding(bindingPath: string): Promise<boolean> {
  try {
    if (!fs.existsSync(bindingPath) || fs.statSync(bindingPath).size === 0) return false;
    const testModule = { exports: {} } as any;
    process.dlopen(testModule, bindingPath);
    logger.error(`[native-addon] ✅ Binding validated: ${bindingPath}`);
    return true;
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('NODE_MODULE_VERSION') || msg.includes('was compiled against')) {
      logger.error(`[native-addon] ❌ MODULE_VERSION mismatch: ${msg.substring(0, 200)}`);
    } else {
      logger.error(`[native-addon] ❌ Binding validation failed: ${msg.substring(0, 200)}`);
    }
    return false;
  }
}

export { validateBinding };
