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

const lilaApi = 'https://dolphin-systems-caretaker.ritikyadav.workers.dev/api/lila/message';

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
      <img class="lila-avatar" src="${new URL('assets/lila-avatar.png', document.baseURI).href}" alt="" width="38" height="38">
      <span>Chat with Lila</span>
    </button>
    <div class="lila-panel" id="lila-panel">
      <div class="lila-header">
        <img class="lila-avatar" src="${new URL('assets/lila-avatar.png', document.baseURI).href}" alt="" width="42" height="42">
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
  let conversationId = localStorage.getItem('lilaConversationId') || '';

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
      addMessage('Hi, I am Lila. What is your name, and what email or phone number should Dolphin Systems use if this looks like a fit?', 'bot');
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
    setTyping(true);
    fetch(lilaApi, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId, message: value }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.conversationId) {
          conversationId = data.conversationId;
          localStorage.setItem('lilaConversationId', conversationId);
        }
        const reply = data.reply || 'I had trouble reading that. Can you tell me the workflow, tools, and outcome you want?';
        window.setTimeout(() => {
          setTyping(false);
          addMessage(reply, 'bot');
        }, typingDelay(reply));
      })
      .catch(() => {
      setTyping(false);
        addMessage('I am having trouble reaching my backend. You can still email hello@dolphinsystems.com with your name, contact, workflow problem, tools, and desired outcome.', 'bot');
      });
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
