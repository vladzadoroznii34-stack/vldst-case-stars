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
let cases = [];
let currentCase = null;
let currentRewards = [];


/* =========================
   TELEGRAM
========================= */

function getTelegramUser() {

  const user =
    tg?.initDataUnsafe?.user;

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

  const response = await fetch(
    API + path,
    {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const data =
    await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.error || "Ошибка API"
    );
  }

  return data;
}


/* =========================
   NAVIGATION
========================= */

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(element => {
      element.classList.remove("active");
    });

  const target =
    document.getElementById(page);

  if (!target) return;

  target.classList.add("active");

  document
    .querySelectorAll(".bottom-nav button")
    .forEach(button => {
      button.classList.remove("active");
    });

  const button =
    document.querySelector(
      `.bottom-nav button[data-page="${page}"]`
    );

  if (button) {
    button.classList.add("active");
  }

  if (page === "cases") {
    loadCases();
  }

  if (page === "tasks") {
    loadTasks();
  }

  if (page === "inventory") {
    loadInventory();
  }

  if (page === "rating") {
    loadRating("coins");
  }
}


/* =========================
   USER
========================= */

async function loadUser() {

  const user =
    getTelegramUser();

  const data =
    await api(
      "/user",
      {
        method: "POST",

        body: JSON.stringify({
          id: user.id,
          username:
            user.username || null,
          first_name:
            user.first_name || null
        })
      }
    );

  currentUser =
    data.user;

  updateBalances();

  document.getElementById(
    "username"
  ).textContent =
    currentUser.username
      ? "@" + currentUser.username
      : currentUser.first_name ||
        "Пользователь";

  document.getElementById(
    "telegramId"
  ).textContent =
    "ID: " + currentUser.id;

  document.getElementById(
    "avatar"
  ).textContent =
    (
      currentUser.first_name ||
      "U"
    )
      .charAt(0)
      .toUpperCase();

  createReferralLink();
}


function updateBalances() {

  if (!currentUser) return;

  const balance =
    Number(
      currentUser.balance || 0
    );

  const coins =
    Number(
      currentUser.coins || 0
    );

  setText(
    "balance",
    balance
  );

  setText(
    "profileBalance",
    balance
  );

  setText(
    "coins",
    coins
  );

  setText(
    "profileCoins",
    coins
  );

  setText(
    "tasksCoins",
    coins
  );
}


async function loadCoins() {

  if (!currentUser) return;

  const data =
    await api(
      "/coins?user_id=" +
      encodeURIComponent(
        currentUser.id
      )
    );

  currentUser.coins =
    Number(data.coins || 0);

  updateBalances();
}


/* =========================
   CASES
========================= */

async function loadCases() {

  const container =
    document.getElementById(
      "casesList"
    );

  if (!container) return;

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем кейсы...
    </div>`;

  try {

    const data =
      await api("/cases");

    cases =
      data.cases || [];

    renderCases();

  } catch (error) {

    console.error(error);

    container.innerHTML =
      `<div class="empty">
        ❌ Не удалось загрузить кейсы
      </div>`;
  }
}


function renderCases() {

  const container =
    document.getElementById(
      "casesList"
    );

  const popular =
    document.getElementById(
      "popularCases"
    );

  if (!container) return;

  if (!cases.length) {

    container.innerHTML =
      `<div class="empty">
        📦 Кейсов пока нет
      </div>`;

    return;
  }

  const html =
    cases.map(renderCaseCard)
    .join("");

  container.innerHTML =
    html;

  if (popular) {

    popular.innerHTML =
      cases
        .slice(0, 2)
        .map(renderCaseCard)
        .join("");
  }
}


function renderCaseCard(item) {

  const premium =
    Number(item.premium) === 1;

  const price =
    premium
      ? `⭐ ${item.price_stars}`
      : `🪙 ${item.price_coins}`;

  return `
    <div class="case-card">

      <div class="case-emoji">
        ${escapeHtml(item.emoji)}
      </div>

      <div class="case-name">
        ${escapeHtml(item.name)}
      </div>

      <div class="case-description">
        ${escapeHtml(
          item.description || ""
        )}
      </div>

      <div class="case-price">
        ${price}
      </div>

      <button
        class="primary"
        onclick="openCase(${Number(item.id)})"
      >
        ${premium
          ? "Выбрать Premium"
          : "Открыть"}
      </button>

    </div>
  `;
}


async function openCase(caseId) {

  const item =
    cases.find(
      x =>
        Number(x.id) ===
        Number(caseId)
    );

  if (!item) return;

  currentCase =
    item;

  const data =
    await api(
      "/cases/rewards?case_id=" +
      encodeURIComponent(caseId)
    );

  currentRewards =
    data.rewards || [];

  renderCaseView();

  showPage("caseView");
}


function renderCaseView() {

  const info =
    document.getElementById(
      "caseInfo"
    );

  const container =
    document.getElementById(
      "caseRewards"
    );

  if (!currentCase) return;

  const premium =
    Number(
      currentCase.premium
    ) === 1;

  info.innerHTML = `
    <div class="case-big-icon">
      ${escapeHtml(
        currentCase.emoji
      )}
    </div>

    <h1>
      ${escapeHtml(
        currentCase.name
      )}
    </h1>

    <p>
      ${escapeHtml(
        currentCase.description || ""
      )}
    </p>

    <div class="case-price">
      ${
        premium
          ? "⭐ " +
            currentCase.price_stars +
            " Stars"
          : "🪙 " +
            currentCase.price_coins +
            " Coins"
      }
    </div>
  `;

  container.innerHTML =
    currentRewards
      .map(reward => {

        const rarity =
          rarityName(
            reward.rarity
          );

        return `
          <div class="reward-card">

            <div class="reward-icon">
              ${escapeHtml(
                reward.emoji
              )}
            </div>

            <div class="reward-name">
              ${escapeHtml(
                reward.name
              )}
            </div>

            <div class="rarity">
              ${rarity}
            </div>

            <div class="reward-value">
              🪙 ${Number(
                reward.value_coins
              )}
            </div>

            <button
              class="buy"
              onclick="claimReward(
                ${Number(currentCase.id)},
                ${Number(reward.id)}
              )"
            >
              Выбрать
            </button>

          </div>
        `;

      })
      .join("");
}


async function claimReward(
  caseId,
  rewardId
) {

  if (!currentUser) return;

  const item =
    cases.find(
      x =>
        Number(x.id) ===
        Number(caseId)
    );

  if (!item) return;

  if (Number(item.premium) === 1) {

    showMessage(
      "Premium Case",
      "Оплата 15 Stars будет подключена через Telegram Payments. После оплаты награда будет выдана сервером."
    );

    return;
  }

  if (
    Number(currentUser.coins || 0) <
    Number(item.price_coins || 0)
  ) {

    showMessage(
      "Недостаточно Coins",
      "Выполни задания, чтобы получить Coins."
    );

    return;
  }

  try {

    const data =
      await api(
        "/cases/open",
        {
          method: "POST",

          body:
            JSON.stringify({
              user_id:
                currentUser.id,

              case_id:
                caseId,

              reward_id:
                rewardId
            })
        }
      );

    currentUser.coins =
      Number(data.coins || 0);

    updateBalances();

    await loadInventory();

    showMessage(
      "🎉 Награда получена",
      `${data.reward.emoji} ${data.reward.name}\n\nСтоимость: 🪙 ${data.reward.value_coins}`
    );

    showPage("inventory");

  } catch (error) {

    showMessage(
      "Ошибка",
      error.message
    );
  }
}


/* =========================
   TASKS
========================= */

async function loadTasks() {

  if (!currentUser) return;

  const container =
    document.getElementById(
      "tasksList"
    );

  if (!container) return;

  try {

    const data =
      await api(
        "/tasks?user_id=" +
        encodeURIComponent(
          currentUser.id
        )
      );

    tasks =
      data.tasks || [];

    renderTasks();

    await loadCoins();

  } catch (error) {

    console.error(error);

    container.innerHTML =
      `<div class="empty">
        ❌ Ошибка загрузки заданий
      </div>`;
  }
}


function renderTasks() {

  const container =
    document.getElementById(
      "tasksList"
    );

  if (!tasks.length) {

    container.innerHTML =
      `<div class="empty">
        🎯 Сейчас нет заданий
      </div>`;

    return;
  }

  container.innerHTML =
    tasks.map(task => {

      const completed =
        Number(task.completed) === 1;

      return `
        <div class="task-card">

          <div class="task-icon">
            🎯
          </div>

          <div class="gift-name">
            ${escapeHtml(
              task.title
            )}
          </div>

          <div class="gift-description">
            ${escapeHtml(
              task.description || ""
            )}
          </div>

          <div class="reward-value">
            🪙 +${Number(
              task.reward || 0
            )}
          </div>

          ${
            completed
              ? `
                <button
                  class="buy"
                  disabled
                >
                  ✓ Получено
                </button>
              `
              : `
                <button
                  class="primary"
                  onclick="completeTask(
                    ${Number(task.id)}
                  )"
                >
                  Получить
                </button>
              `
          }

        </div>
      `;
    }).join("");
}


async function completeTask(taskId) {

  try {

    const data =
      await api(
        "/tasks/complete",
        {
          method: "POST",

          body:
            JSON.stringify({
              user_id:
                currentUser.id,

              task_id:
                taskId
            })
        }
      );

    currentUser.coins =
      Number(data.coins || 0);

    updateBalances();

    showMessage(
      "🎉 Готово",
      `Начислено 🪙 ${data.reward}`
    );

    await loadTasks();

  } catch (error) {

    showMessage(
      "Ошибка",
      error.message
    );
  }
}


/* =========================
   INVENTORY
========================= */

async function loadInventory() {

  if (!currentUser) return;

  const data =
    await api(
      "/inventory?user_id=" +
      encodeURIComponent(
        currentUser.id
      )
    );

  inventory =
    data.inventory || [];

  renderInventory();

  setText(
    "inventoryCount",
    inventory.length
  );
}


function renderInventory() {

  const container =
    document.getElementById(
      "inventoryList"
    );

  if (!inventory.length) {

    container.innerHTML =
      `<div class="empty">
        🎒 Инвентарь пока пуст
      </div>`;

    return;
  }

  container.innerHTML =
    inventory.map(item => `
      <div class="gift-card">

        <div class="gift-icon">
          ${escapeHtml(
            item.emoji || "🎁"
          )}
        </div>

        <div class="gift-name">
          ${escapeHtml(
            item.name
          )}
        </div>

        <div class="price">
          ⭐ ${Number(
            item.price || 0
          )}
        </div>

      </div>
    `).join("");
}


/* =========================
   RATING
========================= */

async function loadRating(type) {

  const container =
    document.getElementById(
      "ratingList"
    );

  if (!container) return;

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем рейтинг...
    </div>`;

  try {

    const data =
      await api(
        "/rating?type=" +
        encodeURIComponent(type)
      );

    renderRating(
      data.rating || []
    );

  } catch (error) {

    container.innerHTML =
      `<div class="empty">
        ❌ Ошибка рейтинга
      </div>`;
  }
}


function renderRating(list) {

  const container =
    document.getElementById(
      "ratingList"
    );

  if (!list.length) {

    container.innerHTML =
      `<div class="empty">
        Пока нет данных
      </div>`;

    return;
  }

  container.innerHTML =
    list.map(
      (user, index) => {

        const name =
          user.username
            ? "@" + user.username
            : user.first_name ||
              "Пользователь";

        return `
          <div class="rating-row">

            <div class="rating-place">
              #${index + 1}
            </div>

            <div class="rating-user">
              ${escapeHtml(name)}
            </div>

            <div class="rating-value">
              ${Number(
                user.value || 0
              )}
            </div>

          </div>
        `;
      }
    ).join("");
}


/* =========================
   REFERRALS
========================= */

function createReferralLink() {

  if (!currentUser) return;

  const element =
    document.getElementById(
      "refLink"
    );

  if (!element) return;

  element.textContent =
    "https://t.me/VldstxCase_bot?start=ref_" +
    currentUser.id;
}


async function copyReferral() {

  const element =
    document.getElementById(
      "refLink"
    );

  if (!element) return;

  try {

    await navigator.clipboard.writeText(
      element.textContent
    );

    showMessage(
      "Готово",
      "Ссылка скопирована"
    );

  } catch {

    alert(
      element.textContent
    );
  }
}


/* =========================
   POPUP
========================= */

function showMessage(
  title,
  message
) {

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
      title +
      "\n\n" +
      message
    );
  }
}


/* =========================
   HELPERS
========================= */

function rarityName(rarity) {

  const names = {
    common: "🟢 Обычный",
    rare: "🔵 Редкий",
    epic: "🟣 Эпический",
    legendary: "🟡 Легендарный",
    premium: "⭐ Premium"
  };

  return names[rarity] ||
    "🎁 Награда";
}


function setText(
  id,
  value
) {

  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}


function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* =========================
   START
========================= */

async function init() {

  try {

    await loadUser();

    await loadGifts();

    await loadInventory();

    await loadCoins();

    await loadCases();

    showPage("home");

  } catch (error) {

    console.error(
      "Ошибка запуска:",
      error
    );
  }
}


async function loadGifts() {

  try {

    const data =
      await api("/gifts");

    gifts =
      data.gifts || [];

  } catch (error) {

    console.error(error);
  }
}


document.addEventListener(
  "DOMContentLoaded",
  init
);
