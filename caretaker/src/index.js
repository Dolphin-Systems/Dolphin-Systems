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

    if (url.pathname.startsWith('/api/leads/') && request.method === 'PATCH') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const id = decodeURIComponent(url.pathname.slice('/api/leads/'.length));
      const body = await request.json();
      const result = await updateLead(env, id, body);
      return json(result, result.ok ? 200 : 400);
    }

    if (url.pathname.startsWith('/api/leads/') && request.method === 'DELETE') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const id = decodeURIComponent(url.pathname.slice('/api/leads/'.length));
      const result = await deleteLead(env, id);
      return json(result, result.ok ? 200 : 400);
    }

    if (url.pathname === '/api/conversations') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const conversations = await listConversations(env);
      return json({ ok: true, conversations });
    }

    if (url.pathname.startsWith('/api/conversations/') && request.method === 'GET') {
      if (!isAuthorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const id = decodeURIComponent(url.pathname.slice('/api/conversations/'.length));
      const conversation = await getConversationTranscript(env, id);
      if (!conversation) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, conversation });
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
  const db = env.LEADS_DB;
  if (!db) return { ok: false, error: 'storage_not_configured' };

  const conversationId = String(body.conversationId || crypto.randomUUID());
  const userMessage = String(body.message || '').trim().slice(0, 1200);
  if (!userMessage) return { ok: false, error: 'message_required' };

  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO conversations (id, created_at, updated_at) VALUES (?1, ?2, ?2) ' +
    'ON CONFLICT(id) DO UPDATE SET updated_at = ?2'
  ).bind(conversationId, now).run();
  await db.prepare(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(conversationId, 'user', userMessage, now).run();

  const history = await getRecentMessages(db, conversationId, 24);
  const ai = await askLila(env, history);
  const repliedAt = new Date().toISOString();
  await db.prepare(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(conversationId, 'assistant', ai.reply, repliedAt).run();

  const lead = {
    ...(ai.lead || {}),
    summary: ai.summary || '',
    relevant: ai.relevant !== false,
    updatedAt: repliedAt,
  };
  if (lead.relevant && (lead.name || lead.email || lead.phone || lead.summary)) {
    await saveLead(db, conversationId, lead);
  }
  await db.prepare('UPDATE conversations SET updated_at = ?2 WHERE id = ?1')
    .bind(conversationId, repliedAt).run();

  return { ok: true, conversationId, reply: ai.reply, lead };
}

async function getRecentMessages(db, conversationId, limit) {
  const rows = await db.prepare(
    'SELECT role, content, created_at AS at FROM messages WHERE conversation_id = ?1 ORDER BY id DESC LIMIT ?2'
  ).bind(conversationId, limit).all();
  return (rows.results || []).reverse();
}

async function saveLead(db, conversationId, lead) {
  await db.prepare(
    `INSERT INTO leads (conversation_id, name, email, phone, company, problem, tools, outcome, timeline, budget, summary, relevant, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
     ON CONFLICT(conversation_id) DO UPDATE SET
       name = excluded.name, email = excluded.email, phone = excluded.phone, company = excluded.company,
       problem = excluded.problem, tools = excluded.tools, outcome = excluded.outcome,
       timeline = excluded.timeline, budget = excluded.budget, summary = excluded.summary,
       relevant = excluded.relevant, updated_at = excluded.updated_at`
  ).bind(
    conversationId,
    lead.name || null, lead.email || null, lead.phone || null, lead.company || null,
    lead.problem || null, lead.tools || null, lead.outcome || null,
    lead.timeline || null, lead.budget || null,
    lead.summary || '', lead.relevant ? 1 : 0, lead.updatedAt
  ).run();
}

async function askLila(env, messages) {
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
        ...messages.map((message) => ({ role: message.role, content: message.content })),
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
  const db = env.LEADS_DB;
  if (!db) return [];
  const rows = await db.prepare(
    `SELECT l.conversation_id AS id, l.name, l.email, l.phone, l.company, l.problem, l.tools,
            l.outcome, l.timeline, l.budget, l.summary, l.relevant, l.updated_at AS updatedAt,
            l.status, l.notes, c.created_at AS createdAt
     FROM leads l
     JOIN conversations c ON c.id = l.conversation_id
     ORDER BY l.updated_at DESC
     LIMIT 50`
  ).all();
  const leads = [];
  for (const row of rows.results || []) {
    const transcript = await getRecentMessages(db, row.id, 100);
    leads.push({
      id: row.id,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      status: row.status || 'new',
      notes: row.notes || '',
      lead: {
        name: row.name, email: row.email, phone: row.phone, company: row.company,
        problem: row.problem, tools: row.tools, outcome: row.outcome,
        timeline: row.timeline, budget: row.budget,
        summary: row.summary, relevant: row.relevant === 1,
      },
      transcript,
    });
  }
  return leads;
}

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

async function updateLead(env, conversationId, body) {
  const db = env.LEADS_DB;
  if (!db) return { ok: false, error: 'storage_not_configured' };
  const updates = [];
  const params = [];
  let index = 1;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!LEAD_STATUSES.includes(status)) return { ok: false, error: 'invalid_status' };
    updates.push(`status = ?${index++}`);
    params.push(status);
  }
  if (body.notes !== undefined) {
    updates.push(`notes = ?${index++}`);
    params.push(String(body.notes).slice(0, 5000));
  }
  if (!updates.length) return { ok: false, error: 'nothing_to_update' };
  updates.push(`updated_at = ?${index++}`);
  params.push(new Date().toISOString());
  params.push(conversationId);
  const result = await db.prepare(
    `UPDATE leads SET ${updates.join(', ')} WHERE conversation_id = ?${index}`
  ).bind(...params).run();
  if (!result.meta || result.meta.changes === 0) return { ok: false, error: 'not_found' };
  return { ok: true };
}

async function deleteLead(env, conversationId) {
  const db = env.LEADS_DB;
  if (!db) return { ok: false, error: 'storage_not_configured' };
  await db.prepare('DELETE FROM messages WHERE conversation_id = ?1').bind(conversationId).run();
  await db.prepare('DELETE FROM leads WHERE conversation_id = ?1').bind(conversationId).run();
  await db.prepare('DELETE FROM conversations WHERE id = ?1').bind(conversationId).run();
  return { ok: true };
}

async function listConversations(env) {
  const db = env.LEADS_DB;
  if (!db) return [];
  const rows = await db.prepare(
    `SELECT c.id, c.created_at AS createdAt, c.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messageCount,
            (SELECT m2.content FROM messages m2 WHERE m2.conversation_id = c.id AND m2.role = 'user' ORDER BY m2.id ASC LIMIT 1) AS preview,
            l.name AS leadName
     FROM conversations c
     LEFT JOIN leads l ON l.conversation_id = c.id
     ORDER BY c.updated_at DESC
     LIMIT 200`
  ).all();
  return rows.results || [];
}

async function getConversationTranscript(env, conversationId) {
  const db = env.LEADS_DB;
  if (!db) return null;
  const conv = await db.prepare(
    'SELECT id, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE id = ?1'
  ).bind(conversationId).first();
  if (!conv) return null;
  const msgs = await db.prepare(
    'SELECT role, content, created_at AS at FROM messages WHERE conversation_id = ?1 ORDER BY id ASC'
  ).bind(conversationId).all();
  return { id: conv.id, createdAt: conv.createdAt, updatedAt: conv.updatedAt, messages: msgs.results || [] };
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
<title>Dolphin Systems · Caretaker</title>
<style>
:root{
  --bg:#070b16; --bg2:#0b1122; --panel:#0e1528; --card:#121b32; --card2:#16203a;
  --line:#1f2b4d; --line2:#2a3a63;
  --ink:#eaf0ff; --muted:#8b98b8; --faint:#5b6889;
  --blue:#3b82f6; --cyan:#22d3ee; --good:#34d399; --warn:#fbbf24; --bad:#f87171; --violet:#a78bfa;
  --radius:16px;
}
*{box-sizing:border-box}
html,body{height:100%}
html{-webkit-text-size-adjust:100%}
button{-webkit-tap-highlight-color:transparent}
.transcript,.chat-list,.drawer-body,.mini-transcript{-webkit-overflow-scrolling:touch}
body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
body:before{content:'';position:fixed;inset:0;pointer-events:none;
  background:radial-gradient(600px 320px at 12% -4%,rgba(59,130,246,.16),transparent 60%),
             radial-gradient(700px 380px at 95% 8%,rgba(34,211,238,.10),transparent 60%);}
.app{position:relative;display:flex;min-height:100vh}
/* ---------- sidebar ---------- */
.sidebar{width:250px;flex-shrink:0;background:rgba(10,15,30,.85);border-right:1px solid var(--line);
  padding:22px 16px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh;backdrop-filter:blur(8px)}
.brand{display:flex;align-items:center;gap:12px;padding:6px 10px 20px}
.brand .mark{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--cyan));
  display:flex;align-items:center;justify-content:center;font-weight:900;font-size:19px;color:#fff;box-shadow:0 8px 24px rgba(59,130,246,.35)}
.brand b{display:block;font-size:15px;letter-spacing:-.01em}
.brand small{color:var(--muted);font-size:11px;letter-spacing:.14em;text-transform:uppercase}
.nav{display:flex;flex-direction:column;gap:4px}
.nav button{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;color:var(--muted);
  font:inherit;font-size:14px;font-weight:600;padding:11px 12px;border-radius:12px;cursor:pointer;text-align:left;transition:.15s}
.nav button:hover{background:var(--card);color:var(--ink)}
.nav button.active{background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(34,211,238,.12));color:#fff;box-shadow:inset 0 0 0 1px var(--line2)}
.nav button .ico{width:22px;text-align:center;font-size:16px}
.nav button .count{margin-left:auto;background:var(--card2);border:1px solid var(--line);color:var(--muted);
  font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px}
.side-foot{margin-top:auto;padding:12px 10px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--faint);margin-right:8px;vertical-align:1px}
.dot.on{background:var(--good);box-shadow:0 0 10px var(--good)}
/* ---------- main ---------- */
.main{flex:1;min-width:0;padding:26px 30px 60px;max-width:1240px}
.topbar{display:flex;align-items:center;gap:14px;margin-bottom:22px}
.topbar h1{font-size:24px;margin:0;letter-spacing:-.03em}
.topbar p{margin:4px 0 0;color:var(--muted);font-size:13px}
.topbar .spacer{flex:1}
.btn{border:1px solid var(--line2);background:var(--card);color:var(--ink);font:inherit;font-size:13px;font-weight:700;
  padding:10px 16px;border-radius:12px;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;gap:8px}
.btn:hover{border-color:var(--blue);transform:translateY(-1px)}
.btn.primary{background:linear-gradient(135deg,var(--blue),#2563eb);border-color:transparent;color:#fff;box-shadow:0 10px 26px rgba(59,130,246,.35)}
.btn.danger{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.4);color:var(--bad)}
.btn.ghost{background:transparent}
.view{display:none}
.view.active{display:block;animation:fade .25s ease}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
/* ---------- stats ---------- */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat{background:linear-gradient(180deg,var(--card),var(--panel));border:1px solid var(--line);border-radius:var(--radius);padding:18px}
.stat b{display:block;font-size:28px;letter-spacing:-.04em;margin-bottom:4px}
.stat span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;font-weight:700}
.stat.blue b{color:var(--blue)} .stat.cyan b{color:var(--cyan)} .stat.amber b{color:var(--warn)} .stat.green b{color:var(--good)}
/* ---------- toolbar ---------- */
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.search{flex:1;min-width:200px;position:relative}
.search input{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;color:var(--ink);
  font:inherit;font-size:14px;padding:11px 14px 11px 40px;outline:none}
.search input:focus{border-color:var(--blue)}
.search .ico{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--faint)}
select{background:var(--panel);border:1px solid var(--line);border-radius:12px;color:var(--ink);font:inherit;font-size:13px;font-weight:600;padding:11px 12px;outline:none;cursor:pointer}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--panel);color:var(--muted);font:inherit;font-size:12px;font-weight:700;
  padding:8px 14px;border-radius:999px;cursor:pointer;transition:.15s}
.chip:hover{color:var(--ink);border-color:var(--line2)}
.chip.active{background:#fff;color:#0a0e1a;border-color:#fff}
/* ---------- lead cards ---------- */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.card{background:linear-gradient(180deg,var(--card),var(--panel));border:1px solid var(--line);border-radius:var(--radius);
  padding:18px;cursor:pointer;transition:.18s;position:relative;overflow:hidden}
.card:hover{transform:translateY(-3px);border-color:var(--line2);box-shadow:0 18px 44px rgba(0,0,0,.45)}
.card .who{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
.avatar{width:42px;height:42px;border-radius:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--violet),var(--blue))}
.card h3{margin:0;font-size:15px;letter-spacing:-.01em}
.card .contact{font-size:12px;color:var(--muted);margin-top:3px}
.card .summary{font-size:13px;color:var(--muted);line-height:1.55;margin:10px 0;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .meta{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--faint)}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
  padding:5px 11px;border-radius:999px;border:1px solid}
.pill.new{color:#93c5fd;border-color:rgba(59,130,246,.45);background:rgba(59,130,246,.12)}
.pill.contacted{color:#67e8f9;border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.10)}
.pill.qualified{color:#fcd34d;border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.10)}
.pill.won{color:#6ee7b7;border-color:rgba(52,211,153,.45);background:rgba(52,211,153,.10)}
.pill.lost{color:#9aa5c4;border-color:var(--line2);background:rgba(90,104,137,.12)}
.pill.leadtag{color:var(--violet);border-color:rgba(167,139,250,.45);background:rgba(167,139,250,.10)}
.empty{text-align:center;padding:70px 20px;color:var(--muted);border:1px dashed var(--line2);border-radius:var(--radius);grid-column:1/-1}
.empty .big{font-size:40px;margin-bottom:12px}
/* ---------- chat logs ---------- */
.chat-layout{display:grid;grid-template-columns:360px 1fr;gap:14px;align-items:start}
.chat-list{display:flex;flex-direction:column;gap:8px;max-height:70vh;overflow:auto;padding-right:4px}
.chat-row{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:13px 14px;cursor:pointer;transition:.15s;text-align:left;width:100%;color:var(--ink);font:inherit}
.chat-row:hover{border-color:var(--line2)}
.chat-row.active{border-color:var(--blue);background:var(--card)}
.chat-row .prev{font-size:13px;color:var(--muted);margin:6px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-row .rowmeta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--faint)}
.chat-viewer{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);display:flex;flex-direction:column;max-height:70vh;min-height:420px;overflow:hidden}
.chat-head{padding:16px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
.chat-head b{font-size:15px}
.chat-head small{color:var(--muted);display:block;font-size:12px;margin-top:2px}
.transcript{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.bubble{max-width:78%;padding:11px 15px;border-radius:16px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.bubble small{display:block;font-size:10.5px;opacity:.6;margin-top:6px}
.bubble.user{align-self:flex-end;background:linear-gradient(135deg,var(--blue),#2563eb);color:#fff;border-bottom-right-radius:6px}
.bubble.lila{align-self:flex-start;background:var(--card2);border:1px solid var(--line);border-bottom-left-radius:6px}
.viewer-empty{margin:auto;color:var(--faint);text-align:center;padding:40px}
/* ---------- drawer ---------- */
.scrim{position:fixed;inset:0;background:rgba(3,6,15,.6);opacity:0;pointer-events:none;transition:.25s;z-index:40}
.scrim.show{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:var(--bg2);border-left:1px solid var(--line2);
  transform:translateX(102%);transition:transform .3s cubic-bezier(.2,.8,.25,1);z-index:50;display:flex;flex-direction:column}
.drawer.show{transform:none}
.drawer-head{padding:20px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:flex-start}
.drawer-head .avatar{width:48px;height:48px;font-size:18px}
.drawer-head h2{margin:0;font-size:18px;letter-spacing:-.02em}
.drawer-head .contact{font-size:12.5px;color:var(--muted);margin-top:4px}
.drawer-body{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:18px}
.drawer-foot{padding:16px 20px;border-top:1px solid var(--line);display:flex;gap:10px}
.field label{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:8px}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kv div{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.kv small{display:block;font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;font-weight:700}
.kv span{font-size:13px}
textarea,input[type=text]{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;color:var(--ink);
  font:inherit;font-size:13.5px;padding:12px;outline:none;resize:vertical}
textarea:focus,input[type=text]:focus{border-color:var(--blue)}
.mini-transcript{display:flex;flex-direction:column;gap:10px;max-height:320px;overflow:auto;padding:4px}
/* ---------- caretaker ---------- */
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:22px;margin-bottom:16px}
.panel h3{margin:0 0 4px;font-size:16px;letter-spacing:-.02em}
.panel .sub{font-size:13px;color:var(--muted);margin:0 0 16px}
.panel label{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px}
.panel label:first-child{margin-top:0}
.panel textarea{min-height:110px}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.seg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.seg button{border:1px solid var(--line);background:var(--card);color:var(--muted);font:inherit;font-size:13px;font-weight:700;
  padding:12px;border-radius:12px;cursor:pointer;transition:.15s}
.seg button.active{background:linear-gradient(135deg,var(--blue),#2563eb);color:#fff;border-color:transparent}
pre.out{background:#05080f;border:1px solid var(--line);border-radius:12px;padding:16px;overflow:auto;max-height:300px;
  font-size:12px;line-height:1.6;color:#9fd0ff;white-space:pre-wrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
/* ---------- modal / toast ---------- */
.modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:60;background:rgba(3,6,15,.7);padding:20px}
.modal.show{display:flex}
.modal .box{background:var(--bg2);border:1px solid var(--line2);border-radius:20px;padding:28px;width:min(420px,100%)}
.modal h3{margin:0 0 6px}
.modal p{font-size:13px;color:var(--muted);margin:0 0 16px}
.toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,80px);background:#fff;color:#0a0e1a;font-size:13.5px;font-weight:700;
  padding:13px 22px;border-radius:999px;z-index:70;transition:.3s;box-shadow:0 18px 50px rgba(0,0,0,.5);opacity:0}
.toast.show{transform:translate(-50%,0);opacity:1}
@media(max-width:960px){
  .sidebar{position:fixed;left:0;top:0;bottom:0;transform:translateX(-102%);transition:.25s;z-index:55;height:100vh}
  body.nav-open .sidebar{transform:none}
  .main{padding:18px 16px calc(60px + env(safe-area-inset-bottom))}
  .stats{grid-template-columns:repeat(2,1fr)}
  .chat-layout{grid-template-columns:1fr}
  .chat-list{max-height:300px}
  .two{grid-template-columns:1fr}
  .menu-btn{display:inline-flex !important}
  .nav-scrim{display:block;position:fixed;inset:0;background:rgba(3,6,15,.6);z-index:54;opacity:0;pointer-events:none;transition:.25s}
  body.nav-open .nav-scrim{opacity:1;pointer-events:auto}
}
.menu-btn{display:none}
.nav-scrim{display:none}
/* ---------- phone polish ---------- */
@media(max-width:640px){
  input,textarea,select{font-size:16px !important}
  .topbar{gap:10px;margin-bottom:16px}
  .topbar h1{font-size:19px}
  .topbar p{display:none}
  .topbar .btn{padding:9px 12px}
  .stats{gap:10px;margin-bottom:14px}
  .stat{padding:14px}
  .stat b{font-size:22px}
  .stat span{font-size:10px}
  .toolbar{gap:8px;margin-bottom:12px}
  .search{flex:1 1 100%;min-width:0}
  .chip{padding:10px 16px}
  .btn{min-height:44px}
  .grid{grid-template-columns:1fr}
  .card{padding:16px}
  .card .contact,.card .summary{word-break:break-word}
  .seg{grid-template-columns:repeat(2,1fr)}
  .panel{padding:16px}
  .drawer{width:100%;border-left:0;padding-top:env(safe-area-inset-top)}
  .drawer-foot{padding-bottom:calc(16px + env(safe-area-inset-bottom))}
  .bubble{max-width:88%}
  .modal{padding:14px}
  .modal .box{padding:22px}
  .toast{bottom:calc(20px + env(safe-area-inset-bottom));max-width:calc(100vw - 32px)}
}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <div class="mark">D</div>
      <div><b>Dolphin Systems</b><small>Caretaker</small></div>
    </div>
    <nav class="nav">
      <button data-view="leads" class="active"><span class="ico">▣</span>Leads<span class="count" id="navLeadCount">–</span></button>
      <button data-view="chats"><span class="ico">💬</span>Chat logs<span class="count" id="navChatCount">–</span></button>
      <button data-view="caretaker"><span class="ico">⚙</span>Caretaker</button>
    </nav>
    <div class="side-foot"><span class="dot" id="connDot"></span><span id="connText">Not connected</span></div>
  </aside>
  <div class="nav-scrim" id="navScrim"></div>

  <main class="main">
    <header class="topbar">
      <button class="btn ghost menu-btn" id="menuBtn" type="button">☰</button>
      <div>
        <h1 id="viewTitle">Leads</h1>
        <p id="viewSub">Every visitor Lila talked to, organized.</p>
      </div>
      <div class="spacer"></div>
      <button class="btn" id="tokenBtn" type="button">🔑 Token</button>
    </header>

    <!-- LEADS -->
    <section class="view active" id="view-leads">
      <div class="stats">
        <div class="stat blue"><b id="stTotal">–</b><span>Total leads</span></div>
        <div class="stat cyan"><b id="stNew">–</b><span>New</span></div>
        <div class="stat amber"><b id="stQualified">–</b><span>Qualified</span></div>
        <div class="stat green"><b id="stWon">–</b><span>Won</span></div>
      </div>
      <div class="toolbar">
        <div class="search"><span class="ico">⌕</span><input id="leadSearch" type="text" placeholder="Search name, email, company, notes…"></div>
        <select id="leadSort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
        <button class="btn" id="exportBtn" type="button">⤓ Export CSV</button>
      </div>
      <div class="chips" id="statusChips" style="margin-bottom:16px"></div>
      <div class="grid" id="leadsGrid"></div>
    </section>

    <!-- CHAT LOGS -->
    <section class="view" id="view-chats">
      <div class="toolbar">
        <div class="search"><span class="ico">⌕</span><input id="chatSearch" type="text" placeholder="Search across all conversations…"></div>
      </div>
      <div class="chat-layout">
        <div class="chat-list" id="chatList"></div>
        <div class="chat-viewer" id="chatViewer"><div class="viewer-empty">Select a conversation to read the full chat log.</div></div>
      </div>
    </section>

    <!-- CARETAKER -->
    <section class="view" id="view-caretaker">
      <div class="stats">
        <div class="stat blue"><b id="mSite">–</b><span>Website</span></div>
        <div class="stat cyan"><b id="mCadence">–</b><span>Cadence</span></div>
        <div class="stat amber"><b id="mMode">–</b><span>Blog mode</span></div>
        <div class="stat green"><b id="mLast">–</b><span>Last post</span></div>
      </div>
      <div class="panel">
        <h3>Blog direction</h3>
        <p class="sub">Tell the caretaker what to write in plain language.</p>
        <label for="instructions">Manager instruction</label>
        <textarea id="instructions" placeholder="Example: Write one practical blog post every day about automation and system reliability."></textarea>
        <div class="row">
          <button class="btn primary" id="saveInstr" type="button">Save instruction</button>
          <button class="btn" id="refreshBtn" type="button">↻ Refresh status</button>
          <button class="btn danger" id="generateBtn" type="button">Generate one blog now</button>
        </div>
      </div>
      <div class="two">
        <div class="panel">
          <h3>Publishing cadence</h3>
          <p class="sub">How often the caretaker publishes.</p>
          <div class="seg" id="cadenceSeg">
            <button data-cadence="daily" type="button">Daily</button>
            <button data-cadence="weekly" type="button">Weekly</button>
            <button data-cadence="monthly" type="button">Monthly</button>
            <button data-cadence="paused" type="button">Pause</button>
          </div>
          <div class="row">
            <button class="btn primary" id="saveControls" type="button">Save</button>
            <button class="btn ghost" id="resetDue" type="button">Make next run due</button>
          </div>
        </div>
        <div class="panel">
          <h3>Topic focus</h3>
          <p class="sub">What the blog should be about.</p>
          <label for="topicFocus">Topics</label>
          <textarea id="topicFocus" placeholder="automation, integrations, operational dashboards"></textarea>
        </div>
      </div>
      <div class="panel">
        <h3>Blog voice</h3>
        <p class="sub">How the writer should sound.</p>
        <label for="blogSystemPrompt">System prompt</label>
        <textarea id="blogSystemPrompt" placeholder="Tell the blog writer how to sound and what impression to create."></textarea>
      </div>
      <div class="panel">
        <h3>Raw status</h3>
        <p class="sub">Latest API response for debugging.</p>
        <pre class="out" id="output">Enter your admin token, then refresh.</pre>
      </div>
    </section>
  </main>
</div>

<!-- lead drawer -->
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer">
  <div class="drawer-head">
    <div class="avatar" id="dAvatar">?</div>
    <div style="flex:1">
      <h2 id="dName">–</h2>
      <div class="contact" id="dContact">–</div>
    </div>
    <button class="btn ghost" id="drawerClose" type="button">✕</button>
  </div>
  <div class="drawer-body">
    <div class="field">
      <label>Pipeline status</label>
      <select id="dStatus" style="width:100%"></select>
    </div>
    <div class="field">
      <label>Lead details</label>
      <div class="kv" id="dFields"></div>
    </div>
    <div class="field">
      <label>Summary</label>
      <div id="dSummary" style="font-size:13.5px;color:var(--muted);line-height:1.6"></div>
    </div>
    <div class="field">
      <label for="dNotes">Private notes</label>
      <textarea id="dNotes" rows="4" placeholder="Anything worth remembering about this lead…"></textarea>
      <div class="row"><button class="btn primary" id="dSaveNotes" type="button">Save notes</button></div>
    </div>
    <div class="field">
      <label>Full chat transcript</label>
      <div class="mini-transcript" id="dTranscript"></div>
    </div>
  </div>
  <div class="drawer-foot">
    <button class="btn danger" id="dDelete" type="button" style="flex:1;justify-content:center">Delete lead</button>
  </div>
</aside>

<!-- token modal -->
<div class="modal" id="tokenModal">
  <div class="box">
    <h3>Admin token</h3>
    <p>Stored only in this browser. Needed for leads, chat logs and caretaker controls.</p>
    <input type="password" id="tokenInput" placeholder="Paste ADMIN_TOKEN" autocomplete="current-password">
    <div class="row" style="margin-top:16px">
      <button class="btn primary" id="tokenSave" type="button" style="flex:1;justify-content:center">Save &amp; connect</button>
      <button class="btn ghost" id="tokenCancel" type="button">Cancel</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
<script>
var $ = function(s){ return document.querySelector(s); };
var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
var STATUSES = ['new','contacted','qualified','won','lost'];
var STATUS_LABEL = { new:'New', contacted:'Contacted', qualified:'Qualified', won:'Won', lost:'Lost' };
var state = { leads:[], chats:[], view:'leads', leadFilter:'all', leadQuery:'', leadSort:'newest',
  chatQuery:'', activeChatId:null, activeLeadId:null, settings:{}, transcriptCache:{} };

function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
var toastTimer = null;
function toast(msg){
  var t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}
function timeAgo(iso){
  if(!iso) return '—';
  var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  if(s < 864000) return Math.floor(s/86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}
function fmtDT(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function initials(name){
  var n = String(name || '?').trim();
  return n ? n.charAt(0).toUpperCase() : '?';
}
/* ---------- token ---------- */
function getToken(){ return localStorage.getItem('caretakerAdminToken') || ''; }
function setToken(v){ localStorage.setItem('caretakerAdminToken', v); paintConn(); }
function paintConn(){
  var on = !!getToken();
  $('#connDot').classList.toggle('on', on);
  $('#connText').textContent = on ? 'Connected' : 'Not connected';
}
$('#tokenBtn').onclick = function(){ $('#tokenInput').value = getToken(); $('#tokenModal').classList.add('show'); };
$('#tokenCancel').onclick = function(){ $('#tokenModal').classList.remove('show'); };
$('#tokenSave').onclick = function(){
  setToken($('#tokenInput').value.trim());
  $('#tokenModal').classList.remove('show');
  toast('Token saved');
  boot();
};
async function api(path, options){
  options = options || {};
  var res = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'authorization':'Bearer ' + getToken(), 'content-type':'application/json' },
    body: options.body
  });
  var data = null;
  try { data = await res.json(); } catch(e){ data = { ok:false, error:'bad_response' }; }
  if(!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}
/* ---------- views ---------- */
var TITLES = {
  leads:['Leads','Every visitor Lila talked to, organized.'],
  chats:['Chat logs','Every conversation, searchable end to end.'],
  caretaker:['Caretaker','Publishing, health checks and blog direction.']
};
function setView(v){
  state.view = v;
  $$('.nav button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-view') === v); });
  $$('.view').forEach(function(s){ s.classList.remove('active'); });
  $('#view-' + v).classList.add('active');
  $('#viewTitle').textContent = TITLES[v][0];
  $('#viewSub').textContent = TITLES[v][1];
  document.body.classList.remove('nav-open');
  if(v === 'leads' && !state.leads.length) loadLeads();
  if(v === 'chats' && !state.chats.length) loadChats();
}
$$('.nav button').forEach(function(b){ b.onclick = function(){ setView(b.getAttribute('data-view')); }; });
$('#menuBtn').onclick = function(){ document.body.classList.toggle('nav-open'); };
$('#navScrim').onclick = function(){ document.body.classList.remove('nav-open'); };
/* ---------- leads ---------- */
function statusPill(s){ return '<span class="pill ' + s + '">' + STATUS_LABEL[s] + '</span>'; }
function renderChips(){
  var counts = { all: state.leads.length };
  STATUSES.forEach(function(s){ counts[s] = 0; });
  state.leads.forEach(function(l){ counts[l.status] = (counts[l.status] || 0) + 1; });
  var html = '<button class="chip' + (state.leadFilter === 'all' ? ' active' : '') + '" data-f="all">All · ' + counts.all + '</button>';
  STATUSES.forEach(function(s){
    html += '<button class="chip' + (state.leadFilter === s ? ' active' : '') + '" data-f="' + s + '">' +
      STATUS_LABEL[s] + ' · ' + (counts[s] || 0) + '</button>';
  });
  $('#statusChips').innerHTML = html;
  $$('#statusChips .chip').forEach(function(c){ c.onclick = function(){ state.leadFilter = c.getAttribute('data-f'); renderLeads(); }; });
}
function filteredLeads(){
  var q = state.leadQuery.toLowerCase();
  var out = state.leads.filter(function(item){
    if(state.leadFilter !== 'all' && item.status !== state.leadFilter) return false;
    if(!q) return true;
    var l = item.lead || {};
    var hay = [l.name,l.email,l.phone,l.company,l.problem,l.tools,l.outcome,l.timeline,l.budget,l.summary,item.notes].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  });
  out.sort(function(a,b){
    if(state.leadSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if(state.leadSort === 'name'){
      var an = ((a.lead||{}).name || '').toLowerCase(), bn = ((b.lead||{}).name || '').toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  return out;
}
function renderLeads(){
  renderChips();
  var list = filteredLeads();
  $('#navLeadCount').textContent = state.leads.length;
  $('#stTotal').textContent = state.leads.length;
  $('#stNew').textContent = state.leads.filter(function(l){ return l.status === 'new'; }).length;
  $('#stQualified').textContent = state.leads.filter(function(l){ return l.status === 'qualified'; }).length;
  $('#stWon').textContent = state.leads.filter(function(l){ return l.status === 'won'; }).length;
  if(!list.length){
    $('#leadsGrid').innerHTML = '<div class="empty"><div class="big">🫧</div><div>' +
      (state.leads.length ? 'No leads match this filter.' : 'No leads yet. They will appear here when Lila chats with visitors.') + '</div></div>';
    return;
  }
  $('#leadsGrid').innerHTML = list.map(function(item){
    var l = item.lead || {};
    var contact = [l.email, l.phone].filter(Boolean).join(' · ');
    return '<article class="card" data-id="' + esc(item.id) + '">' +
      '<div class="who"><div class="avatar">' + esc(initials(l.name)) + '</div>' +
      '<div style="flex:1;min-width:0"><h3>' + esc(l.name || 'Unknown visitor') + '</h3>' +
      '<div class="contact">' + esc(contact || (l.company || 'No contact yet')) + '</div></div></div>' +
      '<div class="summary">' + esc(l.summary || l.problem || 'No summary yet.') + '</div>' +
      '<div class="meta">' + statusPill(item.status) +
      '<span>' + esc((item.transcript || []).length + ' msgs') + '</span>' +
      '<span style="margin-left:auto">' + esc(timeAgo(item.updatedAt)) + '</span></div></article>';
  }).join('');
  $$('#leadsGrid .card').forEach(function(c){ c.onclick = function(){ openLead(c.getAttribute('data-id')); }; });
}
async function loadLeads(){
  try {
    var data = await api('/api/leads');
    state.leads = data.leads || [];
    renderLeads();
  } catch(e){ toast('Leads: ' + e.message); }
}
$('#leadSearch').addEventListener('input', function(e){ state.leadQuery = e.target.value; renderLeads(); });
$('#leadSort').addEventListener('change', function(e){ state.leadSort = e.target.value; renderLeads(); });
function bubbleHTML(m){
  var who = m.role === 'user' ? 'user' : 'lila';
  return '<div class="bubble ' + who + '">' + esc(m.content) + '<small>' + esc(fmtDT(m.at)) + '</small></div>';
}
function openLead(id){
  var item = null;
  state.leads.forEach(function(l){ if(l.id === id) item = l; });
  if(!item) return;
  state.activeLeadId = id;
  var l = item.lead || {};
  $('#dAvatar').textContent = initials(l.name);
  $('#dName').textContent = l.name || 'Unknown visitor';
  $('#dContact').textContent = [l.email, l.phone, l.company].filter(Boolean).join(' · ') || 'No contact info yet';
  var sel = $('#dStatus');
  sel.innerHTML = STATUSES.map(function(s){
    return '<option value="' + s + '"' + (item.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
  }).join('');
  var fields = [['Problem',l.problem],['Tools',l.tools],['Outcome',l.outcome],['Timeline',l.timeline],['Budget',l.budget],['Company',l.company]];
  $('#dFields').innerHTML = fields.map(function(f){
    return '<div><small>' + f[0] + '</small><span>' + esc(f[1] || '—') + '</span></div>';
  }).join('');
  $('#dSummary').textContent = l.summary || 'No summary yet.';
  $('#dNotes').value = item.notes || '';
  var t = item.transcript || [];
  $('#dTranscript').innerHTML = t.length ? t.map(bubbleHTML).join('') : '<div style="color:var(--faint);font-size:13px">No messages.</div>';
  $('#scrim').classList.add('show');
  $('#drawer').classList.add('show');
}
function closeDrawer(){
  $('#scrim').classList.remove('show');
  $('#drawer').classList.remove('show');
  state.activeLeadId = null;
}
$('#drawerClose').onclick = closeDrawer;
$('#scrim').onclick = closeDrawer;
$('#dStatus').addEventListener('change', async function(e){
  if(!state.activeLeadId) return;
  try {
    await api('/api/leads/' + encodeURIComponent(state.activeLeadId), { method:'PATCH', body: JSON.stringify({ status: e.target.value }) });
    state.leads.forEach(function(l){ if(l.id === state.activeLeadId) l.status = e.target.value; });
    renderLeads(); toast('Status updated');
  } catch(err){ toast('Failed: ' + err.message); }
});
$('#dSaveNotes').onclick = async function(){
  if(!state.activeLeadId) return;
  try {
    await api('/api/leads/' + encodeURIComponent(state.activeLeadId), { method:'PATCH', body: JSON.stringify({ notes: $('#dNotes').value }) });
    state.leads.forEach(function(l){ if(l.id === state.activeLeadId) l.notes = $('#dNotes').value; });
    toast('Notes saved');
  } catch(err){ toast('Failed: ' + err.message); }
};
$('#dDelete').onclick = async function(){
  if(!state.activeLeadId) return;
  if(!confirm('Delete this lead and its entire chat history?')) return;
  try {
    await api('/api/leads/' + encodeURIComponent(state.activeLeadId), { method:'DELETE' });
    state.leads = state.leads.filter(function(l){ return l.id !== state.activeLeadId; });
    state.chats = state.chats.filter(function(c){ return c.id !== state.activeLeadId; });
    closeDrawer(); renderLeads(); renderChatList(); toast('Lead deleted');
  } catch(err){ toast('Failed: ' + err.message); }
};
$('#exportBtn').onclick = function(){
  var rows = [['id','name','email','phone','company','problem','tools','outcome','timeline','budget','summary','status','notes','created','updated']];
  state.leads.forEach(function(item){
    var l = item.lead || {};
    rows.push([item.id, l.name||'', l.email||'', l.phone||'', l.company||'', l.problem||'', l.tools||'',
      l.outcome||'', l.timeline||'', l.budget||'', l.summary||'', item.status, item.notes||'', item.createdAt||'', item.updatedAt||'']);
  });
  var csv = rows.map(function(r){ return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = 'dolphin-leads.csv'; a.click();
  toast('Exported ' + state.leads.length + ' leads');
};
/* ---------- chat logs ---------- */
function renderChatList(){
  $('#navChatCount').textContent = state.chats.length;
  var q = state.chatQuery.toLowerCase();
  var list = state.chats.filter(function(c){
    if(!q) return true;
    return ((c.preview || '') + ' ' + (c.leadName || '')).toLowerCase().indexOf(q) !== -1;
  });
  if(!list.length){
    $('#chatList').innerHTML = '<div class="empty"><div class="big">💬</div><div>No conversations found.</div></div>';
    return;
  }
  $('#chatList').innerHTML = list.map(function(c){
    return '<button class="chat-row' + (state.activeChatId === c.id ? ' active' : '') + '" data-id="' + esc(c.id) + '">' +
      '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:13.5px">' + esc(c.leadName || 'Visitor') + '</b>' +
      (c.leadName ? '<span class="pill leadtag">lead</span>' : '') +
      '<span style="margin-left:auto;font-size:11px;color:var(--faint)">' + esc(c.messageCount + ' msgs') + '</span></div>' +
      '<div class="prev">' + esc(c.preview || 'No messages') + '</div>' +
      '<div class="rowmeta"><span>' + esc(timeAgo(c.updatedAt)) + '</span></div></button>';
  }).join('');
  $$('#chatList .chat-row').forEach(function(r){ r.onclick = function(){ openChat(r.getAttribute('data-id')); }; });
}
async function loadChats(){
  try {
    var data = await api('/api/conversations');
    state.chats = data.conversations || [];
    renderChatList();
  } catch(e){ toast('Chat logs: ' + e.message); }
}
$('#chatSearch').addEventListener('input', function(e){ state.chatQuery = e.target.value; renderChatList(); });
async function openChat(id){
  state.activeChatId = id;
  renderChatList();
  var v = $('#chatViewer');
  v.innerHTML = '<div class="viewer-empty">Loading…</div>';
  try {
    var data;
    if(state.transcriptCache[id]) { data = { conversation: state.transcriptCache[id] }; }
    else {
      data = await api('/api/conversations/' + encodeURIComponent(id));
      state.transcriptCache[id] = data.conversation;
    }
    var c = data.conversation;
    var meta = state.chats.filter(function(x){ return x.id === id; })[0] || {};
    var html = '<div class="chat-head"><div class="avatar">' + esc(initials(meta.leadName)) + '</div>' +
      '<div><b>' + esc(meta.leadName || 'Visitor') + '</b>' +
      '<small>' + esc(c.messages.length + ' messages · started ' + fmtDT(c.createdAt)) + '</small></div></div>' +
      '<div class="transcript">' + c.messages.map(bubbleHTML).join('') + '</div>';
    v.innerHTML = html;
    var t = v.querySelector('.transcript');
    t.scrollTop = t.scrollHeight;
    if(window.innerWidth <= 640){ v.scrollIntoView({behavior:'smooth',block:'start'}); }
  } catch(e){ v.innerHTML = '<div class="viewer-empty">Failed to load: ' + esc(e.message) + '</div>'; }
}
/* ---------- caretaker ---------- */
function paintCaretaker(data){
  var s = data.settings || {};
  state.settings = s;
  $('#instructions').value = s.instructions || '';
  $('#topicFocus').value = s.topicFocus || '';
  $('#blogSystemPrompt').value = s.blogSystemPrompt || '';
  $$('#cadenceSeg button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-cadence') === s.blogCadence); });
  var healthy = data.checks && data.checks.ok;
  $('#mSite').textContent = healthy ? 'Healthy' : 'Check';
  $('#mCadence').textContent = s.blogCadence || '–';
  $('#mMode').textContent = s.blogEnabled === false ? 'Paused' : 'Active';
  $('#mLast').textContent = s.lastPublishedAt ? new Date(s.lastPublishedAt).toLocaleDateString() : 'None';
  $('#output').textContent = JSON.stringify(data, null, 2);
}
$('#refreshBtn').onclick = async function(){
  try { paintCaretaker(await api('/api/status')); } catch(e){ toast('Failed: ' + e.message); }
};
$('#saveInstr').onclick = async function(){
  try { paintCaretaker(await api('/api/instructions', { method:'POST', body: JSON.stringify({ instructions: $('#instructions').value }) })); toast('Instruction saved'); }
  catch(e){ toast('Failed: ' + e.message); }
};
$('#generateBtn').onclick = async function(){
  if(!confirm('Generate and publish one blog post now?')) return;
  try { paintCaretaker(await api('/api/generate', { method:'POST' })); toast('Blog generated'); }
  catch(e){ toast('Failed: ' + e.message); }
};
$$('#cadenceSeg button').forEach(function(b){
  b.onclick = function(){
    state.settings.blogCadence = b.getAttribute('data-cadence');
    state.settings.blogEnabled = b.getAttribute('data-cadence') !== 'paused';
    $$('#cadenceSeg button').forEach(function(x){ x.classList.toggle('active', x === b); });
  };
});
$('#saveControls').onclick = async function(){
  try {
    var data = await api('/api/settings', { method:'POST', body: JSON.stringify({
      blogCadence: state.settings.blogCadence, blogEnabled: state.settings.blogEnabled,
      topicFocus: $('#topicFocus').value, blogSystemPrompt: $('#blogSystemPrompt').value,
      instructions: $('#instructions').value }) });
    paintCaretaker(data); toast('Saved');
  } catch(e){ toast('Failed: ' + e.message); }
};
$('#resetDue').onclick = async function(){
  try {
    var data = await api('/api/settings', { method:'POST', body: JSON.stringify({
      blogCadence: state.settings.blogCadence, blogEnabled: state.settings.blogEnabled,
      topicFocus: $('#topicFocus').value, blogSystemPrompt: $('#blogSystemPrompt').value,
      instructions: $('#instructions').value, resetLastPublishedAt: true }) });
    paintCaretaker(data); toast('Next run is due');
  } catch(e){ toast('Failed: ' + e.message); }
};
/* ---------- boot ---------- */
function boot(){
  paintConn();
  if(getToken()){
    loadLeads();
    state.chats = []; state.transcriptCache = {};
    if(state.view === 'chats') loadChats();
  }
}
document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ closeDrawer(); document.body.classList.remove('nav-open'); $('#tokenModal').classList.remove('show'); } });
boot();
</script>
</body>
</html>`;
}
