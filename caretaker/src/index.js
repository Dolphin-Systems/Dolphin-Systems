const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };
const SETTINGS_PATH = 'caretaker/settings.json';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: JSON_HEADERS });
}

function adminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dolphin Systems Caretaker</title>
  <style>
    :root{color-scheme:light;--ink:#071329;--muted:#5b6578;--line:#dbe4f3;--blue:#1458e8;--soft:#f6f9ff}
    *{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--ink);background:linear-gradient(135deg,#f8fbff,#eef5ff)}
    main{width:min(880px,calc(100% - 32px));margin:40px auto}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px}
    h1{font-size:34px;margin:0 0 8px;letter-spacing:-.03em}p{color:var(--muted);line-height:1.55}
    .panel{background:white;border:1px solid var(--line);border-radius:8px;padding:22px;margin:16px 0;box-shadow:0 18px 40px rgba(20,88,232,.08)}
    label{display:block;font-weight:700;margin-bottom:8px}input,textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:12px 14px;font:inherit}
    textarea{min-height:130px;resize:vertical}button{border:0;border-radius:8px;background:var(--blue);color:white;font-weight:700;padding:12px 16px;cursor:pointer}
    button.secondary{background:#071329}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    pre{white-space:pre-wrap;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto}
    .status{font-size:14px;color:var(--muted)}
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <h1>Dolphin Systems Caretaker</h1>
        <p>Control website checks and automated blog publishing.</p>
      </div>
      <button class="secondary" id="refresh">Refresh</button>
    </div>
    <section class="panel">
      <label for="token">Admin token</label>
      <input id="token" type="password" autocomplete="current-password" placeholder="Paste ADMIN_TOKEN">
      <p class="status">Saved only in this browser's local storage.</p>
    </section>
    <section class="panel">
      <label for="instructions">Instruction</label>
      <textarea id="instructions" placeholder="Example: Write one practical blog post every day about automation and system reliability."></textarea>
      <div class="actions">
        <button id="save">Save instruction</button>
        <button class="secondary" id="generate">Generate one blog now</button>
      </div>
    </section>
    <section class="panel">
      <label>Status</label>
      <pre id="output">Enter your admin token, then refresh.</pre>
    </section>
  </main>
  <script>
    const token = document.querySelector('#token');
    const instructions = document.querySelector('#instructions');
    const output = document.querySelector('#output');
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

    document.querySelector('#refresh').onclick = async () => {
      const data = await api('/api/status');
      instructions.value = data.settings.instructions || '';
    };
    document.querySelector('#save').onclick = async () => {
      await api('/api/instructions', { method: 'POST', body: JSON.stringify({ instructions: instructions.value }) });
    };
    document.querySelector('#generate').onclick = async () => {
      await api('/api/generate', { method: 'POST' });
    };
  </script>
</body>
</html>`;
}
