const API_BASE = (() => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  return 'https://rs-1234-fastapi-demo.hf.space';
})();

let cloudinaryConfig = null;
let currentUser = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let searchQuery = '';
let deletingPostId = null;
let editingPostId = null;
let pendingMediaFiles = [];
let editPendingMediaFiles = [];
const MAX_MEDIA = 5;
const votedPosts = new Set();
let activePage = 'feed';

const GRADIENT_COLORS = [
  ['#405de6', '#5851db', '#833ab4'],
  ['#e1306c', '#fd1d1d', '#f77737'],
  ['#4dc9f6', '#45b8d8', '#1877f2'],
  ['#fccc63', '#fbad50', '#e1306c'],
  ['#5b51d8', '#833ab4', '#c13584'],
  ['#00c6ff', '#0072ff', '#405de6'],
  ['#11998e', '#38ef7d', '#22c55e'],
  ['#ee9ca7', '#ffdde1', '#f093fb'],
];

function getToken() {
  return localStorage.getItem('picto_token');
}
function setToken(token) {
  localStorage.setItem('picto_token', token);
}
function clearToken() {
  localStorage.removeItem('picto_token');
}

async function api(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status === 401) { clearToken(); window.location.href = 'index.html'; throw new Error('Unauthorized'); }
  if (!res.ok) {
    const detail = data?.detail || data?.message || data || `Request failed (${res.status})`;
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return data;
}

function showError(el, msg) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function hideError(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}
function getInitials(email) {
  return email ? email.charAt(0).toUpperCase() : '?';
}
function getGradient(email) {
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) hash = ((hash << 5) - hash) + email.charCodeAt(i);
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}
function timeAgo(dateStr) {
  const now = Date.now();
  const diff = Math.floor((now - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}
function getMediaType(url) {
  if (!url) return null;
  const isVideo = /\/video\/upload\//.test(url) || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url);
  const isImage = /\/image\/upload\//.test(url) || /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(url);
  if (isVideo) return 'video';
  if (isImage) return 'image';
  return null;
}
function getContentParts(content) {
  if (!content) return { mediaUrls: [], caption: content || '' };
  const lines = content.split('\n');
  const blankIdx = lines.indexOf('');
  const urlLines = blankIdx >= 0 ? lines.slice(0, blankIdx) : [];
  const captionLines = blankIdx >= 0 ? lines.slice(blankIdx + 1) : lines;
  const mediaUrls = urlLines.filter(u => u.trim() && getMediaType(u.trim())).map(u => u.trim());
  if (mediaUrls.length === 0) return { mediaUrls: [], caption: content };
  return { mediaUrls, caption: captionLines.join('\n').trim() };
}

if (document.querySelector('.auth-page')) initAuth();
if (document.getElementById('feed')) initDashboard();

function initAuth() {
  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loginForm.classList.toggle('active', tab.dataset.tab === 'login');
      registerForm.classList.toggle('active', tab.dataset.tab === 'register');
      hideError('login-error'); hideError('register-error');
    });
  });
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('login-error');
    const btn = loginForm.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const fd = new URLSearchParams();
      fd.append('username', email);
      fd.append('password', password);
      const res = await fetch(`${API_BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      setToken(data.access_token);
      window.location.href = 'dashboard.html';
    } catch (err) { showError('login-error', err.message); }
    finally { btn.disabled = false; btn.textContent = 'Sign In'; }
  });
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('register-error');
    const pw = document.getElementById('register-password').value;
    if (pw !== document.getElementById('register-confirm').value) { showError('register-error', 'Passwords do not match'); return; }
    const email = document.getElementById('register-email').value.trim();
    const btn = registerForm.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing up...';
    try {
      await api('/users/', { method: 'POST', body: JSON.stringify({ email, password: pw }) });
      const fd = new URLSearchParams();
      fd.append('username', email); fd.append('password', pw);
      const res = await fetch(`${API_BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      setToken(data.access_token);
      window.location.href = 'dashboard.html';
    } catch (err) { showError('register-error', err.message); }
    finally { btn.disabled = false; btn.textContent = 'Sign Up'; }
  });
}

function initDashboard() {
  if (!getToken()) { window.location.href = 'index.html'; return; }
  fetchCurrentUser();
  document.getElementById('logout-btn').addEventListener('click', () => { clearToken(); window.location.href = 'index.html'; });
  document.getElementById('profile-back').addEventListener('click', showFeedSection);
  document.getElementById('profile-btn').addEventListener('click', () => { document.getElementById('dropdown-menu').classList.add('hidden'); openProfile(); });
  document.getElementById('avatar-btn').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-menu').classList.toggle('hidden'); });
  document.addEventListener('click', () => { document.getElementById('dropdown-menu').classList.add('hidden'); });
  document.getElementById('new-post-btn').addEventListener('click', () => { showFeedSection(); openCreateModal(); });
  document.getElementById('bottom-home').addEventListener('click', () => { showFeedSection(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.getElementById('bottom-search').addEventListener('click', () => {
    showFeedSection();
    document.getElementById('search-input').focus();
  });
  document.getElementById('bottom-create').addEventListener('click', () => { showFeedSection(); openCreateModal(); });
  document.getElementById('bottom-notif').addEventListener('click', () => openNotifications());
  document.getElementById('bottom-profile').addEventListener('click', () => openProfile());
  document.getElementById('header-notif-btn').addEventListener('click', () => openNotifications());
  document.getElementById('notif-close').addEventListener('click', closeNotifications);
  document.getElementById('notif-mark-all-read').addEventListener('click', markAllNotificationsRead);
  document.getElementById('notif-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeNotifications(); });
  document.getElementById('notif-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeNotifications(); });
  document.getElementById('create-modal-close').addEventListener('click', closeCreateModal);
  document.getElementById('create-modal-next').addEventListener('click', goToDetailsStep);
  document.getElementById('create-modal-share').addEventListener('click', handleCreateSubmit);
  document.getElementById('create-select-btn').addEventListener('click', () => {
    document.getElementById('media-input').value = '';
    document.getElementById('media-input').click();
  });
  document.getElementById('media-input').addEventListener('change', handleCreateMediaSelect);
  document.getElementById('create-change-btn').addEventListener('click', () => {
    document.getElementById('media-input').value = '';
    document.getElementById('media-input').click();
  });
  document.getElementById('edit-modal-back').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal-share').addEventListener('click', handleEditSubmit);
  document.getElementById('edit-change-btn').addEventListener('click', () => {
    document.getElementById('edit-media-input').value = '';
    document.getElementById('edit-media-input').click();
  });
  document.getElementById('edit-media-input').addEventListener('change', handleEditMediaSelect);
  document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('create-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCreateModal(); });
  document.getElementById('edit-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeEditModal(); });
  document.getElementById('delete-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDeleteModal(); });
  document.getElementById('comments-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCommentsModal(); });
  document.getElementById('comments-close').addEventListener('click', closeCommentsModal);
  document.getElementById('comments-post-btn').addEventListener('click', handleCommentSubmit);
  document.getElementById('comments-cancel-reply').addEventListener('click', cancelReply);
  document.getElementById('comments-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(); }
  });
  document.getElementById('comments-input').addEventListener('input', () => {
    const el = document.getElementById('comments-input');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  });
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = e.target.value; currentPage = 1; loadFeed(); }, 350);
  });
  loadFeed();
}

async function fetchCurrentUser() {
  try {
    const token = getToken();
    if (!token) return;
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.user_id) {
      currentUser = await api(`/users/${payload.user_id}`);
      const initial = getInitials(currentUser.email);
      document.getElementById('header-avatar').textContent = initial;
      document.getElementById('dropdown-user').textContent = currentUser.email;
      document.getElementById('create-user-avatar').textContent = initial;
      document.getElementById('create-username').textContent = currentUser.email.split('@')[0];
      document.getElementById('edit-user-avatar').textContent = initial;
      document.getElementById('edit-username').textContent = currentUser.email.split('@')[0];
      document.getElementById('bottom-avatar').textContent = initial;
    }
  } catch (e) { console.warn('fetchCurrentUser:', e); }
}

async function loadFeed() {
  const feed = document.getElementById('feed');
  const loading = document.getElementById('loading');
  const errorBanner = document.getElementById('error-banner');
  loading.style.display = ''; loading.classList.remove('hidden'); feed.innerHTML = ''; hideError(errorBanner);
  try {
    const skip = (currentPage - 1) * PAGE_SIZE;
    const [data, votedIds] = await Promise.all([
      api(`/posts/?limit=${PAGE_SIZE}&skip=${skip}&search=${encodeURIComponent(searchQuery)}`),
      api('/vote/my').catch(() => [])
    ]);
    votedPosts.clear();
    votedIds.forEach(id => votedPosts.add(id));
    loading.classList.add('hidden');
    if (!data || data.length === 0) { feed.innerHTML = '<div class="feed-end">No posts yet. Be the first to share!</div>'; return; }
    renderFeed(data);
  } catch (err) { loading.classList.add('hidden'); showError(errorBanner, err.message); }
}

function renderFeed(posts) {
  const feed = document.getElementById('feed');
  feed.innerHTML = '';
  posts.forEach((post) => {
    const p = post.Post || post;
    const voteCount = post.votes ?? 0;
    const ownerId = p.owner_id;
    const currentUserId = currentUser?.id;
    const isOwner = currentUserId && ownerId === currentUserId;
    const email = p.owner?.email || `user${ownerId}@picto`;
    const initial = getInitials(email);
    const gradient = getGradient(email);
    const gradientStr = `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`;
    const { mediaUrls, caption } = getContentParts(p.content || '');
    const captionText = caption || p.content;
    const username = email.split('@')[0];

    let mediaHtml;
    if (mediaUrls.length === 1) {
      const url = escHtml(mediaUrls[0]);
      const t = getMediaType(mediaUrls[0]);
      if (t === 'video') {
        mediaHtml = `<video class="post-display-video" src="${url}" controls preload="metadata"></video>`;
      } else {
        mediaHtml = `<img class="post-display-img" src="${url}" alt="${escHtml(p.title)}" loading="lazy">`;
      }
    } else if (mediaUrls.length > 1) {
      const carouselId = `carousel-${p.id}`;
      let slides = '';
      mediaUrls.forEach((u, idx) => {
        const eu = escHtml(u);
        const t = getMediaType(u);
        if (t === 'video') {
          slides += `<div class="carousel-slide"><video src="${eu}" controls preload="metadata"></video></div>`;
        } else {
          slides += `<div class="carousel-slide"><img src="${eu}" alt="${escHtml(p.title)}" loading="lazy"></div>`;
        }
      });
      let dots = '';
      mediaUrls.forEach((_, idx) => {
        dots += `<button class="carousel-dot${idx === 0 ? ' active' : ''}" data-idx="${idx}" aria-label="Go to slide ${idx + 1}"></button>`;
      });
      mediaHtml = `
        <div class="carousel" id="${carouselId}">
          <div class="carousel-track">${slides}</div>
          <button class="carousel-arrow carousel-arrow-left" aria-label="Previous"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
          <button class="carousel-arrow carousel-arrow-right" aria-label="Next"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
          <div class="carousel-dots">${dots}</div>
        </div>`;
    } else {
      mediaHtml = `<div class="post-display-img" style="background:${gradientStr};display:flex;align-items:center;justify-content:center;aspect-ratio:1;font-size:72px;font-weight:700;color:rgba(255,255,255,0.3)">${p.title.charAt(0).toUpperCase()}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'post-card';
    card.dataset.postId = p.id;

    const actionBarLiked = votedPosts.has(p.id) ? ' liked' : '';
    const heartSvgFill = votedPosts.has(p.id) ? 'fill="currentColor"' : 'fill="none"';

    card.innerHTML = `
      <div class="post-header">
        <div class="post-header-avatar" style="background:${gradientStr}">${initial}</div>
        <div class="post-header-info">
          <div class="post-username">${escHtml(username)}</div>
        </div>
        ${isOwner ? `<button class="post-options-btn" data-post-id="${p.id}"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>` : ''}
      </div>
      <div class="post-image-wrapper" data-post-id="${p.id}">
        ${mediaHtml}
        <div class="heart-overlay" id="heart-${p.id}">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
      </div>
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="action-btn like-btn${actionBarLiked}" data-post-id="${p.id}">
            <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" ${heartSvgFill} stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button class="action-btn comment-btn" data-post-id="${p.id}">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="action-btn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
        <button class="action-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="post-likes-row">${voteCount} ${voteCount === 1 ? 'like' : 'likes'}</div>
      <div class="post-caption-row"><span class="caption-username">${escHtml(username)}</span> ${escHtml(p.title)}${captionText ? ' — ' + escHtml(captionText) : ''}</div>
      <div class="post-comments-link" data-post-id="${p.id}">${p.comment_count > 0 ? `View all ${p.comment_count} comments` : 'Add a comment...'}</div>
      <div class="post-time">${timeAgo(p.created_at).toUpperCase()} AGO</div>
      ${isOwner ? `<div class="post-owner-badges"><button class="post-owner-badge edit-btn" data-post-id="${p.id}">Edit</button><button class="post-owner-badge danger delete-btn" data-post-id="${p.id}">Delete</button></div>` : ''}`;

    const imgWrapper = card.querySelector('.post-image-wrapper');
    let lastTap = 0;
    imgWrapper.addEventListener('click', (e) => {
      const now = Date.now();
      if (now - lastTap < 350) {
        handleVote(p.id, card);
        showHeartOverlay(p.id);
      }
      lastTap = now;
    });

    card.querySelector('.like-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      handleVote(p.id, card);
    });
    const optionsBtn = card.querySelector('.post-options-btn');
    if (optionsBtn) {
      optionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(p);
      });
    }
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => openEditModal(p));
    const delBtn = card.querySelector('.delete-btn');
    if (delBtn) delBtn.addEventListener('click', () => openDeleteModal(p.id));
    const commentBtns = card.querySelectorAll('.comment-btn, .post-comments-link');
    commentBtns.forEach(btn => btn.addEventListener('click', () => openCommentsModal(p.id)));
    const carousel = card.querySelector('.carousel');
    if (carousel) {
      const track = carousel.querySelector('.carousel-track');
      const dots = carousel.querySelectorAll('.carousel-dot');
      const leftBtn = carousel.querySelector('.carousel-arrow-left');
      const rightBtn = carousel.querySelector('.carousel-arrow-right');
      function updateCarousel() {
        const idx = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
        leftBtn.classList.toggle('hidden', idx === 0);
        rightBtn.classList.toggle('hidden', idx === dots.length - 1);
      }
      track.addEventListener('scroll', updateCarousel);
      leftBtn.addEventListener('click', (e) => { e.stopPropagation(); track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' }); });
      rightBtn.addEventListener('click', (e) => { e.stopPropagation(); track.scrollBy({ left: track.clientWidth, behavior: 'smooth' }); });
      dots.forEach(d => d.addEventListener('click', (e) => {
        e.stopPropagation();
        track.scrollTo({ left: parseInt(d.dataset.idx) * track.clientWidth, behavior: 'smooth' });
      }));
      updateCarousel();
    }
    feed.appendChild(card);
  });
  document.getElementById('feed-end').textContent = posts.length < PAGE_SIZE ? "You've reached the end" : '';
}

function showHeartOverlay(postId) {
  const overlay = document.getElementById(`heart-${postId}`);
  if (overlay) {
    overlay.classList.remove('visible');
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    setTimeout(() => overlay.classList.remove('visible'), 600);
  }
}

async function handleVote(postId, card) {
  const isVoted = votedPosts.has(postId);
  const dir = isVoted ? 0 : 1;
  const btn = card.querySelector('.like-btn');
  btn.disabled = true;
  try {
    await api('/vote/', { method: 'POST', body: JSON.stringify({ post_id: postId, dir }) });
    updateVoteState(postId, card, !isVoted);
  } catch (err) {
    if (dir === 1 && (err.status === 409 || err.message.toLowerCase().includes('already'))) {
      votedPosts.add(postId);
      try { await api('/vote/', { method: 'POST', body: JSON.stringify({ post_id: postId, dir: 0 }) }); updateVoteState(postId, card, false); } catch {}
    } else if (dir === 0 && (err.status === 404 || err.message.toLowerCase().includes('not found') || err.message.toLowerCase().includes('does not exist'))) {
      votedPosts.delete(postId);
      try { await api('/vote/', { method: 'POST', body: JSON.stringify({ post_id: postId, dir: 1 }) }); updateVoteState(postId, card, true); } catch {}
    } else { showError('error-banner', err.message); }
  } finally { btn.disabled = false; }
}

function updateVoteState(postId, card, liked) {
  const btn = card.querySelector('.like-btn');
  const countEl = card.querySelector('.post-likes-row');
  const current = parseInt(countEl.textContent) || 0;
  const svg = btn.querySelector('svg');
  if (liked) {
    votedPosts.add(postId);
    countEl.textContent = `${current + 1} ${current + 1 === 1 ? 'like' : 'likes'}`;
    btn.classList.add('liked');
    svg.setAttribute('fill', 'currentColor');
    showHeartOverlay(postId);
  } else {
    votedPosts.delete(postId);
    countEl.textContent = `${Math.max(0, current - 1)} ${current - 1 === 1 ? 'like' : 'likes'}`;
    btn.classList.remove('liked');
    svg.setAttribute('fill', 'none');
  }
}

function openCreateModal() {
  editingPostId = null;
  pendingMediaFiles = [];
  document.getElementById('create-caption').value = '';
  document.getElementById('create-error').classList.add('hidden');
  document.getElementById('create-step-select').classList.remove('hidden');
  document.getElementById('create-step-details').classList.add('hidden');
  document.getElementById('create-preview-grid').innerHTML = '';
  document.getElementById('create-preview-selected').innerHTML = '';
  document.getElementById('create-preview-selected').classList.add('hidden');
  document.getElementById('create-placeholder-icon').classList.remove('hidden');
  document.getElementById('create-placeholder-text').classList.remove('hidden');
  document.getElementById('create-modal-next').classList.remove('hidden');
  document.getElementById('create-modal-share').classList.add('hidden');
  document.getElementById('create-modal-next').disabled = true;
  document.getElementById('create-modal-title').textContent = 'New post';
  document.getElementById('media-input').value = '';
  document.getElementById('create-modal').classList.remove('hidden');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.add('hidden');
  pendingMediaFiles.forEach(item => { if (item.file) URL.revokeObjectURL(item.preview); });
  pendingMediaFiles = [];
}

function showFeedSection() {
  document.getElementById('feed-page').classList.remove('hidden');
  document.getElementById('profile-page').classList.add('hidden');
  activePage = 'feed';
}

function openEditModal(post) {
  editingPostId = post.id;
  editPendingMediaFiles = [];
  document.getElementById('edit-caption').value = '';
  document.getElementById('edit-error').classList.add('hidden');
  document.getElementById('edit-preview-grid').innerHTML = '';
  document.getElementById('edit-modal-share').disabled = false;
  document.getElementById('edit-modal-share').textContent = 'Save';

  if (post.content) {
    const { mediaUrls, caption } = getContentParts(post.content);
    document.getElementById('edit-caption').value = caption || post.content;
    mediaUrls.forEach(url => {
      editPendingMediaFiles.push({ file: null, preview: url });
    });
    buildEditPreviewGrid(editPendingMediaFiles);
  }

  document.getElementById('edit-media-input').value = '';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editPendingMediaFiles.forEach(item => { if (item.file) URL.revokeObjectURL(item.preview); });
  editPendingMediaFiles = [];
  editingPostId = null;
}

function handleCreateMediaSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const remaining = MAX_MEDIA - pendingMediaFiles.length;
  if (files.length > remaining) {
    showError('create-error', `You can add up to ${MAX_MEDIA} files. ${remaining} remaining.`);
    return;
  }

  for (const file of files) {
    const preview = URL.createObjectURL(file);
    pendingMediaFiles.push({ file, preview });
  }

  buildCreatePreviewGrid(pendingMediaFiles, 'create-preview-selected', true);
  buildCreatePreviewGrid(pendingMediaFiles, 'create-preview-grid', true);
  document.getElementById('create-placeholder-icon').classList.add('hidden');
  document.getElementById('create-placeholder-text').classList.add('hidden');
  document.getElementById('create-preview-selected').classList.remove('hidden');
  document.getElementById('create-modal-next').disabled = false;
}

function goToDetailsStep() {
  if (pendingMediaFiles.length === 0) return;
  buildCreatePreviewGrid(pendingMediaFiles, 'create-preview-grid', true);
  updateCreateChangeButton();
  document.getElementById('create-step-select').classList.add('hidden');
  document.getElementById('create-step-details').classList.remove('hidden');
  document.getElementById('create-modal-next').classList.add('hidden');
  document.getElementById('create-modal-share').classList.remove('hidden');
  document.getElementById('create-modal-title').textContent = 'New post';
}

function updateCreateChangeButton() {
  const btn = document.getElementById('create-change-btn');
  if (!btn) return;
  btn.textContent = pendingMediaFiles.length < MAX_MEDIA ? 'Add' : 'Change';
}

function buildCreatePreviewGrid(items, gridId = 'create-preview-grid', allowRemove = false) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';
  grid.className = 'create-preview-grid';
  if (items.length > 1) grid.classList.add('multi');
  items.forEach((item, index) => {
    const isVideo = item.file ? item.file.type.startsWith('video/') : getMediaType(item.preview) === 'video';
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-thumb';

    const el = document.createElement(isVideo ? 'video' : 'img');
    el.src = item.preview;
    if (isVideo) { el.muted = true; el.controls = false; }
    el.loading = 'lazy';
    wrapper.appendChild(el);

    if (allowRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'preview-remove-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pendingMediaFiles.splice(index, 1);
        if (pendingMediaFiles.length === 0) {
          document.getElementById('create-preview-selected').classList.add('hidden');
          document.getElementById('create-placeholder-icon').classList.remove('hidden');
          document.getElementById('create-placeholder-text').classList.remove('hidden');
        }
        buildCreatePreviewGrid(pendingMediaFiles, 'create-preview-selected', true);
        buildCreatePreviewGrid(pendingMediaFiles, 'create-preview-grid', true);
        updateCreateChangeButton();
      });
      wrapper.appendChild(removeBtn);
    }

    grid.appendChild(wrapper);
  });
}

function handleEditMediaSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const remaining = MAX_MEDIA - editPendingMediaFiles.length;
  if (files.length > remaining) {
    showError('edit-error', `You can add up to ${MAX_MEDIA} files. ${remaining} remaining.`);
    return;
  }

  for (const file of files) {
    const preview = URL.createObjectURL(file);
    editPendingMediaFiles.push({ file, preview });
  }

  buildEditPreviewGrid(editPendingMediaFiles);
}

function buildEditPreviewGrid(items) {
  const grid = document.getElementById('edit-preview-grid');
  grid.innerHTML = '';
  grid.className = 'create-preview-grid';
  if (items.length > 1) grid.classList.add('multi');
  items.forEach((item) => {
    const isVideo = item.file ? item.file.type.startsWith('video/') : getMediaType(item.preview) === 'video';
    const el = document.createElement(isVideo ? 'video' : 'img');
    el.src = item.preview;
    if (isVideo) { el.muted = true; el.controls = false; }
    el.loading = 'lazy';
    grid.appendChild(el);
  });
}

async function handleCreateSubmit() {
  const caption = document.getElementById('create-caption').value.trim();
  if (!caption) { showError('create-error', 'Please write a caption'); return; }
  if (pendingMediaFiles.length === 0) { showError('create-error', 'Please select a photo or video'); return; }

  const btn = document.getElementById('create-modal-share');
  btn.disabled = true; btn.textContent = 'Sharing...';
  hideError('create-error');

  try {
    if (!cloudinaryConfig) cloudinaryConfig = await api('/upload-signature');

    const urls = [];
    for (const item of pendingMediaFiles) {
      if (item.file) {
        const isVideo = item.file.type.startsWith('video/');
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('api_key', cloudinaryConfig.api_key);
        fd.append('timestamp', cloudinaryConfig.timestamp);
        fd.append('signature', cloudinaryConfig.signature);
        if (cloudinaryConfig.upload_preset) fd.append('upload_preset', cloudinaryConfig.upload_preset);
        fd.append('folder', cloudinaryConfig.folder);
        const rt = isVideo ? 'video' : 'image';
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloud_name}/${rt}/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
        urls.push(data.secure_url);
      } else {
        urls.push(item.preview);
      }
    }

    const urlsPart = urls.join('\n') + '\n\n';
    const content = urlsPart + caption;

    await api('/posts/', { method: 'POST', body: JSON.stringify({ title: caption, content, published: true }) });
    closeCreateModal();
    currentPage = 1;
    loadFeed();
  } catch (err) { showError('create-error', err.message); }
  finally { btn.disabled = false; btn.textContent = 'Share'; }
}

async function handleEditSubmit() {
  if (!editingPostId) return;
  const caption = document.getElementById('edit-caption').value.trim();
  if (!caption) { showError('edit-error', 'Please write a caption'); return; }

  const btn = document.getElementById('edit-modal-share');
  btn.disabled = true; btn.textContent = 'Saving...';
  hideError('edit-error');

  try {
    if (!cloudinaryConfig) cloudinaryConfig = await api('/upload-signature');

    const urls = [];
    for (const item of editPendingMediaFiles) {
      if (item.file) {
        const isVideo = item.file.type.startsWith('video/');
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('api_key', cloudinaryConfig.api_key);
        fd.append('timestamp', cloudinaryConfig.timestamp);
        fd.append('signature', cloudinaryConfig.signature);
        if (cloudinaryConfig.upload_preset) fd.append('upload_preset', cloudinaryConfig.upload_preset);
        fd.append('folder', cloudinaryConfig.folder);
        const rt = isVideo ? 'video' : 'image';
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloud_name}/${rt}/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
        urls.push(data.secure_url);
      } else {
        urls.push(item.preview);
      }
    }

    const urlsPart = urls.join('\n') + '\n\n';
    const content = urlsPart + caption;

    await api(`/posts/${editingPostId}`, { method: 'PUT', body: JSON.stringify({ title: caption, content, published: true }) });
    closeEditModal();
    currentPage = 1;
    loadFeed();
  } catch (err) { showError('edit-error', err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save'; }
}

function openDeleteModal(postId) {
  deletingPostId = postId;
  document.getElementById('delete-error').classList.add('hidden');
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  deletingPostId = null;
}

async function confirmDelete() {
  if (!deletingPostId) return;
  const btn = document.getElementById('delete-confirm');
  btn.disabled = true; btn.textContent = 'Deleting...';
  try { await api(`/posts/${deletingPostId}`, { method: 'DELETE' }); closeDeleteModal(); currentPage = 1; loadFeed(); }
  catch (err) { showError('delete-error', err.message); }
  finally { btn.disabled = false; btn.textContent = 'Delete'; }
}

async function openProfile() {
  document.getElementById('feed-page').classList.add('hidden');
  document.getElementById('profile-page').classList.remove('hidden');
  activePage = 'profile';
  const token = getToken();
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.user_id) return;
    const user = await api(`/users/${payload.user_id}`);
    const email = user.email;
    const username = email.split('@')[0];
    const initial = getInitials(email);
    const gradient = getGradient(email);
    const gradientStr = `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`;
    document.getElementById('profile-avatar').textContent = initial;
    document.getElementById('profile-avatar').style.background = gradientStr;
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-bio').textContent = '';
    const posts = await api('/posts/?limit=100&skip=0&search=');
    const userPosts = posts.filter(p => (p.Post || p).owner_id === user.id);
    document.getElementById('profile-post-count').textContent = userPosts.length;
    renderProfilePosts(userPosts);
  } catch (err) {
    showError('error-banner', 'Failed to load profile: ' + err.message);
  }
}

function renderProfilePosts(posts) {
  const grid = document.getElementById('profile-posts');
  grid.innerHTML = '';
  if (posts.length === 0) {
    grid.innerHTML = '<div class="profile-posts-empty">No posts yet.</div>';
    return;
  }
  posts.forEach((post) => {
    const p = post.Post || post;
    const { mediaUrls } = getContentParts(p.content || '');
    const thumb = mediaUrls[0] || '';
    const el = document.createElement('div');
    el.className = 'profile-post-thumb';
    if (thumb) {
      el.innerHTML = `<img src="${escHtml(thumb)}" alt="${escHtml(p.title)}" loading="lazy">`;
    } else {
      const g = getGradient(p.owner?.email || `user${p.owner_id}@picto`);
      el.innerHTML = `<div class="profile-post-thumb-fallback" style="background:linear-gradient(135deg,${g[0]},${g[1]},${g[2]})">${p.title.charAt(0).toUpperCase()}</div>`;
    }
    if (mediaUrls.length > 1) {
      el.innerHTML += `<div class="profile-post-thumb-multi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>`;
    }
    grid.appendChild(el);
  });
}

function closeProfile() {
  showFeedSection();
}

let commentsPostId = null;
let replyToCommentId = null;
let replyToUsername = null;

function openCommentsModal(postId) {
  commentsPostId = postId;
  replyToCommentId = null;
  replyToUsername = null;
  document.getElementById('comments-reply-to').classList.add('hidden');
  document.getElementById('comments-input').value = '';
  document.getElementById('comments-post-btn').disabled = false;
  document.getElementById('comments-post-btn').textContent = 'Post';
  document.getElementById('comments-list').innerHTML = '';
  document.getElementById('comments-loading').classList.remove('hidden');
  document.getElementById('comments-modal').classList.remove('hidden');
  loadComments();
}

function closeCommentsModal() {
  document.getElementById('comments-modal').classList.add('hidden');
  commentsPostId = null;
  replyToCommentId = null;
  replyToUsername = null;
}

async function loadComments() {
  if (!commentsPostId) return;
  try {
    const comments = await api(`/posts/${commentsPostId}/comments`);
    document.getElementById('comments-loading').classList.add('hidden');
    renderComments(comments || []);
  } catch (err) {
    document.getElementById('comments-loading').classList.add('hidden');
    document.getElementById('comments-list').innerHTML = `<div class="comments-error">Failed to load comments: ${escHtml(err.message)}</div>`;
  }
}

function renderComments(comments) {
  const list = document.getElementById('comments-list');
  list.innerHTML = '';
  if (comments.length === 0) {
    list.innerHTML = '<div class="comments-empty">No comments yet.</div>';
    return;
  }
  comments.forEach(c => {
    const el = renderCommentElement(c, 0);
    list.appendChild(el);
  });
}

function renderCommentElement(comment, level) {
  const email = comment.owner?.email || `user${comment.user_id}@picto`;
  const initial = getInitials(email);
  const gradient = getGradient(email);
  const gradientStr = `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradient[2]})`;
  const username = email.split('@')[0];
  const isOwner = currentUser && comment.user_id === currentUser.id;

  const wrapper = document.createElement('div');
  wrapper.className = 'comment-wrapper';
  if (level > 0) wrapper.classList.add('comment-wrapper-reply');

  const div = document.createElement('div');
  div.className = 'comment-item';
  div.innerHTML = `
    <div class="comment-avatar" style="background:${gradientStr}">${initial}</div>
    <div class="comment-body">
      <div class="comment-username">${escHtml(username)}</div>
      <div class="comment-text">${escHtml(comment.content)}</div>
      <div class="comment-footer">
        <span class="comment-time">${timeAgo(comment.created_at)}</span>
        <button class="comment-reply-btn" data-comment-id="${comment.id}" data-username="${escHtml(username)}">Reply</button>
        ${isOwner ? `<button class="comment-delete-btn" data-comment-id="${comment.id}">Delete</button>` : ''}
      </div>
    </div>`;

  wrapper.appendChild(div);

  div.querySelector('.comment-reply-btn').addEventListener('click', () => {
    const cid = parseInt(div.querySelector('.comment-reply-btn').dataset.commentId);
    const uname = div.querySelector('.comment-reply-btn').dataset.username;
    setReplyTo(cid, uname);
  });

  const delBtn = div.querySelector('.comment-delete-btn');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const cid = parseInt(delBtn.dataset.commentId);
      try {
        await api(`/comments/${cid}`, { method: 'DELETE' });
        loadComments();
      } catch (err) { /* ignore */ }
    });
  }

  if (comment.replies && comment.replies.length > 0) {
    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'comment-replies';
    comment.replies.forEach(r => {
      const replyEl = renderCommentElement(r, level + 1);
      repliesContainer.appendChild(replyEl);
    });
    wrapper.appendChild(repliesContainer);
  }

  return wrapper;
}

function setReplyTo(commentId, username) {
  replyToCommentId = commentId;
  replyToUsername = username;
  document.getElementById('comments-reply-username').textContent = `@${username}`;
  document.getElementById('comments-reply-to').classList.remove('hidden');
  document.getElementById('comments-input').focus();
}

function cancelReply() {
  replyToCommentId = null;
  replyToUsername = null;
  document.getElementById('comments-reply-to').classList.add('hidden');
}

async function handleCommentSubmit() {
  const input = document.getElementById('comments-input');
  const content = input.value.trim();
  if (!content) return;
  const btn = document.getElementById('comments-post-btn');
  btn.disabled = true; btn.textContent = 'Posting...';
  try {
    const body = { content };
    if (replyToCommentId) body.parent_id = replyToCommentId;
    await api(`/posts/${commentsPostId}/comments`, { method: 'POST', body: JSON.stringify(body) });
    input.value = '';
    cancelReply();
    btn.disabled = false; btn.textContent = 'Post';
    loadComments();
    const feedCards = document.querySelectorAll('.post-card');
    feedCards.forEach(card => {
      if (card.dataset.postId == commentsPostId) {
        const link = card.querySelector('.post-comments-link');
        if (link) {
          const count = parseInt(link.textContent.match(/\d+/)?.[0] || '0') + 1;
          link.textContent = `View all ${count} comments`;
        }
      }
    });
  } catch (err) {
    showError('error-banner', err.message);
    btn.disabled = false; btn.textContent = 'Post';
  }
}

function buildNotifText(n) {
  const username = n.actor?.email?.split('@')[0] || 'someone';
  if (n.type === 'like') return `<strong>${escHtml(username)}</strong> liked your post`;
  if (n.type === 'comment') return `<strong>${escHtml(username)}</strong> commented on your post`;
  if (n.type === 'reply') return `<strong>${escHtml(username)}</strong> replied to your comment`;
  return `<strong>${escHtml(username)}</strong> interacted with your post`;
}

function updateNotifDots(count) {
  document.getElementById('notif-dot').classList.toggle('hidden', count === 0);
  document.getElementById('notif-dot-bottom').classList.toggle('hidden', count === 0);
}

function openNotifications() {
  document.getElementById('notif-list').innerHTML = '';
  document.getElementById('notif-loading').classList.remove('hidden');
  document.getElementById('notif-empty').classList.add('hidden');
  document.getElementById('notif-mark-all-read').classList.add('hidden');
  document.getElementById('notif-modal').classList.remove('hidden');
  loadNotifications();
}

function closeNotifications() {
  document.getElementById('notif-modal').classList.add('hidden');
}

async function loadNotifications() {
  try {
    const data = await api('/notifications/');
    document.getElementById('notif-loading').classList.add('hidden');
    updateNotifDots(data.unread_count);
    renderNotifications(data.notifications || []);
    if (data.unread_count > 0) {
      document.getElementById('notif-mark-all-read').classList.remove('hidden');
    }
  } catch (err) {
    document.getElementById('notif-loading').classList.add('hidden');
    document.getElementById('notif-list').innerHTML = `<div class="notif-empty">Failed to load notifications</div>`;
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notif-list');
  list.innerHTML = '';
  if (notifications.length === 0) {
    document.getElementById('notif-empty').classList.remove('hidden');
    return;
  }
  notifications.forEach(n => {
    const email = n.actor?.email || `user${n.actor_id}@picto`;
    const initial = getInitials(email);
    const gradient = getGradient(email);
    const el = document.createElement('div');
    el.className = 'notif-item' + (n.read ? '' : ' unread');
    el.innerHTML = `
      <div class="notif-item-avatar" style="background:linear-gradient(135deg,${gradient[0]},${gradient[1]},${gradient[2]})">${initial}</div>
      <div class="notif-item-body">
        <div class="notif-item-text">${buildNotifText(n)}</div>
        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
      </div>
      ${n.read ? '' : '<div class="notif-item-dot"></div>'}`;
    if (!n.read) {
      el.addEventListener('click', async () => {
        try { await api(`/notifications/${n.id}/read`, { method: 'PUT' }); } catch {}
        el.classList.remove('unread');
        el.querySelector('.notif-item-dot')?.remove();
        const dots = document.querySelectorAll('.notif-item.unread');
        if (dots.length === 0) document.getElementById('notif-mark-all-read').classList.add('hidden');
        updateNotifDots(dots.length - 1);
      });
    }
    list.appendChild(el);
  });
}

async function markAllNotificationsRead() {
  try {
    await api('/notifications/read-all', { method: 'PUT' });
    document.querySelectorAll('.notif-item.unread').forEach(el => {
      el.classList.remove('unread');
      el.querySelector('.notif-item-dot')?.remove();
    });
    document.getElementById('notif-mark-all-read').classList.add('hidden');
    updateNotifDots(0);
  } catch {}
}

let prevNotifCount = 0;

async function pollNotifications() {
  try {
    const data = await api('/notifications/');
    const count = data.unread_count || 0;
    updateNotifDots(count);
    if (count > prevNotifCount && count > 0) {
      const newNotifs = (data.notifications || []).slice(0, count - prevNotifCount);
      newNotifs.forEach(n => showNotifToast(n));
    }
    prevNotifCount = count;
  } catch (err) {
    console.warn('pollNotifications failed:', err.message);
  }
}

function showNotifToast(n) {
  const email = n.actor?.email || `user${n.actor_id}@picto`;
  const initial = getInitials(email);
  const gradient = getGradient(email);
  const text = buildNotifText(n);
  const container = document.getElementById('notif-toast-container');
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `
    <div class="notif-toast-avatar" style="background:linear-gradient(135deg,${gradient[0]},${gradient[1]},${gradient[2]})">${initial}</div>
    <div class="notif-toast-text">${text}</div>`;
  toast.addEventListener('click', () => { closeToast(toast); openNotifications(); });
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => closeToast(toast), 5000);
}

function closeToast(toast) {
  toast.classList.remove('show');
  setTimeout(() => toast.remove(), 300);
}

// Poll for unread count (immediately, then every 15s)
if (document.getElementById('feed')) {
  pollNotifications();
  setInterval(pollNotifications, 15000);
}
