const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : 'https://huggingface.co/spaces/rs-1234/fastapi-demo';

let cloudinaryConfig = null;
let currentUser = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let searchQuery = '';
let deletingPostId = null;
let editingPostId = null;
let pendingMediaUrls = [];
const MAX_MEDIA = 5;
const votedPosts = new Set();

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
  const headers = { 'Content-Type': 'application/json', ...options.headers };
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
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
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
      const fd = new URLSearchParams();
      fd.append('username', document.getElementById('login-email').value);
      fd.append('password', document.getElementById('login-password').value);
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
    const btn = registerForm.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing up...';
    try {
      await api('/users/', { method: 'POST', body: JSON.stringify({ email: document.getElementById('register-email').value, password: pw }) });
      const fd = new URLSearchParams();
      fd.append('username', document.getElementById('register-email').value); fd.append('password', pw);
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
  document.getElementById('profile-btn').addEventListener('click', () => { document.getElementById('dropdown-menu').classList.add('hidden'); openProfile(); });
  document.getElementById('avatar-btn').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-menu').classList.toggle('hidden'); });
  document.addEventListener('click', () => { document.getElementById('dropdown-menu').classList.add('hidden'); });
  document.getElementById('search-toggle').addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) { document.getElementById('search-input').focus(); }
    else { searchQuery = ''; currentPage = 1; loadFeed(); }
  });
  document.getElementById('new-post-btn').addEventListener('click', () => openModal());
  document.getElementById('media-upload-btn').addEventListener('click', () => {
    document.getElementById('media-input').value = '';
    document.getElementById('media-input').click();
  });
  document.getElementById('media-input').addEventListener('change', handleMediaSelect);
  document.getElementById('media-remove-btn').addEventListener('click', () => {
    pendingMediaUrls = [];
    document.getElementById('media-input').value = '';
    document.getElementById('media-preview-grid').classList.add('hidden');
    document.getElementById('media-preview-grid').innerHTML = '';
    document.getElementById('media-upload-btn').style.display = '';
    document.getElementById('media-count').textContent = '';
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-back').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('post-form').addEventListener('submit', handlePostSubmit);
  document.getElementById('delete-close').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDeleteModal(); });
  document.getElementById('delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('profile-close').addEventListener('click', closeProfile);
  document.getElementById('profile-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeProfile(); });
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
      document.getElementById('header-avatar').textContent = getInitials(currentUser.email);
      document.getElementById('dropdown-user').textContent = currentUser.email;
    }
  } catch {}
}

async function loadFeed() {
  const feed = document.getElementById('feed');
  const loading = document.getElementById('loading');
  const errorBanner = document.getElementById('error-banner');
  loading.classList.remove('hidden'); feed.innerHTML = ''; hideError(errorBanner);
  try {
    const skip = (currentPage - 1) * PAGE_SIZE;
    const data = await api(`/posts/?limit=${PAGE_SIZE}&skip=${skip}&search=${encodeURIComponent(searchQuery)}`);
    loading.style.display = 'none';
    if (!data || data.length === 0) { feed.innerHTML = '<div class="feed-end">No posts yet. Be the first to share!</div>'; return; }
    renderFeed(data);
  } catch (err) { loading.style.display = 'none'; showError(errorBanner, err.message); }
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
    const titleInitial = (p.title || 'P').charAt(0).toUpperCase();
    const { mediaUrls, caption } = getContentParts(p.content || '');
    const captionText = caption || p.content;

    let mediaSection;
    if (mediaUrls.length === 1) {
      const url = escHtml(mediaUrls[0]);
      const t = getMediaType(mediaUrls[0]);
      if (t === 'video') mediaSection = `<div class="post-image has-image" style="aspect-ratio:auto"><video src="${url}" controls style="width:100%;display:block" preload="metadata"></video></div>`;
      else mediaSection = `<div class="post-image has-image"><img src="${url}" alt="${escHtml(p.title)}" loading="lazy"></div>`;
    } else if (mediaUrls.length > 1) {
      let items = '';
      mediaUrls.forEach((u, i) => {
        const eu = escHtml(u);
        const t = getMediaType(u);
        if (t === 'video') items += `<div class="media-grid-item"><video src="${eu}" controls preload="metadata"></video></div>`;
        else items += `<div class="media-grid-item"><img src="${eu}" alt="" loading="lazy"></div>`;
      });
      mediaSection = `<div class="post-image has-image media-grid">${items}</div>`;
    } else {
      mediaSection = `<div class="post-image" style="background:${gradientStr}"><span class="post-image-initial">${titleInitial}</span></div>`;
    }

    const card = document.createElement('div');
    card.className = 'post-card';
    card.innerHTML = `
      <div class="post-header">
        <div class="avatar avatar-md" style="background:${gradientStr}">${initial}</div>
        <div class="post-author">
          <div class="post-username">${escHtml(email.split('@')[0])}</div>
          <div class="post-time">${timeAgo(p.created_at)}</div>
        </div>
        ${isOwner ? `<div class="post-more-btn" data-post-id="${p.id}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></div>` : ''}
      </div>
      ${mediaSection}
      <div class="post-body">
        <div class="post-actions-bar">
          <button class="like-btn ${votedPosts.has(p.id) ? 'liked' : ''}" data-post-id="${p.id}">
            <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="${votedPosts.has(p.id) ? 'currentColor' : 'none'}" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <span class="post-likes vote-count">${voteCount} ${voteCount === 1 ? 'like' : 'likes'}</span>
        </div>
        <div class="post-caption"><span class="caption-username">${escHtml(email.split('@')[0])}</span> ${escHtml(p.title)}${captionText ? ' — ' + escHtml(captionText) : ''}</div>
        ${isOwner ? `<div class="post-owner-actions"><button class="post-owner-btn edit-btn" data-post-id="${p.id}">Edit</button><button class="post-owner-btn danger delete-btn" data-post-id="${p.id}">Delete</button></div>` : ''}
      </div>`;

    card.querySelector('.like-btn').addEventListener('click', () => handleVote(p.id, card));
    const moreBtn = card.querySelector('.post-more-btn');
    if (moreBtn) moreBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(p); });
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => openEditModal(p));
    const delBtn = card.querySelector('.delete-btn');
    if (delBtn) delBtn.addEventListener('click', () => openDeleteModal(p.id));
    feed.appendChild(card);
  });
  document.getElementById('feed-end').textContent = posts.length < PAGE_SIZE ? 'You\'ve reached the end' : '';
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
  const countEl = card.querySelector('.vote-count');
  const current = parseInt(countEl.textContent) || 0;
  if (liked) {
    votedPosts.add(postId);
    countEl.textContent = `${current + 1} ${current + 1 === 1 ? 'like' : 'likes'}`;
    btn.classList.add('liked');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    votedPosts.delete(postId);
    countEl.textContent = `${Math.max(0, current - 1)} ${current - 1 === 1 ? 'like' : 'likes'}`;
    btn.classList.remove('liked');
    btn.querySelector('svg').setAttribute('fill', 'none');
  }
}

function openModal(post = null) {
  editingPostId = post ? post.id : null;
  document.getElementById('modal-title').textContent = post ? 'Edit Post' : 'New Post';
  document.getElementById('post-title').value = post ? post.title : '';
  document.getElementById('post-content').value = '';
  document.getElementById('media-preview-grid').classList.add('hidden');
  document.getElementById('media-preview-grid').innerHTML = '';
  document.getElementById('media-upload-btn').style.display = '';
  document.getElementById('media-count').textContent = '';
  pendingMediaUrls = [];

  if (post && post.content) {
    const { mediaUrls, caption } = getContentParts(post.content);
    document.getElementById('post-content').value = caption || post.content;
    if (mediaUrls.length > 0) {
      pendingMediaUrls = [...mediaUrls];
      buildPreviewGrid(mediaUrls);
      document.getElementById('media-upload-btn').style.display = 'none';
      document.getElementById('media-count').textContent = `${mediaUrls.length} file(s)`;
    }
  }

  document.getElementById('post-published').checked = post ? post.published : true;
  document.getElementById('modal-submit').textContent = post ? 'Save' : 'Share';
  hideError('post-error');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openEditModal(post) { openModal(post); }

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingPostId = null;
  pendingMediaUrls = [];
  document.getElementById('media-input').value = '';
  document.getElementById('media-preview-grid').classList.add('hidden');
  document.getElementById('media-preview-grid').innerHTML = '';
  document.getElementById('media-upload-btn').style.display = '';
  document.getElementById('media-count').textContent = '';
}

async function handleMediaSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const remaining = MAX_MEDIA - pendingMediaUrls.length;
  if (files.length > remaining) {
    showError('post-error', `You can add up to ${MAX_MEDIA} files total. ${remaining} remaining.`);
    return;
  }

  const statusEl = document.getElementById('upload-status');
  const countEl = document.getElementById('media-count');
  document.getElementById('media-upload-btn').style.display = 'none';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isVideo = file.type.startsWith('video/');
    statusEl.classList.remove('hidden');
    statusEl.textContent = `Uploading ${i + 1} of ${files.length}...`;

    try {
      if (!cloudinaryConfig) cloudinaryConfig = await api('/upload-signature');

      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', cloudinaryConfig.api_key);
      fd.append('timestamp', cloudinaryConfig.timestamp);
      fd.append('signature', cloudinaryConfig.signature);
      fd.append('upload_preset', cloudinaryConfig.upload_preset);
      fd.append('folder', cloudinaryConfig.folder);

      const rt = isVideo ? 'video' : 'image';
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloud_name}/${rt}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Upload failed');

      pendingMediaUrls.push(data.secure_url);
    } catch (err) {
      statusEl.textContent = `Upload failed: ${err.message}`;
      document.getElementById('media-upload-btn').style.display = '';
      return;
    }
  }

  buildPreviewGrid(pendingMediaUrls);
  statusEl.textContent = '';
  statusEl.classList.add('hidden');
  countEl.textContent = `${pendingMediaUrls.length} file(s)`;
  if (pendingMediaUrls.length < MAX_MEDIA) {
    document.getElementById('media-upload-btn').style.display = '';
  }
}

function buildPreviewGrid(urls) {
  const grid = document.getElementById('media-preview-grid');
  grid.innerHTML = '';
  urls.forEach((url, idx) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    const t = getMediaType(url);
    if (t === 'video') {
      const video = document.createElement('video');
      video.src = url; video.controls = false; video.muted = true;
      item.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = url;
      item.appendChild(img);
    }
    const del = document.createElement('button');
    del.className = 'preview-item-remove';
    del.innerHTML = '&times;';
    del.addEventListener('click', (e) => { e.stopPropagation(); removeMediaItem(idx); });
    item.appendChild(del);
    grid.appendChild(item);
  });
  grid.classList.remove('hidden');
}

function removeMediaItem(idx) {
  pendingMediaUrls.splice(idx, 1);
  if (pendingMediaUrls.length === 0) {
    document.getElementById('media-preview-grid').classList.add('hidden');
    document.getElementById('media-preview-grid').innerHTML = '';
    document.getElementById('media-upload-btn').style.display = '';
    document.getElementById('media-count').textContent = '';
  } else {
    buildPreviewGrid(pendingMediaUrls);
    document.getElementById('media-count').textContent = `${pendingMediaUrls.length} file(s)`;
  }
}

async function handlePostSubmit(e) {
  e.preventDefault();
  hideError('post-error');
  const title = document.getElementById('post-title').value.trim();
  const caption = document.getElementById('post-content').value.trim();
  const published = document.getElementById('post-published').checked;
  if (!title || !caption) { showError('post-error', 'Please fill in all fields'); return; }

  const urlsPart = pendingMediaUrls.length > 0 ? pendingMediaUrls.join('\n') + '\n\n' : '';
  const content = urlsPart + caption;

  const btn = document.getElementById('modal-submit');
  btn.disabled = true; btn.textContent = 'Sharing...';
  try {
    if (editingPostId) {
      await api(`/posts/${editingPostId}`, { method: 'PUT', body: JSON.stringify({ title, content, published }) });
    } else {
      await api('/posts/', { method: 'POST', body: JSON.stringify({ title, content, published }) });
    }
    closeModal();
    currentPage = 1;
    loadFeed();
  } catch (err) { showError('post-error', err.message); }
  finally { btn.disabled = false; btn.textContent = editingPostId ? 'Save' : 'Share'; }
}

function openDeleteModal(postId) { deletingPostId = postId; hideError('delete-error'); document.getElementById('delete-overlay').classList.remove('hidden'); }
function closeDeleteModal() { document.getElementById('delete-overlay').classList.add('hidden'); deletingPostId = null; hideError('delete-error'); }
async function confirmDelete() {
  if (!deletingPostId) return;
  hideError('delete-error');
  const btn = document.getElementById('delete-confirm');
  btn.disabled = true; btn.textContent = 'Deleting...';
  try { await api(`/posts/${deletingPostId}`, { method: 'DELETE' }); closeDeleteModal(); currentPage = 1; loadFeed(); }
  catch (err) { showError('delete-error', err.message); }
  finally { btn.disabled = false; btn.textContent = 'Delete'; }
}

async function openProfile() {
  if (!currentUser) await fetchCurrentUser();
  if (!currentUser) return;
  document.getElementById('profile-avatar').textContent = getInitials(currentUser.email);
  document.getElementById('profile-email').textContent = currentUser.email;
  try {
    const posts = await api('/posts/?limit=100&skip=0&search=');
    const userPosts = posts.filter(p => (p.Post || p).owner_id === currentUser.id);
    document.getElementById('profile-post-count').textContent = userPosts.length;
    const totalLikes = userPosts.reduce((sum, p) => sum + (p.votes || 0), 0);
    document.getElementById('profile-like-count').textContent = totalLikes;
  } catch { document.getElementById('profile-post-count').textContent = '0'; document.getElementById('profile-like-count').textContent = '0'; }
  document.getElementById('profile-overlay').classList.remove('hidden');
}
function closeProfile() { document.getElementById('profile-overlay').classList.add('hidden'); }
