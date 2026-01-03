import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts';

const LOGSEQ_ENDPOINT = Deno.env.get('LOGSEQ_ENDPOINT') || null;
const LOGSEQ_TOKEN = Deno.env.get('LOGSEQ_TOKEN') || null;

async function callLogseq(method, args) {
  const payload = { method }
  if (args) {
    payload.args = args
  }

  const response = await fetch(LOGSEQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOGSEQ_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json()
  if (result?.error) {
    throw new Error(result.error);
  }

  return result;
}

try {
  console.log('First prepend...');
  const result1 = await callLogseq('logseq.Editor.prependBlockInPage', ['Test-Manual', 'FIRST']);
  console.log('First result:', result1);
  
  console.log('Second prepend...');
  const result2 = await callLogseq('logseq.Editor.prependBlockInPage', ['Test-Manual', 'SECOND']);
  console.log('Second result:', result2);
} catch (error) {
  console.error('API Error:', error.message);
}