"use strict";

const STORAGE_KEY = "closet-note-data-v1";
const categories = ["トップス", "ボトムス", "ワンピース", "アウター", "シューズ", "バッグ", "小物"];
const fallbackPalettes = ["#d9dfd4", "#e7d8ca", "#d9dce0", "#e6dfc9", "#d5d9d0", "#e3d5d0", "#d9d4e0"];
const emptyMark = "✳";

let state = loadState();
let pendingPhoto = "";
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const closetView = $("#closet-view");
const outfitsView = $("#outfits-view");
const itemDialog = $("#item-dialog");
const outfitDialog = $("#outfit-dialog");

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
render();

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
