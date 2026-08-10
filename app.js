const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "/api";

let currentUser = null;
let gifts = [];
let inventory = [];

function getTelegramUser() {
  const user = tg?.initDataUnsafe?.user;

  if (user) return user;

  return {
    id: 100000001,
    username: "test_user",
    first_name: "Тестовый пользователь"
  };
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Ошибка API");
  }

  return data;
}

/* =========================
   НАВИГАЦИЯ
========================= */

function showPage(page) {
  document.querySelectorAll(".page").forEach(element => {
    element.classList.remove("active");
  });

  const target = document.getElementById(page);

  if (!target) {
    console.error("Страница не найдена:", page);
    return;
  }

  target.classList.add("active");

  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.remove("active");
  });

  const activeButton = document.querySelector(
    `.bottom-nav button[data-page="${page}"]`
  );

  if (activeButton) {
    activeButton.classList.add("active");
  }

  if (page === "inventory") {
    loadInventory().catch(console.error);
  }
}

/* =========================
   ПОЛЬЗОВАТЕЛЬ
========================= */

async function loadUser() {
  const user = getTelegramUser();

  const data = await api("/user", {
    method: "POST",
    body: JSON.stringify({
      id: user.id,
      username: user.username || null,
      first_name: user.first_name || null
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

  document.getElementById("avatar").textContent =
    (currentUser.first_name || "U").charAt(0).toUpperCase();

  createReferralLink();
}

/* =========================
   ПОДАРКИ
========================= */

async function loadGifts() {
  const data = await api("/gifts");

  gifts = data.gifts || [];

  renderGifts();
  renderPopular();
}

function renderGifts() {
  const container = document.getElementById("gifts");

  if (!gifts.length) {
    container.innerHTML =
      `<div class="empty">🎁 Подарков пока нет</div>`;
    return;
  }

  container.innerHTML = gifts.map(gift => `
    <div class="gift-card">

      <div class="gift-icon">
        ${escapeHtml(gift.emoji || "🎁")}
      </div>

      <div class="gift-name">
        ${escapeHtml(gift.name)}
      </div>

      <div class="gift-description">
        ${escapeHtml(gift.description || "Коллекционный подарок")}
      </div>

      <div class="gift-bottom">

        <span class="price">
          ⭐ ${Number(gift.price || 0)}
        </span>

        <button
          class="buy"
          onclick="buyGift(${Number(gift.id)})">
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
    container.innerHTML =
      `<div class="empty">🎁 Скоро здесь появятся подарки</div>`;
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
          onclick="showPage('shop')">
          Открыть
        </button>

      </div>

    </div>
  `).join("");
}

/* =========================
   ИНВЕНТАРЬ
========================= */

async function loadInventory() {
  if (!currentUser) return;

  const data = await api(
    "/inventory?user_id=" +
    encodeURIComponent(currentUser.id)
  );

  inventory = data.inventory || [];

  renderInventory();

  document.getElementById("inventoryCount").textContent =
    inventory.length;
}

function renderInventory() {
  const container = document.getElementById("inventoryList");

  if (!inventory.length) {
    container.innerHTML =
      `<div class="empty">🎒 Инвентарь пока пуст</div>`;
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

/* =========================
   РЕФЕРАЛЫ
========================= */

function createReferralLink() {
  if (!currentUser) return;

  const link =
    "https://t.me/VldstxCase_bot?start=ref_" +
    currentUser.id;

  document.getElementById("refLink").textContent = link;
}

async function copyReferral() {
  const element = document.getElementById("refLink");

  if (!element) return;

  const link = element.textContent;

  try {
    await navigator.clipboard.writeText(link);

    if (tg?.showPopup) {
      tg.showPopup({
        title: "Готово",
        message: "Реферальная ссылка скопирована",
        buttons: [
          {
            type: "ok",
            text: "OK"
          }
        ]
      });
    } else {
      alert("Ссылка скопирована");
    }
  } catch {
    alert(link);
  }
}

/* =========================
   ПОКУПКА
========================= */

function buyGift(giftId) {
  const gift = gifts.find(item => item.id === giftId);

  if (!gift) return;

  const message =
    `${gift.emoji || "🎁"} ${gift.name}\n\n` +
    `Цена: ⭐ ${gift.price}\n\n` +
    `Оплата Telegram Stars будет подключена следующим этапом.`;

  if (tg?.showPopup) {
    tg.showPopup({
      title: "Покупка",
      message,
      buttons: [
        {
          type: "ok",
          text: "Понятно"
        }
      ]
    });
  } else {
    alert(message);
  }
}

/* =========================
   ЗАЩИТА HTML
========================= */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   ЗАПУСК
========================= */

async function init() {
  try {
    await loadUser();
    await loadGifts();
    await loadInventory();

    showPage("home");
  } catch (error) {
    console.error("Ошибка запуска:", error);
  }
}

document.addEventListener("DOMContentLoaded", init);
