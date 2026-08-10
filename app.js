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
let openingCase = false;

/* =====================================================
   TELEGRAM USER
===================================================== */

function getTelegramUser() {
  const user = tg?.initDataUnsafe?.user;

  if (user && user.id) {
    return user;
  }

  return {
    id: 100000001,
    username: "test_user",
    first_name: "Тестовый пользователь"
  };
}

/* =====================================================
   API
===================================================== */

async function api(path, options = {}) {
  try {
    const response = await fetch(API + path, {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        "Сервер вернул некорректный ответ"
      );
    }

    if (!response.ok || data.ok === false) {
      throw new Error(
        data.error ||
        data.message ||
        `Ошибка сервера: ${response.status}`
      );
    }

    return data;

  } catch (error) {
    console.error("API ERROR:", error);
    throw error;
  }
}

/* =====================================================
   NAVIGATION
===================================================== */

function showPage(page) {
  document
    .querySelectorAll(".page")
    .forEach(element => {
      element.classList.remove("active");
    });

  const target =
    document.getElementById(page);

  if (!target) {
    console.error(
      "Страница не найдена:",
      page
    );
    return;
  }

  target.classList.add("active");

  document
    .querySelectorAll(".bottom-nav button")
    .forEach(button => {
      button.classList.remove("active");
    });

  const activeButton =
    document.querySelector(
      `.bottom-nav button[data-page="${page}"]`
    );

  if (activeButton) {
    activeButton.classList.add("active");
  }

  if (page === "cases") {
    loadCases().catch(console.error);
  }

  if (page === "tasks") {
    loadTasks().catch(console.error);
  }

  if (page === "inventory") {
    loadInventory().catch(console.error);
  }

  if (page === "referrals") {
    loadReferrals().catch(console.error);
  }

  if (page === "ranking") {
    loadRanking("coins").catch(console.error);
  }
}

/* =====================================================
   USER
===================================================== */

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

  const username =
    document.getElementById("username");

  if (username) {
    username.textContent =
      currentUser.username
        ? "@" + currentUser.username
        : currentUser.first_name ||
          "Пользователь";
  }

  const telegramId =
    document.getElementById("telegramId");

  if (telegramId) {
    telegramId.textContent =
      "ID: " + currentUser.id;
  }

  const avatar =
    document.getElementById("avatar");

  if (avatar) {
    avatar.textContent =
      (
        currentUser.first_name ||
        "U"
      )
        .charAt(0)
        .toUpperCase();
  }
}

/* =====================================================
   BALANCES
===================================================== */

function updateUserBalance() {
  if (!currentUser) {
    return;
  }

  const stars =
    Number(currentUser.balance || 0);

  const coins =
    Number(currentUser.coins || 0);

  const balance =
    document.getElementById("balance");

  if (balance) {
    balance.textContent = stars;
  }

  const profileBalance =
    document.getElementById("profileBalance");

  if (profileBalance) {
    profileBalance.textContent = stars;
  }

  const coinsElement =
    document.getElementById("coins");

  if (coinsElement) {
    coinsElement.textContent = coins;
  }

  const profileCoins =
    document.getElementById("profileCoins");

  if (profileCoins) {
    profileCoins.textContent = coins;
  }

  const tasksCoins =
    document.getElementById("tasksCoins");

  if (tasksCoins) {
    tasksCoins.textContent = coins;
  }
}

async function loadCoins() {
  if (!currentUser) {
    return;
  }

  const data =
    await api(
      "/coins?user_id=" +
      encodeURIComponent(currentUser.id)
    );

  currentUser.coins =
    Number(data.coins || 0);

  updateUserBalance();
}

/* =====================================================
   GIFTS
===================================================== */

async function loadGifts() {
  try {
    const data =
      await api("/gifts");

    gifts =
      data.gifts || [];

    return gifts;

  } catch (error) {
    console.error(
      "Ошибка загрузки подарков:",
      error
    );

    gifts = [];

    return [];
  }
}

/* =====================================================
   CASES
===================================================== */

async function loadCases() {
  const container =
    document.getElementById("casesList");

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем кейсы...
    </div>`;

  try {
    const data =
      await api("/cases");

    cases =
      Array.isArray(data.cases)
        ? data.cases
        : [];

    renderCases();
    renderPopularCases();

  } catch (error) {
    console.error(
      "Ошибка загрузки кейсов:",
      error
    );

    cases = [];

    container.innerHTML =
      `<div class="empty">
        ❌ Не удалось загрузить кейсы
        <br><br>
        ${escapeHtml(error.message)}
      </div>`;
  }
}

function renderCases() {
  const container =
    document.getElementById("casesList");

  if (!container) {
    return;
  }

  if (!cases.length) {
    container.innerHTML =
      `<div class="empty">
        🎁 Кейсов пока нет
      </div>`;

    return;
  }

  container.innerHTML =
    cases
      .map(gameCase => {
        const isStars =
          gameCase.type === "stars";

        const price =
          isStars
            ? `⭐ ${Number(gameCase.stars_price || 0)}`
            : `🪙 ${Number(gameCase.price_coins || 0)}`;

        return `
          <div class="case-card">

            <div class="case-icon">
              ${escapeHtml(
                gameCase.emoji || "🎁"
              )}
            </div>

            <div class="case-name">
              ${escapeHtml(
                gameCase.name || "Кейс"
              )}
            </div>

            <div class="case-description">
              ${escapeHtml(
                gameCase.description ||
                "Открой кейс и получи подарок"
              )}
            </div>

            <div class="case-price">
              ${price}
            </div>

            <button
              class="primary"
              onclick="openCaseDetails(${Number(gameCase.id)})"
            >
              ${isStars
                ? "⭐ Подробнее"
                : "🎁 Открыть"}
            </button>

          </div>
        `;
      })
      .join("");
}

function renderPopularCases() {
  const container =
    document.getElementById("popularCases");

  if (!container) {
    return;
  }

  const popular =
    cases.slice(0, 3);

  if (!popular.length) {
    container.innerHTML =
      `<div class="empty">
        🎁 Кейсов пока нет
      </div>`;

    return;
  }

  container.innerHTML =
    popular
      .map(gameCase => {
        const price =
          gameCase.type === "stars"
            ? `⭐ ${Number(gameCase.stars_price || 0)}`
            : `🪙 ${Number(gameCase.price_coins || 0)}`;

        return `
          <div class="case-card">

            <div class="case-icon">
              ${escapeHtml(
                gameCase.emoji || "🎁"
              )}
            </div>

            <div class="case-name">
              ${escapeHtml(
                gameCase.name || "Кейс"
              )}
            </div>

            <div class="case-price">
              ${price}
            </div>

            <button
              class="primary"
              onclick="openCaseDetails(${Number(gameCase.id)})"
            >
              Открыть
            </button>

          </div>
        `;
      })
      .join("");
}

/* =====================================================
   CASE DETAILS
===================================================== */

async function openCaseDetails(caseId) {
  const gameCase =
    cases.find(
      item =>
        Number(item.id) === Number(caseId)
    );

  if (!gameCase) {
    showMessage(
      "Ошибка",
      "Кейс не найден"
    );

    return;
  }

  currentCase =
    gameCase;

  showPage("caseDetails");

  const container =
    document.getElementById(
      "caseDetailsContent"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем награды...
    </div>`;

  try {
    const data =
      await api(
        "/cases/items?case_id=" +
        encodeURIComponent(caseId)
      );

    const items =
      Array.isArray(data.items)
        ? data.items
        : [];

    renderCaseDetails(
      gameCase,
      items
    );

  } catch (error) {
    console.error(
      "Ошибка загрузки содержимого кейса:",
      error
    );

    container.innerHTML =
      `<div class="empty">
        ❌ Не удалось загрузить содержимое кейса
        <br><br>
        ${escapeHtml(error.message)}
      </div>`;
  }
}

function renderCaseDetails(
  gameCase,
  items
) {
  const container =
    document.getElementById(
      "caseDetailsContent"
    );

  if (!container) {
    return;
  }

  const isStars =
    gameCase.type === "stars";

  const price =
    isStars
      ? `⭐ ${Number(gameCase.stars_price || 0)}`
      : `🪙 ${Number(gameCase.price_coins || 0)}`;

  let button;

  if (isStars) {
    button = `
      <button
        class="primary"
        disabled
        style="opacity:.55"
      >
        ⭐ Stars-покупка
      </button>

      <p class="notice">
        Покупка за Stars пока отключена.
      </p>
    `;
  } else {
    button = `
      <button
        class="primary open-case-button"
        onclick="openCase(${Number(gameCase.id)})"
      >
        🎁 Открыть за
        🪙 ${Number(gameCase.price_coins || 0)}
      </button>
    `;
  }

  container.innerHTML = `
    <div class="case-detail">

      <div class="big-case-icon">
        ${escapeHtml(
          gameCase.emoji || "🎁"
        )}
      </div>

      <h1>
        ${escapeHtml(
          gameCase.name || "Кейс"
        )}
      </h1>

      <p>
        ${escapeHtml(
          gameCase.description ||
          "Открой кейс и получи случайный подарок"
        )}
      </p>

      <div class="case-detail-price">
        ${price}
      </div>

      <div class="case-items-title">
        🎁 Возможные награды
      </div>

      <div class="case-rewards">
        ${
          items.length
            ? items
                .map(item => `
                  <div class="reward-card">

                    <div class="reward-icon">
                      ${escapeHtml(
                        item.emoji || "🎁"
                      )}
                    </div>

                    <div class="reward-info">

                      <b>
                        ${escapeHtml(
                          item.name || "Подарок"
                        )}
                      </b>

                      <span>
                        ${Number(
                          item.chance || 0
                        )}% шанс
                      </span>

                      <small>
                        Цена:
                        ${Number(
                          item.price || 0
                        )}
                      </small>

                    </div>

                  </div>
                `)
                .join("")
            : `
              <div class="empty">
                Наград пока нет
              </div>
            `
        }
      </div>

      ${button}

    </div>
  `;
}

/* =====================================================
   OPEN CASE
===================================================== */

async function openCase(caseId) {
  if (!currentUser) {
    showMessage(
      "Ошибка",
      "Пользователь ещё не загружен"
    );

    return;
  }

  if (openingCase) {
    return;
  }

  const gameCase =
    cases.find(
      item =>
        Number(item.id) === Number(caseId)
    );

  if (!gameCase) {
    showMessage(
      "Ошибка",
      "Кейс не найден"
    );

    return;
  }

  if (gameCase.type !== "coins") {
    showMessage(
      "⭐ Stars",
      "Этот кейс сейчас открывается только за Stars."
    );

    return;
  }

  const price =
    Number(gameCase.price_coins || 0);

  if (price <= 0) {
    showMessage(
      "Ошибка",
      "У кейса неправильная цена"
    );

    return;
  }

  if (
    Number(currentUser.coins || 0) <
    price
  ) {
    showMessage(
      "Недостаточно Coins",
      `Нужно 🪙 ${price} Coins`
    );

    return;
  }

  openingCase = true;

  const button =
    document.querySelector(
      ".open-case-button"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Открываем...";
  }

  try {
    const data =
      await api(
        "/cases/open",
        {
          method: "POST",

          body: JSON.stringify({
            user_id:
              currentUser.id,

            case_id:
              Number(caseId)
          })
        }
      );

    currentUser.coins =
      Number(data.coins || 0);

    updateUserBalance();

    showReward(
      data.reward
    );

    await loadInventory();

  } catch (error) {
    console.error(
      "Ошибка открытия кейса:",
      error
    );

    showMessage(
      "Ошибка",
      error.message ||
      "Не удалось открыть кейс"
    );

    await loadCoins();

  } finally {
    openingCase = false;

    if (button) {
      button.disabled = false;
      button.textContent =
        `🎁 Открыть за 🪙 ${price}`;
    }
  }
}

function showReward(reward) {
  if (!reward) {
    showMessage(
      "Кейс открыт",
      "Подарок получен!"
    );

    return;
  }

  const message =
    `${reward.emoji || "🎁"} ${reward.name || "Подарок"}\n\n` +
    `Стоимость: ${Number(reward.price || 0)}\n\n` +
    `Шанс: ${Number(reward.chance || 0)}%`;

  showMessage(
    "🎉 Кейс открыт!",
    message
  );
}

/* =====================================================
   TASKS
===================================================== */

async function loadTasks() {
  if (!currentUser) {
    return;
  }

  const container =
    document.getElementById("tasksList");

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем задания...
    </div>`;

  try {
    const data =
      await api(
        "/tasks?user_id=" +
        encodeURIComponent(
          currentUser.id
        )
      );

    tasks =
      Array.isArray(data.tasks)
        ? data.tasks
        : [];

    renderTasks();

    await loadCoins();

  } catch (error) {
    console.error(
      "Ошибка загрузки заданий:",
      error
    );

    container.innerHTML =
      `<div class="empty">
        ❌ Не удалось загрузить задания
        <br><br>
        ${escapeHtml(error.message)}
      </div>`;
  }
}

function renderTasks() {
  const container =
    document.getElementById("tasksList");

  if (!container) {
    return;
  }

  if (!tasks.length) {
    container.innerHTML =
      `<div class="empty">
        🎯 Сейчас нет доступных заданий
      </div>`;

    return;
  }

  container.innerHTML =
    tasks
      .map(task => {
        const completed =
          Number(task.completed) === 1;

        return `
          <div class="gift-card">

            <div class="gift-icon">
              🎯
            </div>

            <div class="gift-name">
              ${escapeHtml(
                task.title || "Задание"
              )}
            </div>

            <div class="gift-description">
              ${escapeHtml(
                task.description ||
                "Выполни задание и получи награду"
              )}
            </div>

            <div class="price">
              🪙 +${Number(
                task.reward || 0
              )}
            </div>

            <div class="gift-bottom">

              ${
                completed
                  ? `
                    <button
                      class="buy"
                      disabled
                      style="opacity:.5"
                    >
                      ✓ Получено
                    </button>
                  `
                  : `
                    <button
                      class="buy"
                      onclick="completeTask(${Number(task.id)})"
                    >
                      Получить
                    </button>
                  `
              }

            </div>

          </div>
        `;
      })
      .join("");
}

async function completeTask(taskId) {
  if (!currentUser) {
    return;
  }

  try {
    const data =
      await api(
        "/tasks/complete",
        {
          method: "POST",

          body: JSON.stringify({
            user_id:
              currentUser.id,

            task_id:
              Number(taskId)
          })
        }
      );

    currentUser.coins =
      Number(data.coins || 0);

    updateUserBalance();

    showMessage(
      "🎉 Награда",
      `Получено 🪙 ${Number(data.reward || 0)} Coins`
    );

    await loadTasks();

  } catch (error) {
    console.error(
      "Ошибка выполнения задания:",
      error
    );

    showMessage(
      "Ошибка",
      error.message ||
      "Не удалось получить награду"
    );
  }
}

/* =====================================================
   INVENTORY
===================================================== */

async function loadInventory() {
  if (!currentUser) {
    return;
  }

  const container =
    document.getElementById(
      "inventoryList"
    );

  if (container) {
    container.innerHTML =
      `<div class="empty">
        ⏳ Загружаем инвентарь...
      </div>`;
  }

  try {
    const data =
      await api(
        "/inventory?user_id=" +
        encodeURIComponent(
          currentUser.id
        )
      );

    inventory =
      Array.isArray(data.inventory)
        ? data.inventory
        : [];

    renderInventory();

    const count =
      document.getElementById(
        "inventoryCount"
      );

    if (count) {
      count.textContent =
        inventory.length;
    }

  } catch (error) {
    console.error(
      "Ошибка инвентаря:",
      error
    );

    if (container) {
      container.innerHTML =
        `<div class="empty">
          ❌ Не удалось загрузить инвентарь
        </div>`;
    }
  }
}

function renderInventory() {
  const container =
    document.getElementById(
      "inventoryList"
    );

  if (!container) {
    return;
  }

  if (!inventory.length) {
    container.innerHTML =
      `<div class="empty">
        🎒 Инвентарь пока пуст
      </div>`;

    return;
  }

  container.innerHTML =
    inventory
      .map(item => `
        <div class="gift-card">

          <div class="gift-icon">
            ${escapeHtml(
              item.emoji || "🎁"
            )}
          </div>

          <div class="gift-name">
            ${escapeHtml(
              item.name || "Подарок"
            )}
          </div>

          <div class="gift-description">
            ${escapeHtml(
              item.description || ""
            )}
          </div>

          <div class="price">
            ⭐ ${Number(
              item.price || 0
            )}
          </div>

        </div>
      `)
      .join("");
}

/* =====================================================
   REFERRALS
===================================================== */

async function loadReferrals() {
  if (!currentUser) {
    return;
  }

  try {
    const data =
      await api(
        "/referrals?user_id=" +
        encodeURIComponent(
          currentUser.id
        )
      );

    const count =
      document.getElementById(
        "referralCount"
      );

    if (count) {
      count.textContent =
        Number(
          data.referrals || 0
        );
    }

    /*
      Worker сейчас возвращает только количество
      рефералов.

      Поэтому настоящую Telegram-ссылку
      создаём здесь.
    */

    const botUsername =
      window.BOT_USERNAME ||
      tg?.initDataUnsafe?.user?.username;

    const link =
      document.getElementById(
        "refLink"
      );

    if (link) {
      if (botUsername) {
        link.textContent =
          `https://t.me/${botUsername}?start=ref_${currentUser.id}`;
      } else {
        link.textContent =
          `ref_${currentUser.id}`;
      }
    }

  } catch (error) {
    console.error(
      "Ошибка рефералов:",
      error
    );
  }
}

async function copyReferral() {
  const element =
    document.getElementById(
      "refLink"
    );

  if (!element) {
    return;
  }

  const link =
    element.textContent.trim();

  if (!link) {
    showMessage(
      "Ошибка",
      "Реферальная ссылка ещё не создана"
    );

    return;
  }

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

/* =====================================================
   RANKING
===================================================== */

async function loadRanking(
  type = "coins",
  button = null
) {
  const container =
    document.getElementById(
      "rankingList"
    );

  if (!container) {
    return;
  }

  if (button) {
    document
      .querySelectorAll(
        ".ranking-tab"
      )
      .forEach(element => {
        element.classList.remove(
          "active"
        );
      });

    button.classList.add("active");
  }

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем рейтинг...
    </div>`;

  try {
    let endpoint;

    if (type === "referrals") {
      endpoint =
        "/rating/referrals";
    } else {
      endpoint =
        "/rating/coins";
    }

    const data =
      await api(endpoint);

    const ranking =
      Array.isArray(data.rating)
        ? data.rating
        : [];

    if (!ranking.length) {
      container.innerHTML =
        `<div class="empty">
          🏆 Пока нет участников
        </div>`;

      return;
    }

    container.innerHTML =
      ranking
        .map((player, index) => {
          const name =
            player.username
              ? "@" + player.username
              : player.first_name ||
                "Игрок";

          const score =
            type === "referrals"
              ? Number(
                  player.referrals || 0
                )
              : Number(
                  player.coins || 0
                );

          return `
            <div class="ranking-item">

              <div class="ranking-place">
                ${
                  index === 0
                    ? "🥇"
                    : index === 1
                    ? "🥈"
                    : index === 2
                    ? "🥉"
                    : "#" +
                      (index + 1)
                }
              </div>

              <div class="ranking-name">
                ${escapeHtml(name)}
              </div>

              <div class="ranking-score">
                ${
                  type === "referrals"
                    ? "👥 "
                    : "🪙 "
                }
                ${score}
              </div>

            </div>
          `;
        })
        .join("");

  } catch (error) {
    console.error(
      "Ошибка рейтинга:",
      error
    );

    container.innerHTML =
      `<div class="empty">
        ❌ Ошибка загрузки рейтинга
        <br><br>
        ${escapeHtml(error.message)}
      </div>`;
  }
}

/* =====================================================
   POPUP
===================================================== */

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

/* =====================================================
   HTML SECURITY
===================================================== */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

/* =====================================================
   INIT
===================================================== */

async function init() {
  try {
    await loadUser();

    await Promise.all([
      loadGifts(),
      loadCases(),
      loadInventory(),
      loadCoins()
    ]);

    showPage("home");

  } catch (error) {
    console.error(
      "ОШИБКА ЗАПУСКА:",
      error
    );

    showMessage(
      "Ошибка",
      error.message ||
      "Не удалось загрузить приложение"
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
