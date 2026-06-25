const API_BASE = 'http://localhost:8000';
let currentUser = null;
let currentPage = 1;
let pageSize = 10;
let searchQuery = '';
let deletingPostId = null;
let editingPostId = null;

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function clearToken() {
  localStorage.removeItem('token');
}

async function api(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = 'index.html';
    throw new Error('Unauthorized');
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const detail = data?.detail || data?.message || data || `Request failed (${res.status})`;
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
    throw new Error(msg);
  }

  return data;
}

function showError(el, msg) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }
}

function hideError(el) {
  showError(el, '');
}

function isAuthPage() {
  return document.querySelector('.auth-page') !== null;
}

async function handleLogin(email, password) {
  const formData = new URLSearchParams();
  formData.append('username', email);
  formData.append('password', password);

  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  return data;
}

function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

if (isAuthPage()) {
  const tabBar = document.querySelector('.tab-bar');
  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      loginForm.classList.toggle('active', target === 'login');
      registerForm.classList.toggle('active', target === 'register');
      hideError('login-error');
      hideError('register-error');
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('login-error');
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const data = await handleLogin(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
      setToken(data.access_token);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError('login-error', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('register-error');
    const pw = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    if (pw !== confirm) {
      showError('register-error', 'Passwords do not match');
      return;
    }
    const btn = registerForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      await api('/users/', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('register-email').value,
          password: pw,
        }),
      });
      const data = await handleLogin(
        document.getElementById('register-email').value,
        pw
      );
      setToken(data.access_token);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError('register-error', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
}

if (document.getElementById('posts-grid')) {
  initDashboard();
}

function initDashboard() {
  const token = getToken();
  if (!token) { window.location.href = 'index.html'; return; }

  const payload = decodeToken(token);
  if (payload && payload.user_id) {
    fetchUser(payload.user_id);
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearToken();
    window.location.href = 'index.html';
  });

  document.getElementById('new-post-btn').addEventListener('click', () => openModal());
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('post-form').addEventListener('submit', handlePostSubmit);

  document.getElementById('delete-close').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  document.getElementById('delete-confirm').addEventListener('click', confirmDelete);

  let searchTimer;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      currentPage = 1;
      loadPosts();
    }, 300);
  });

  loadPosts();
}

async function fetchUser(userId) {
  try {
    const user = await api(`/users/${userId}`);
    document.getElementById('user-email').textContent = user.email;
    currentUser = user;
  } catch {
    // silently fail
  }
}

async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  const loading = document.getElementById('loading');
  const errorBanner = document.getElementById('error-banner');
  loading.style.display = 'block';
  grid.innerHTML = '';
  hideError(errorBanner);

  try {
    const skip = (currentPage - 1) * pageSize;
    const data = await api(`/posts/?limit=${pageSize}&skip=${skip}&search=${encodeURIComponent(searchQuery)}`);
    loading.style.display = 'none';

    if (!data || data.length === 0) {
      grid.innerHTML = '<div class="loading" style="display:block">No posts found.</div>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    renderPosts(data);
    renderPagination(data.length);
  } catch (err) {
    loading.style.display = 'none';
    showError(errorBanner, err.message);
  }
}

function renderPosts(posts) {
  const grid = document.getElementById('posts-grid');
  grid.innerHTML = '';

  posts.forEach(post => {
    const p = post.Post || post;
    const voteCount = post.votes ?? 0;
    const ownerId = p.owner_id;
    const currentUserId = currentUser?.id;
    const isOwner = currentUserId && ownerId === currentUserId;

    const card = document.createElement('div');
    card.className = 'post-card';
    const ownerEmail = p.owner?.email || `User #${ownerId}`;
    const date = new Date(p.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

    card.innerHTML = `
      <div class="post-card-header">
        <h3 class="post-title">${escHtml(p.title)}</h3>
      </div>
      <div class="post-meta">
        <span>${escHtml(ownerEmail)}</span>
        <span>${date}</span>
        ${!p.published ? '<span style="color:var(--text-muted)">Draft</span>' : ''}
      </div>
      <div class="post-content collapsed">${escHtml(p.content)}</div>
      <div class="post-actions">
        <button class="vote-btn ${voteCount > 0 ? 'voted' : ''}" data-post-id="${p.id}">
          &#9650; <span class="vote-count">${voteCount}</span>
        </button>
        <div class="spacer"></div>
        ${isOwner ? `<button class="btn btn-outline btn-sm edit-btn" data-post-id="${p.id}">Edit</button>` : ''}
        ${isOwner ? `<button class="btn btn-danger btn-sm delete-btn" data-post-id="${p.id}">Delete</button>` : ''}
      </div>
    `;

    card.querySelector('.vote-btn').addEventListener('click', () => handleVote(p.id, voteCount, card));
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => openEditModal(p));
    const delBtn = card.querySelector('.delete-btn');
    if (delBtn) delBtn.addEventListener('click', () => openDeleteModal(p.id));

    grid.appendChild(card);
  });
}

function renderPagination(count) {
  const el = document.getElementById('pagination');
  if (count < pageSize && currentPage === 1) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <button class="btn btn-outline btn-sm" id="prev-page" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="page-info">Page ${currentPage}</span>
    <button class="btn btn-outline btn-sm" id="next-page" ${count < pageSize ? 'disabled' : ''}>Next</button>
  `;

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; loadPosts(); }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    if (count >= pageSize) { currentPage++; loadPosts(); }
  });
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openModal(post = null) {
  editingPostId = post ? post.id : null;
  document.getElementById('modal-title').textContent = post ? 'Edit Post' : 'New Post';
  document.getElementById('post-title').value = post ? post.title : '';
  document.getElementById('post-content').value = post ? post.content : '';
  document.getElementById('post-published').checked = post ? post.published : true;
  document.getElementById('modal-submit').textContent = post ? 'Save Changes' : 'Create Post';
  hideError('post-error');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openEditModal(post) {
  openModal(post);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingPostId = null;
}

function closeDeleteModal() {
  document.getElementById('delete-overlay').classList.add('hidden');
  deletingPostId = null;
  hideError('delete-error');
}

function openDeleteModal(postId) {
  deletingPostId = postId;
  hideError('delete-error');
  document.getElementById('delete-overlay').classList.remove('hidden');
}

async function handlePostSubmit(e) {
  e.preventDefault();
  hideError('post-error');
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const published = document.getElementById('post-published').checked;

  if (!title || !content) {
    showError('post-error', 'Title and content are required.');
    return;
  }

  const btn = document.getElementById('modal-submit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if (editingPostId) {
      await api(`/posts/${editingPostId}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content, published }),
      });
    } else {
      await api('/posts/', {
        method: 'POST',
        body: JSON.stringify({ title, content, published }),
      });
    }
    closeModal();
    loadPosts();
  } catch (err) {
    showError('post-error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = editingPostId ? 'Save Changes' : 'Create Post';
  }
}

async function confirmDelete() {
  if (!deletingPostId) return;
  hideError('delete-error');
  const btn = document.getElementById('delete-confirm');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    await api(`/posts/${deletingPostId}`, { method: 'DELETE' });
    closeDeleteModal();
    loadPosts();
  } catch (err) {
    showError('delete-error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
}

async function handleVote(postId, currentVotes, card) {
  const token = getToken();
  if (!token) return;

  const hasVoted = currentVotes > 0;
  const dir = hasVoted ? 0 : 1;

  const btn = card.querySelector('.vote-btn');
  btn.disabled = true;

  try {
    await api('/vote/', {
      method: 'POST',
      body: JSON.stringify({ post_id: postId, dir }),
    });
    const countEl = card.querySelector('.vote-count');
    const newCount = hasVoted ? currentVotes - 1 : currentVotes + 1;
    countEl.textContent = newCount;
    btn.classList.toggle('voted', !hasVoted);
  } catch (err) {
    showError('error-banner', err.message);
  } finally {
    btn.disabled = false;
  }
}
