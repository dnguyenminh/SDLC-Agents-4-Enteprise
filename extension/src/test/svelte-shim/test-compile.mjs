import { preprocess, compile } from './compiler/index.js';

const code = '<script lang="ts">const x: string = "hello"</script><div>Hello</div>';
const filename = 'test.svelte';

const processed = await preprocess(code, {
  script: ({ content, attributes }) => {
    if (attributes.lang !== 'ts') return { code: content };
    return { code: content.replace(/:\s*\w+/g, '') };
  }
}, { filename });

console.log('Preprocess success');
const result = compile(processed.code, { filename });
console.log('Compile success:', result.js?.code?.slice(0, 100));