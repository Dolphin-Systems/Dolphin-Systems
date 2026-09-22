import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const email = 'hello@dolphinsystems.com';
const brandMark = 'assets/brand-mark.svg?v=20260922-blended';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const navigation = [
  ['Services', 'services.html'],
  ['Products', 'products.html'],
  ['Research', 'research.html'],
  ['About', 'about.html'],
  ['Blog', 'blog/'],
];

function layout({ title, description, key, body, prefix = './', article = false }) {
  const nav = navigation.map(([label, href]) =>
    `<a href="${prefix}${href}"${key === label.toLowerCase() ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('');
  const pageTitle = title === 'Home' ? 'Dolphin Systems — Make the complex work together' : `${title} — Dolphin Systems`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#f7f9fd">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="icon" type="image/svg+xml" href="${prefix}${brandMark}">
  <link rel="stylesheet" href="${prefix}assets/site.css">
  <script src="${prefix}assets/site.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header" id="site-header">
    <div class="shell header-inner">
      <a class="brand" href="${prefix}index.html" aria-label="Dolphin Systems home">
        <img class="brand-mark" src="${prefix}${brandMark}" alt="" width="38" height="38">
        <span>Dolphin<span class="brand-light">Systems</span></span>
      </a>
      <button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open menu"><span></span><span></span></button>
      <nav class="site-nav" id="site-nav" aria-label="Main navigation">
        ${nav}
        <a class="nav-contact" href="${prefix}contact.html"${key === 'contact' ? ' aria-current="page"' : ''}>Let's talk <span aria-hidden="true">↗</span></a>
      </nav>
    </div>
  </header>
  <main id="main"${article ? ' class="article-main"' : ''}>${body}</main>
  <footer class="site-footer">
    <div class="shell footer-main">
      <div><a class="brand" href="${prefix}index.html"><img class="brand-mark" src="${prefix}${brandMark}" alt="" width="38" height="38"><span>Dolphin<span class="brand-light">Systems</span></span></a><p>Making complex systems easier to run.</p></div>
      <div class="footer-links"><a href="${prefix}services.html">Services</a><a href="${prefix}products.html">Products</a><a href="${prefix}research.html">Research</a><a href="${prefix}about.html">About</a><a href="${prefix}blog/">Blog</a><a href="${prefix}contact.html">Contact</a></div>
      <div class="footer-contact"><span>Have a system in mind?</span><a href="mailto:${email}">${email} <span aria-hidden="true">↗</span></a></div>
    </div>
    <div class="shell footer-bottom"><span>© <span data-year></span> Dolphin Systems</span><span>Built for clarity.</span></div>
  </footer>
${key === 'contact' ? `  <script>
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    (function () {
      const chat = document.createElement('script');
      chat.async = true;
      chat.src = 'https://embed.tawk.to/69f65d91b4a1331c31f071f2/1k32og3ur';
      chat.charset = 'UTF-8';
      chat.setAttribute('crossorigin', '*');
      document.head.appendChild(chat);
    })();
  </script>` : ''}
</body>
</html>
`;
}

const arrow = '<span class="text-arrow" aria-hidden="true">↗</span>';
const cta = `<section class="closing"><div class="shell closing-inner"><div><span class="kicker kicker-light">Start here</span><h2>Tell us what needs to work better.</h2></div><a class="button button-light" href="./contact.html">Start a conversation ${arrow}</a></div></section>`;

const pages = [
  {
    file: 'index.html', key: 'home', title: 'Home',
    description: 'Dolphin Systems designs automation, integrations, and connected systems that make complex work easier to run.',
    body: `<section class="hero shell">
      <div class="hero-copy"><span class="kicker"><span class="signal-dot"></span> Automation & system optimization</span><h1>Make the complex <em>work together.</em></h1><p>We connect tools, information, and people into systems that are easier to understand, operate, and improve.</p><div class="hero-actions"><a class="button button-dark" href="./services.html">Explore our work ${arrow}</a><a class="button button-quiet" href="./contact.html">Talk through a problem <span aria-hidden="true">→</span></a></div></div>
      <div class="system-board" aria-label="Diagram: inputs move through a connected system to a clear outcome" role="img"><div class="board-top"><span>THE SYSTEM / 01</span><span class="board-status"><i></i> Connected</span></div><div class="flow"><div class="flow-node"><small>01 / INPUT</small><strong>Scattered tools</strong><span>Data · requests · decisions</span></div><div class="flow-line"><i></i><i></i><i></i></div><div class="flow-node flow-node-center"><small>02 / SYSTEM</small><strong>One clear flow</strong><span>Logic · visibility · control</span></div><div class="flow-line"><i></i><i></i><i></i></div><div class="flow-node"><small>03 / OUTCOME</small><strong>Work moves</strong><span>Less friction · more focus</span></div></div><div class="board-bottom"><span>Designed around the way you work.</span><span>DS—01</span></div></div>
    </section>
    <section class="statement"><div class="shell statement-grid"><span class="kicker">The idea</span><p>Good systems make the next step obvious. We find the gaps between your tools and processes, then build a better way for work to move.</p></div></section>
    <section class="section shell"><div class="section-heading"><div><span class="kicker">What we do</span><h2>Practical systems for real work.</h2></div><a class="inline-link" href="./services.html">All services ${arrow}</a></div><div class="service-preview"><a href="./services.html#automation"><span class="service-num">01</span><h3>Automation</h3><p>Give repeatable work a dependable path from trigger to result.</p>${arrow}</a><a href="./services.html#integrations"><span class="service-num">02</span><h3>Integrations</h3><p>Move information between the tools your team already uses.</p>${arrow}</a><a href="./services.html#architecture"><span class="service-num">03</span><h3>System design</h3><p>Make the whole workflow visible before adding another tool.</p>${arrow}</a></div></section>
    <section class="feature-band"><div class="shell feature-grid"><div><span class="kicker kicker-light">How we think</span><h2>See the whole system. Fix the right part.</h2><p>A useful solution begins with the actual handoffs, decisions, and constraints. That is where we start.</p><a class="button button-outline-light" href="./about.html">Our approach ${arrow}</a></div><div class="feature-diagram" aria-hidden="true"><div class="diagram-line"><span>Understand</span><b>01</b></div><div class="diagram-line"><span>Design</span><b>02</b></div><div class="diagram-line"><span>Build</span><b>03</b></div><div class="diagram-line"><span>Improve</span><b>04</b></div></div></div></section>
    <section class="section shell"><div class="section-heading"><div><span class="kicker">Explore</span><h2>More ways to move forward.</h2></div></div><div class="explore-grid"><a class="explore-card" href="./products.html"><span class="kicker">Products</span><h3>Tools shaped by recurring problems.</h3><p>Where reusable software can make work simpler.</p>${arrow}</a><a class="explore-card" href="./research.html"><span class="kicker">Research</span><h3>Questions behind better systems.</h3><p>What we are examining as technology and work change.</p>${arrow}</a><a class="explore-card" href="./blog/"><span class="kicker">Blog</span><h3>Notes from the work.</h3><p>Ideas and practical lessons as they are published.</p>${arrow}</a></div></section>${cta}`,
  },
  {
    file: 'services.html', key: 'services', title: 'Services',
    description: 'Explore Dolphin Systems services in automation, integrations, system architecture, and ongoing optimization.',
    body: `<section class="page-hero shell"><span class="kicker">Services</span><h1>Better work starts with <em>a better system.</em></h1><p>We look at the full path a task takes, from the first request to the final result. Then we design the pieces that make that path clearer and more reliable.</p></section>
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Capabilities</span><h2>What we can build together.</h2></div></div><div class="detail-list"><article id="automation"><span class="detail-index">01 / AUTOMATION</span><div><h3>Automation</h3><p>Turn repeatable tasks into workflows with clear triggers, rules, exceptions, and owners. The goal is less manual effort without losing visibility into what happened.</p></div><span class="detail-mark" aria-hidden="true">↗</span></article><article id="integrations"><span class="detail-index">02 / INTEGRATIONS</span><div><h3>Integrations</h3><p>Connect the software you already depend on so information arrives where it is needed. We design for the awkward cases as well as the happy path.</p></div><span class="detail-mark" aria-hidden="true">↗</span></article><article id="architecture"><span class="detail-index">03 / SYSTEM DESIGN</span><div><h3>System architecture</h3><p>Map responsibilities, data, and decisions across a process. A clear model helps teams choose what to improve, replace, or keep.</p></div><span class="detail-mark" aria-hidden="true">↗</span></article><article id="optimization"><span class="detail-index">04 / OPTIMIZATION</span><div><h3>Optimization</h3><p>Find bottlenecks in systems that already exist. Improve speed, reliability, and the experience of the people who use them.</p></div><span class="detail-mark" aria-hidden="true">↗</span></article><article id="intelligent-workflows"><span class="detail-index">05 / INTELLIGENT WORKFLOWS</span><div><h3>Intelligent workflows</h3><p>Use AI where it helps with a specific task, while keeping human review and a dependable fallback where they matter.</p></div><span class="detail-mark" aria-hidden="true">↗</span></article></div></section>
    <section class="soft-section"><div class="shell split-section"><div><span class="kicker">The working method</span><h2>Understand first. Build with purpose.</h2></div><div class="steps"><div><b>01</b><p>Map the current workflow and the outcome you need.</p></div><div><b>02</b><p>Choose the smallest change that solves the real problem.</p></div><div><b>03</b><p>Build, test, and make the system understandable to its owners.</p></div><div><b>04</b><p>Measure what changed and keep improving it.</p></div></div></div></section>${cta}`,
  },
  {
    file: 'products.html', key: 'products', title: 'Products',
    description: 'Explore the product areas Dolphin Systems is developing around workflows, visibility, and connected operations.',
    body: `<section class="page-hero shell"><span class="kicker">Products</span><h1>Useful tools begin with <em>a recurring problem.</em></h1><p>Some challenges call for a tailored system. Others point to a tool many teams could use. This is where our product thinking lives.</p></section>
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Product directions</span><h2>Where we are focusing.</h2></div><p class="section-aside">These are areas of work, not a catalog of released products.</p></div><div class="product-grid"><article class="product-card"><span class="product-icon" aria-hidden="true">↗</span><span class="kicker">01 / FLOW</span><h3>Workflow tools</h3><p>Clear steps, handoffs, and approvals for work that currently gets lost between people and platforms.</p></article><article class="product-card"><span class="product-icon" aria-hidden="true">◫</span><span class="kicker">02 / VIEW</span><h3>Operational views</h3><p>A useful picture of what is moving, what is stuck, and what needs attention.</p></article><article class="product-card"><span class="product-icon" aria-hidden="true">⌁</span><span class="kicker">03 / CONNECT</span><h3>Connection layers</h3><p>Small, dependable bridges between systems that were not designed to work together.</p></article></div></section>
    <section class="soft-section"><div class="shell split-section"><div><span class="kicker">Our product filter</span><h2>Build what holds up in daily use.</h2></div><div class="body-copy"><p>A product should make a repeated task easier to perform and easier to understand. We pay attention to setup, exceptions, ownership, and what happens when something fails.</p><p>When a product is ready for public use, this page will include its name, purpose, and a direct way to try it.</p><a class="inline-link" href="./contact.html">Discuss a product need ${arrow}</a></div></div></section>${cta}`,
  },
  {
    file: 'research.html', key: 'research', title: 'Research',
    description: 'Dolphin Systems research interests: reliable automation, human oversight, and interoperable systems.',
    body: `<section class="page-hero shell"><span class="kicker">Research</span><h1>Ask better questions. <em>Build better systems.</em></h1><p>Our research interests come from the practical problems behind automation: how systems connect, how people stay in control, and how a workflow stays dependable when conditions change.</p></section>
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Focus areas</span><h2>What we are examining.</h2></div><p class="section-aside">Focus areas are questions we are exploring, not published findings.</p></div><div class="research-list"><article><span>01</span><div><h3>Reliable automation</h3><p>How do we make an automated process observable, recoverable, and clear about its limits?</p></div></article><article><span>02</span><div><h3>Human oversight</h3><p>Where should a person review, approve, or override a system's decision?</p></div></article><article><span>03</span><div><h3>Systems that connect</h3><p>How can tools exchange the right information without creating a fragile chain of dependencies?</p></div></article></div></section>
    <section class="soft-section"><div class="shell split-section"><div><span class="kicker">Reference points</span><h2>Useful work to learn from.</h2></div><div class="body-copy"><p>We draw on open technical guidance as we think through these questions. These external references are starting points, not Dolphin Systems research publications.</p><div class="resource-links"><a href="https://www.nist.gov/itl/ai-risk-management-framework" target="_blank" rel="noopener noreferrer"><span>NIST / AI Risk Management Framework</span>${arrow}</a><a href="https://www.w3.org/standards/" target="_blank" rel="noopener noreferrer"><span>W3C / Web standards</span>${arrow}</a></div><p>When we publish our own notes or experiments, they will appear in the <a class="body-link" href="./blog/">blog</a>.</p></div></div></section>${cta}`,
  },
  {
    file: 'about.html', key: 'about', title: 'About',
    description: 'Learn how Dolphin Systems approaches automation and system optimization: understand the work, design clearly, and improve what matters.',
    body: `<section class="page-hero shell"><span class="kicker">About Dolphin Systems</span><h1>Clarity before <em>complexity.</em></h1><p>Dolphin Systems focuses on automation and system optimization. We help make the connections between tools, processes, and people easier to see—and easier to improve.</p></section>
    <section class="statement"><div class="shell statement-grid"><span class="kicker">Our point of view</span><p>A system is only useful when the people who rely on it can understand what it does, trust what it produces, and change it when their work changes.</p></div></section>
    <section class="section shell"><div class="section-heading"><div><span class="kicker">Principles</span><h2>How we approach the work.</h2></div></div><div class="principle-grid"><article><span>01</span><h3>Look at the full path</h3><p>A slow handoff may be the real problem, even when the request sounds like a need for new software.</p></article><article><span>02</span><h3>Make decisions visible</h3><p>Clear rules, owners, and exceptions help a system stay useful after launch.</p></article><article><span>03</span><h3>Keep improving</h3><p>Work changes. A good system should make it possible to learn from use and adjust.</p></article></div></section>
    <section class="soft-section"><div class="shell split-section"><div><span class="kicker">What that means</span><h2>Technology in service of the work.</h2></div><div class="body-copy"><p>We do not begin with a tool list. We begin with the outcome, the people involved, and the constraints that matter. From there, we can decide where automation helps, where a connection is missing, and where the simplest fix is a better process.</p><a class="inline-link" href="./services.html">See our services ${arrow}</a></div></div></section>${cta}`,
  },
  {
    file: 'contact.html', key: 'contact', title: 'Contact',
    description: 'Contact Dolphin Systems about automation, integrations, and system optimization.',
    body: `<section class="page-hero shell contact-hero"><span class="kicker">Contact</span><h1>What needs to <em>work better?</em></h1><p>Tell us about the process, tool, or handoff that is slowing you down. A short description is enough to start.</p><div class="contact-panel"><div><span class="kicker">Email us</span><a href="mailto:${email}?subject=Dolphin%20Systems%20inquiry">${email} ${arrow}</a></div><p>Helpful context: what happens today, where it gets stuck, and what a better outcome would look like.</p></div></section>
    <section class="soft-section"><div class="shell split-section"><div><span class="kicker">Before we build</span><h2>Start with the problem.</h2></div><div class="steps"><div><b>01</b><p>What work is repeated, delayed, or hard to track?</p></div><div><b>02</b><p>Which tools and people are involved today?</p></div><div><b>03</b><p>What would change if the system worked well?</p></div></div></div></section>`,
  },
];

function renderBlock(block) {
  if (!block || typeof block !== 'object') throw new Error('Every post block must be an object.');
  if (block.type === 'paragraph') return `<p>${escapeHtml(block.text ?? '')}</p>`;
  if (block.type === 'heading') return `<h2>${escapeHtml(block.text ?? '')}</h2>`;
  if (block.type === 'list' && Array.isArray(block.items)) return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  throw new Error(`Unsupported post block type: ${block.type}`);
}

async function loadPosts() {
  const directory = join(root, 'content', 'posts');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  const posts = [];
  for (const name of names) {
    const post = JSON.parse(await readFile(join(directory, name), 'utf8'));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || `${post.slug}.json` !== name) throw new Error(`Invalid post slug or filename: ${name}`);
    if (!post.title || !post.description || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) || !Array.isArray(post.body)) throw new Error(`Missing or invalid post fields: ${name}`);
    post.body.forEach(renderBlock);
    posts.push(post);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

async function build() {
  for (const page of pages) await writeFile(join(root, page.file), layout(page), 'utf8');
  const posts = await loadPosts();
  const cards = posts.length ? posts.map((post) => `<a class="post-card" href="./${escapeHtml(post.slug)}.html"><div><span class="kicker">${escapeHtml(post.category || 'Notes')}</span><time datetime="${post.date}">${escapeHtml(post.date)}</time></div><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><span class="inline-link">Read article ${arrow}</span></a>`).join('') : `<div class="empty-state"><span class="signal-dot"></span><h2>First notes are on the way.</h2><p>We will publish practical thinking about automation, connected systems, and the work behind them.</p></div>`;
  const blogBody = `<section class="page-hero shell"><span class="kicker">Blog</span><h1>Notes from <em>the work.</em></h1><p>Ideas, observations, and practical lessons about making systems easier to run.</p></section><section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Latest writing</span><h2>${posts.length ? 'From the blog.' : 'A place for useful ideas.'}</h2></div></div><div class="posts-grid">${cards}</div></section><section class="soft-section"><div class="shell split-section"><div><span class="kicker">Keep in touch</span><h2>Have a question worth exploring?</h2></div><div class="body-copy"><p>We are interested in the problems behind the tools. Tell us what you are trying to make work better.</p><a class="inline-link" href="../contact.html">Start a conversation ${arrow}</a></div></div></section>`;
  await mkdir(join(root, 'blog'), { recursive: true });
  await writeFile(join(root, 'blog', 'index.html'), layout({ title: 'Blog', description: 'Practical notes from Dolphin Systems about automation, integrations, and connected work.', key: 'blog', body: blogBody, prefix: '../' }), 'utf8');
  for (const post of posts) {
    const body = `<article class="shell article"><a class="back-link" href="./">← All articles</a><div class="article-heading"><span class="kicker">${escapeHtml(post.category || 'Notes')}</span><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.description)}</p><time datetime="${post.date}">${escapeHtml(post.date)}</time></div><div class="article-content">${post.body.map(renderBlock).join('')}</div><div class="article-end"><a class="inline-link" href="./">More from the blog ${arrow}</a></div></article>`;
    await writeFile(join(root, 'blog', `${post.slug}.html`), layout({ title: post.title, description: post.description, key: 'blog', body, prefix: '../', article: true }), 'utf8');
  }
  console.log(`Built ${pages.length + 1 + posts.length} pages (${posts.length} blog posts).`);
}

await build();
