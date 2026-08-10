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
let currentCaseItems = [];


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
   NAVIGATION
========================= */

function showPage(page) {
  document.querySelectorAll(".page").forEach(el => {
    el.classList.remove("active");
  });

  const target = document.getElementById(page);

  if (!target) return;

  target.classList.add("active");

  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.classList.remove("active");
  });

  const button = document.querySelector(
    `.bottom-nav button[data-page="${page}"]`
  );

  if (button) {
    button.classList.add("active");
  }

  if (page === "inventory") loadInventory();
  if (page === "tasks") loadTasks();
  if (page === "cases") loadCases();
  if (page === "referrals") loadReferrals();
  if (page === "rating") loadLeaderboard("coins");
}


/* =========================
   USER
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

  updateBalance();

  const username = document.getElementById("username");
  const telegramId = document.getElementById("telegramId");
  const avatar = document.getElementById("avatar");

  if (username) {
    username.textContent = currentUser.username
      ? "@" + currentUser.username
      : currentUser.first_name || "Пользователь";
  }

  if (telegramId) {
    telegramId.textContent = "ID: " + currentUser.id;
  }

  if (avatar) {
    avatar.textContent =
      (currentUser.first_name || "U")
        .charAt(0)
        .toUpperCase();
  }
}


/* =========================
   BALANCE
========================= */

function updateBalance() {
  if (!currentUser) return;

  const coins = Number(currentUser.coins || 0);
  const stars = Number(currentUser.balance || 0);

  const elements = [
    ["coins", coins],
    ["tasksCoins", coins],
    ["profileCoins", coins],
    ["balance", stars],
    ["profileBalance", stars]
  ];

  elements.forEach(([id, value]) => {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  });
}

async function loadCoins() {
  if (!currentUser) return;

  const data = await api(
    "/coins?user_id=" +
    encodeURIComponent(currentUser.id)
  );

  currentUser.coins = Number(data.coins || 0);

  updateBalance();
}


/* =========================
   GIFTS
========================= */

async function loadGifts() {
  const data = await api("/gifts");

  gifts = data.gifts || [];

  renderGifts();
}

function renderGifts() {
  const container = document.getElementById("gifts");

  if (!container) return;

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
        ${escapeHtml(
          gift.description || "Коллекционный подарок"
        )}
      </div>

      <div class="gift-bottom">
        <span class="price">
          ⭐ ${Number(gift.price || 0)}
        </span>
      </div>
    </div>
  `).join("");
}


/* =========================
   CASES
========================= */

async function loadCases() {
  const container = document.getElementById("casesList");

  if (!container) return;

  container.innerHTML =
    `<div class="empty">⏳ Загружаем кейсы...</div>`;

  try {
    const data = await api("/cases");

    cases = data.cases || [];

    renderCases();
  } catch (error) {
    container.innerHTML =
      `<div class="empty">❌ ${escapeHtml(error.message)}</div>`;
  }
}

function renderCases() {
  const container = document.getElementById("casesList");

  if (!container) return;

  if (!cases.length) {
    container.innerHTML =
      `<div class="empty">🎁 Кейсов пока нет</div>`;
    return;
  }

  container.innerHTML = cases.map(item => `
    <div class="case-card">
      <div class="case-icon">🎁</div>

      <div class="case-name">
        ${escapeHtml(item.name)}
      </div>

      <div class="case-description">
        Несколько подарков с разными шансами
      </div>

      <button
        class="primary"
        onclick="openCaseInfo(${Number(item.id)})">
        Открыть
      </button>
    </div>
  `).join("");
}

async function openCaseInfo(caseId) {
  try {
    const data = await api(
      "/case?case_id=" + encodeURIComponent(caseId)
    );

    currentCaseItems = data.items || [];

    const selected = cases.find(
      item => Number(item.id) === Number(caseId)
    );

    if (!selected) return;

    let text =
      `🎁 ${selected.name}\n\n` +
      `Предметы:\n\n`;

    currentCaseItems.forEach(item => {
      text +=
        `${item.emoji || "🎁"} ${item.name} — ` +
        `${Number(item.chance)}%\n`;
    });

    text +=
      `\nОткрытие выполняется за Coins.`;

    if (tg?.showPopup) {
      tg.showPopup({
        title: selected.name,
        message: text,
        buttons: [
          {
            id: "open",
            type: "default",
            text: "Открыть"
          },
          {
            type: "cancel",
            text: "Закрыть"
          }
        ]
      }, async id => {
        if (id === "open") {
          await openCoinCase(caseId);
        }
      });
    } else {
      if (confirm(text + "\n\nОткрыть?")) {
        await openCoinCase(caseId);
      }
    }

  } catch (error) {
    showMessage("Ошибка", error.message);
  }
}

async function openCoinCase(caseId) {
  if (!currentUser) return;

  try {
    const data = await api("/cases/open", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUser.id,
        case_id: caseId
      })
    });

    currentUser.coins =
      Number(data.coins || 0);

    updateBalance();

    await loadInventory();

    showMessage(
      "🎉 Поздравляем!",
      `${data.reward.emoji || "🎁"} ${data.reward.name}\n\n` +
      `Предмет добавлен в инвентарь.`
    );

  } catch (error) {
    showMessage(
      "Не удалось открыть",
      error.message
    );
  }
}


/* =========================
   TASKS
========================= */

async function loadTasks() {
  if (!currentUser) return;

  const container = document.getElementById("tasksList");

  if (!container) return;

  try {
    const data = await api(
      "/tasks?user_id=" +
      encodeURIComponent(currentUser.id)
    );

    tasks = data.tasks || [];

    renderTasks();

    await loadCoins();
  } catch (error) {
    container.innerHTML =
      `<div class="empty">❌ Не удалось загрузить задания</div>`;
  }
}

function renderTasks() {
  const container = document.getElementById("tasksList");

  if (!container) return;

  if (!tasks.length) {
    container.innerHTML =
      `<div class="empty">🎯 Сейчас нет заданий</div>`;
    return;
  }

  container.innerHTML = tasks.map(task => {
    const completed =
      Number(task.completed) === 1;

    return `
      <div class="task-card">
        <div class="task-icon">🎯</div>

        <div class="task-title">
          ${escapeHtml(task.title)}
        </div>

        <div class="task-description">
          ${escapeHtml(
            task.description ||
            "Выполни задание"
          )}
        </div>

        <div class="price">
          🪙 +${Number(task.reward || 0)}
        </div>

        ${
          completed
            ? `
              <button class="buy" disabled>
                ✓ Получено
              </button>
            `
            : `
              <button
                class="primary"
                onclick="completeTask(${Number(task.id)})">
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
    const data = await api(
      "/tasks/complete",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUser.id,
          task_id: taskId
        })
      }
    );

    currentUser.coins =
      Number(data.coins || 0);

    updateBalance();

    showMessage(
      "🎉 Награда",
      `Получено 🪙 ${data.reward}`
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
      `<div class="empty">🎒 Инвентарь пуст</div>`;
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
   REFERRALS
========================= */

async function loadReferrals() {
  if (!currentUser) return;

  try {
    const data = await api(
      "/referrals?user_id=" +
      encodeURIComponent(currentUser.id)
    );

    const link =
      document.getElementById("refLink");

    const count =
      document.getElementById("refCount");

    if (link) {
      link.textContent = data.link;
    }

    if (count) {
      count.textContent = data.count;
    }

  } catch (error) {
    console.error(error);
  }
}

async function copyReferral() {
  const element =
    document.getElementById("refLink");

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
    alert(element.textContent);
  }
}


/* =========================
   LEADERBOARD
========================= */

async function loadLeaderboard(type) {
  const container =
    document.getElementById("leaderboard");

  if (!container) return;

  container.innerHTML =
    `<div class="empty">⏳ Загружаем рейтинг...</div>`;

  try {
    const data = await api(
      "/leaderboard?type=" + encodeURIComponent(type)
    );

    if (!data.leaderboard.length) {
      container.innerHTML =
        `<div class="empty">🏆 Пока нет игроков</div>`;
      return;
    }

    container.innerHTML =
      data.leaderboard.map((user, index) => `
        <div class="leader-row">

          <div class="leader-place">
            #${index + 1}
          </div>

          <div class="leader-name">
            ${
              user.username
                ? "@" + escapeHtml(user.username)
                : escapeHtml(
                    user.first_name || "Игрок"
                  )
            }
          </div>

          <div class="leader-score">
            ${Number(user.score || 0)}
          </div>

        </div>
      `).join("");

  } catch (error) {
    container.innerHTML =
      `<div class="empty">❌ ${escapeHtml(error.message)}</div>`;
  }
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
    alert(title + "\n\n" + message);
  }
}


/* =========================
   HTML ESCAPE
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
   INIT
========================= */

async function init() {
  try {
    await loadUser();
    await loadGifts();
    await loadInventory();
    await loadCoins();
    await loadCases();
    await loadReferrals();

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
