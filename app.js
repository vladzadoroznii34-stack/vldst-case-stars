const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const API = "/api";

let currentUser = null;
let cases = [];
let currentCase = null;


/* =========================
   TELEGRAM USER
========================= */

function getTelegramUser() {

  const user = tg?.initDataUnsafe?.user;

  if (user) {
    return user;
  }

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

  const data = await response.json();

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
    loadCases();
  }

  if (page === "tasks") {
    loadTasks();
  }

  if (page === "inventory") {
    loadInventory();
  }

  if (page === "referrals") {
    loadReferrals();
  }

  if (page === "ranking") {
    loadRanking("coins");
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

  updateBalance();

  document
    .getElementById("username")
    .textContent =
      currentUser.username
        ? "@" + currentUser.username
        : currentUser.first_name ||
          "Пользователь";

  document
    .getElementById("telegramId")
    .textContent =
      "ID: " + currentUser.id;

  document
    .getElementById("avatar")
    .textContent =
      (
        currentUser.first_name ||
        "U"
      )
        .charAt(0)
        .toUpperCase();
}


/* =========================
   BALANCE
========================= */

function updateBalance() {

  if (!currentUser) {
    return;
  }

  const coins =
    Number(
      currentUser.coins || 0
    );

  const elements = [
    "coins",
    "tasksCoins",
    "profileCoins"
  ];

  elements.forEach(id => {

    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        coins;
    }

  });
}


async function loadCoins() {

  if (!currentUser) {
    return;
  }

  const data =
    await api(
      "/coins?user_id=" +
      encodeURIComponent(
        currentUser.id
      )
    );

  currentUser.coins =
    Number(data.coins || 0);

  updateBalance();
}


/* =========================
   CASES
========================= */

async function loadCases() {

  const container =
    document.getElementById(
      "casesList"
    );

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
      data.cases || [];

    renderCases();

  } catch (error) {

    container.innerHTML =
      `<div class="empty">
        ❌ ${escapeHtml(
          error.message
        )}
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

  const html =
    cases.map(item => {

      const premium =
        Number(item.premium) === 1;

      return `
        <div class="case-card">

          <div class="case-emoji">
            ${escapeHtml(
              item.emoji
            )}
          </div>

          <div class="case-name">
            ${escapeHtml(
              item.name
            )}
          </div>

          <div class="case-description">
            ${escapeHtml(
              item.description || ""
            )}
          </div>

          <div class="case-price">

            ${
              premium
                ? "⭐ Premium"
                : "🪙 " +
                  Number(
                    item.cost_coins
                  )
            }

          </div>

          <button
            class="primary"
            onclick="openCaseView(${item.id})"
          >
            Открыть
          </button>

        </div>
      `;

    }).join("");

  if (container) {
    container.innerHTML =
      html ||
      `<div class="empty">
        Кейсов пока нет
      </div>`;
  }

  if (popular) {

    popular.innerHTML =
      cases
        .slice(0, 2)
        .map(item => `
          <div class="case-card">

            <div class="case-emoji">
              ${escapeHtml(
                item.emoji
              )}
            </div>

            <div class="case-name">
              ${escapeHtml(
                item.name
              )}
            </div>

            <button
              class="primary"
              onclick="openCaseView(${item.id})"
            >
              Открыть
            </button>

          </div>
        `)
        .join("");

  }
}


/* =========================
   CASE DETAILS
========================= */

async function openCaseView(caseId) {

  currentCase =
    cases.find(
      item =>
        Number(item.id) ===
        Number(caseId)
    );

  if (!currentCase) {
    return;
  }

  showPage("caseView");

  const container =
    document.getElementById(
      "caseDetails"
    );

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем содержимое...
    </div>`;

  try {

    const data =
      await api(
        "/case-items?case_id=" +
        encodeURIComponent(caseId)
      );

    const items =
      data.items || [];

    const premium =
      Number(
        currentCase.premium
      ) === 1;

    container.innerHTML = `

      <div class="case-big">

        <div class="case-big-emoji">
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

        <h2>
          Возможные награды
        </h2>

        <div class="reward-list">

          ${
            items.map(item => `
              <div class="reward">

                <span>
                  ${escapeHtml(
                    item.emoji
                  )}
                  ${escapeHtml(
                    item.name
                  )}
                </span>

                <b>
                  ${Number(
                    item.chance
                  )}%
                </b>

              </div>
            `).join("")
          }

        </div>

        ${
          premium
            ? `
              <button
                class="primary"
                onclick="buyPremium()"
              >
                ⭐ Premium за 15 Stars
              </button>
            `
            : `
              <button
                class="primary"
                onclick="openCoinCase(${currentCase.id})"
              >
                🪙 Открыть за
                ${Number(
                  currentCase.cost_coins
                )} Coins
              </button>
            `
        }

      </div>
    `;

  } catch (error) {

    container.innerHTML =
      `<div class="empty">
        ❌ ${escapeHtml(
          error.message
        )}
      </div>`;

  }
}


/* =========================
   COIN CASE
========================= */

async function openCoinCase(caseId) {

  if (!currentUser) {
    return;
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
              caseId
          })
        }
      );

    currentUser.coins =
      Number(
        data.coins || 0
      );

    updateBalance();

    showMessage(
      "🎉 Кейс открыт!",
      `${data.gift.emoji}
      ${data.gift.name}

      Ты получил новый подарок!`
    );

    await loadInventory();

  } catch (error) {

    showMessage(
      "Ошибка",
      error.message
    );

  }
}


/* =========================
   PREMIUM
========================= */

function buyPremium() {

  showMessage(
    "⭐ Premium",
    "Premium-набор за 15 Stars будет подключён через официальный Telegram Payments. Внутри будет гарантированная награда."
  );
}


/* =========================
   TASKS
========================= */

async function loadTasks() {

  if (!currentUser) {
    return;
  }

  const container =
    document.getElementById(
      "tasksList"
    );

  if (!container) {
    return;
  }

  try {

    const data =
      await api(
        "/tasks?user_id=" +
        encodeURIComponent(
          currentUser.id
        )
      );

    const tasks =
      data.tasks || [];

    if (!tasks.length) {

      container.innerHTML =
        `<div class="empty">
          🎯 Сейчас нет доступных заданий
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

            <div>

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

              <div class="price">
                🪙 +
                ${Number(
                  task.reward || 0
                )}
              </div>

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
                    class="buy"
                    onclick="completeTask(${task.id})"
                  >
                    Получить
                  </button>
                `
            }

          </div>
        `;

      }).join("");

  } catch (error) {

    container.innerHTML =
      `<div class="empty">
        ❌ ${escapeHtml(
          error.message
        )}
      </div>`;

  }
}


async function completeTask(taskId) {

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
              taskId
          })
        }
      );

    currentUser.coins =
      Number(data.coins || 0);

    updateBalance();

    showMessage(
      "🎉 Задание выполнено",
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

  if (!currentUser) {
    return;
  }

  const data =
    await api(
      "/inventory?user_id=" +
      encodeURIComponent(
        currentUser.id
      )
    );

  const inventory =
    data.inventory || [];

  const container =
    document.getElementById(
      "inventoryList"
    );

  if (!container) {
    return;
  }

  const count =
    document.getElementById(
      "inventoryCount"
    );

  if (count) {
    count.textContent =
      inventory.length;
  }

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
            item.emoji
          )}
        </div>

        <div class="gift-name">
          ${escapeHtml(
            item.name
          )}
        </div>

        <div class="gift-description">
          ${escapeHtml(
            item.description || ""
          )}
        </div>

      </div>
    `).join("");
}


/* =========================
   REFERRALS
========================= */

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

    document.getElementById(
      "refCount"
    ).textContent =
      data.referrals;

    document.getElementById(
      "refActive"
    ).textContent =
      data.active;

    document.getElementById(
      "profileReferrals"
    ).textContent =
      data.referrals;

    document.getElementById(
      "refLink"
    ).textContent =
      data.link;

  } catch (error) {

    console.error(error);

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
    element.textContent;

  try {

    await navigator.clipboard
      .writeText(link);

    showMessage(
      "Готово",
      "Реферальная ссылка скопирована"
    );

  } catch {

    alert(link);

  }
}


/* =========================
   RANKING
========================= */

async function loadRanking(type) {

  const container =
    document.getElementById(
      "rankingList"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="empty">
      ⏳ Загружаем рейтинг...
    </div>`;

  try {

    let endpoint =
      "/coins-rank";

    if (type === "referrals") {
      endpoint =
        "/referral-rank";
    }

    if (type === "gifts") {
      endpoint =
        "/gifts-rank";
    }

    const data =
      await api(endpoint);

    const ranking =
      data.ranking || [];

    container.innerHTML =
      ranking.map(
        (user, index) => {

          const name =
            user.username
              ? "@" + user.username
              : user.first_name ||
                "Пользователь";

          const value =
            type === "coins"
              ? "🪙 " +
                Number(
                  user.coins || 0
                )
              : type === "referrals"
                ? "👥 " +
                  Number(
                    user.referrals || 0
                  )
                : "🎁 " +
                  Number(
                    user.gifts || 0
                  );

          return `
            <div class="rank-card">

              <strong>
                #${index + 1}
              </strong>

              <span>
                ${escapeHtml(
                  name
                )}
              </span>

              <b>
                ${value}
              </b>

            </div>
          `;

        }
      ).join("");

  } catch (error) {

    container.innerHTML =
      `<div class="empty">
        ❌ ${escapeHtml(
          error.message
        )}
      </div>`;

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
   HTML SECURITY
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

    await loadCoins();

    await loadCases();

    await loadInventory();

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
