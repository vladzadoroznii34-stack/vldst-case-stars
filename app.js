const tg = window.Telegram?.WebApp;

if (tg) {
tg.ready();
tg.expand();
}

const API = "/api";

let currentUser = null;
let gifts = [];
let inventory = [];
let tasks = [];

/* =========================
TELEGRAM
========================= */

function getTelegramUser() {
const user = tg?.initDataUnsafe?.user;

if (user) return user;

return {
id: 100000001,
username: "test_user",
first_name: "Тестовый пользователь"
};
}

/* =========================
API
========================= */

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
".bottom-nav button[data-page="${page}"]"
);

if (activeButton) {
activeButton.classList.add("active");
}

if (page === "inventory") {
loadInventory().catch(console.error);
}

if (page === "tasks") {
loadTasks().catch(console.error);
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

updateUserBalance();

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
BALANCE / COINS
========================= */

function updateUserBalance() {
if (!currentUser) return;

const balance = Number(currentUser.balance || 0);
const coins = Number(currentUser.coins || 0);

const balanceElement = document.getElementById("balance");
const profileBalanceElement =
document.getElementById("profileBalance");

const coinsElement =
document.getElementById("coins");

const tasksCoinsElement =
document.getElementById("tasksCoins");

const profileCoinsElement =
document.getElementById("profileCoins");

if (balanceElement) {
balanceElement.textContent = balance;
}

if (profileBalanceElement) {
profileBalanceElement.textContent = balance;
}

if (coinsElement) {
coinsElement.textContent = coins;
}

if (tasksCoinsElement) {
tasksCoinsElement.textContent = coins;
}

if (profileCoinsElement) {
profileCoinsElement.textContent = coins;
}
}

async function loadCoins() {
if (!currentUser) return;

const data = await api(
"/coins?user_id=" +
encodeURIComponent(currentUser.id)
);

currentUser.coins = Number(data.coins || 0);

updateUserBalance();
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

if (!container) return;

if (!gifts.length) {
container.innerHTML =
"<div class="empty">🎁 Подарков пока нет</div>";
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

if (!container) return;

const popular = gifts.slice(0, 4);

if (!popular.length) {
container.innerHTML =
"<div class="empty">🎁 Скоро здесь появятся подарки</div>";
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
ЗАДАНИЯ
========================= */

async function loadTasks() {
if (!currentUser) return;

const container = document.getElementById("tasksList");

if (!container) return;

container.innerHTML =
"<div class="empty">⏳ Загружаем задания...</div>";

try {
const data = await api(
"/tasks?user_id=" +
encodeURIComponent(currentUser.id)
);

tasks = data.tasks || [];

renderTasks();

await loadCoins();

} catch (error) {
console.error("Ошибка загрузки заданий:", error);

container.innerHTML =
  `<div class="empty">❌ Не удалось загрузить задания</div>`;

}
}

function renderTasks() {
const container = document.getElementById("tasksList");

if (!container) return;

if (!tasks.length) {
container.innerHTML = "<div class="empty"> 🎯 Сейчас нет доступных заданий </div>";

return;

}

container.innerHTML = tasks.map(task => {

const completed =
  Number(task.completed) === 1;

return `
  <div class="gift-card">

    <div class="gift-icon">
      🎯
    </div>

    <div class="gift-name">
      ${escapeHtml(task.title)}
    </div>

    <div class="gift-description">
      ${escapeHtml(
        task.description ||
        "Выполни задание и получи награду"
      )}
    </div>

    <div class="price">
      🪙 +${Number(task.reward || 0)}
    </div>

    <div class="gift-bottom">

      ${
        completed
          ? `
            <button
              class="buy"
              disabled
              style="opacity:.5;">
              ✓ Получено
            </button>
          `
          : `
            <button
              class="buy"
              onclick="completeTask(${Number(task.id)})">
              Получить
            </button>
          `
      }

    </div>

  </div>
`;

}).join("");
}

/* =========================
ВЫПОЛНЕНИЕ ЗАДАНИЯ
========================= */

async function completeTask(taskId) {
if (!currentUser) return;

const task = tasks.find(
item => Number(item.id) === Number(taskId)
);

if (!task) return;

if (Number(task.completed) === 1) {
showMessage(
"Задание",
"Ты уже получил награду за это задание."
);
return;
}

try {

const data = await api("/tasks/complete", {
  method: "POST",

  body: JSON.stringify({
    user_id: currentUser.id,
    task_id: taskId
  })
});

currentUser.coins =
  Number(data.coins || 0);

updateUserBalance();

showMessage(
  "🎉 Награда получена",
  `Тебе начислено 🪙 ${data.reward}`
);

await loadTasks();

} catch (error) {

console.error(error);

showMessage(
  "Ошибка",
  error.message || "Не удалось получить награду"
);

}
}

/* =========================
INVENTORY
========================= */

async function loadInventory() {
if (!currentUser) return;

const data = await api(
"/inventory?user_id=" +
encodeURIComponent(currentUser.id)
);

inventory = data.inventory || [];

renderInventory();

const count =
document.getElementById("inventoryCount");

if (count) {
count.textContent = inventory.length;
}
}

function renderInventory() {
const container =
document.getElementById("inventoryList");

if (!container) return;

if (!inventory.length) {
container.innerHTML =
"<div class="empty">🎒 Инвентарь пока пуст</div>";
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

const element =
document.getElementById("refLink");

if (!element) return;

const link =
"https://t.me/VldstxCase_bot?start=ref_" +
currentUser.id;

element.textContent = link;
}

async function copyReferral() {
const element =
document.getElementById("refLink");

if (!element) return;

const link = element.textContent;

try {

await navigator.clipboard.writeText(link);

showMessage(
  "Готово",
  "Реферальная ссылка скопирована"
);

} catch {

alert(link);

}
}

/* =========================
ПОКУПКА
========================= */

function buyGift(giftId) {
const gift = gifts.find(
item => Number(item.id) === Number(giftId)
);

if (!gift) return;

const message =
"${gift.emoji || "🎁"} ${gift.name}\n\n" +
"Цена: ⭐ ${gift.price}\n\n" +
"Оплата Telegram Stars будет подключена следующим этапом.";

showMessage(
"Покупка",
message
);
}

/* =========================
POPUP
========================= */

function showMessage(title, message) {

if (tg?.showPopup) {

tg.showPopup({
  title,
  message,
  buttons: [
    {
      type: "ok",
      text: "OK"
    }
  ]
});

} else {

alert(
  title + "\n\n" + message
);

}
}

/* =========================
ЗАЩИТА HTML
========================= */

function escapeHtml(value) {
return String(value)
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

/* =========================
ЗАПУСК
========================= */

async function init() {

try {

await loadUser();

await loadGifts();

await loadInventory();

await loadCoins();

await loadTasks();

showPage("home");

} catch (error) {

console.error(
  "Ошибка запуска:",
  error
);

}
}

document.addEventListener(
"DOMContentLoaded",
init
);
