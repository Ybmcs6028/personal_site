/* Progressive enhancement only: every navigation and page remains usable without JS. */
(() => {
  "use strict";
  document.querySelectorAll("[data-year]").forEach(el => { el.textContent = new Date().getFullYear(); });
  // Preserve old incoming portfolio links after removing the duplicate homepage section.
  if (document.body.classList.contains("home-page") && location.hash === "#design") {
    history.replaceState(null, "", "#projects");
    document.getElementById("projects")?.scrollIntoView({ behavior: "instant" });
  }
})();
