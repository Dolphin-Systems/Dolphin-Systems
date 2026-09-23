import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const email = 'hello@dolphinsystems.net';
const brandMark = 'assets/brand-mark.svg?v=20260923-ds-favicon';
const assetVersion = '20260923-human-chat';
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
  <link rel="stylesheet" href="${prefix}assets/site.css?v=${assetVersion}">
  <script src="${prefix}assets/site.js?v=${assetVersion}" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header" id="site-header">
    <div class="shell header-inner">
      <a class="brand" href="${prefix}index.html" aria-label="Dolphin Systems home">
        <span>Dolphin<span class="brand-light">Systems</span></span>
      </a>
      <button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open menu"><span></span><span></span></button>
      <nav class="site-nav" id="site-nav" aria-label="Main navigation">
        ${nav}
        <a class="nav-contact" href="${prefix}contact.html"${key === 'contact' ? ' aria-current="page"' : ''}>Let's talk <span aria-hidden="true">↗︎</span></a>
      </nav>
    </div>
  </header>
  <main id="main"${article ? ' class="article-main"' : ''}>${body}</main>
  <footer class="site-footer">
    <div class="shell footer-main">
      <div><a class="brand" href="${prefix}index.html"><span>Dolphin<span class="brand-light">Systems</span></span></a><p>Making complex systems easier to run.</p>${socialRow}</div>
      <div class="footer-links"><a href="${prefix}services.html">Services</a><a href="${prefix}products.html">Products</a><a href="${prefix}research.html">Research</a><a href="${prefix}about.html">About</a><a href="${prefix}blog/">Blog</a><a href="${prefix}contact.html">Contact</a></div>
      <div class="footer-contact"><span>Have a system in mind?</span><a href="#" data-email-link="${email.replace('@','|')}"><span data-email-show="${email.replace('@','|')}"></span> <span aria-hidden="true">↗︎</span></a><button class="chat-link" type="button" data-open-lila><img class="chat-icon" src="${prefix}assets/lila-avatar.png" alt="" aria-hidden="true"> Chat with Lila</button></div>
    </div>
    <div class="shell footer-bottom"><span>© <span data-year></span> Dolphin Systems</span><span>Built for clarity.</span></div>
  </footer>
</body>
</html>
`;
}

const arrow = '<span class="text-arrow" aria-hidden="true">↗︎</span>';
const socialRow = `<div class="social-row" aria-label="Dolphin Systems on social media"><a href="#" aria-label="Dolphin Systems on X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a><a href="#" aria-label="Dolphin Systems on YouTube"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a><a href="#" aria-label="Dolphin Systems on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a><a href="#" aria-label="Dolphin Systems on TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg></a></div>`;
const cta = `<section class="closing"><div class="shell closing-inner"><div><span class="kicker kicker-light">Start here</span><h2>Tell us what needs to work better.</h2></div><a class="button button-light" href="./contact.html">Start a conversation ${arrow}</a></div></section>`;

const pages = [
  {
    file: 'index.html', key: 'home', title: 'Home',
    description: 'Dolphin Systems designs automation, integrations, and connected systems that make complex work easier to run.',
    body: `<section class="hero shell">
      <div class="hero-copy"><span class="kicker"><span class="signal-dot"></span> Automation & system optimization</span><h1>Make the complex <em>work together.</em></h1><p>We connect tools, information, and people into systems that are easier to understand, operate, and improve.</p><div class="hero-actions"><a class="button button-dark" href="./services.html">Explore our work ${arrow}</a><a class="button button-quiet" href="./contact.html">Talk through a problem <span aria-hidden="true">→</span></a></div></div>
      <img class="system-board-img" src="./assets/system-diagram.svg" alt="Diagram: scattered tools — data, requests, decisions — move through one clear connected system — logic, visibility, control — so work moves with less friction and more focus" width="650" height="400" fetchpriority="high">
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
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Capabilities</span><h2>What we can build together.</h2></div></div><div class="detail-list"><article id="automation"><span class="detail-index">01 / AUTOMATION</span><div><h3>Automation</h3><p>Turn repeatable tasks into workflows with clear triggers, rules, exceptions, and owners. The goal is less manual effort without losing visibility into what happened.</p></div><span class="detail-mark" aria-hidden="true">↗︎</span></article><article id="integrations"><span class="detail-index">02 / INTEGRATIONS</span><div><h3>Integrations</h3><p>Connect the software you already depend on so information arrives where it is needed. We design for the awkward cases as well as the happy path.</p></div><span class="detail-mark" aria-hidden="true">↗︎</span></article><article id="architecture"><span class="detail-index">03 / SYSTEM DESIGN</span><div><h3>System architecture</h3><p>Map responsibilities, data, and decisions across a process. A clear model helps teams choose what to improve, replace, or keep.</p></div><span class="detail-mark" aria-hidden="true">↗︎</span></article><article id="optimization"><span class="detail-index">04 / OPTIMIZATION</span><div><h3>Optimization</h3><p>Find bottlenecks in systems that already exist. Improve speed, reliability, and the experience of the people who use them.</p></div><span class="detail-mark" aria-hidden="true">↗︎</span></article><article id="intelligent-workflows"><span class="detail-index">05 / INTELLIGENT WORKFLOWS</span><div><h3>Intelligent workflows</h3><p>Use AI where it helps with a specific task, while keeping human review and a dependable fallback where they matter.</p></div><span class="detail-mark" aria-hidden="true">↗︎</span></article></div></section>
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Sample cards</span><h2>Sample services.</h2></div><p class="section-aside">Example engagements, to show what working together could look like.</p></div><div class="product-grid" id="sampleGrid" data-kind="service"><a class="product-card" href="item.html?slug=workflow-mapping"><span class="product-icon" aria-hidden="true">✎</span><span class="kicker">SAMPLE 01</span><h3>Workflow mapping</h3><p>A sample engagement where we document how work actually moves through your team, then mark exactly what to automate.</p></a><a class="product-card" href="item.html?slug=systems-integration"><span class="product-icon" aria-hidden="true">🔗</span><span class="kicker">SAMPLE 02</span><h3>Systems integration</h3><p>A sample engagement where we connect the tools you already use, so information arrives where it is needed.</p></a><a class="product-card" href="item.html?slug=automation-build"><span class="product-icon" aria-hidden="true">⚙</span><span class="kicker">SAMPLE 03</span><h3>Automation build</h3><p>A sample engagement where we design, build, and test the workflow with your team, then hand over the keys.</p></a></div></section><section class="soft-section"><div class="shell split-section"><div><span class="kicker">The working method</span><h2>Understand first. Build with purpose.</h2></div><div class="steps"><div><b>01</b><p>Map the current workflow and the outcome you need.</p></div><div><b>02</b><p>Choose the smallest change that solves the real problem.</p></div><div><b>03</b><p>Build, test, and make the system understandable to its owners.</p></div><div><b>04</b><p>Measure what changed and keep improving it.</p></div></div></div></section>${cta}`,
  },
  {
    file: 'products.html', key: 'products', title: 'Products',
    description: 'Explore the product areas Dolphin Systems is developing around workflows, visibility, and connected operations.',
    body: `<section class="page-hero shell"><span class="kicker">Products</span><h1>Useful tools begin with <em>a recurring problem.</em></h1><p>Some challenges call for a tailored system. Others point to a tool many teams could use. This is where our product thinking lives.</p></section>
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Product directions</span><h2>Where we are focusing.</h2></div><p class="section-aside">These are areas of work, not a catalog of released products.</p></div><div class="product-grid"><article class="product-card"><span class="product-icon" aria-hidden="true">↗︎</span><span class="kicker">01 / FLOW</span><h3>Workflow tools</h3><p>Clear steps, handoffs, and approvals for work that currently gets lost between people and platforms.</p></article><article class="product-card"><span class="product-icon" aria-hidden="true">◫</span><span class="kicker">02 / VIEW</span><h3>Operational views</h3><p>A useful picture of what is moving, what is stuck, and what needs attention.</p></article><article class="product-card"><span class="product-icon" aria-hidden="true">⌁</span><span class="kicker">03 / CONNECT</span><h3>Connection layers</h3><p>Small, dependable bridges between systems that were not designed to work together.</p></article></div></section>
    <section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Sample cards</span><h2>Sample products.</h2></div><p class="section-aside">Example offerings, to show what a finished product could look like.</p></div><div class="product-grid" id="sampleGrid" data-kind="product"><a class="product-card" href="item.html?slug=flowtrack"><span class="product-icon" aria-hidden="true">◉</span><span class="kicker">SAMPLE 01</span><h3>FlowTrack</h3><p>A sample operations dashboard that follows every task from request to done, so nothing gets lost between people.</p></a><a class="product-card" href="item.html?slug=syncbridge"><span class="product-icon" aria-hidden="true">⇄</span><span class="kicker">SAMPLE 02</span><h3>SyncBridge</h3><p>A sample integration layer that moves data between your CRM, inbox, and spreadsheets without manual copying.</p></a><a class="product-card" href="item.html?slug=pulsereport"><span class="product-icon" aria-hidden="true">◈</span><span class="kicker">SAMPLE 03</span><h3>PulseReport</h3><p>A sample weekly summary of what moved, what got stuck, and what needs attention, in one clear page.</p></a></div></section><section class="soft-section"><div class="shell split-section"><div><span class="kicker">Our product filter</span><h2>Build what holds up in daily use.</h2></div><div class="body-copy"><p>A product should make a repeated task easier to perform and easier to understand. We pay attention to setup, exceptions, ownership, and what happens when something fails.</p><p>When a product is ready for public use, this page will include its name, purpose, and a direct way to try it.</p><a class="inline-link" href="./contact.html">Discuss a product need ${arrow}</a></div></div></section>${cta}`,
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
    body: `<section class="page-hero shell contact-hero"><span class="kicker">Contact</span><h1>What needs to <em>work better?</em></h1><p>Tell us about the process, tool, or handoff that is slowing you down. A short description is enough to start.</p><div class="contact-panel"><div><span class="kicker">Email us</span><a href="#" data-email-link="${email.replace('@','|')}" data-email-subject="Dolphin%20Systems%20inquiry"><span data-email-show="${email.replace('@','|')}"></span> ${arrow}</a><button class="chat-link chat-link-contact" type="button" data-open-lila><img class="chat-icon" src="./assets/lila-avatar.png" alt="" aria-hidden="true"> Chat with Lila</button></div><p>Helpful context: what happens today, where it gets stuck, and what a better outcome would look like.</p></div></section>
    <section class="soft-section"><div class="shell split-section"><div><span class="kicker">Before we build</span><h2>Start with the problem.</h2></div><div class="steps"><div><b>01</b><p>What work is repeated, delayed, or hard to track?</p></div><div><b>02</b><p>Which tools and people are involved today?</p></div><div><b>03</b><p>What would change if the system worked well?</p></div></div></div></section>`,
  },
  {
    file: 'products/item.html', key: 'products', prefix: '../', title: 'Product details',
    description: 'Details and ratings for a Dolphin Systems product.',
    body: `<section class="page-hero shell"><a class="inline-link" href="../products.html">← All products</a></section>` +
    `<section class="section shell"><div class="catalog-item" id="catalogItem" data-kind="product"><p>Loading…</p></div></section>`,
  },
  {
    file: 'services/item.html', key: 'services', prefix: '../', title: 'Service details',
    description: 'Details and ratings for a Dolphin Systems service.',
    body: `<section class="page-hero shell"><a class="inline-link" href="../services.html">← All services</a></section>` +
    `<section class="section shell"><div class="catalog-item" id="catalogItem" data-kind="service"><p>Loading…</p></div></section>`,
  },
];

function renderBlock(block) {
  if (!block || typeof block !== 'object') throw new Error('Every post block must be an object.');
  if (block.type === 'paragraph') return `<p>${escapeHtml(block.text ?? '')}</p>`;
  if (block.type === 'heading') return `<h2>${escapeHtml(block.text ?? '')}</h2>`;
  if (block.type === 'list' && Array.isArray(block.items)) return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  throw new Error(`Unsupported post block type: ${block.type}`);
}

function hashValue(value) {
  return [...String(value)].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 9973, 7);
}

function blogThumb(post) {
  const hash = hashValue(post.slug);
  const hueA = 205 + (hash % 44);
  const hueB = 175 + (hash % 70);
  const angle = 110 + (hash % 90);
  return `<div class="blog-thumb" style="--thumb-a:${hueA};--thumb-b:${hueB};--thumb-angle:${angle}deg" aria-hidden="true"><span></span><i></i><b></b></div>`;
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
  await mkdir(join(root, 'blog'), { recursive: true });
  await mkdir(join(root, 'products'), { recursive: true });
  await mkdir(join(root, 'services'), { recursive: true });
  for (const page of pages) await writeFile(join(root, page.file), layout(page), 'utf8');
  const posts = await loadPosts();
  const cards = posts.length ? posts.map((post) => `<a class="post-card" href="./${escapeHtml(post.slug)}.html">${blogThumb(post)}<div><span class="kicker">${escapeHtml(post.category || 'Notes')}</span><time datetime="${post.date}">${escapeHtml(post.date)}</time></div><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><span class="inline-link">Read article ${arrow}</span></a>`).join('') : `<div class="empty-state"><span class="signal-dot"></span><h2>First notes are on the way.</h2><p>We will publish practical thinking about automation, connected systems, and the work behind them.</p></div>`;
  const blogBody = `<section class="page-hero shell"><span class="kicker">Blog</span><h1>Notes from <em>the work.</em></h1><p>Ideas, observations, and practical lessons about making systems easier to run.</p></section><section class="section shell section-tight"><div class="section-heading"><div><span class="kicker">Latest writing</span><h2>${posts.length ? 'From the blog.' : 'A place for useful ideas.'}</h2></div></div><div class="posts-grid">${cards}</div></section><section class="soft-section"><div class="shell split-section"><div><span class="kicker">Keep in touch</span><h2>Have a question worth exploring?</h2></div><div class="body-copy"><p>We are interested in the problems behind the tools. Tell us what you are trying to make work better.</p><a class="inline-link" href="../contact.html">Start a conversation ${arrow}</a></div></div></section>`;
  await writeFile(join(root, 'blog', 'index.html'), layout({ title: 'Blog', description: 'Practical notes from Dolphin Systems about automation, integrations, and connected work.', key: 'blog', body: blogBody, prefix: '../' }), 'utf8');
  for (const post of posts) {
    const body = `<article class="shell article" data-post-slug="${escapeHtml(post.slug)}"><a class="back-link" href="./">← All articles</a><div class="article-heading">${blogThumb(post)}<span class="kicker">${escapeHtml(post.category || 'Notes')}</span><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.description)}</p><time datetime="${post.date}">${escapeHtml(post.date)}</time></div><div class="article-content">${post.body.map(renderBlock).join('')}</div><section class="blog-engage" aria-label="Reactions and comments"><div class="engage-reactions"><div class="reaction-summary" id="reactionSummary" aria-live="polite"></div><div class="reaction-pick"><div class="reaction-picker-wrap"><button type="button" class="like-btn" id="likeBtn" aria-haspopup="true" aria-expanded="false"><span class="like-emoji">👍</span> <span class="like-label">Like</span></button><div class="reaction-picker" id="reactionPicker" role="menu" hidden><button type="button" data-reaction="like" data-label="Like" aria-label="Like">👍</button><button type="button" data-reaction="love" data-label="Love" aria-label="Love">❤️</button><button type="button" data-reaction="haha" data-label="Haha" aria-label="Haha">😂</button><button type="button" data-reaction="wow" data-label="Wow" aria-label="Wow">😮</button><button type="button" data-reaction="sad" data-label="Sad" aria-label="Sad">😢</button><button type="button" data-reaction="angry" data-label="Angry" aria-label="Angry">😡</button></div></div></div></div><div class="engage-comments"><h2>Comments <span class="comment-count" id="commentCount"></span></h2><div class="comment-list" id="commentList"><p class="empty-comment">Loading comments…</p></div><form class="comment-form" id="commentForm"><input type="text" id="commentName" maxlength="40" placeholder="Your name" autocomplete="name" required><textarea id="commentBody" maxlength="1000" placeholder="Write a comment…" required></textarea><button type="submit">Post comment</button><p class="form-error" id="commentError" hidden></p></form></div></section><div class="article-end"><a class="inline-link" href="./">More from the blog ${arrow}</a></div></article>`;
    await writeFile(join(root, 'blog', `${post.slug}.html`), layout({ title: post.title, description: post.description, key: 'blog', body, prefix: '../', article: true }), 'utf8');
  }
  console.log(`Built ${pages.length + 1 + posts.length} pages (${posts.length} blog posts).`);
}

await build();
