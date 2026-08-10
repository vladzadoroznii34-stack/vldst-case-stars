const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

let balance = 0;
let inventory = [];

const user = tg.initDataUnsafe?.user;

if (user) {
  document.getElementById("username").textContent =
    user.first_name || "Пользователь";

  document.getElementById("userId").textContent =
    user.id;

  if (user.photo_url) {
    document.getElementById("avatar").innerHTML =
      `<img src="${user.photo_url}" width="45" height="45" style="border-radius:50%">`;
  }
}

function openPage(page) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
  });

  document.getElementById(page).classList.add("active");
}

function buyGift(name, price) {
  tg.showConfirm(
    `Купить ${name} за ⭐ ${price}?`,
    confirmed => {
      if (!confirmed) return;

      tg.showAlert(
        "Оплата Stars будет подключена на следующем этапе."
      );
    }
  );
}

function showTelegramInfo() {
  tg.showAlert(
    "Платежи Telegram Stars подключим после настройки Bot API."
  );
}

function showReferrals() {
  const id = user?.id || "USER";

  tg.showAlert(
    `Твоя реферальная ссылка:\nhttps://t.me/VldstxCase_bot?start=ref_${id}`
  );
}

function updateUI() {
  document.getElementById("balance").textContent = balance;
  document.getElementById("profileBalance").textContent = balance;
  document.getElementById("giftCount").textContent = inventory.length;

  const list = document.getElementById("inventoryList");

  if (!inventory.length) {
    list.innerHTML = `
      <div class="empty">
        🎁 Здесь появятся твои подарки
      </div>
    `;
    return;
  }

  list.innerHTML = inventory.map(item => `
    <div class="inventory-item">
      <div style="font-size:45px">${item.icon}</div>
      <b>${item.name}</b>
      <div style="color:#aaa">⭐ ${item.price}</div>
    </div>
  `).join("");
}

updateUI();
