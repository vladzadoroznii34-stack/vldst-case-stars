const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "/api";

let currentUser = null;
let gifts = [];
let inventory = [];

// -------------------------
// Telegram
// -------------------------

function getTelegramUser() {
  const user = tg?.initDataUnsafe?.user;

  if (user) {
    return user;
  }

  // Для проверки сайта вне Telegram
  return {
    id: 100000001,
    username: "test_user",
    first_name: "Тестовый пользователь"
  };
}

// -------------------------
// API
// -------------------------

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Ошибка API");
  }

  return data;
}

// -------------------------
// Пользователь
// -------------------------

async function loadUser() {
  const tgUser = getTelegramUser();

  const data = await api("/user", {
    method: "POST",
    body: JSON.stringify({
      id: tgUser.id,
      username: tgUser.username || null,
      first_name: tgUser.first_name || null
    })
  });

  currentUser = data.user;

  document.getElementById("balance").textContent =
    currentUser.balance ?? 0;

  document.getElementById("profileBalance").textContent =
    currentUser.balance ?? 0;

  document.getElementById("username").textContent =
    currentUser.username
      ? "@" + currentUser.username
      : currentUser.first_name || "Пользователь";

  document.getElementById("telegramId").textContent =
    "ID: " + currentUser.id;

  const firstLetter =
    (currentUser.first_name || "U").charAt(0).toUpperCase();

  document.getElementById("avatar").textContent = firstLetter;

  createReferralLink();
}

// -------------------------
// Подарки
// -------------------------

async function loadGifts() {
  const data = await api("/gifts");

  gifts = data.gifts || [];

  renderGifts();
  renderPopular();
}

// -------------------------
// Инвентарь
// -------------------------

async function loadInventory() {
  if (!currentUser) return;

  const data = await api(
    "/inventory?user_id=" + encodeURIComponent(currentUser.id)
  );

  inventory = data.inventory || [];

  renderInventory();

  document.getElementById("inventoryCount").textContent =
    inventory.length;
}

// -------------------------
// Рендер подарков
// -------------------------

function renderGifts() {
  const container = document.getElementById("gifts");

  if (!gifts.length) {
    container.innerHTML = `
      <div class="empty">
        🎁 Пока нет доступных подарков
      </div>
    `;
    return;
  }

  container.innerHTML = gifts.map(gift => `
    <div class="gift-card">

      <div class="gift-icon">
        ${escapeHtml(gift.emoji || "🎁")}
      </div>

      <div>
        <div class="gift-name">
          ${escapeHtml(gift.name)}
        </div>

        <div class="gift-description">
          ${escapeHtml(gift.description || "Коллекционный подарок")}
        </div>
      </div>

      <div class="gift-bottom">

        <div class="price">
          ⭐ ${Number(gift.price || 0)}
        </div>

        <button
          class="buy"
          onclick="buyGift(${Number(gift.id)})"
        >
          Купить
        </button>

      </div>

    </div>
  `).join("");
}

function renderPopular() {
  const container = document.getElementById("popular");

  const popular = gifts.slice(0, 4);

  if (!popular.length) {
    container.innerHTML = `
      <div class="empty">
        Скоро здесь появятся подарки
      </div>
    `;
    return;
  }

  container.innerHTML = popular.map(gift => `
    <div class="gift-card">

      <div class="gift-icon">
        ${escapeHtml(gift.emoji || "🎁")}
      </div>

      <div class="gift-name">
        ${escapeHtml(gift.name)}
      </div>

      <div class="gift-bottom">
        <span class="price">
          ⭐ ${Number(gift.price || 0)}
        </span>

        <button
          class="buy"
          onclick="showPage('shop')"
        >
          Открыть
        </button>
      </div>

    </div>
  `).join("");
}

// -------------------------
// Инвентарь
// -------------------------

function renderInventory() {
  const container = document.getElementById("inventoryList");

  if (!inventory.length) {
    container.innerHTML = `
      <div class="empty">
        🎒 Инвентарь пока пуст
      </div>
    `;
    return;
  }

  container.innerHTML = inventory.map(item => `
    <div class="gift-card">

      <div class="gift-icon">
        ${escapeHtml(item.emoji || "🎁")}
      </div>

      <div class="gift-name">
        ${escapeHtml(item.name)}
      </div>

      <div class="gift-description">
        ${escapeHtml(item.description || "")}
      </div>

      <div class="price">
        ⭐ ${Number(item.price || 0)}
      </div>

    </div>
  `).join("");
}

// -------------------------
// Покупка
// -------------------------

async function buyGift(giftId) {
  if (!currentUser) return;

  // Пока покупки отключены.
  // На следующем этапе подключим Telegram Stars
  // через Telegram Payments.

  if (tg?.showPopup) {
    tg.showPopup({
      title: "Покупка",
      message: "Оплата Stars будет подключена
