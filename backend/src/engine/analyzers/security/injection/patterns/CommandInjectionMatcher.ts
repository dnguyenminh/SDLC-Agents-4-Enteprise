/**
 * KSA-165: Command Injection Matcher — 4 patterns for OS command injection.
 */

import { PatternMatcher } from '../PatternMatcher.js';
import type { InjectionPattern } from '../../types/index.js';

export class CommandInjectionMatcher extends PatternMatcher {
  readonly category = 'command_injection';
  readonly patterns: InjectionPattern[] = [
    {
      id: 9,
      name: 'Shell Command with String Concatenation',
      category: 'command_injection',
      cwe: 'CWE-78',
      severity: 'Critical',
      sinkPatterns: ['exec(', 'execSync(', 'system(', 'popen(', 'subprocess.run', 'child_process.exec'],
      dangerousOps: ['concat', 'template_literal', 'format_string'],
      safePatterns: ['execFile', 'spawn', 'shell=False', 'shellescape'],
      description: 'Use execFile/spawn with array arguments instead of exec with shell string. Example: execFile("cmd", [arg1, arg2])',
    },
    {
      id: 10,
      name: 'Shell=True with User Input',
      category: 'command_injection',
      cwe: 'CWE-78',
      severity: 'Critical',
      sinkPatterns: ['subprocess.run', 'subprocess.Popen', 'subprocess.call'],
      dangerousOps: ['concat', 'template_literal', 'pass_through'],
      safePatterns: ['shell=False', 'shlex.quote', 'shellescape'],
      description: 'Use shell=False and pass command as list: subprocess.run(["cmd", user_input], shell=False)',
    },
    {
      id: 11,
      name: 'eval() with User Input',
      category: 'command_injection',
      cwe: 'CWE-95',
      severity: 'Critical',
      sinkPatterns: ['eval(', 'Function(', 'vm.runInContext', 'vm.runInNewContext'],
      dangerousOps: ['concat', 'template_literal', 'pass_through', 'assign'],
      safePatterns: ['JSON.parse', 'parseInt', 'sandbox'],
      description: 'Never use eval() with user input. Use JSON.parse for data, or a sandboxed VM for code execution.',
    },
    {
      id: 12,
      name: 'Dynamic Require/Import with User Input',
      category: 'command_injection',
      cwe: 'CWE-94',
      severity: 'High',
      sinkPatterns: ['require(', 'import(', '__import__'],
      dangerousOps: ['concat', 'template_literal', 'pass_through'],
      safePatterns: ['whitelist', 'allowedModules', 'includes('],
      description: 'Validate module names against a whitelist before dynamic import.',
    },
  ];
}