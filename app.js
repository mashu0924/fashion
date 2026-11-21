"use strict";

const STORAGE_PREFIX = "closet-note-data-v1:";
const LEGACY_STORAGE_KEY = "closet-note-data-v1";
const AUTH_CONFIG_KEY = "closet-note-supabase-config-v1";
const categories = ["トップス", "ボトムス", "ワンピース", "アウター", "シューズ", "バッグ", "小物"];
const fallbackPalettes = ["#d9dfd4", "#e7d8ca", "#d9dce0", "#e6dfc9", "#d5d9d0", "#e3d5d0", "#d9d4e0"];
const emptyMark = "✳";

let state = { items: [], outfits: [] };
let storageKey = "";
let supabaseClient = null;
let authMode = "signin";
let recoveryMode = false;
let pendingPhoto = "";
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const closetView = $("#closet-view");
const outfitsView = $("#outfits-view");
const itemDialog = $("#item-dialog");
const outfitDialog = $("#outfit-dialog");

function loadState(savedData = null) {
  try {
    const saved = savedData === null ? localStorage.getItem(storageKey) : savedData;
    if (!saved) return { items: [], outfits: [] };
    const parsed = JSON.parse(saved);
    return {
      items: Array.isArray(parsed.items) ? parsed.items.filter(isValidItem) : [],
      outfits: Array.isArray(parsed.outfits) ? parsed.outfits.filter(isValidOutfit) : [],
    };
  } catch (error) {
    console.error("クローゼットのデータを読み込めませんでした。", error);
    return { items: [], outfits: [] };
  }
}

function isValidItem(item) {
  return item && typeof item.id === "string" && typeof item.name === "string" &&
    categories.includes(item.category) && Number.isFinite(item.wears) &&
    (item.photo === "" || typeof item.photo === "string");
}

function isValidOutfit(outfit) {
  return outfit && typeof outfit.id === "string" && typeof outfit.name === "string" &&
    Array.isArray(outfit.itemIds) && typeof outfit.createdAt === "string";
}

function saveState() {
  if (!storageKey) {
    showToast("ログインしてから保存してください。");
    return false;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("クローゼットのデータを保存できませんでした。", error);
    showToast("保存できませんでした。写真のサイズを小さくしてお試しください。");
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function itemById(id) {
  return state.items.find((item) => item.id === id);
}

function getItemImage(item, className = "") {
  if (item.photo) return `<img class="${className}" src="${item.photo}" alt="${escapeHTML(item.name)}">`;
  const index = Math.max(0, categories.indexOf(item.category));
  return `<div class="photo-placeholder-art ${className}" style="background:linear-gradient(145deg, ${fallbackPalettes[index]}, #f0eee7)" aria-label="${escapeHTML(item.name)}の写真はありません">${emptyMark}</div>`;
}

function render() {
  renderStats();
  renderItems();
  renderOutfits();
}

function renderStats() {
  $("#total-count").textContent = state.items.length;
  $("#wear-count").textContent = state.items.reduce((total, item) => total + item.wears, 0);
  $("#outfit-count").textContent = state.outfits.length;
  $("#visible-count").textContent = state.items.length;
  $("#outfit-summary-count").textContent = state.outfits.length;
}

function renderItems() {
  const grid = $("#clothes-grid");
  const query = $("#search-input").value.trim().toLocaleLowerCase("ja");
  const category = $("#category-filter").value;
  const items = state.items.filter((item) =>
    (category === "all" || item.category === category) &&
    item.name.toLocaleLowerCase("ja").includes(query));
  $("#visible-count").textContent = items.length;

  if (!state.items.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">${emptyMark}</span><strong>クローゼットはまだ空っぽ</strong><p>お気に入りの服を登録して、あなただけのコレクションを作りましょう。</p><button class="button button-dark" type="button" data-open-dialog="item-dialog">最初の服を追加</button></div>`;
    return;
  }
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⌕</span><strong>アイテムが見つかりません</strong><p>検索ワードやカテゴリーを変えてみてください。</p></div>`;
    return;
  }

  grid.innerHTML = items.map((item) => `
    <article class="clothing-card">
      <div class="clothing-photo">
        ${getItemImage(item)}
        <span class="category-tag">${escapeHTML(item.category)}</span>
        <button class="card-menu" type="button" data-delete-item="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.name)}を削除">×</button>
      </div>
      <div class="card-content">
        <h3 class="card-title" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</h3>
        <div class="card-meta"><span>着用 ${item.wears} 回</span><button class="wear-button" type="button" data-wear-item="${escapeHTML(item.id)}">＋ 着用を記録</button></div>
      </div>
    </article>`).join("");
}

function renderOutfits() {
  const grid = $("#outfits-grid");
  const outfits = state.outfits.filter((outfit) => outfit.itemIds.some((id) => itemById(id)));
  if (!outfits.length) {
    const canCreate = state.items.length >= 2;
    grid.innerHTML = `<div class="empty-state"><span class="empty-state-icon">${emptyMark}</span><strong>${canCreate ? "お気に入りの組み合わせを保存しよう" : "コーディネートはまだありません"}</strong><p>${canCreate ? "クローゼットのアイテムを組み合わせて、自分だけのコーデを作りましょう。" : "コーデを作るには、まず洋服を2点以上登録してください。"}</p>${canCreate ? '<button class="button button-dark" type="button" data-create-outfit>コーデを作成</button>' : ""}</div>`;
    return;
  }
  grid.innerHTML = outfits.map((outfit) => {
    const items = outfit.itemIds.map(itemById).filter(Boolean);
    const date = new Date(outfit.createdAt);
    const dateLabel = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
    const images = items.slice(0, 4).map((item) => item.photo
      ? `<img src="${item.photo}" alt="${escapeHTML(item.name)}">`
      : `<div class="photo-placeholder-art" style="background:linear-gradient(145deg, ${fallbackPalettes[Math.max(0, categories.indexOf(item.category))]}, #f0eee7)" aria-label="${escapeHTML(item.name)}の写真はありません">${emptyMark}</div>`).join("");
    return `<article class="outfit-card">
      <div class="outfit-images">${images}</div>
      <div class="outfit-title-row"><h3 class="outfit-title" title="${escapeHTML(outfit.name)}">${escapeHTML(outfit.name)}</h3><button class="delete-button" type="button" data-delete-outfit="${escapeHTML(outfit.id)}">削除</button></div>
      <p class="outfit-meta">${items.length} アイテム · ${dateLabel}</p>
      <p class="outfit-items">${items.map((item) => escapeHTML(item.name)).join(" · ")}</p>
    </article>`;
  }).join("");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function showAuthMessage(message, isError = false) {
  const element = $("#auth-message");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function getAuthRedirectURL() {
  return window.location.protocol === "http:" || window.location.protocol === "https:"
    ? window.location.href.split(/[?#]/)[0]
    : undefined;
}

function isPrivilegedApiKey(key) {
  if (/service[_-]?role/i.test(key) || /^sb_secret_/i.test(key)) return true;
  const tokenParts = key.split(".");
  if (tokenParts.length !== 3) return false;
  try {
    const encodedPayload = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=")));
    return typeof payload.role === "string" && payload.role.toLowerCase() === "service_role";
  } catch {
    return false;
  }
}

function makeSupabaseClient(projectUrl, publicKey) {
  const parsedURL = new URL(projectUrl);
  const isLocalHTTP = parsedURL.protocol === "http:" &&
    (parsedURL.hostname === "localhost" || parsedURL.hostname === "127.0.0.1");
  if (parsedURL.protocol !== "https:" && !isLocalHTTP) {
    throw new Error("Project URL には HTTPS の URL を入力してください。");
  }
  if (!publicKey.trim() || isPrivilegedApiKey(publicKey.trim())) {
    throw new Error("anon / publishable の公開キーを使用してください。service_role キーと sb_secret_ キーは使用できません。");
  }
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== "function") {
    throw new Error("Supabase SDK を読み込めません。インターネット接続を確認して、ページを再読み込みしてください。");
  }
  return sdk.createClient(parsedURL.origin, publicKey.trim(), {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
}

function showAuthenticationForm() {
  const configured = Boolean(supabaseClient);
  const recovering = configured && recoveryMode;
  $("#auth-setup").hidden = configured;
  $("#auth-config-ready").hidden = !configured || recovering;
  $("#auth-form").hidden = !configured || recovering;
  $("#recovery-form").hidden = !recovering;
  $("#auth-options").hidden = !configured || recovering;
  $("#cancel-config-button").hidden = true;
  $("#auth-title").textContent = recovering
    ? "新しいパスワードを設定"
    : authMode === "signup" ? "アカウントを作成" : "クローゼットにログイン";
  $("#auth-description").textContent = recovering
    ? "この画面で新しいパスワードを設定してください。"
    : authMode === "signup"
      ? "アカウント登録はこの画面で行います。メール確認が有効な場合は、届いたリンクから登録を完了してください。"
      : "ログイン、またはこのアプリ内で新しいアカウントを作成できます。";
  $("#auth-submit").textContent = authMode === "signup" ? "アカウントを作成" : "ログイン";
  const passwordInput = $("[name='password']", $("#auth-form"));
  passwordInput.autocomplete = authMode === "signup" ? "new-password" : "current-password";
  passwordInput.minLength = authMode === "signup" ? 8 : 0;
  $("#auth-mode-button").textContent = authMode === "signup"
    ? "ログインに戻る"
    : "アカウントを新規登録";
  $("#reset-password-button").hidden = authMode === "signup";
}

function loadUserState(user) {
  storageKey = `${STORAGE_PREFIX}${user.id}`;
  let saved = null;
  try {
    saved = localStorage.getItem(storageKey);
    if (!saved) {
      const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyData && window.confirm("このブラウザーに保存されている既存の洋服・コーデ記録を、このアカウント用に引き継ぎますか？記録はこの端末内に保存されます。")) {
        localStorage.setItem(storageKey, legacyData);
        saved = legacyData;
      }
    }
  } catch (error) {
    console.error("既存のクローゼットデータを確認できませんでした。", error);
    showToast("既存データを読み込めませんでした。");
  }
  state = loadState(saved);
  render();
}

function setAuthenticatedSession(session) {
  if (recoveryMode) {
    $("#app-shell").hidden = true;
    $("#auth-screen").hidden = false;
    return;
  }
  const user = session && session.user ? session.user : null;
  if (!user) {
    storageKey = "";
    state = { items: [], outfits: [] };
    $("#app-shell").hidden = true;
    $("#auth-screen").hidden = false;
    return;
  }
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  $("#user-email").textContent = user.email || "";
  $("#user-email").title = user.email || "";
  loadUserState(user);
}

function watchAuthenticationChanges(client) {
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      showAuthenticationForm();
      showAuthMessage("パスワード再設定リンクを確認してください。");
    }
    setAuthenticatedSession(session);
  });
}

async function initializeAuthentication() {
  recoveryMode = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") === "recovery";
  showAuthenticationForm();
  let savedConfig = null;
  try {
    const storedConfig = localStorage.getItem(AUTH_CONFIG_KEY);
    if (storedConfig) savedConfig = JSON.parse(storedConfig);
  } catch (error) {
    console.error("Supabase の接続設定を読み込めませんでした。", error);
    showAuthMessage("Supabase の接続設定を読み込めません。接続情報を再設定してください。", true);
  }

  if (savedConfig && typeof savedConfig.projectUrl === "string" && typeof savedConfig.publicKey === "string") {
    try {
      supabaseClient = makeSupabaseClient(savedConfig.projectUrl, savedConfig.publicKey);
    } catch (error) {
      console.error("Supabase に接続できませんでした。", error);
      showAuthMessage(error.message || "Supabase に接続できませんでした。", true);
      return;
    }
    showAuthenticationForm();
    watchAuthenticationChanges(supabaseClient);
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      setAuthenticatedSession(data.session);
    } catch (error) {
      console.error("Supabase のセッションを確認できませんでした。", error);
      showAuthMessage(error.message || "接続を確認できませんでした。再度お試しください。", true);
    }
  }
}

function openItemDialog() {
  $("#item-form").reset();
  $("#item-form-error").textContent = "";
  $("#photo-preview").hidden = true;
  $("#photo-preview").removeAttribute("src");
  $("#photo-placeholder").hidden = false;
  pendingPhoto = "";
  itemDialog.showModal();
  $("[name='name']", $("#item-form")).focus();
}

function openOutfitDialog() {
  const picker = $("#picker-list");
  $("#outfit-form").reset();
  $("#outfit-form-error").textContent = "";
  picker.innerHTML = state.items.map((item) => `
    <label class="picker-option">
      <input type="checkbox" name="itemIds" value="${escapeHTML(item.id)}">
      ${item.photo ? `<img src="${item.photo}" alt="">` : `<span class="picker-placeholder">${emptyMark}</span>`}
      <span>${escapeHTML(item.name)} · ${escapeHTML(item.category)}</span>
    </label>`).join("");
  outfitDialog.showModal();
  $("[name='name']", $("#outfit-form")).focus();
}

async function prepareImage(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("画像ファイルを選択してください。");
  const imageURL = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageURL;
    await image.decode();
    const maxDimension = 1000;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を読み込めませんでした。別の画像をお試しください。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(imageURL);
  }
}

$("#today-label").textContent = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

$$(".nav-link").forEach((link) => link.addEventListener("click", () => {
  const showCloset = link.dataset.view === "closet";
  $$(".nav-link").forEach((navLink) => navLink.classList.toggle("active", navLink === link));
  closetView.hidden = !showCloset;
  outfitsView.hidden = showCloset;
  closetView.classList.toggle("active", showCloset);
  outfitsView.classList.toggle("active", !showCloset);
  $("#breadcrumb-current").textContent = showCloset ? "クローゼット" : "コーディネート";
}));

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const openButton = target.closest("[data-open-dialog]");
  if (openButton) openItemDialog();
  if (target.closest("[data-create-outfit]")) {
    if (state.items.length >= 2) openOutfitDialog();
  }
});

$$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => {
  button.closest("dialog").close();
}));

$("#item-photo").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  $("#item-form-error").textContent = "";
  try {
    pendingPhoto = await prepareImage(file);
    $("#photo-preview").src = pendingPhoto;
    $("#photo-preview").hidden = false;
    $("#photo-placeholder").hidden = true;
  } catch (error) {
    $("#item-form-error").textContent = error.message || "画像を読み込めませんでした。";
    event.target.value = "";
  }
});

$("#item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "");
  if (!name) {
    $("#item-form-error").textContent = "アイテム名を入力してください。";
    $("[name='name']", form).focus();
    return;
  }
  if (!categories.includes(category)) {
    $("#item-form-error").textContent = "カテゴリーを選択してください。";
    return;
  }
  const item = { id: crypto.randomUUID(), name, category, photo: pendingPhoto, wears: 0 };
  state.items.unshift(item);
  if (!saveState()) {
    state.items.shift();
    return;
  }
  itemDialog.close();
  render();
  showToast("クローゼットに追加しました");
});

$("#outfit-create-button").addEventListener("click", () => {
  if (state.items.length < 2) {
    showToast("コーデを作るには、洋服を2点以上登録してください");
    return;
  }
  openOutfitDialog();
});

$("#outfit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const itemIds = formData.getAll("itemIds").map(String).filter((id) => itemById(id));
  if (itemIds.length < 2) {
    $("#outfit-form-error").textContent = "コーディネートにはアイテムを2点以上選んでください。";
    return;
  }
  if (!name) {
    $("#outfit-form-error").textContent = "コーディネート名を入力してください。";
    $("[name='name']", form).focus();
    return;
  }
  const outfit = { id: crypto.randomUUID(), name, itemIds, createdAt: new Date().toISOString() };
  state.outfits.unshift(outfit);
  if (!saveState()) {
    state.outfits.shift();
    return;
  }
  outfitDialog.close();
  render();
  showToast("コーディネートを保存しました");
});

$("#clothes-grid").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const wearButton = target.closest("[data-wear-item]");
  if (wearButton) {
    const item = itemById(wearButton.dataset.wearItem);
    if (!item) return;
    item.wears += 1;
    if (!saveState()) {
      item.wears -= 1;
      return;
    }
    render();
    showToast("着用回数を記録しました");
    return;
  }
  const deleteButton = target.closest("[data-delete-item]");
  if (deleteButton) {
    const item = itemById(deleteButton.dataset.deleteItem);
    if (!item || !window.confirm(`「${item.name}」をクローゼットから削除しますか？関連するコーディネートからも取り除かれます。`)) return;
    const previousItems = state.items;
    const previousOutfits = state.outfits;
    state.items = state.items.filter((entry) => entry.id !== item.id);
    state.outfits = state.outfits.map((outfit) => ({ ...outfit, itemIds: outfit.itemIds.filter((id) => id !== item.id) })).filter((outfit) => outfit.itemIds.length >= 2);
    if (!saveState()) {
      state.items = previousItems;
      state.outfits = previousOutfits;
      return;
    }
    render();
    showToast("アイテムを削除しました");
  }
});

$("#outfits-grid").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const deleteButton = target.closest("[data-delete-outfit]");
  if (!deleteButton) return;
  const index = state.outfits.findIndex((outfit) => outfit.id === deleteButton.dataset.deleteOutfit);
  if (index < 0 || !window.confirm(`「${state.outfits[index].name}」を削除しますか？`)) return;
  const [removed] = state.outfits.splice(index, 1);
  if (!saveState()) {
    state.outfits.splice(index, 0, removed);
    return;
  }
  render();
  showToast("コーディネートを削除しました");
});

$("#search-input").addEventListener("input", renderItems);
$("#category-filter").addEventListener("change", renderItems);

$("#auth-mode-button").addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  $("#auth-form").reset();
  showAuthMessage("");
  showAuthenticationForm();
});

$("#change-config-button").addEventListener("click", () => {
  try {
    const savedConfig = JSON.parse(localStorage.getItem(AUTH_CONFIG_KEY) || "{}");
    $("[name='projectUrl']", $("#config-form")).value = savedConfig.projectUrl || "";
    $("[name='publicKey']", $("#config-form")).value = savedConfig.publicKey || "";
  } catch (error) {
    console.error("Supabase の接続設定を読み込めませんでした。", error);
  }
  $("#auth-setup").hidden = false;
  $("#auth-config-ready").hidden = true;
  $("#auth-form").hidden = true;
  $("#auth-options").hidden = true;
  $("#cancel-config-button").hidden = false;
  showAuthMessage("");
});

$("#cancel-config-button").addEventListener("click", () => {
  showAuthenticationForm();
  showAuthMessage("");
});

$("#config-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const projectUrl = String(formData.get("projectUrl") || "").trim();
  const publicKey = String(formData.get("publicKey") || "").trim();
  const submitButton = $("button[type='submit']", form);
  submitButton.disabled = true;
  showAuthMessage("");
  try {
    const client = makeSupabaseClient(projectUrl, publicKey);
    localStorage.setItem(AUTH_CONFIG_KEY, JSON.stringify({ projectUrl, publicKey }));
    supabaseClient = client;
    watchAuthenticationChanges(client);
    showAuthenticationForm();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    setAuthenticatedSession(data.session);
    showAuthMessage("接続しました。メールアドレスでログインまたはアカウントを作成してください。");
  } catch (error) {
    console.error("Supabase の設定に失敗しました。", error);
    showAuthMessage(error.message || "接続できませんでした。入力内容とネットワークを確認してください。", true);
  } finally {
    submitButton.disabled = false;
  }
});

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    showAuthMessage("先に Supabase に接続してください。", true);
    return;
  }
  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const submitButton = $("#auth-submit");
  submitButton.disabled = true;
  showAuthMessage("");
  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthRedirectURL() },
      });
      if (error) throw error;
      if (data.session) {
        showAuthMessage("アカウントを作成しました。");
      } else {
        showAuthMessage("確認メールを送信しました。メール内のリンクから登録を完了してください。");
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    console.error("認証に失敗しました。", error);
    showAuthMessage(error.message || "認証に失敗しました。入力内容を確認してください。", true);
  } finally {
    submitButton.disabled = false;
  }
});

$("#recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient || !recoveryMode) return;
  const formData = new FormData(event.currentTarget);
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (newPassword !== confirmPassword) {
    showAuthMessage("入力したパスワードが一致しません。", true);
    return;
  }
  const submitButton = $("button[type='submit']", event.currentTarget);
  submitButton.disabled = true;
  try {
    const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
    recoveryMode = false;
    setAuthenticatedSession({ user: data.user });
  } catch (error) {
    console.error("パスワードを更新できませんでした。", error);
    showAuthMessage(error.message || "パスワードを更新できませんでした。", true);
  } finally {
    submitButton.disabled = false;
  }
});

$("#reset-password-button").addEventListener("click", async () => {
  if (!supabaseClient) return;
  const email = $("[name='email']", $("#auth-form")).value.trim();
  if (!email) {
    showAuthMessage("先にメールアドレスを入力してください。", true);
    $("[name='email']", $("#auth-form")).focus();
    return;
  }
  try {
    const options = {};
    const redirectURL = getAuthRedirectURL();
    if (redirectURL) options.redirectTo = redirectURL;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, options);
    if (error) throw error;
    showAuthMessage("パスワード再設定のメールを送信しました。");
  } catch (error) {
    console.error("再設定メールを送信できませんでした。", error);
    showAuthMessage(error.message || "メールを送信できませんでした。", true);
  }
});

$("#signout-button").addEventListener("click", async () => {
  if (!supabaseClient) return;
  const button = $("#signout-button");
  button.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    showAuthMessage("ログアウトしました。");
  } catch (error) {
    console.error("ログアウトに失敗しました。", error);
    showToast(error.message || "ログアウトに失敗しました。");
  } finally {
    button.disabled = false;
  }
});

initializeAuthentication();
