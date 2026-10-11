(function () {
  // Where consultation requests are sent. Paste your form-service URL here
  // (e.g. "https://formspree.io/f/XXXXXXXX"). While empty, the form falls back
  // to opening an email to CONTACT_EMAIL.
  var FORM_ENDPOINT = "";
  var CONTACT_EMAIL = "hello@ampliteia.com";

  // ---------- Language switcher ----------
  var STORAGE_KEY = "ampliteia.lang";
  var btn = document.getElementById("langBtn");
  var menu = document.getElementById("langMenu");
  var flagEl = document.getElementById("langFlag");
  var codeEl = document.getElementById("langCode");

  function detect() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && I18N[saved]) return saved;
    } catch (e) {}
    var nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return I18N[nav] ? nav : "en";
  }

  function apply(lang) {
    var dict = I18N[lang] || I18N.en;
    document.documentElement.lang = dict.htmlLang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-ph");
      if (dict[key]) el.setAttribute("placeholder", dict[key]);
    });
    window.__dict = dict;
    flagEl.src = dict.flag;
    codeEl.textContent = dict.code;
    menu.querySelectorAll("li").forEach(function (li) {
      li.setAttribute("aria-selected", li.dataset.lang === lang ? "true" : "false");
    });
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function toggle(open) {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggle(menu.hidden);
  });
  menu.addEventListener("click", function (e) {
    var li = e.target.closest("li[data-lang]");
    if (!li) return;
    apply(li.dataset.lang);
    toggle(false);
  });
  document.addEventListener("click", function () { toggle(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });

  apply(detect());

  // ---------- Services dropdown (touch / click support) ----------
  var svcItem = document.getElementById("svcItem");
  var svcLink = document.getElementById("svcLink");
  svcLink.addEventListener("click", function (e) {
    e.preventDefault();
    var open = svcItem.classList.toggle("open");
    svcLink.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", function (e) {
    if (!svcItem.contains(e.target)) {
      svcItem.classList.remove("open");
      svcLink.setAttribute("aria-expanded", "false");
    }
  });
  svcItem.querySelectorAll(".dd a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (a.getAttribute("href") === "#") e.preventDefault();
      svcItem.classList.remove("open");
    });
  });

  // ---------- Active nav link on scroll (Home / About / Contacts) ----------
  var navLinks = {
    top: document.querySelector('.main-nav a[href="#top"]'),
    about: document.querySelector('.main-nav a[href="#about"]'),
    contacts: document.querySelector('.main-nav a[href="#contacts"]')
  };
  var aboutEl = document.getElementById("about");
  var footerEl = document.getElementById("contacts");
  var consultEl = document.getElementById("consultation");
  function onScroll() {
    var y = window.scrollY + window.innerHeight * 0.45;
    var cur = "top";
    if (aboutEl && y >= aboutEl.offsetTop) cur = "about";
    if (consultEl && y >= consultEl.offsetTop) cur = "contacts";
    if (footerEl && y >= footerEl.offsetTop) cur = "contacts";
    Object.keys(navLinks).forEach(function (k) { navLinks[k].classList.toggle("active", k === cur); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- Consultation form ----------
  var form = document.getElementById("consultForm");
  var errEl = document.getElementById("consultErr");
  var doneEl = document.getElementById("consultDone");
  var sendBtn = document.getElementById("consultBtn");
  function tr(key) { return (window.__dict && window.__dict[key]) || ""; }

  function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errEl.hidden = true;
    if (form.elements._gotcha.value) return;            // spam trap
    if (!form.checkValidity()) {
      form.reportValidity();
      showError(tr("cons.req"));
      return;
    }
    var data = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      company: form.elements.company.value.trim(),
      need: form.elements.need.value,
      message: form.elements.message.value.trim(),
      language: document.documentElement.lang,
      page: location.href
    };

    if (!FORM_ENDPOINT) {                                // fallback: open the mail app
      var body = "Name: " + data.name + "\nEmail: " + data.email + "\nCompany: " + data.company +
                 "\nNeed: " + data.need + "\nLanguage: " + data.language + "\n\n" + data.message;
      window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" +
        encodeURIComponent("Consultation request: " + data.name) + "&body=" + encodeURIComponent(body);
      errEl.classList.remove("err"); errEl.classList.add("info");
      showError(tr("cons.fallback"));
      return;
    }

    errEl.classList.remove("info"); errEl.classList.add("err");
    var label = sendBtn.querySelector("span");
    var oldLabel = label.textContent;
    sendBtn.disabled = true; label.textContent = tr("cons.sending");
    fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (!r.ok) throw new Error("bad status " + r.status);
      form.hidden = true; doneEl.hidden = false;
    }).catch(function () {
      showError(tr("cons.err"));
    }).then(function () {
      sendBtn.disabled = false; label.textContent = oldLabel;
    });
  });

  // ---------- Particle / flow-line background ----------
  var canvas = document.getElementById("fx");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var ctx = canvas.getContext("2d");
  var W, H, dpr, dots = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round((W * H) / 9000);
    dots = [];
    for (var i = 0; i < n; i++) {
      dots.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.4 + 0.3,
        s: Math.random() * 0.25 + 0.05,
        a: Math.random() * Math.PI * 2
      });
    }
  }
  resize();
  window.addEventListener("resize", resize);

  var t = 0;
  function frame() {
    t += 0.004;
    ctx.clearRect(0, 0, W, H);

    // flowing lines
    for (var k = 0; k < 14; k++) {
      ctx.beginPath();
      for (var x = -20; x <= W + 20; x += 24) {
        var base = H * 0.38 + k * 5;
        var y = base
          + Math.sin(x * 0.004 + t * 2 + k * 0.18) * (70 + k * 3)
          + Math.sin(x * 0.011 - t * 1.4) * 18
          - (x / W) * H * 0.18;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(150,110,255," + (0.12 + k * 0.025) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // drifting particles
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.a += 0.01;
      d.x += Math.cos(d.a) * d.s;
      d.y += Math.sin(d.a) * d.s - 0.03;
      if (d.y < -5) d.y = H + 5;
      if (d.x < -5) d.x = W + 5;
      if (d.x > W + 5) d.x = -5;
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 3 + i));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(200,175,255," + (0.5 * tw) + ")";
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
})();
