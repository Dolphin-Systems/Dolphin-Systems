const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.site-nav');

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.classList.toggle('is-open', open);
  });
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open menu');
      menu.classList.remove('is-open');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open menu');
      menu.classList.remove('is-open');
    }
  });
}

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const lilaReplies = [
  {
    match: ['price', 'cost', 'budget', 'quote', 'estimate'],
    text: 'A useful estimate depends on the workflow size and how many tools need to connect. If you share what is slow, manual, or breaking today, we can scope a practical first step.',
  },
  {
    match: ['automation', 'automate', 'workflow', 'process'],
    text: 'Dolphin Systems helps turn repeatable work into clear automated flows with triggers, rules, owners, and fallback paths. What process are you hoping to simplify?',
  },
  {
    match: ['integrate', 'integration', 'api', 'connect', 'tools'],
    text: 'Integrations are a strong fit for us. We focus on getting the right information between your existing tools without making the system fragile. Which tools are involved?',
  },
  {
    match: ['ai', 'agent', 'chatbot', 'deepseek', 'openai'],
    text: 'We can use AI when it has a clear job: drafting, routing, summarizing, checking, or helping a team move faster. The important part is keeping review and reliability in the system.',
  },
  {
    match: ['contact', 'call', 'meeting', 'email', 'talk'],
    text: 'Best next step: send a quick note to hello@dolphinsystems.com with the workflow or system you want to improve. A short description is enough to start.',
  },
  {
    match: ['client', 'customer', 'hire', 'work with', 'project'],
    text: 'We are looking for clients who have complex work that needs to become simpler: automation, integrations, dashboards, or system cleanup. Tell me what you want working better.',
  },
];

function getLilaReply(message) {
  const lower = message.toLowerCase();
  const found = lilaReplies.find((reply) => reply.match.some((word) => lower.includes(word)));
  if (found) return found.text;
  return 'I am Lila from Dolphin Systems. We help companies make complex systems easier to run through automation, integrations, and clearer workflows. What are you trying to improve?';
}

function typingDelay(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(5200, Math.max(1200, words * 230));
}

function createLilaChat() {
  if (document.querySelector('.lila-chat')) return;

  const widget = document.createElement('section');
  widget.className = 'lila-chat';
  widget.innerHTML = `
    <button class="lila-launcher" type="button" aria-expanded="false" aria-controls="lila-panel">
      <span class="lila-dot" aria-hidden="true"></span>
      <span>Chat with Lila</span>
    </button>
    <div class="lila-panel" id="lila-panel" hidden>
      <div class="lila-header">
        <div>
          <strong>Lila</strong>
          <span>Dolphin Systems</span>
        </div>
        <button class="lila-close" type="button" aria-label="Close chat">×</button>
      </div>
      <div class="lila-messages" aria-live="polite"></div>
      <form class="lila-form">
        <input class="lila-input" type="text" autocomplete="off" placeholder="Tell Lila what you need">
        <button type="submit">Send</button>
      </form>
    </div>
  `;

  document.body.appendChild(widget);

  const launcher = widget.querySelector('.lila-launcher');
  const panel = widget.querySelector('.lila-panel');
  const close = widget.querySelector('.lila-close');
  const messages = widget.querySelector('.lila-messages');
  const form = widget.querySelector('.lila-form');
  const input = widget.querySelector('.lila-input');

  function addMessage(text, sender) {
    const bubble = document.createElement('div');
    bubble.className = `lila-message lila-message-${sender}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function setTyping(active) {
    let typing = messages.querySelector('.lila-typing');
    if (active && !typing) {
      typing = document.createElement('div');
      typing.className = 'lila-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(typing);
    }
    if (!active && typing) typing.remove();
    messages.scrollTop = messages.scrollHeight;
  }

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    if (!messages.children.length) {
      addMessage('Hi, I am Lila. Dolphin Systems helps companies simplify complex work with automation, integrations, and better system design. What are you working on?', 'bot');
    }
    input.focus();
  }

  function closeChat() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
  }

  launcher.addEventListener('click', () => {
    if (panel.hidden) openChat();
    else closeChat();
  });
  close.addEventListener('click', closeChat);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    addMessage(value, 'user');
    const reply = getLilaReply(value);
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      addMessage(reply, 'bot');
    }, typingDelay(reply));
  });
}

createLilaChat();
