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
      <img class="lila-avatar" src="${new URL('/assets/lila-avatar.png', document.baseURI).href}" alt="" width="38" height="38">
      <span>Chat with Lila</span>
    </button>
    <div class="lila-panel" id="lila-panel">
      <div class="lila-header">
        <img class="lila-avatar" src="${new URL('/assets/lila-avatar.png', document.baseURI).href}" alt="" width="42" height="42">
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
  const API = 'https://dolphin-systems-caretaker.ritikyadav.workers.dev';
  const EMOJI = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
  const LABEL = { like: 'Like', love: 'Love', haha: 'Haha', wow: 'Wow', sad: 'Sad', angry: 'Angry' };
  const ORDER = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
  const summary = panel.querySelector('#reactionSummary');
  const likeBtn = panel.querySelector('#likeBtn');
  const picker = panel.querySelector('#reactionPicker');
  const commentList = panel.querySelector('#commentList');
  const commentCount = panel.querySelector('#commentCount');
  const form = panel.querySelector('#commentForm');
  const formError = panel.querySelector('#commentError');

  const myKey = `dolphin-blog-reaction:${slug}`;
  let myReaction = null;
  try { myReaction = localStorage.getItem(myKey); } catch (e) { /* ignore */ }
  let counts = {};
  let comments = [];

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function totalReactions() {
    return ORDER.reduce((n, r) => n + (counts[r] || 0), 0);
  }

  function renderReactions() {
    const total = totalReactions();
    const top = ORDER.filter((r) => counts[r] > 0).slice(0, 3);
    summary.innerHTML = total
      ? `<span class="reaction-emojis">${top.map((r) => EMOJI[r]).join('')}</span><span>${total}</span>`
      : '<span class="reaction-none">Be the first to react.</span>';
    const emoji = panel.querySelector('.like-emoji');
    const label = panel.querySelector('.like-label');
    if (myReaction && EMOJI[myReaction]) {
      emoji.textContent = EMOJI[myReaction];
      label.textContent = LABEL[myReaction];
      likeBtn.classList.add('reacted');
    } else {
      emoji.textContent = EMOJI.like;
      label.textContent = 'Like';
      likeBtn.classList.remove('reacted');
    }
  }

  function renderComments() {
    commentCount.textContent = comments.length ? `(${comments.length})` : '';
    commentList.innerHTML = comments.length
      ? comments.map((c) => {
          const when = c.created_at ? new Date(c.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
          return `<div class="comment"><div class="comment-head"><b>${escHtml(c.name)}</b><time>${escHtml(when)}</time></div><p>${escHtml(c.body)}</p></div>`;
        }).join('')
      : '<p class="empty-comment">No comments yet. Start the conversation.</p>';
  }

  async function sendReaction(reaction) {
    if (myReaction === reaction) { closePicker(); return; }
    try {
      const res = await fetch(`${API}/api/blog/${encodeURIComponent(slug)}/reactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'failed');
      counts = data.reactions || {};
      myReaction = reaction;
      try { localStorage.setItem(myKey, reaction); } catch (e) { /* ignore */ }
      renderReactions();
    } catch (e) { /* silent: reactions are best-effort */ }
    closePicker();
  }

  function openPicker() {
    picker.hidden = false;
    likeBtn.setAttribute('aria-expanded', 'true');
  }
  function closePicker() {
    picker.hidden = true;
    likeBtn.setAttribute('aria-expanded', 'false');
  }

  // Desktop: hover opens the picker, like Facebook. Touch: long-press opens it.
  let pressTimer = null;
  likeBtn.addEventListener('click', () => {
    if (!picker.hidden) { closePicker(); return; }
    sendReaction('like');
  });
  likeBtn.addEventListener('mouseenter', openPicker);
  panel.querySelector('.reaction-picker-wrap').addEventListener('mouseleave', closePicker);
  likeBtn.addEventListener('touchstart', () => {
    pressTimer = setTimeout(openPicker, 450);
  }, { passive: true });
  likeBtn.addEventListener('touchend', () => clearTimeout(pressTimer));
  likeBtn.addEventListener('touchmove', () => clearTimeout(pressTimer));
  picker.querySelectorAll('[data-reaction]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      sendReaction(b.getAttribute('data-reaction'));
    });
  });
  document.addEventListener('click', (e) => {
    if (!panel.querySelector('.reaction-picker-wrap').contains(e.target)) closePicker();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;
    const name = panel.querySelector('#commentName').value.trim();
    const body = panel.querySelector('#commentBody').value.trim();
    if (!name || !body) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/api/blog/${encodeURIComponent(slug)}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, body }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error === 'slow_down' ? 'You are commenting too fast. Wait a bit and try again.' : 'Could not post your comment.');
      }
      comments.unshift(data.comment);
      panel.querySelector('#commentBody').value = '';
      renderComments();
    } catch (e) {
      formError.textContent = e.message;
      formError.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  (async () => {
    try {
      const res = await fetch(`${API}/api/blog/${encodeURIComponent(slug)}/engagement`);
      const data = await res.json();
      if (data.ok) {
        counts = data.reactions || {};
        comments = data.comments || [];
      }
    } catch (e) { /* offline: keep empty state */ }
    renderReactions();
    renderComments();
  })();
}

setupBlogEngagement();

function setupCatalogGrid() {
  const grid = document.getElementById('sampleGrid');
  if (!grid) return;
  const kind = grid.getAttribute('data-kind') || 'product';
  const API = 'https://dolphin-systems-caretaker.ritikyadav.workers.dev';
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function stars(avg) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="${i <= Math.round(avg) ? 'on' : ''}">★</span>`;
    return `<span class="card-stars">${s}</span>`;
  }
  fetch(`${API}/api/catalog?kind=${encodeURIComponent(kind)}`)
    .then((r) => r.json())
    .then((data) => {
      const items = (data && data.items) || [];
      if (!items.length) return;
      grid.innerHTML = items.map((it) => {
        const r = it.rating || { count: 0, average: 0 };
        const blurb = (it.body || '').length > 140 ? it.body.slice(0, 140).trimEnd() + '…' : (it.body || '');
        return `<a class="product-card" href="item.html?slug=${encodeURIComponent(it.slug)}">` +
          `<span class="product-icon" aria-hidden="true">${esc(it.icon || '◈')}</span>` +
          `<span class="kicker">${esc(it.kicker || '')}</span><h3>${esc(it.title)}</h3><p>${esc(blurb)}</p>` +
          `<div class="card-rating">${stars(r.average)}<span class="rating-text">${esc(String(r.average))} (${esc(String(r.count))})</span></div></a>`;
      }).join('');
    })
    .catch(() => { /* keep static fallback */ });
}

function setupCatalogItem() {
  const root = document.getElementById('catalogItem');
  if (!root) return;
  const slug = new URLSearchParams(window.location.search).get('slug');
  const API = 'https://dolphin-systems-caretaker.ritikyadav.workers.dev';
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  if (!slug) { root.innerHTML = '<p>Item not found.</p>'; return; }
  const ratedKey = `dolphin-catalog-rated:${slug}`;
  let myRating = 0;
  try { myRating = Number(localStorage.getItem(ratedKey) || 0); } catch (e) { /* ignore */ }

  function render(item) {
    const r = item.rating || { count: 0, average: 0 };
    const paras = String(item.body || '').split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p.trim())}</p>`).join('');
    root.innerHTML =
      `<span class="kicker">${esc(item.kicker || '')}</span><h1>${esc(item.title)}</h1>` +
      `<div class="rating-summary" aria-live="polite">${renderStars(r.average, true)}<span class="rating-text">${esc(String(r.average))} average · ${esc(String(r.count))} rating${r.count === 1 ? '' : 's'}</span></div>` +
      `<div class="body-copy">${paras}</div>` +
      `<div class="rate-box"><span class="rate-label">${myRating ? `You rated this ${myRating}/5` : 'Rate this:'}</span><div class="rate-stars" role="radiogroup" aria-label="Rate this item">${[1, 2, 3, 4, 5].map((n) =>
        `<button type="button" data-rate="${n}" role="radio" aria-checked="${myRating === n}" aria-label="${n} star${n === 1 ? '' : 's'}" ${myRating ? 'disabled' : ''}>★</button>`).join('')}</div></div>`;
    if (!myRating) {
      root.querySelectorAll('[data-rate]').forEach((b) => {
        b.addEventListener('click', async () => {
          const n = Number(b.getAttribute('data-rate'));
          b.disabled = true;
          try {
            const res = await fetch(`${API}/api/catalog/${encodeURIComponent(slug)}/ratings`, {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: n }),
            });
            const data = await res.json();
            if (data.ok) {
              myRating = n;
              try { localStorage.setItem(ratedKey, String(n)); } catch (e) { /* ignore */ }
              render({ ...item, rating: data.rating });
            } else { b.disabled = false; }
          } catch (e) { b.disabled = false; }
        });
      });
    }
  }
  function renderStars(avg, big) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="${i <= Math.round(avg) ? 'on' : ''}">★</span>`;
    return `<span class="item-stars">${s}</span>`;
  }
  fetch(`${API}/api/catalog/${encodeURIComponent(slug)}`)
    .then((r) => { if (!r.ok) throw new Error('nf'); return r.json(); })
    .then((data) => { document.title = `${data.item.title} — Dolphin Systems`; render(data.item); })
    .catch(() => { root.innerHTML = '<p>Could not load this item.</p>'; });
}

setupCatalogGrid();
setupCatalogItem();
