import { SessionManager } from '../src/session-manager.js';
import { BrowserBridge } from '../src/browser-bridge.js';
import { rewriteUrl } from '../src/url-rewriter.js';

async function test() {
  const sessionManager = new SessionManager(undefined, 9100);
  const browserBridge = new BrowserBridge(sessionManager);

  try {
    // Test 1: Create session
    console.log('Test 1: Creating session "test1"...');
    const session = await sessionManager.create('test1', 'https://example.com');
    console.log(`  ✓ Session created: port=${session.port}, container=${session.containerId.slice(0, 12)}`);

    // Test 2: Connect Playwright
    console.log('Test 2: Connecting Playwright...');
    await browserBridge.connect('test1');
    console.log('  ✓ Playwright connected');

    // Test 3: Navigate
    console.log('Test 3: Navigating to example.com...');
    const navResult = await browserBridge.navigate('test1', 'https://example.com');
    console.log(`  ✓ ${navResult}`);

    // Test 4: Get text
    console.log('Test 4: Getting h1 text...');
    const text = await browserBridge.getText('test1', 'h1');
    console.log(`  ✓ h1 text: "${text}"`);
    if (text !== 'Example Domain') throw new Error(`Expected "Example Domain", got "${text}"`);

    // Test 5: Screenshot
    console.log('Test 5: Taking screenshot...');
    const screenshot = await browserBridge.screenshot('test1');
    console.log(`  ✓ Screenshot: ${screenshot.length} bytes`);
    if (screenshot.length < 1000) throw new Error('Screenshot too small');

    // Test 6: Evaluate JS
    console.log('Test 6: Evaluating JavaScript...');
    const evalResult = await browserBridge.evaluate('test1', 'document.title');
    console.log(`  ✓ document.title: ${evalResult}`);

    // Test 7: Create second session (parallel)
    console.log('Test 7: Creating parallel session "test2"...');
    const session2 = await sessionManager.create('test2', 'https://www.google.com');
    await browserBridge.connect('test2');
    await browserBridge.navigate('test2', 'https://www.google.com');
    console.log(`  ✓ Session "test2" created: port=${session2.port}`);

    // Test 8: List sessions
    console.log('Test 8: Listing sessions...');
    const sessions = sessionManager.list();
    console.log(`  ✓ ${sessions.length} active sessions: ${sessions.map(s => s.id).join(', ')}`);
    if (sessions.length !== 2) throw new Error(`Expected 2 sessions, got ${sessions.length}`);

    // Test 9: Destroy sessions
    console.log('Test 9: Destroying sessions...');
    await browserBridge.disconnect('test1');
    await sessionManager.destroy('test1');
    await browserBridge.disconnect('test2');
    await sessionManager.destroy('test2');
    const remaining = sessionManager.list();
    console.log(`  ✓ ${remaining.length} sessions remaining`);
    if (remaining.length !== 0) throw new Error('Sessions not cleaned up');

    // Sanity: rewriteUrl
    const rewritten = rewriteUrl('http://localhost:3000/path');
    if (!rewritten.includes('host.docker.internal')) throw new Error(`rewriteUrl failed: ${rewritten}`);
    console.log(`  ✓ rewriteUrl: ${rewritten}`);

    console.log('\n=== ALL E2E TESTS PASSED ===');

  } catch (error) {
    console.error('\n=== E2E TEST FAILED ===');
    console.error(error);

    // Cleanup on failure
    try {
      await browserBridge.disconnect('test1').catch(() => {});
      await browserBridge.disconnect('test2').catch(() => {});
      await sessionManager.destroyAll();
    } catch { /* ignore cleanup errors */ }

    process.exit(1);
  }
}

test();
