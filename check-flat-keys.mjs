import { globSync } from 'glob';
import { readFileSync } from 'fs';

const files = globSync('extension/src/**/*.ts', { ignore: ['**/__tests__/**'] });
const allowedFiles = [
  'extension/src/pi-workflow/pi-provider-config-bridge.ts',
  'extension/src/config/llm-profile-migration.ts',
  'extension/src/services/ProviderConfigMigration.ts',
  'extension/src/services/ProviderConfigModels.ts',
  'extension/src/config/settings-migration-runner.ts',
  'extension/src/config/config-namespace-migration.ts',
  'extension/src/chat-panel/chat-panel-provider/model-config.ts',
  'extension/src/chat-panel/chat-panel-provider/config-change.ts',
  'extension/src/extension.ts',
  'extension/src/types/server-types.ts',
  'extension/src/shared/types/llm-profile.ts',
  'extension/src/chat-panel/ChatModelManager.ts',
];

let violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for flat key reads: llm.provider or llm.model (not llm.profiles, llm.activeProfileId)
    if (/llm\.(provider|model)(?!\w)/.test(line) && !/llm\.(profiles|activeProfileId)/.test(line)) {
      const isAllowed = allowedFiles.some(af => file.replace(/\\/g, '/').includes(af.replace(/\\/g, '/')));
      if (!isAllowed) {
        violations.push(`${file}:${i+1}: ${line.trim()}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.log('FLAT KEY VIOLATIONS (outside allowed files):');
  violations.forEach(v => console.log(v));
} else {
  console.log('No flat key violations ✓');
}

process.exit(violations.length > 0 ? 1 : 0);