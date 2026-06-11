#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'fs';

const URL = 'https://biobrain-1e719.web.app';
const API = 'https://biobrain-api.onrender.com';
const S = 'bb';

async function call(c, name, args) {
  const r = await c.callTool({ name, arguments: args });
  const text = r.content?.find(x => x.type === 'text')?.text;
  const img = r.content?.find(x => x.type === 'image');
  if (text?.startsWith('Error:')) console.log(`  [TOOL ${name}] ${text.substring(0, 150)}`);
  return { text, img };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function snap(c, l) {
  try {
    const s = await call(c, 'screenshot', { session_id: S });
    if (s.img) writeFileSync(`/tmp/bb-${l}.jpg`, Buffer.from(s.img.data, 'base64'));
    console.log(`  📸 /tmp/bb-${l}.jpg`);
  } catch (e) { console.log(`  📸 FAIL: ${e.message}`); }
}

async function js(c, script) {
  try {
    return (await call(c, 'evaluate', { session_id: S, script })).text;
  } catch (e) { return `ERR:${e.message}`; }
}

// OAuth2 login — returns { token, raw } or null
async function apiLogin(c, email, password) {
  const result = await js(c, `
    (async () => {
      try {
        const body = new URLSearchParams({
          username: '${email}',
          password: '${password}',
          grant_type: 'password',
          scope: 'offline_access'
        });
        const r = await fetch('${API}/api/connect/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        const text = await r.text();
        const d = JSON.parse(text);
        if (d.access_token) {
          localStorage.setItem('biobrainUser', JSON.stringify(d));
          return JSON.stringify({ ok: true, token: d.access_token });
        }
        return JSON.stringify({ ok: false, error: text.substring(0, 200) });
      } catch(e) { return JSON.stringify({ ok: false, error: e.message }); }
    })()
  `);
  try {
    const parsed = JSON.parse(JSON.parse(result));
    return parsed;
  } catch {
    return { ok: false, error: result };
  }
}

// Fetch student courses via API (using token from localStorage)
async function getStudentCourses(c) {
  const result = await js(c, `
    (async () => {
      try {
        const user = JSON.parse(localStorage.getItem('biobrainUser'));
        if (!user?.access_token) return JSON.stringify({ error: 'no token' });
        const r = await fetch('${API}/api/Courses/GetCoursesForStudent', {
          headers: { 'Authorization': 'Bearer ' + user.access_token }
        });
        const data = await r.json();
        return JSON.stringify(data);
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);
  try { return JSON.parse(JSON.parse(result)); } catch { return null; }
}

// Fetch teacher courses via API
async function getTeacherCourses(c) {
  const result = await js(c, `
    (async () => {
      try {
        const user = JSON.parse(localStorage.getItem('biobrainUser'));
        if (!user?.access_token) return JSON.stringify({ error: 'no token' });
        const r = await fetch('${API}/api/Courses/GetCourses', {
          headers: { 'Authorization': 'Bearer ' + user.access_token }
        });
        const data = await r.json();
        return JSON.stringify(data);
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);
  try { return JSON.parse(JSON.parse(result)); } catch { return null; }
}

// Click element by text content
async function clickByText(c, tag, text) {
  return await js(c, `
    (() => {
      const els = Array.from(document.querySelectorAll('${tag}'));
      const el = els.find(e => e.textContent?.trim().toLowerCase().includes('${text}'.toLowerCase()));
      if (el) { el.click(); return 'CLICKED:' + el.textContent?.trim().substring(0, 50); }
      return 'NOT_FOUND';
    })()
  `);
}

// Get page info
async function pageInfo(c) {
  const result = await js(c, `JSON.stringify({
    url: window.location.href,
    body: document.body.innerText.substring(0, 500),
    btns: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length > 0 && t.length < 30).slice(0, 25),
    icons: Array.from(document.querySelectorAll('mat-icon')).map(i => i.textContent.trim()).slice(0, 30),
    links: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent?.trim().substring(0, 30), href: a.getAttribute('href') || a.getAttribute('routerlink') || '' })).filter(l => l.text).slice(0, 20)
  })`);
  try { return JSON.parse(result); } catch { return { raw: result }; }
}

const R = {};

async function main() {
  console.log('=== BioBrain TestEngine Regression v7 ===\n');
  const t = new StdioClientTransport({ command: 'node', args: ['dist/server.js'], cwd: '.' });
  const c = new Client({ name: 'bb', version: '7.0' });
  await c.connect(t);
  console.log('[OK] Connected\n');

  // CREATE SESSION
  await call(c, 'session_create', { session_id: S, url: URL, mode: 'headless' });
  await sleep(6000);
  await snap(c, '01-login');

  // =============================================
  // STUDENT TESTS
  // =============================================
  console.log('=== STUDENT LOGIN ===');
  const sLogin = await apiLogin(c, 'student@biobrain.com', '20002000');
  console.log('  Login:', sLogin.ok ? 'OK' : sLogin.error);
  if (!sLogin.ok) { R.login = 'FAIL'; return; }
  R.login = 'PASS';

  // Reload to activate session
  await call(c, 'navigate', { session_id: S, url: URL });
  await sleep(6000);
  await snap(c, '02-student-home');

  const sPage = await pageInfo(c);
  console.log('  URL:', sPage.url);
  console.log('  Body:', sPage.body?.substring(0, 150));

  // --- Issue #8: Rate popup (student only) ---
  console.log('\n[#8] Rate popup (student only)');
  const rate = await js(c, `JSON.stringify({
    dialog: !!document.querySelector('mat-dialog-container, .cdk-overlay-container .mat-dialog-container'),
    stars: document.querySelectorAll('[class*="star"]').length,
    ratingComponent: !!document.querySelector('app-star-rating, [class*="rating"]'),
    overlayContent: (document.querySelector('.cdk-overlay-container') || {}).textContent?.substring(0, 200) || 'NONE'
  })`);
  console.log('  ', rate);
  R.issue8 = rate;

  // Dismiss any popup before continuing
  await js(c, `
    (() => {
      const overlay = document.querySelector('.cdk-overlay-backdrop');
      if (overlay) overlay.click();
      const closeBtn = document.querySelector('mat-dialog-container button');
      if (closeBtn) closeBtn.click();
    })()
  `);
  await sleep(1000);

  // Get student courses to find Biology courseId
  console.log('\n[COURSES] Fetching student courses...');
  const courses = await getStudentCourses(c);
  console.log('  Courses:', JSON.stringify(courses)?.substring(0, 300));

  let biologyCourseId = null;
  if (Array.isArray(courses)) {
    // Courses might be nested in groups or flat
    for (const item of courses) {
      if (item.courseId && (item.subjectCode === 1 || item.subject?.name?.toLowerCase().includes('bio'))) {
        biologyCourseId = item.courseId;
        break;
      }
      // Check if grouped by school
      if (item.courses) {
        for (const sc of item.courses) {
          if (sc.courseId && (sc.subjectCode === 1 || sc.subject?.name?.toLowerCase().includes('bio'))) {
            biologyCourseId = sc.courseId;
            break;
          }
        }
      }
      if (biologyCourseId) break;
    }
  }

  // Fallback: try clicking Biology on the my-courses page
  if (!biologyCourseId) {
    console.log('  No courseId from API, trying to click Biology on page...');
    const clickResult = await js(c, `
      (() => {
        // Try clicking any card/element that contains "Biology"
        const all = document.querySelectorAll('mat-card, .course-card, [class*="course"], [class*="class-icon"], app-teacher-class-icon');
        for (const el of all) {
          if (el.textContent?.includes('Biology') || el.textContent?.includes('biology')) {
            el.click();
            return 'CLICKED_CARD:' + el.textContent?.trim().substring(0, 50);
          }
        }
        // Try any clickable element with Biology
        const els = document.querySelectorAll('a, button, [role="button"], div[click], span[click]');
        for (const el of els) {
          if (el.textContent?.trim().includes('Biology')) {
            el.click();
            return 'CLICKED_EL:' + el.tagName + ':' + el.textContent?.trim().substring(0, 50);
          }
        }
        return 'NO_BIOLOGY_FOUND';
      })()
    `);
    console.log('  Click result:', clickResult);
    await sleep(4000);
    const afterClick = await js(c, 'window.location.href');
    console.log('  URL after click:', afterClick);

    // Extract courseId from URL if navigation happened
    const match = afterClick?.match(/\/materials\/course\/([^?]+)/);
    if (match) biologyCourseId = match[1];
  }

  if (biologyCourseId) {
    console.log('  Biology courseId:', biologyCourseId);

    // Navigate to materials page
    const matUrl = `${URL}/materials/course/${biologyCourseId}`;
    console.log('\n[NAVIGATE] → Materials page:', matUrl);
    await call(c, 'navigate', { session_id: S, url: matUrl });
    await sleep(6000);
    await snap(c, '03-materials');

    const matPage = await pageInfo(c);
    console.log('  URL:', matPage.url);
    console.log('  Buttons:', matPage.btns?.slice(0, 15));
    console.log('  Icons:', matPage.icons?.slice(0, 20));

    // --- Issue #2: L1/L2 buttons ---
    console.log('\n[#2] L1/L2 buttons');
    const l1l2 = await js(c, `JSON.stringify({
      l1: !!Array.from(document.querySelectorAll('button, mat-button-toggle')).find(b => b.textContent.trim() === 'L1'),
      l2: !!Array.from(document.querySelectorAll('button, mat-button-toggle')).find(b => b.textContent.trim() === 'L2'),
      toggleGroup: !!document.querySelector('mat-button-toggle-group'),
      toggleBtns: Array.from(document.querySelectorAll('mat-button-toggle')).map(b => b.textContent.trim()),
      levelBtns: Array.from(document.querySelectorAll('button')).filter(b => /^L\d/.test(b.textContent.trim())).map(b => b.textContent.trim())
    })`);
    console.log('  ', l1l2);
    try {
      const p = JSON.parse(l1l2);
      R.issue2 = (p.l1 || p.toggleBtns?.includes('L1')) ? 'L1 FOUND' : 'L1 MISSING';
    } catch { R.issue2 = l1l2; }

    // --- Issue #3: expand arrows ---
    console.log('\n[#3] Expand arrows');
    const arrows = await js(c, `JSON.stringify({
      treeNodes: document.querySelectorAll('mat-tree-node, .mat-tree-node, mat-nested-tree-node').length,
      expandIcons: Array.from(document.querySelectorAll('mat-icon')).filter(i =>
        ['chevron_right', 'expand_more', 'arrow_right', 'arrow_drop_down', 'keyboard_arrow_right', 'keyboard_arrow_down'].includes(i.textContent.trim())
      ).length,
      expandBtns: document.querySelectorAll('.mat-icon-button, button mat-icon').length,
      allIcons: Array.from(document.querySelectorAll('mat-icon')).map(i => i.textContent.trim()).slice(0, 30)
    })`);
    console.log('  ', arrows);
    try {
      const p = JSON.parse(arrows);
      R.issue3 = p.treeNodes > 0 ? `TREE_FOUND (${p.treeNodes} nodes, ${p.expandIcons} arrows)` : 'NO_TREE';
    } catch { R.issue3 = arrows; }

    // --- Issue #4: sound toggle ---
    console.log('\n[#4] Sound toggle');
    const sound = await js(c, `JSON.stringify({
      volumeIcon: Array.from(document.querySelectorAll('mat-icon')).some(i =>
        i.textContent.includes('volume') || i.textContent.includes('sound')
      ),
      toolbar: (document.querySelector('mat-toolbar, .toolbar, header, .top-bar') || {}).innerHTML?.substring(0, 500) || 'NO_TOOLBAR',
      allIcons: Array.from(document.querySelectorAll('mat-icon')).map(i => i.textContent.trim()),
      toolbarIcons: Array.from(document.querySelectorAll('mat-toolbar mat-icon, .toolbar mat-icon')).map(i => i.textContent.trim())
    })`);
    console.log('  ', sound);
    try {
      const p = JSON.parse(sound);
      R.issue4 = p.volumeIcon ? 'FOUND' : 'MISSING';
    } catch { R.issue4 = sound; }

    // --- Issue #6: quiz question count ---
    console.log('\n[#6] Quiz button (needs topic selected)');
    // Try to expand a tree node first
    const expandResult = await js(c, `
      (() => {
        const nodes = document.querySelectorAll('mat-tree-node, .mat-tree-node');
        if (nodes.length === 0) return 'NO_TREE_NODES';
        // Click first expandable node
        const expandBtn = nodes[0]?.querySelector('button, .mat-icon-button');
        if (expandBtn) { expandBtn.click(); return 'EXPANDED:' + nodes[0].textContent?.trim().substring(0, 50); }
        nodes[0].click();
        return 'CLICKED_NODE:' + nodes[0].textContent?.trim().substring(0, 50);
      })()
    `);
    console.log('  Expand:', expandResult);
    await sleep(2000);

    const quizCheck = await js(c, `JSON.stringify({
      quizBtns: Array.from(document.querySelectorAll('button')).filter(b =>
        b.textContent?.toLowerCase().includes('quiz') || b.textContent?.toLowerCase().includes('start')
      ).map(b => ({ text: b.textContent.trim().substring(0, 30), disabled: b.disabled })),
      url: window.location.href,
      btns: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length > 0 && t.length < 30).slice(0, 20)
    })`);
    console.log('  ', quizCheck);
    R.issue6 = quizCheck;

    // --- Issue #7: Student quiz results layout ---
    console.log('\n[#7] Student quiz results layout');
    R.issue7 = 'NEEDS_QUIZ_COMPLETE (layout check requires active quiz result)';

    // --- Issue #5: Sound length ---
    console.log('\n[#5] Sound length');
    R.issue5 = 'CODE_REVIEW_NEEDED (reduce correct sound by 40%)';

    await snap(c, '04-materials-expanded');

  } else {
    console.log('  ⚠️ Could not find Biology courseId');
    R.issue2 = 'SKIP (no courseId)';
    R.issue3 = 'SKIP (no courseId)';
    R.issue4 = 'SKIP (no courseId)';
    R.issue6 = 'SKIP (no courseId)';
  }

  // --- Issue #1: Quiz Hub tab (sidebar) ---
  console.log('\n[#1] Quiz Hub dropdown tab');
  const qhub = await js(c, `JSON.stringify({
    quizHub: document.body.innerHTML.includes('Quiz Hub'),
    createQuiz: document.body.innerHTML.includes('Create Quiz'),
    quizTemplates: document.body.innerHTML.includes('Quiz Templates') || document.body.innerHTML.includes('Quiz templates'),
    aiPractice: document.body.innerHTML.includes('AI Practice'),
    aiInsights: document.body.innerHTML.includes('AI Insights') || document.body.innerHTML.includes('AI insights'),
    sidebar: (document.querySelector('mat-sidenav, .sidebar, nav') || {}).textContent?.substring(0, 500) || 'NONE'
  })`);
  console.log('  ', qhub);
  try {
    const p = JSON.parse(qhub);
    R.issue1 = p.quizHub ? 'Quiz Hub FOUND' : 'Quiz Hub NOT_FOUND (need to implement)';
  } catch { R.issue1 = qhub; }

  // --- Issue #9: Google Review integration ---
  console.log('\n[#9] Google Review');
  R.issue9 = 'CODE_REVIEW_NEEDED (review should publish to Google, stay in-platform)';

  // --- Issue #18/19: AI Tutoring Chatbot ---
  console.log('\n[#18/#19] Ask BioBrain chatbot');
  const chatbot = await js(c, `JSON.stringify({
    askBioBrain: document.body.innerHTML.includes('Ask BioBrain'),
    chatWidget: !!document.querySelector('[class*="chat"], [class*="chatbot"], app-chatbot, app-ask-biobrain'),
    fabBtn: !!document.querySelector('[class*="fab"], .chat-fab, .ask-biobrain-btn')
  })`);
  console.log('  ', chatbot);
  R.issue18_19 = chatbot;

  // =============================================
  // TEACHER TESTS
  // =============================================
  console.log('\n\n=== TEACHER LOGIN ===');
  const tLogin = await apiLogin(c, 'teacher@biobrain.com', '20002000');
  console.log('  Login:', tLogin.ok ? 'OK' : tLogin.error);

  if (tLogin.ok) {
    R.teacher = 'LOGGED_IN';
    await call(c, 'navigate', { session_id: S, url: URL });
    await sleep(5000);
    await snap(c, '05-teacher-home');

    const tPage = await pageInfo(c);
    console.log('  URL:', tPage.url);
    console.log('  Body:', tPage.body?.substring(0, 200));
    console.log('  Buttons:', tPage.btns?.slice(0, 15));

    // Teacher: try to select a class/course first
    console.log('\n[TEACHER] Selecting class...');
    const classClick = await js(c, `
      (() => {
        // Click on a class card (Biology)
        const cards = document.querySelectorAll('mat-card, .course-card, [class*="course"], [class*="class-icon"], app-teacher-class-icon');
        for (const el of cards) {
          if (el.textContent?.includes('Biology') || el.textContent?.includes('biology')) {
            el.click();
            return 'CLICKED_CARD:' + el.textContent?.trim().substring(0, 50);
          }
        }
        // Fallback: click first course-looking element
        if (cards.length > 0) {
          cards[0].click();
          return 'CLICKED_FIRST:' + cards[0].textContent?.trim().substring(0, 50);
        }
        return 'NO_CARDS';
      })()
    `);
    console.log('  Class click:', classClick);
    await sleep(4000);

    const afterClassUrl = await js(c, 'window.location.href');
    console.log('  URL after class:', afterClassUrl);
    await snap(c, '06-teacher-after-class');

    // Discover teacher sidebar
    const tSidebar = await js(c, `JSON.stringify({
      sidebarText: (document.querySelector('mat-sidenav, .sidebar, nav, .mat-drawer') || {}).textContent?.substring(0, 500) || 'NONE',
      links: Array.from(document.querySelectorAll('a[routerlink], [routerlink]')).map(a => ({
        text: a.textContent?.trim().substring(0, 30),
        route: a.getAttribute('routerlink') || a.getAttribute('routerLink')
      })).slice(0, 25)
    })`);
    console.log('  Sidebar:', tSidebar);

    // --- Issue #10/#14: View Quiz remove/add buttons ---
    console.log('\n[#10/#14] View Quiz buttons');
    // Try to navigate to view quiz via sidebar
    const vqNav = await js(c, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const vqLink = links.find(a => {
          const text = a.textContent?.toLowerCase() || '';
          const href = a.getAttribute('href') || a.getAttribute('routerlink') || '';
          return text.includes('view quiz') || href.includes('quiz-overview');
        });
        if (vqLink) { vqLink.click(); return 'CLICKED:' + vqLink.textContent?.trim(); }
        return 'NOT_FOUND';
      })()
    `);
    console.log('  Nav:', vqNav);
    await sleep(3000);
    await snap(c, '07-view-quiz');

    const vq = await js(c, `JSON.stringify({
      url: window.location.href,
      removeBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.toLowerCase().includes('remove')),
      addBackBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.toLowerCase().includes('add back')),
      allBtns: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length > 0 && t.length < 30).slice(0, 20)
    })`);
    console.log('  ', vq);
    try {
      const p = JSON.parse(vq);
      R.issue10_14 = (p.removeBtn && p.addBackBtn) ? 'PASS' : 'MISSING (remove/add back btns)';
    } catch { R.issue10_14 = vq; }

    // --- Issue #11: Remove/add back on headings (should be removed) ---
    console.log('\n[#11] Remove/add back on headings (should NOT exist)');
    // Navigate to materials/learning content for teacher
    const tMatNav = await js(c, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => {
          const text = a.textContent?.toLowerCase() || '';
          const href = a.getAttribute('href') || a.getAttribute('routerlink') || '';
          return text.includes('learning') || text.includes('content') || href.includes('materials');
        });
        if (link) { link.click(); return 'CLICKED:' + link.textContent?.trim(); }
        return 'NOT_FOUND';
      })()
    `);
    console.log('  Nav:', tMatNav);
    await sleep(3000);

    const headingBtns = await js(c, `JSON.stringify({
      url: window.location.href,
      removeOnHeadings: Array.from(document.querySelectorAll('mat-tree-node button, .mat-tree-node button')).filter(b =>
        b.textContent?.toLowerCase().includes('remove') || b.textContent?.toLowerCase().includes('add back')
      ).map(b => b.textContent.trim()),
      treeNodes: document.querySelectorAll('mat-tree-node, .mat-tree-node').length
    })`);
    console.log('  ', headingBtns);
    try {
      const p = JSON.parse(headingBtns);
      R.issue11 = p.removeOnHeadings?.length > 0 ? 'STILL_PRESENT (need to remove)' : 'REMOVED or NOT_ON_PAGE';
    } catch { R.issue11 = headingBtns; }

    // --- Issue #12: Anonymize Results text ---
    console.log('\n[#12] Anonymize Results text');
    const anNav = await js(c, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => {
          const text = a.textContent?.toLowerCase() || '';
          const href = a.getAttribute('href') || a.getAttribute('routerlink') || '';
          return text.includes('class result') || text.includes('results') || href.includes('class-results');
        });
        if (link) { link.click(); return 'CLICKED:' + link.textContent?.trim(); }
        return 'NOT_FOUND';
      })()
    `);
    console.log('  Nav:', anNav);
    await sleep(3000);
    await snap(c, '08-class-results');

    const anon = await js(c, `JSON.stringify({
      url: window.location.href,
      anonText: !!document.body.innerHTML.match(/Anonymize/i),
      anonElement: (() => {
        const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent?.includes('Anonymize') && e.children.length === 0);
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return { text: el.textContent.trim(), color: style.color, font: style.fontFamily, fontSize: style.fontSize };
      })(),
      assignedElement: (() => {
        const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent?.trim() === 'Assigned' && e.children.length === 0);
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return { text: el.textContent.trim(), color: style.color, font: style.fontFamily, fontSize: style.fontSize };
      })()
    })`);
    console.log('  ', anon);
    R.issue12 = anon;

    // --- Issue #13: Quiz name in Work Assigned ---
    console.log('\n[#13] Quiz name under Key Knowledge Heading');
    R.issue13 = 'CODE_REVIEW_NEEDED (quiz name should appear under Key Knowledge heading in TI & SI)';

    // --- Issue #15: Quiz Templates styling ---
    console.log('\n[#15] Quiz Templates');
    const qtNav = await js(c, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => {
          const text = a.textContent?.toLowerCase() || '';
          return text.includes('quiz template');
        });
        if (link) { link.click(); return 'CLICKED:' + link.textContent?.trim(); }
        return 'NOT_FOUND';
      })()
    `);
    console.log('  Nav:', qtNav);
    await sleep(3000);
    await snap(c, '09-quiz-templates');

    const qt = await js(c, `JSON.stringify({
      url: window.location.href,
      heading: (() => {
        const h = document.querySelector('h1, h2, h3, .page-title, [class*="heading"]');
        if (!h) return null;
        const style = window.getComputedStyle(h);
        return { text: h.textContent.trim().substring(0, 50), font: style.fontFamily, color: style.color };
      })(),
      columns: Array.from(document.querySelectorAll('th, .mat-header-cell')).map(th => th.textContent.trim()).slice(0, 10),
      toggleSound: !!document.body.innerHTML.match(/sound.*toggle|toggle.*sound|hints.*toggle|toggle.*hints/i)
    })`);
    console.log('  ', qt);
    R.issue15 = qt;

    // --- Issue #16: AI Practice Set ---
    console.log('\n[#16] AI Practice Set');
    const aiNav = await js(c, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => {
          const text = a.textContent?.toLowerCase() || '';
          return text.includes('ai practice');
        });
        if (link) { link.click(); return 'CLICKED:' + link.textContent?.trim(); }
        return 'NOT_FOUND';
      })()
    `);
    console.log('  Nav:', aiNav);
    await sleep(3000);

    const aiPractice = await js(c, `JSON.stringify({
      url: window.location.href,
      viewQuizBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.toLowerCase().includes('view')),
      quizNameField: !!document.querySelector('input[placeholder*="name"], input[formcontrolname*="name"], [class*="quiz-name"]'),
      heading: document.querySelector('h1, h2, .page-title')?.textContent?.trim().substring(0, 50) || 'NONE'
    })`);
    console.log('  ', aiPractice);
    R.issue16 = aiPractice;

    // --- Issue #17: AI Performance Insights heading ---
    console.log('\n[#17] AI Performance Insights');
    const insNav = await js(c, `
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => {
          const text = a.textContent?.toLowerCase() || '';
          return text.includes('ai insight') || text.includes('performance');
        });
        if (link) { link.click(); return 'CLICKED:' + link.textContent?.trim(); }
        return 'NOT_FOUND';
      })()
    `);
    console.log('  Nav:', insNav);
    await sleep(3000);

    const aiInsights = await js(c, `JSON.stringify({
      url: window.location.href,
      heading: (() => {
        const h = document.querySelector('h1, h2, .page-title, [class*="heading"]');
        if (!h) return null;
        const style = window.getComputedStyle(h);
        return { text: h.textContent.trim().substring(0, 50), font: style.fontFamily, color: style.color };
      })()
    })`);
    console.log('  ', aiInsights);
    R.issue17 = aiInsights;

    // --- Issue #20: Turn off AI toggle (sys admin) ---
    console.log('\n[#20] Turn off AI toggle');
    R.issue20 = 'CODE_REVIEW_NEEDED (sys admin school setup - toggle to disable AI features)';

  } else {
    console.log('  Teacher login failed');
    R.teacher = 'LOGIN_FAIL';
  }

  // === CONSOLE ERRORS ===
  console.log('\n[CONSOLE]');
  try {
    const lg = await call(c, 'console_log', { session_id: S });
    const errs = (lg.text || '').split('\n').filter(l => l.toLowerCase().includes('error')).slice(0, 5);
    console.log('  Errors:', errs.length ? errs.join('\n  ') : 'none');
  } catch (e) { console.log('  Console error:', e.message); }

  // === SUMMARY ===
  console.log('\n\n========================================');
  console.log('   REGRESSION TEST RESULTS v7');
  console.log('========================================');
  for (const [k, v] of Object.entries(R)) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const icon = s.includes('PASS') || s.includes('FOUND') || s.includes('LOGGED_IN') ? '✅' :
                 s.includes('FAIL') || s.includes('MISSING') ? '❌' :
                 s.includes('CODE_REVIEW') || s.includes('SKIP') ? '📋' : '⚠️';
    console.log(`  ${icon} ${k}: ${s.substring(0, 120)}`);
  }
  console.log('========================================');

  await call(c, 'session_destroy', { session_id: S });
  await c.close();
  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
