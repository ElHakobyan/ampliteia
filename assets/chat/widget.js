/*
 * Ampliteia chat widget.
 *
 * Embed on any site with one tag:
 *   <script src="https://.../assets/chat/widget.js" defer></script>
 * Optional config BEFORE that tag:
 *   <script>window.AmpliteiaChat = { apiUrl: "https://your-worker.workers.dev/chat", brand: "Dubai Tours" };</script>
 *
 * With apiUrl set, messages go to the AI agent (see /worker).
 * Without apiUrl the widget runs a built-in scripted DEMO (no AI, no server),
 * so the experience can be shown anywhere, including GitHub Pages.
 */
(function () {
  "use strict";

  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";
  var cfg = Object.assign({
    apiUrl: "",
    brand: "Sunrise Desert Tours",
    subtitle: "Typically replies instantly · 24/7",
    greeting: "Hello! I can answer questions about our tours and prepare your booking request. What would you like to do?",
    footer: "AI assistant · a person confirms every booking",
    currency: "AED"
  }, window.AmpliteiaChat || {});

  // ---------- Demo knowledge base (fictional company, used only without apiUrl) ----------
  var TOURS = [
    { id: "safari", name: "Desert Safari", words: ["safari", "desert", "dune", "camel", "bbq"], from: 150, dur: "about 6 hours",
      incl: "hotel pick-up and drop-off, dune driving, camel ride, BBQ dinner and a live show" },
    { id: "city", name: "Dubai City Tour", words: ["city", "burj", "tour of dubai", "sightseeing"], from: 120, dur: "about 5 hours",
      incl: "hotel transfers, an English-speaking guide, a stop at Burj Khalifa and Dubai Frame" },
    { id: "abudhabi", name: "Abu Dhabi Day Trip", words: ["abu dhabi", "mosque", "abudhabi"], from: 180, dur: "a full day",
      incl: "hotel transfers, a guide, Sheikh Zayed Grand Mosque and a city tour" },
    { id: "dhow", name: "Dhow Cruise Dinner", words: ["dhow", "cruise", "marina", "boat"], from: 130, dur: "about 2.5 hours",
      incl: "boat cruise, dinner buffet, drinks and hotel transfers" }
  ];
  var FAQ = [
    { k: ["price", "cost", "how much", "pricing", "rate"], a: function () {
        return "Prices start from: " + TOURS.map(function (t) { return t.name + " " + cfg.currency + " " + t.from; }).join(", ") +
          " per person. Final price depends on date and group size, and a manager confirms it.";
      } },
    { k: ["include", "included", "what do i get", "what's in"], a: function (t) {
        return t ? t.name + " includes " + t.incl + "." : "Each tour includes hotel transfers. Tell me which tour and I will list exactly what is included.";
      } },
    { k: ["pick up", "pickup", "pick-up", "hotel", "transfer"], a: function () {
        return "Yes, hotel pick-up and drop-off are included in all our tours within Dubai. Send your hotel name with your request.";
      } },
    { k: ["cancel", "refund", "change"], a: function () {
        return "Free cancellation up to 24 hours before the tour. A manager will confirm the exact policy for your booking.";
      } },
    { k: ["how long", "duration", "hours", "time"], a: function (t) {
        return t ? t.name + " takes " + t.dur + "." : "Tours take from about 2.5 hours (cruise) to a full day (Abu Dhabi). Which tour are you interested in?";
      } },
    { k: ["kid", "child", "children", "baby", "family"], a: function () {
        return "Children are welcome on all tours, and young children get a reduced price. Tell me how many adults and children.";
      } }
  ];

  // ---------- State ----------
  var slots = { tour: null, date: null, guests: null, budget: null, contact: null };
  var asked = null;           // which slot we last asked about
  var done = false;
  var history = [];           // for live mode
  var sid = "s" + Math.random().toString(36).slice(2, 10);

  // ---------- DOM ----------
  var root = document.createElement("div");
  root.className = "ac-root";
  root.innerHTML =
    '<div class="ac-panel" hidden role="dialog" aria-label="Chat">' +
      '<div class="ac-head"><span class="ac-dot"></span><div><div class="ac-title"></div><div class="ac-sub"></div></div>' +
      '<button class="ac-x" type="button" aria-label="Close">&times;</button></div>' +
      '<div class="ac-msgs" aria-live="polite"></div>' +
      '<div class="ac-chips"></div>' +
      '<form class="ac-form"><input class="ac-input" type="text" maxlength="800" autocomplete="off" placeholder="Type your message…" aria-label="Message">' +
      '<button class="ac-send" type="submit">Send</button></form>' +
      '<div class="ac-foot"></div>' +
    '</div>' +
    '<button class="ac-fab" type="button" aria-label="Open chat">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
    '</button>';

  var $ = function (s) { return root.querySelector(s); };
  var panel, msgs, chips, form, input, sendBtn;

  function mount() {
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = SCRIPT_SRC ? SCRIPT_SRC.replace(/widget\.js.*$/, "widget.css") : "/assets/chat/widget.css";
    document.head.appendChild(css);
    document.body.appendChild(root);
    panel = $(".ac-panel"); msgs = $(".ac-msgs"); chips = $(".ac-chips");
    form = $(".ac-form"); input = $(".ac-input"); sendBtn = $(".ac-send");
    $(".ac-title").textContent = cfg.brand;
    $(".ac-sub").textContent = cfg.subtitle;
    $(".ac-foot").textContent = cfg.footer;

    $(".ac-fab").addEventListener("click", function () { toggle(panel.hidden); });
    $(".ac-x").addEventListener("click", function () { toggle(false); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      input.value = "";
      userSays(v);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
  }
  var started = false;
  function toggle(open) {
    panel.hidden = !open;
    if (open) {
      if (!started) { started = true; botSays(cfg.greeting, true); if (!cfg.apiUrl) setChips(TOURS.map(function (t) { return t.name; }).concat(["Prices"])); }
      setTimeout(function () { input.focus(); }, 50);
    }
  }

  function addMsg(text, who) {
    var d = document.createElement("div");
    d.className = "ac-msg " + who;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function setChips(list) {
    chips.textContent = "";
    list.forEach(function (label) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "ac-chip"; b.textContent = label;
      b.addEventListener("click", function () { setChips([]); userSays(label); });
      chips.appendChild(b);
    });
  }
  function typing(on) {
    var t = msgs.querySelector(".ac-typing");
    if (on && !t) {
      t = document.createElement("div"); t.className = "ac-typing"; t.innerHTML = "<i></i><i></i><i></i>";
      msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
    } else if (!on && t) { t.remove(); }
  }
  function botSays(text, instant) {
    history.push({ role: "assistant", content: text });
    if (instant) { addMsg(text, "bot"); return; }
    addMsg(text, "bot");
  }
  function showCard(lead) {
    var c = document.createElement("div");
    c.className = "ac-card";
    var h = document.createElement("h4"); h.textContent = "Request card sent to the team";
    var dl = document.createElement("dl");
    [["Tour", lead.tour], ["Date", lead.date], ["Guests", lead.guests], ["Budget", lead.budget], ["Contact", lead.contact], ["Language", lead.language]]
      .forEach(function (r) {
        if (!r[1]) return;
        var dt = document.createElement("dt"); dt.textContent = r[0];
        var dd = document.createElement("dd"); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
    c.appendChild(h); c.appendChild(dl);
    msgs.appendChild(c); msgs.scrollTop = msgs.scrollHeight;
  }

  // ---------- Conversation ----------
  function userSays(text) {
    addMsg(text, "user");
    history.push({ role: "user", content: text });
    setChips([]);
    sendBtn.disabled = true;
    typing(true);
    var work = cfg.apiUrl ? live(text) : demo(text);
    work.then(function (res) {
      typing(false);
      botSays(res.reply);
      if (res.lead) showCard(res.lead);
      if (res.chips) setChips(res.chips);
    }).catch(function () {
      typing(false);
      addMsg("Sorry, something went wrong. Please try again or contact us directly.", "bot");
    }).then(function () { sendBtn.disabled = false; input.focus(); });
  }

  function live(text) {
    return fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, messages: history.slice(-20) })
    }).then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); });
  }

  // ---------- Scripted demo (no AI) ----------
  function lang(text) {
    if (/[Ѐ-ӿ]/.test(text)) return "Russian";
    if (/[؀-ۿ]/.test(text)) return "Arabic";
    return "English";
  }
  function findTour(t) {
    t = t.toLowerCase();
    for (var i = 0; i < TOURS.length; i++) {
      if (t.indexOf(TOURS[i].name.toLowerCase()) > -1) return TOURS[i];
      for (var j = 0; j < TOURS[i].words.length; j++) if (t.indexOf(TOURS[i].words[j]) > -1) return TOURS[i];
    }
    return null;
  }
  function currentTour() { return slots.tour ? TOURS.filter(function (t) { return t.name === slots.tour; })[0] : null; }
  function next() {
    if (!slots.tour) { asked = "tour"; return { reply: "Which tour would you like?", chips: TOURS.map(function (t) { return t.name; }) }; }
    if (!slots.date) { asked = "date"; return { reply: "Great choice. What date would you like to go?" }; }
    if (!slots.guests) { asked = "guests"; return { reply: "How many guests (adults and children)?" }; }
    if (!slots.budget) { asked = "budget"; return { reply: "Do you have a budget in mind? You can say \"skip\".", chips: ["Skip"] }; }
    if (!slots.contact) { asked = "contact"; return { reply: "Last step: please share your name and a phone number or email so our team can confirm." }; }
    done = true; asked = null;
    var lead = { tour: slots.tour, date: slots.date, guests: slots.guests, budget: slots.budget === "skip" ? "" : slots.budget, contact: slots.contact, language: slots.lang };
    return { reply: "Thank you! Your request is with our team. A manager will confirm the price and availability shortly. Is there anything else I can help with?", lead: lead };
  }
  function demo(text) {
    return new Promise(function (resolve) {
      var low = text.toLowerCase();
      slots.lang = slots.lang || lang(text);
      var res;
      if (done) {
        res = { reply: "Your request has been sent. A manager will contact you soon. You can also ask me about tours, prices or what is included." };
        FAQ.forEach(function (f) { if (!res.faq && f.k.some(function (k) { return low.indexOf(k) > -1; })) { res = { reply: f.a(currentTour()), faq: true }; } });
        return setTimeout(function () { resolve(res); }, 600);
      }
      // 1. fill the slot we just asked about
      var t = findTour(text);
      if (t && !slots.tour) slots.tour = t.name;
      var answered = false;
      if (asked === "date" && !slots.date) { slots.date = text; answered = true; }
      else if (asked === "guests" && !slots.guests) { var n = text.match(/\d+/); slots.guests = n ? text : null; answered = !!n; }
      else if (asked === "budget" && !slots.budget) { slots.budget = /skip|no\b|none/i.test(text) ? "skip" : text; answered = true; }
      else if (asked === "contact" && !slots.contact) {
        if (/@|\d{6,}/.test(text.replace(/[\s()+-]/g, ""))) { slots.contact = text; answered = true; }
      }
      // 2. FAQ answer, if the message looks like a question
      var faqText = "";
      FAQ.forEach(function (f) { if (!faqText && f.k.some(function (k) { return low.indexOf(k) > -1; })) faqText = f.a(currentTour() || t); });
      // 3. next question
      var n2 = next();
      var reply = n2.reply;
      if (faqText && !answered) reply = faqText + "\n\n" + n2.reply;
      else if (!answered && asked && t == null && !faqText) {
        if (asked === "guests") reply = "Please tell me the number of guests, for example \"2 adults and 1 child\".";
        else if (asked === "contact") reply = "Please share a phone number or email so the team can reach you.";
        else reply = n2.reply;
      }
      res = { reply: reply, chips: n2.chips, lead: n2.lead };
      setTimeout(function () { resolve(res); }, 650);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
