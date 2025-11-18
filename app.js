// auth-users.js
// Sistema simples de autenticação e gerenciamento de usuários
// Regras implementadas:
// - Dois papéis: 'admin' e 'gestor'
// - Administrador (admin): acesso total, exceto que NÃO PODE excluir seu próprio usuário
// - Gestor (gestor): pode criar usuários e excluir apenas usuários que ele mesmo criou
// - Ambos (admin e gestor) podem alterar sua própria senha e editar seus próprios dados
// - O app NÃO usa Firestore nem serviços externos; persiste usuários no localStorage do navegador
// - Senhas são armazenadas como hashes SHA-256 (via SubtleCrypto)

// USO: abra o console do navegador, importe/execute este arquivo e chame as funções assíncronas abaixo.
// Exemplos de teste estão no final do arquivo.

const STORAGE_KEY = 'miniapp_users_v0.1';
const SESSION_KEY = 'miniapp_session_v0.1';

// --- Helpers ---
function uuid() {
  // simples uuid-like
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function nowISO() { return new Date().toISOString(); }

// --- Persistence ---
function loadUsersFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to parse users from storage, resetting.');
    return null;
  }
}

function saveUsersToStorage(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// --- Core data operations ---
async function seedInitialUsersIfNeeded() {
  let users = loadUsersFromStorage();
  if (users && users.length) return users;

  // Senhas iniciais: admin: 'admin123', gestor: 'gestor123' (só para mock/testes)
  const adminPass = await hashPassword('admin123');
  const gestorPass = await hashPassword('gestor123');

  const admin = {
    id: 'user-admin-1',
    username: 'admin',
    role: 'admin',
    passwordHash: adminPass,
    createdBy: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  const gestor = {
    id: 'user-gestor-1',
    username: 'gestor',
    role: 'gestor',
    passwordHash: gestorPass,
    createdBy: 'user-admin-1',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  users = [admin, gestor];
  saveUsersToStorage(users);
  return users;
}

async function getAllUsers() {
  await seedInitialUsersIfNeeded();
  return loadUsersFromStorage() || [];
}

async function findUserByUsername(username) {
  const users = await getAllUsers();
  return users.find(u => u.username === username) || null;
}

async function findUserById(id) {
  const users = await getAllUsers();
  return users.find(u => u.id === id) || null;
}

// --- Auth / Session ---
async function login(username, password) {
  const user = await findUserByUsername(username);
  if (!user) throw new Error('Usuário não encontrado');
  const ph = await hashPassword(password);
  if (ph !== user.passwordHash) throw new Error('Senha incorreta');

  const session = {
    token: uuid(),
    userId: user.id,
    username: user.username,
    role: user.role,
    createdAt: nowISO(),
  };
  saveSession(session);
  return session;
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
}

function currentSession() {
  return loadSession();
}

async function currentUser() {
  const sess = currentSession();
  if (!sess) return null;
  return await findUserById(sess.userId);
}

// --- Authorization helpers ---
function isAdmin(user) { return user && user.role === 'admin'; }
function isGestor(user) { return user && user.role === 'gestor'; }

// --- User operations ---
async function createUser(actor, { username, password, role = 'gestor' }) {
  // actor: user object performing the action (must be logged in and have rights)
  if (!actor) throw new Error('Ação não autorizada: faça login primeiro');
  if (!isAdmin(actor) && !isGestor(actor)) throw new Error('Somente admin ou gestor podem criar usuários');
  if (!username || !password) throw new Error('username e password obrigatórios');
  if (role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode criar outro admin');

  const existing = await findUserByUsername(username);
  if (existing) throw new Error('Já existe um usuário com esse username');

  const users = await getAllUsers();
  const hashed = await hashPassword(password);
  const user = {
    id: uuid(),
    username,
    role,
    passwordHash: hashed,
    createdBy: actor.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  users.push(user);
  saveUsersToStorage(users);
  return sanitizeUser(user);
}

async function editUser(actor, targetUserId, updates = {}) {
  // updates: { username?, role?, } - password use changePassword
  if (!actor) throw new Error('Ação não autorizada: faça login primeiro');
  const users = await getAllUsers();
  const idx = users.findIndex(u => u.id === targetUserId);
  if (idx === -1) throw new Error('Usuário alvo não encontrado');
  const target = users[idx];

  // Permission rules:
  // - Admin can edit qualquer usuário
  // - Gestor pode editar apenas usuários que ele criou
  // - Usuário pode editar seu próprio username
  if (actor.id === target.id) {
    // allowed
  } else if (isAdmin(actor)) {
    // allowed
  } else if (isGestor(actor) && target.createdBy === actor.id) {
    // allowed
  } else {
    throw new Error('Permissão negada para editar este usuário');
  }

  if (updates.role && updates.role === 'admin' && !isAdmin(actor)) {
    throw new Error('Apenas admin pode atribuir papel admin');
  }

  if (updates.username) {
    const other = users.find(u => u.username === updates.username && u.id !== target.id);
    if (other) throw new Error('Outro usuário já usa esse username');
    target.username = updates.username;
  }
  if (updates.role) target.role = updates.role;
  target.updatedAt = nowISO();
  users[idx] = target;
  saveUsersToStorage(users);
  return sanitizeUser(target);
}

async function changePassword(actor, targetUserId, newPassword) {
  if (!actor) throw new Error('Ação não autorizada: faça login primeiro');
  if (!newPassword) throw new Error('Nova senha requerida');
  const users = await getAllUsers();
  const idx = users.findIndex(u => u.id === targetUserId);
  if (idx === -1) throw new Error('Usuário alvo não encontrado');
  const target = users[idx];

  // Permissões:
  // - Usuário pode mudar sua própria senha
  // - Admin pode mudar qualquer senha
  // - Gestor pode mudar a senha de usuários que ele criou
  if (actor.id === target.id) {
    // allowed
  } else if (isAdmin(actor)) {
    // allowed
  } else if (isGestor(actor) && target.createdBy === actor.id) {
    // allowed
  } else {
    throw new Error('Permissão negada para alterar senha');
  }

  const hashed = await hashPassword(newPassword);
  target.passwordHash = hashed;
  target.updatedAt = nowISO();
  users[idx] = target;
  saveUsersToStorage(users);
  return { success: true };
}

async function deleteUser(actor, targetUserId) {
  if (!actor) throw new Error('Ação não autorizada: faça login primeiro');
  const users = await getAllUsers();
  const idx = users.findIndex(u => u.id === targetUserId);
  if (idx === -1) throw new Error('Usuário alvo não encontrado');
  const target = users[idx];

  // Regras:
  // - Admin pode excluir qualquer usuário exceto seu próprio usuário
  // - Gestor pode excluir apenas usuários que ele criou
  // - Ninguém pode excluir o próprio admin (mesmo se existir outro admin?)

  if (actor.id === target.id) {
    throw new Error('Não é permitido excluir o próprio usuário');
  }

  if (isAdmin(actor)) {
    // allow (we already blocked self-delete)
  } else if (isGestor(actor)) {
    if (target.createdBy !== actor.id) throw new Error('Gestor só pode excluir usuários que ele criou');
  } else {
    throw new Error('Permissão negada para excluir usuários');
  }

  users.splice(idx, 1);
  saveUsersToStorage(users);
  return { success: true };
}

// --- Utility to return users without password hash ---
function sanitizeUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

async function listUsers(actor) {
  if (!actor) throw new Error('Ação não autorizada: faça login primeiro');
  const users = await getAllUsers();
  // return sanitized list
  return users.map(sanitizeUser);
}

// --- Exports (attach to window for easy console use) ---
window.MiniAuth = {
  seedInitialUsersIfNeeded,
  getAllUsers,
  findUserByUsername,
  findUserById,
  login,
  logout,
  currentSession,
  currentUser,
  createUser,
  editUser,
  changePassword,
  deleteUser,
  listUsers,
  // helpers for testing
  _rawLoad: loadUsersFromStorage,
  _rawSave: saveUsersToStorage,
};

// --- Example usage / Quick tests ---
// Abra o console e rode (exemplos):
// (async () => {
//   await MiniAuth.seedInitialUsersIfNeeded();
//   const s = await MiniAuth.login('admin', 'admin123');
//   console.log('session', s);
//   const actor = await MiniAuth.currentUser();
//   console.log('actor', actor);
//   const novo = await MiniAuth.createUser(actor, { username: 'usuarioA', password: 'senhaA', role: 'gestor' });
//   console.log('criado', novo);
//   const lista = await MiniAuth.listUsers(actor);
//   console.table(lista);
//   // gestor login
////   await MiniAuth.logout();
//   await MiniAuth.login('gestor', 'gestor123');
//   const gestorAt = await MiniAuth.currentUser();
//   // gestor cria um usuário
//   const u2 = await MiniAuth.createUser(gestorAt, { username: 'u_gerado', password: '1234' });
//   console.log('gestor criou', u2);
//   // gestor tenta excluir um usuário criado por admin -> deve falhar
//   try { await MiniAuth.deleteUser(gestorAt, 'user-admin-1'); } catch (e) { console.warn(e.message); }
//   // gestor exclui o que ele criou -> ok
//   await MiniAuth.deleteUser(gestorAt, u2.id);
//   console.log('excluiu o que criou');
// })();

// Fim do arquivo
