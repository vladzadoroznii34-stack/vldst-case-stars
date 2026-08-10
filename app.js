function showPage(page) {
  document.querySelectorAll(".page").forEach(function(element) {
    element.classList.remove("active");
  });

  var target = document.getElementById(page);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".bottom-nav button").forEach(function(button) {
    button.classList.remove("active");
  });

  var activeButton = document.querySelector(
    '.bottom-nav button[data-page="' + page + '"]'
  );

  if (activeButton) {
    activeButton.classList.add("active");
  }
}

document.addEventListener("DOMContentLoaded", function() {
  showPage("home");
});
