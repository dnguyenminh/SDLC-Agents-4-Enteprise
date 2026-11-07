/**
 * SA4E-6 — MCP tool definitions for the 5 sandbox tools (category 'sandbox').
 * Schemas mirror FSD §3 / TDD §3 exactly. Discoverable via find_tools("sandbox").
 */

import type { ToolDefinition } from '../../../types/tool.js';
import { baseDirSchemaProperties } from '../../../shared/base-dir-schema.js';

export const SANDBOX_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'sandbox_session',
    description: 'Manage sandbox execution sessions. Create isolated environments (local or docker), list active sessions with stats, or destroy a session. Implements UC-01, UC-02, UC-03.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'destroy'], description: 'Session lifecycle action' },
        sessionId: { type: 'string', pattern: '^sess_[a-f0-9]{12}$', description: 'Session ID (required for destroy)' },
        config: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['local', 'docker'], default: 'docker' },
            baseImage: { type: 'string', default: 'node:20-slim' },
            mounts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  target: { type: 'string', default: '/workspace' },
                  readOnly: { type: 'boolean', default: false },
                },
                required: ['source'],
              },
            },
            resources: {
              type: 'object',
              properties: {
                memory: { type: 'string', default: '512m' },
                cpu: { type: 'string', default: '1.0' },
                disk: { type: 'string', default: '1g' },
                pidsLimit: { type: 'number', default: 100 },
              },
            },
            network: { type: 'boolean', default: false },
            ttl: { type: 'number', default: 1800 },
            env: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
      },
      required: ['action'],
    },
    category: 'sandbox',
  },
  {
    name: 'sandbox_exec',
    description: 'Execute a bash command inside a sandbox session. If sessionId is omitted an ephemeral session is created and destroyed automatically. Implements UC-04.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', minLength: 1, description: 'Command to execute' },
        sessionId: { type: 'string', pattern: '^sess_[a-f0-9]{12}$', description: 'Target session (auto-creates ephemeral if omitted)' },
        workdir: { type: 'string', description: 'Working directory inside the sandbox' },
        timeout: { type: 'number', default: 300, minimum: 1, maximum: 600 },
        env: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['command'],
    },
    category: 'sandbox',
  },
  {
    name: 'sandbox_run',
    description: 'Run a code file with the appropriate runtime (node/python/tsx/java/sh). Delegates to sandbox_exec. Implements UC-05.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to the file inside the sandbox. With base_dir: resolved host-side against the registered workspace root before mount.' },
        runtime: { type: 'string', enum: ['node', 'python', 'tsx', 'java', 'sh'] },
        args: { type: 'array', items: { type: 'string' } },
        sessionId: { type: 'string', pattern: '^sess_[a-f0-9]{12}$' },
        timeout: { type: 'number', default: 300, minimum: 1, maximum: 600 },
        ...baseDirSchemaProperties('file'),
      },
      required: ['file', 'runtime', 'sessionId'],
    },
    category: 'sandbox',
  },
  {
    name: 'sandbox_install',
    description: 'Install packages via npm, pip, or apt inside a session. Delegates to sandbox_exec. Implements UC-06.',
    inputSchema: {
      type: 'object',
      properties: {
        manager: { type: 'string', enum: ['npm', 'pip', 'apt'] },
        packages: { type: 'array', items: { type: 'string' }, minItems: 1 },
        sessionId: { type: 'string', pattern: '^sess_[a-f0-9]{12}$' },
        flags: { type: 'string', description: 'Additional flags (e.g. --save-dev)' },
      },
      required: ['manager', 'packages', 'sessionId'],
    },
    category: 'sandbox',
  },
  {
    name: 'sandbox_test',
    description: 'Run a test suite (vitest/jest/pytest/gradle/mocha) and return structured results. Delegates to sandbox_exec + parser. Implements UC-07.',
    inputSchema: {
      type: 'object',
      properties: {
        framework: { type: 'string', enum: ['vitest', 'jest', 'pytest', 'gradle', 'mocha'] },
        sessionId: { type: 'string', pattern: '^sess_[a-f0-9]{12}$' },
        testPath: { type: 'string', description: 'Optional path/pattern to scope the run' },
        coverage: { type: 'boolean', default: false },
        configFile: { type: 'string', description: 'Optional framework config file path' },
      },
      required: ['framework', 'sessionId'],
    },
    category: 'sandbox',
  },
];
