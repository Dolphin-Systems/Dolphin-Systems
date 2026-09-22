const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'dolphin-systems-caretaker' });
    }

    if (url.pathname === '/generate' && request.method === 'POST') {
      const auth = request.headers.get('authorization') || '';
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }

      const result = await runCaretaker(env, { force: true });
      return json(result, result.ok ? 200 : 500);
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCaretaker(env, { cron: controller.cron }));
  },
};

async function runCaretaker(env, options = {}) {
  const checks = await checkWebsite(env.SITE_URL);
  if (!checks.ok) {
    await maybeCreateIssue(env, {
      title: 'Website health check failed',
      body: `Daily caretaker check failed for ${env.SITE_URL}.\n\nStatus: ${checks.status || 'no response'}\nError: ${checks.error || 'none'}\nTime: ${new Date().toISOString()}`,
      label: 'caretaker',
    });
    return { ok: false, checks };
  }

  const post = await generateBlogPost(env);
  const publish = await publishPost(env, post, options.force);

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

async function generateBlogPost(env) {
  requireEnv(env, ['OPENAI_API_KEY']);

  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    'Create one practical blog post for Dolphin Systems, an automation and systems optimization company.',
    'The tone should be clear, technical, concise, and useful to business operators.',
    'Return only valid JSON with this exact shape:',
    '{"title":"","description":"","category":"","body":[{"type":"paragraph","text":""},{"type":"heading","text":""},{"type":"list","items":[""]}]}',
    `Date: ${today}.`,
    'Topics can include workflow automation, integration design, operational visibility, human review, reliability, and making complex systems simple.',
    'Do not mention that AI wrote it. Do not invent customer names or case studies.',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.BLOG_MODEL || 'gpt-6-astra',
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'blog_post',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'description', 'category', 'body'],
            properties: {
              title: { type: 'string', minLength: 8, maxLength: 90 },
              description: { type: 'string', minLength: 30, maxLength: 180 },
              category: { type: 'string', minLength: 3, maxLength: 32 },
              body: {
                type: 'array',
                minItems: 4,
                maxItems: 9,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['type'],
                  properties: {
                    type: { enum: ['paragraph', 'heading', 'list'] },
                    text: { type: 'string' },
                    items: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 6,
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.output_text || extractOutputText(data);
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

function extractOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text' && part.text)
    .map((part) => part.text)
    .join('\n');
}

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required environment values: ${missing.join(', ')}`);
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: JSON_HEADERS });
}
