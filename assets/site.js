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

const lowValuePatterns = [
  /^\s*(hi|hello|hey|yo|sup|ok|okay|thanks|thank you|lol|haha|test)\s*$/i,
  /^\s*.{1,2}\s*$/,
];

function createLeadState() {
  return {
    problem: '',
    tools: '',
    outcome: '',
    timeline: '',
    contactIntent: false,
    messages: 0,
  };
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function readMessage(message, state) {
  const lower = message.toLowerCase();
  state.messages += 1;
  if (includesAny(lower, ['email', 'call', 'meeting', 'contact', 'hire', 'quote', 'estimate', 'client', 'work with'])) state.contactIntent = true;
  if (includesAny(lower, ['zapier', 'hubspot', 'salesforce', 'notion', 'slack', 'airtable', 'google', 'sheet', 'sheets', 'excel', 'api', 'crm', 'website', 'shopify', 'stripe'])) state.tools = message;
  if (includesAny(lower, ['automate', 'manual', 'slow', 'stuck', 'handoff', 'workflow', 'process', 'integrat', 'dashboard', 'report', 'data', 'ai', 'agent'])) state.problem = message;
  if (includesAny(lower, ['want', 'need', 'goal', 'so that', 'reduce', 'save', 'faster', 'simple', 'simpler', 'visibility', 'track'])) state.outcome = message;
  if (includesAny(lower, ['today', 'week', 'month', 'asap', 'urgent', 'soon', 'quarter', 'deadline'])) state.timeline = message;
}

function nextQuestion(state) {
  if (!state.problem) return 'What work is painful right now: a manual task, disconnected tools, unclear reporting, or a process that keeps getting stuck?';
  if (!state.tools) return 'Which tools or systems are involved today? For example CRM, spreadsheets, email, Slack, Notion, website forms, APIs, or something custom.';
  if (!state.outcome) return 'What would a good outcome look like: less manual work, faster response time, cleaner data, better visibility, or a full workflow automation?';
  if (!state.timeline) return 'When would you want this improved: this week, this month, or just exploring options?';
  return '';
}

function summarizeLead(state) {
  return [
    'Here is the useful shape of the request:',
    state.problem ? `Problem: ${state.problem}` : '',
    state.tools ? `Tools: ${state.tools}` : '',
    state.outcome ? `Outcome: ${state.outcome}` : '',
    state.timeline ? `Timeline: ${state.timeline}` : '',
  ].filter(Boolean).join('\n');
}

function getLilaReply(message, state) {
  if (lowValuePatterns.some((pattern) => pattern.test(message))) {
    return 'Hi. I can help turn this into a clear client request. What workflow, tool, or handoff do you want Dolphin Systems to improve?';
  }
  readMessage(message, state);
  const question = nextQuestion(state);
  if (question) {
    const acknowledgement = state.problem
      ? 'Got it. That sounds like a systems/workflow problem Dolphin Systems can help clarify.'
      : 'I want to make this precise enough to be useful.';
    return `${acknowledgement}\n\n${question}`;
  }
  const summary = summarizeLead(state);
  return `${summary}\n\nThis is enough to start a useful conversation. Send this to hello@dolphinsystems.com, or tell me one more constraint I should add before you reach out.`;
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
      <span class="lila-avatar" aria-hidden="true">L</span>
      <span>Chat with Lila</span>
    </button>
    <div class="lila-panel" id="lila-panel">
      <div class="lila-header">
        <span class="lila-avatar" aria-hidden="true">L</span>
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
  const leadState = createLeadState();

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
    panel.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    if (!messages.children.length) {
      addMessage('Hi, I am Lila. I help shape a messy idea into a clear Dolphin Systems client request. What workflow, system, or tool problem are you trying to fix?', 'bot');
    }
    input.focus();
  }

  function closeChat() {
    panel.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
  }

  launcher.addEventListener('click', () => {
    if (!panel.classList.contains('is-open')) openChat();
    else closeChat();
  });
  close.addEventListener('click', closeChat);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeChat();
  });
  document.querySelectorAll('[data-open-lila]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openChat();
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    addMessage(value, 'user');
    const reply = getLilaReply(value, leadState);
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      addMessage(reply, 'bot');
    }, typingDelay(reply));
  });
}

createLilaChat();

function setupBlogEngagement() {
  const article = document.querySelector('[data-post-slug]');
  const panel = document.querySelector('.blog-engage');
  if (!article || !panel) return;

  const slug = article.getAttribute('data-post-slug');
  const key = `dolphin-blog-engage:${slug}`;
  const state = JSON.parse(localStorage.getItem(key) || '{"reactions":{},"comments":[]}');
  const commentList = panel.querySelector('.comment-list');

  function save() {
    localStorage.setItem(key, JSON.stringify(state));
  }

  function render() {
    panel.querySelectorAll('[data-reaction]').forEach((button) => {
      const reaction = button.getAttribute('data-reaction');
      button.querySelector('span').textContent = state.reactions[reaction] || 0;
    });
    commentList.innerHTML = state.comments.length
      ? state.comments.map((comment) => `<p>${comment}</p>`).join('')
      : '<p class="empty-comment">No local comments yet.</p>';
  }

  panel.querySelectorAll('[data-reaction]').forEach((button) => {
    button.addEventListener('click', () => {
      const reaction = button.getAttribute('data-reaction');
      state.reactions[reaction] = (state.reactions[reaction] || 0) + 1;
      save();
      render();
    });
  });

  panel.querySelector('.comment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const textarea = event.currentTarget.querySelector('textarea');
    const value = textarea.value.trim();
    if (!value) return;
    state.comments.unshift(value.replace(/[<>]/g, ''));
    state.comments = state.comments.slice(0, 8);
    textarea.value = '';
    save();
    render();
  });

  render();
}

setupBlogEngagement();
