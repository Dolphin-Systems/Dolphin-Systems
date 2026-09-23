const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };
const SETTINGS_PATH = 'caretaker/settings.json';
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'dolphin-systems-caretaker' });
    }

    if (url.pathname === '/' || url.pathname === '/admin') {
      return new Response(adminPage(), { headers: HTML_HEADERS });
    }

    if (url.pathname === '/api/status') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const settings = await readSettings(env);
      const checks = await checkWebsite(env.SITE_URL);
      return json({ ok: true, checks, settings });
    }

    if (url.pathname === '/api/lila/message' && request.method === 'POST') {
      const body = await request.json();
      const result = await handleLilaMessage(env, body);
      return json(result, result.ok ? 200 : 400, CORS_HEADERS);
    }

    if (url.pathname === '/api/leads') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const leads = await listLeads(env);
      return json({ ok: true, leads });
    }

    if ((url.pathname === '/generate' || url.pathname === '/api/generate') && request.method === 'POST') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);

      const result = await runCaretaker(env, { force: true });
      return json(result, result.ok ? 200 : 500);
    }

    if (url.pathname === '/api/instructions' && request.method === 'POST') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const body = await request.json();
      const result = await updateInstructions(env, String(body.instructions || ''));
      return json(result, result.ok ? 200 : 400);
    }

    if (url.pathname === '/api/settings' && request.method === 'POST') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const body = await request.json();
      const result = await updateSettings(env, body);
      return json(result, result.ok ? 200 : 400);
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCaretaker(env, { cron: controller.cron }));
  },
};

async function runCaretaker(env, options = {}) {
  const settings = await readSettings(env);
  const checks = await checkWebsite(env.SITE_URL);
  if (!checks.ok) {
    await maybeCreateIssue(env, {
      title: 'Website health check failed',
      body: `Daily caretaker check failed for ${env.SITE_URL}.\n\nStatus: ${checks.status || 'no response'}\nError: ${checks.error || 'none'}\nTime: ${new Date().toISOString()}`,
      label: 'caretaker',
    });
    return { ok: false, checks };
  }

  if (!options.force && !shouldPublish(settings)) {
    return { ok: true, checks, publish: { created: false, reason: 'not due', settings } };
  }

  const post = await generateBlogPost(env, settings);
  const publish = await publishPost(env, post, options.force);
  if (publish.created) {
    settings.lastPublishedAt = new Date().toISOString();
    await writeSettings(env, settings, 'Update caretaker publish timestamp');
  }

  return { ok: true, checks, publish };
}

async function handleLilaMessage(env, body) {
  requireEnv(env, ['DEEPSEEK_API_KEY']);
  if (!env.LILA_STORE) return { ok: false, error: 'storage_not_configured' };

  const conversationId = String(body.conversationId || crypto.randomUUID());
  const userMessage = String(body.message || '').trim().slice(0, 1200);
  if (!userMessage) return { ok: false, error: 'message_required' };

  const now = new Date().toISOString();
  const existing = await env.LILA_STORE.get(`chat:${conversationId}`, 'json');
  const chat = existing || { id: conversationId, createdAt: now, messages: [], lead: {} };
  chat.updatedAt = now;
  chat.messages.push({ role: 'user', content: userMessage, at: now });
  chat.messages = chat.messages.slice(-24);

  const ai = await askLila(env, chat);
  chat.messages.push({ role: 'assistant', content: ai.reply, at: new Date().toISOString() });
  chat.lead = {
    ...chat.lead,
    ...(ai.lead || {}),
    summary: ai.summary || chat.lead.summary || '',
    relevant: ai.relevant !== false,
    updatedAt: new Date().toISOString(),
  };

  await env.LILA_STORE.put(`chat:${conversationId}`, JSON.stringify(chat));
  if (chat.lead.relevant && (chat.lead.name || chat.lead.email || chat.lead.phone || chat.lead.summary)) {
    await env.LILA_STORE.put(`lead:${conversationId}`, JSON.stringify({
      id: conversationId,
      updatedAt: chat.updatedAt,
      lead: chat.lead,
      transcript: chat.messages,
    }));
  }

  return { ok: true, conversationId, reply: ai.reply, lead: chat.lead };
}

async function askLila(env, chat) {
  const response = await fetch(`${env.AI_API_BASE || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.BLOG_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: [
            'You are Lila, a warm client-intake assistant for Dolphin Systems.',
            'Dolphin Systems wants clients for automation, integrations, AI workflows, dashboards, and systems cleanup.',
            'Read the whole conversation and keep context.',
            'Start by asking for name and email or phone if missing, but do it naturally.',
            'Ask specific follow-up questions about problem, tools, desired outcome, timeline, and budget only when useful.',
            'Prevent useless chat: if irrelevant, politely redirect to business/workflow needs.',
            'Return only JSON with keys: reply, relevant, lead, summary.',
            'lead keys: name, email, phone, company, problem, tools, outcome, timeline, budget.',
          ].join(' '),
        },
        ...chat.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      response_format: { type: 'json_object' },
      temperature: 0.55,
    }),
  });
  if (!response.ok) throw new Error(`Lila AI request failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  return {
    reply: String(parsed.reply || 'Can you tell me a bit more about what workflow or system you want improved?'),
    relevant: parsed.relevant !== false,
    lead: parsed.lead || {},
    summary: String(parsed.summary || ''),
  };
}

async function listLeads(env) {
  if (!env.LILA_STORE) return [];
  const listed = await env.LILA_STORE.list({ prefix: 'lead:', limit: 50 });
  const leads = await Promise.all(listed.keys.map((key) => env.LILA_STORE.get(key.name, 'json')));
  return leads.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function checkWebsite(siteUrl) {
  try {
    const response = await fetch(siteUrl, {
      headers: { 'user-agent': 'Dolphin Systems Caretaker/1.0' },
    });
    const text = await response.text();
    const ok = response.ok && text.includes('Dolphin') && text.includes('Systems');
    return {
      ok,
      status: response.status,
      bytes: text.length,
      reason: ok ? 'healthy' : 'unexpected content',
    };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}

async function generateBlogPost(env, settings) {
  requireEnv(env, ['DEEPSEEK_API_KEY']);

  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    'Create one practical blog post for Dolphin Systems, an automation and systems optimization company.',
    'The tone should be clear, technical, concise, and useful to business operators.',
    'Return only valid JSON with this exact shape:',
    '{"title":"","description":"","category":"","body":[{"type":"paragraph","text":""},{"type":"heading","text":""},{"type":"list","items":[""]}]}',
    `Date: ${today}.`,
    `Blog system prompt: ${settings.blogSystemPrompt || 'Write clear, useful posts for business operators who may become Dolphin Systems clients.'}`,
    `Current topic focus: ${settings.topicFocus || 'workflow automation, integrations, operational clarity, reliable systems, and making complex work simple'}.`,
    `Caretaker instructions: ${settings.instructions || 'Write one useful Dolphin Systems blog post.'}`,
    'Do not mention that AI wrote it. Do not invent customer names or case studies.',
  ].join('\n');

  const response = await fetch(`${env.AI_API_BASE || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.BLOG_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You write concise, practical company blog posts and return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const generated = JSON.parse(text);
  const slug = uniqueDatedSlug(generated.title);

  return {
    slug,
    title: generated.title,
    description: generated.description,
    date: new Date().toISOString().slice(0, 10),
    category: generated.category,
    body: normalizeBody(generated.body),
  };
}

async function updateInstructions(env, instructions) {
  if (!instructions.trim()) return { ok: false, error: 'instructions_required' };

  const current = await readSettings(env);
  const parsed = await interpretInstructions(env, instructions, current);
  const next = {
    ...current,
    ...parsed,
    instructions,
    updatedAt: new Date().toISOString(),
  };

  await writeSettings(env, next, 'Update caretaker instructions');
  return { ok: true, settings: next };
}

async function updateSettings(env, updates) {
  const current = await readSettings(env);
  const cadence = ['daily', 'weekly', 'monthly', 'paused'].includes(updates.blogCadence)
    ? updates.blogCadence
    : current.blogCadence || 'daily';
  const next = {
    ...current,
    blogCadence: cadence,
    blogEnabled: cadence !== 'paused' && updates.blogEnabled !== false,
    topicFocus: String(updates.topicFocus || current.topicFocus || '').trim(),
    blogSystemPrompt: String(updates.blogSystemPrompt || current.blogSystemPrompt || '').trim(),
    instructions: String(updates.instructions || current.instructions || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  if (updates.resetLastPublishedAt === true) next.lastPublishedAt = null;
  await writeSettings(env, next, 'Update caretaker settings');
  return { ok: true, settings: next };
}

async function interpretInstructions(env, instructions, current) {
  requireEnv(env, ['DEEPSEEK_API_KEY']);
  const prompt = [
    'Turn this website caretaker instruction into settings JSON.',
    'Return only JSON with keys: blogEnabled, blogCadence, topicFocus.',
    'blogCadence must be one of: daily, weekly, monthly, paused.',
    'If the instruction says stop, pause, or do not post, set blogEnabled false and blogCadence paused.',
    'If the instruction mentions every day or daily, set daily. Every week means weekly. Every month means monthly.',
    `Current settings: ${JSON.stringify(current)}`,
    `Instruction: ${instructions}`,
  ].join('\n');

  const response = await fetch(`${env.AI_API_BASE || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.BLOG_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You convert admin instructions into small safe JSON settings.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI instruction request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  const cadence = ['daily', 'weekly', 'monthly', 'paused'].includes(parsed.blogCadence)
    ? parsed.blogCadence
    : current.blogCadence || 'daily';

  return {
    blogEnabled: cadence !== 'paused' && parsed.blogEnabled !== false,
    blogCadence: parsed.blogEnabled === false ? 'paused' : cadence,
    topicFocus: String(parsed.topicFocus || current.topicFocus || '').trim(),
  };
}

async function readSettings(env) {
  const result = await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${SETTINGS_PATH}?ref=${env.GITHUB_BRANCH}`, {
    method: 'GET',
    allow404: true,
  });
  if (result.status === 404) {
    return {
      blogCadence: 'daily',
      blogEnabled: true,
      topicFocus: 'workflow automation, integrations, operational clarity, reliable systems, and making complex work simple',
      blogSystemPrompt: 'Write clear, useful posts for business operators who may become Dolphin Systems clients. Keep the tone practical, technical, and trustworthy. Avoid hype.',
      lastPublishedAt: null,
      instructions: 'Write one useful Dolphin Systems blog post every day.',
    };
  }
  return JSON.parse(decodeBase64(result.json.content || ''));
}

async function writeSettings(env, settings, message) {
  const existing = await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${SETTINGS_PATH}?ref=${env.GITHUB_BRANCH}`, {
    method: 'GET',
    allow404: true,
  });
  const body = {
    message,
    content: toBase64(`${JSON.stringify(settings, null, 2)}\n`),
    branch: env.GITHUB_BRANCH,
  };
  if (existing.status !== 404 && existing.json.sha) body.sha = existing.json.sha;
  await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${SETTINGS_PATH}`, {
    method: 'PUT',
    body,
  });
}

function shouldPublish(settings) {
  if (!settings.blogEnabled || settings.blogCadence === 'paused') return false;
  if (!settings.lastPublishedAt) return true;

  const last = new Date(settings.lastPublishedAt).getTime();
  const elapsedDays = (Date.now() - last) / 86400000;
  if (settings.blogCadence === 'daily') return elapsedDays >= 1;
  if (settings.blogCadence === 'weekly') return elapsedDays >= 7;
  if (settings.blogCadence === 'monthly') return elapsedDays >= 28;
  return false;
}

async function publishPost(env, post, force) {
  requireEnv(env, ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH']);

  const path = `content/posts/${post.slug}.json`;
  const existing = await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`, {
    method: 'GET',
    allow404: true,
  });

  if (existing.status !== 404 && !force) {
    return { created: false, reason: 'post already exists', path };
  }

  const body = {
    message: `Publish blog post: ${post.title}`,
    content: toBase64(`${JSON.stringify(post, null, 2)}\n`),
    branch: env.GITHUB_BRANCH,
  };

  if (existing.status !== 404 && existing.json.sha) {
    body.sha = existing.json.sha;
  }

  const result = await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body,
  });

  return {
    created: true,
    path,
    commit: result.json.commit && result.json.commit.sha,
  };
}

async function maybeCreateIssue(env, issue) {
  if (env.CREATE_ISSUES_ON_FAILURE !== 'true' || !env.GITHUB_TOKEN) return;

  try {
    await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      body: {
        title: issue.title,
        body: issue.body,
        labels: issue.label ? [issue.label] : undefined,
      },
    });
  } catch (error) {
    console.log('Failed to create issue', error);
  }
}

async function github(env, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'Dolphin Systems Caretaker',
      'x-github-api-version': '2022-11-28',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok && !(options.allow404 && response.status === 404)) {
    throw new Error(`GitHub request failed: ${response.status} ${text}`);
  }

  return { status: response.status, json: parsed };
}

function normalizeBody(blocks) {
  return blocks
    .map((block) => {
      if (block.type === 'list') {
        return { type: 'list', items: (block.items || []).filter(Boolean).slice(0, 6) };
      }
      return { type: block.type, text: String(block.text || '').trim() };
    })
    .filter((block) => (block.type === 'list' ? block.items.length : block.text));
}

function uniqueDatedSlug(title) {
  const date = new Date().toISOString().slice(0, 10);
  const titleSlug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58)
    .replace(/-+$/g, '');
  return `${date}-${titleSlug || 'systems-note'}`;
}

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required environment values: ${missing.join(', ')}`);
}

function isAuthorized(request, env) {
  const auth = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`);
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function adminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dolphin Systems Caretaker</title>
  <style>
    :root{color-scheme:light;--ink:#071329;--muted:#647089;--line:#dbe4f2;--blue:#185cff;--soft:#f5f8ff;--good:#0d8f62;--dark:#0c1833}
    *{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--ink);background:#eef4ff}
    body:before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 18% 0,rgba(24,92,255,.18),transparent 32%),radial-gradient(circle at 100% 18%,rgba(83,239,255,.22),transparent 28%);pointer-events:none}
    main{position:relative;width:min(1180px,calc(100% - 32px));margin:30px auto 48px}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:18px;background:var(--dark);color:#fff;border-radius:14px;padding:24px;box-shadow:0 24px 70px rgba(12,24,51,.18)}
    h1{font-size:34px;margin:0 0 6px;letter-spacing:-.04em}p{color:var(--muted);line-height:1.55}.top p{color:#bfd0ee;margin:0}
    .panel{background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:12px;padding:20px;margin:14px 0;box-shadow:0 18px 45px rgba(20,88,232,.08)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{border:1px solid var(--line);border-radius:12px;padding:16px;background:white}.metric b{display:block;font-size:22px;letter-spacing:-.03em}.metric span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700}
    label{display:block;font-weight:800;margin-bottom:8px}input,textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:13px 14px;font:inherit;background:#fbfdff}
    textarea{min-height:128px;resize:vertical}button{border:0;border-radius:10px;background:var(--blue);color:white;font-weight:800;padding:12px 16px;cursor:pointer}
    button.secondary{background:#0c1833}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    .quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.quick button{background:#e9f0ff;color:var(--ink)}.quick button.active{background:var(--blue);color:white}
    pre{white-space:pre-wrap;background:#0c1833;color:#dbe8ff;border:1px solid #263b66;border-radius:12px;padding:14px;overflow:auto;min-height:160px}
    .status{font-size:14px;color:var(--muted)}.manager{border-left:5px solid var(--blue)}.ok{color:var(--good)}.section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px}.pill{display:inline-flex;align-items:center;border-radius:999px;background:#e9f0ff;color:var(--blue);font-size:12px;font-weight:800;padding:6px 10px}.lead-list{display:grid;gap:10px}.lead{border:1px solid var(--line);border-radius:12px;padding:14px;background:#fbfdff}.lead b{display:block;margin-bottom:5px}.lead p{margin:4px 0;font-size:14px}.lead small{color:var(--muted)}
    @media(max-width:800px){.top{align-items:flex-start;flex-direction:column}.grid,.metric-grid,.quick{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <h1>Caretaker Dashboard</h1>
        <p>Manage Dolphin Systems publishing, health checks, and blog direction.</p>
      </div>
      <button class="secondary" id="refresh">Refresh</button>
    </div>
    <section class="panel manager">
      <div class="section-title"><label for="token">Admin token</label><span class="pill">Manager access</span></div>
      <input id="token" type="password" autocomplete="current-password" placeholder="Paste ADMIN_TOKEN">
      <p class="status">Saved only in this browser's local storage. This is the manager panel for the site caretaker.</p>
    </section>
    <section class="metric-grid" id="metrics">
      <div class="metric"><b>--</b><span>Website</span></div>
      <div class="metric"><b>--</b><span>Cadence</span></div>
      <div class="metric"><b>--</b><span>Blog mode</span></div>
      <div class="metric"><b>--</b><span>Last post</span></div>
    </section>
    <section class="panel">
      <div class="section-title"><label for="instructions">Manager instruction</label><span class="pill">Natural language</span></div>
      <textarea id="instructions" placeholder="Example: Write one practical blog post every day about automation and system reliability."></textarea>
      <div class="actions">
        <button id="save">Save instruction</button>
        <button class="secondary" id="generate">Generate one blog now</button>
      </div>
    </section>
    <section class="grid">
      <section class="panel">
        <label>Publishing cadence</label>
        <div class="quick">
          <button data-cadence="daily" type="button">Daily</button>
          <button data-cadence="weekly" type="button">Weekly</button>
          <button data-cadence="monthly" type="button">Monthly</button>
          <button data-cadence="paused" type="button">Pause</button>
        </div>
        <div class="actions">
          <button id="saveControls">Save controls</button>
          <button class="secondary" id="resetDue">Make next run due</button>
        </div>
      </section>
      <section class="panel">
        <label for="topicFocus">Topic focus</label>
        <textarea id="topicFocus" placeholder="automation, integrations, operational dashboards, client acquisition"></textarea>
      </section>
    </section>
    <section class="panel">
      <label for="blogSystemPrompt">Blog system prompt</label>
      <textarea id="blogSystemPrompt" placeholder="Tell the blog writer how to sound and what client impression to create."></textarea>
    </section>
    <section class="panel">
      <div class="section-title"><label>Client leads from Lila</label><button class="secondary" id="loadLeads" type="button">Load leads</button></div>
      <div class="lead-list" id="leadList"><p class="status">No leads loaded yet.</p></div>
    </section>
    <section class="panel">
      <label>Status</label>
      <pre id="output">Enter your admin token, then refresh.</pre>
    </section>
  </main>
  <script>
    const token = document.querySelector('#token');
    const instructions = document.querySelector('#instructions');
    const topicFocus = document.querySelector('#topicFocus');
    const blogSystemPrompt = document.querySelector('#blogSystemPrompt');
    const output = document.querySelector('#output');
    const metrics = document.querySelector('#metrics');
    const leadList = document.querySelector('#leadList');
    let settings = {};
    token.value = localStorage.getItem('caretakerAdminToken') || '';
    token.addEventListener('input', () => localStorage.setItem('caretakerAdminToken', token.value));

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          authorization: 'Bearer ' + token.value,
          'content-type': 'application/json',
          ...(options.headers || {})
        }
      });
      const data = await response.json();
      output.textContent = JSON.stringify(data, null, 2);
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    function paint(data) {
      settings = data.settings || settings || {};
      instructions.value = settings.instructions || '';
      topicFocus.value = settings.topicFocus || '';
      blogSystemPrompt.value = settings.blogSystemPrompt || '';
      document.querySelectorAll('[data-cadence]').forEach((button) => button.classList.toggle('active', button.dataset.cadence === settings.blogCadence));
      const healthy = data.checks && data.checks.ok;
      metrics.innerHTML = [
        ['Website', healthy ? 'Healthy' : 'Check'],
        ['Cadence', settings.blogCadence || '--'],
        ['Blog mode', settings.blogEnabled === false ? 'Paused' : 'Active'],
        ['Last post', settings.lastPublishedAt ? new Date(settings.lastPublishedAt).toLocaleDateString() : 'None']
      ].map(([label, value]) => '<div class="metric"><b class="' + (value === 'Healthy' ? 'ok' : '') + '">' + value + '</b><span>' + label + '</span></div>').join('');
    }

    document.querySelector('#refresh').onclick = async () => {
      const data = await api('/api/status');
      paint(data);
    };
    document.querySelector('#save').onclick = async () => {
      const data = await api('/api/instructions', { method: 'POST', body: JSON.stringify({ instructions: instructions.value }) });
      paint(data);
    };
    document.querySelector('#generate').onclick = async () => {
      await api('/api/generate', { method: 'POST' });
    };
    document.querySelectorAll('[data-cadence]').forEach((button) => {
      button.onclick = () => {
        settings.blogCadence = button.dataset.cadence;
        settings.blogEnabled = button.dataset.cadence !== 'paused';
        paint({ settings, checks: { ok: true } });
      };
    });
    document.querySelector('#saveControls').onclick = async () => {
      const data = await api('/api/settings', { method: 'POST', body: JSON.stringify({
        ...settings,
        topicFocus: topicFocus.value,
        blogSystemPrompt: blogSystemPrompt.value,
        instructions: instructions.value
      }) });
      paint(data);
    };
    document.querySelector('#resetDue').onclick = async () => {
      const data = await api('/api/settings', { method: 'POST', body: JSON.stringify({
        ...settings,
        topicFocus: topicFocus.value,
        blogSystemPrompt: blogSystemPrompt.value,
        instructions: instructions.value,
        resetLastPublishedAt: true
      }) });
      paint(data);
    };
    document.querySelector('#loadLeads').onclick = async () => {
      const data = await api('/api/leads');
      const leads = data.leads || [];
      leadList.innerHTML = leads.length ? leads.map((item) => {
        const lead = item.lead || {};
        return '<article class="lead"><b>' + (lead.name || 'Unknown visitor') + '</b>'
          + '<p>' + [lead.email, lead.phone, lead.company].filter(Boolean).join(' · ') + '</p>'
          + '<p>' + (lead.summary || lead.problem || 'No summary yet.') + '</p>'
          + '<small>' + new Date(item.updatedAt).toLocaleString() + '</small></article>';
      }).join('') : '<p class="status">No stored leads yet.</p>';
    };
  </script>
</body>
</html>`;
}
