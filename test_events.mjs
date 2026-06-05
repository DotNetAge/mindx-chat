import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:1314/ws');

let id = 0;
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = String(++id);
    const handler = (data) => {
      try {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          const msg = JSON.parse(line);
          if (msg.id === myId) {
            ws.off('message', handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }));
  });
}

// Listen for ALL messages
ws.on('message', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.method === 'token_usage_recorded' || (msg.params && (msg.params.type === 'token_usage_recorded' || msg.params?.data?.id?.startsWith('tur_')))) {
        console.log('[EVENT]', JSON.stringify(msg).substring(0, 500));
      }
    } catch (e) {}
  }
});

ws.on('open', async () => {
  console.log('Connected. Listening for events...');
  // Need to send a message to trigger LLM call. But we don't have a session. Let's just create one and send.
  try {
    const agents = await call('agent.list', {});
    console.log('Got agents:', agents.length);
    const sessions = await call('session.list', {});
    console.log('Got sessions:', sessions.length);
    
    // Get the first session or create one
    let sessionId;
    if (sessions.length > 0) {
      sessionId = sessions[0].session_id;
      console.log('Using existing session:', sessionId);
    } else {
      const r = await call('session.create', { agent_name: agents[0].name, project_dir: '/Users/ray/workspaces/ai-ecosystem' });
      sessionId = r.session_id;
      console.log('Created session:', sessionId);
    }
    
    // Send a message
    console.log('Sending test message...');
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'user.message',
      params: { text: 'hi', session_id: sessionId }
    }));
    
    // Wait for events
    await new Promise(r => setTimeout(r, 30000));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('WS error:', err);
  process.exit(1);
});
