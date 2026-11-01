/* DeanWay Labs — site client: concierge chat, build-log feed, operator mode */
(function () {
  "use strict";

  var chatLog = document.getElementById("chat-log");
  var chatForm = document.getElementById("chat-form");
  var chatText = document.getElementById("chat-text");
  var chips = document.getElementById("chat-chips");
  var chipContact = document.getElementById("chip-contact");
  var contactForm = document.getElementById("contact-form");
  var cfNote = document.getElementById("cf-note");
  var opLogin = document.getElementById("op-login");
  var chatStatus = document.getElementById("chat-status");
  var feed = document.getElementById("lab-feed");

  var history = []; // {role, content} sent to the concierge
  var operatorPass = sessionStorage.getItem("dwl_op") || "";
  var operatorOn = !!operatorPass;
  var busy = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function addMsg(role, text) {
    var div = document.createElement("div");
    div.className = "msg msg-" + role;
    div.innerHTML = "<p>" + esc(text).replace(/\n/g, "<br>") + "</p>";
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return div;
  }

  function setTyping(on) {
    var t = document.getElementById("typing");
    if (on && !t) {
      t = document.createElement("div");
      t.className = "msg msg-ai";
      t.id = "typing";
      t.innerHTML = "<p class='dots'><span></span><span></span><span></span></p>";
      chatLog.appendChild(t);
      chatLog.scrollTop = chatLog.scrollHeight;
    } else if (!on && t) {
      t.remove();
    }
  }

  function refreshOpUI() {
    if (operatorOn) {
      opLogin.textContent = "Operator ●";
      opLogin.classList.add("on");
      chatStatus.textContent = "Operator mode — the Lab listens";
    } else {
      opLogin.textContent = "Operator";
      opLogin.classList.remove("on");
      chatStatus.textContent = "Powered by DeanWay Labs";
    }
  }

  async function sendChat(userText) {
    if (busy || !userText.trim()) return;
    busy = true;
    addMsg("user", userText);
    history.push({ role: "user", content: userText });
    if (history.length > 12) history = history.slice(-12);
    setTyping(true);
    chatText.value = "";
    try {
      var res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          operator: operatorOn,
          passphrase: operatorPass || undefined
        })
      });
      var data = await res.json().catch(function () { return {}; });
      setTyping(false);
      if (res.status === 403) {
        operatorOn = false; operatorPass = "";
        sessionStorage.removeItem("dwl_op"); refreshOpUI();
        addMsg("ai", "Operator session expired. Tap Operator to sign in again.");
      } else if (data.tool) {
        handleTool(data.tool);
      } else if (data.reply) {
        addMsg("ai", data.reply);
        history.push({ role: "assistant", content: data.reply });
      } else {
        addMsg("ai", "The Lab is quiet right now — try again in a moment.");
      }
    } catch (e) {
      setTyping(false);
      addMsg("ai", "Couldn't reach the Lab. Check your connection and try again.");
    }
    busy = false;
  }

  // Operator tool calls come back as {tool:{action, ...}} from the AI.
  async function handleTool(tool) {
    if (tool.action === "post_update" && tool.text) {
      var r = await fetch("/.netlify/functions/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: operatorPass, text: tool.text })
      });
      if (r.ok) {
        addMsg("ai", "Posted to the build log.");
        loadFeed();
      } else {
        addMsg("ai", "Couldn't post that update.");
      }
    } else if (tool.action === "list_inquiries") {
      var r2 = await fetch("/.netlify/functions/inquiry?passphrase=" + encodeURIComponent(operatorPass));
      var d2 = await r2.json().catch(function () { return {}; });
      if (d2.inquiries && d2.inquiries.length) {
        var lines = d2.inquiries.slice(-8).map(function (q) {
          return "• " + (q.name || "—") + " <" + (q.email || "—") + "> — " + (q.interest || "—");
        });
        addMsg("ai", "Recent inquiries:\n" + lines.join("\n"));
      } else {
        addMsg("ai", "No inquiries yet.");
      }
    } else if (tool.action === "reply" && tool.text) {
      addMsg("ai", tool.text);
      history.push({ role: "assistant", content: tool.text });
    } else {
      addMsg("ai", "I didn't understand that operator command.");
    }
  }

  chatForm.addEventListener("submit", function (e) {
    e.preventDefault();
    sendChat(chatText.value);
  });

  chips.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.id === "chip-contact") return;
    sendChat(b.getAttribute("data-q"));
  });

  chipContact.addEventListener("click", function () {
    contactForm.hidden = !contactForm.hidden;
    cfNote.textContent = "";
  });
  document.getElementById("cf-cancel").addEventListener("click", function () {
    contactForm.hidden = true;
  });
  contactForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = document.getElementById("cf-name").value.trim();
    var email = document.getElementById("cf-email").value.trim();
    var interest = document.getElementById("cf-interest").value.trim();
    if (!email) { cfNote.textContent = "An email is all we really need."; return; }
    cfNote.textContent = "Sending…";
    try {
      var res = await fetch("/.netlify/functions/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, interest: interest })
      });
      if (res.ok) {
        cfNote.textContent = "Received. The Lab will reach out.";
        addMsg("ai", "Thanks" + (name ? " " + name : "") + " — your info is with the Lab.");
        contactForm.hidden = true;
      } else {
        cfNote.textContent = "Hmm, that didn't go through. Try again.";
      }
    } catch (err) {
      cfNote.textContent = "Couldn't send just now. Try again in a bit.";
    }
  });

  opLogin.addEventListener("click", function () {
    if (operatorOn) {
      operatorOn = false; operatorPass = "";
      sessionStorage.removeItem("dwl_op"); refreshOpUI();
      addMsg("ai", "Operator mode off.");
      return;
    }
    var p = prompt("Operator passphrase:");
    if (!p) return;
    operatorPass = p;
    sessionStorage.setItem("dwl_op", p);
    operatorOn = true;
    refreshOpUI();
    addMsg("ai", "Operator mode on. Tell me what to change — e.g. \"post an update: Gemma's voice pipeline passed its test\" — or say \"show inquiries\".");
  });

  async function loadFeed() {
    try {
      var res = await fetch("/.netlify/functions/content");
      var data = await res.json();
      feed.innerHTML = "";
      (data.updates || []).forEach(function (u) {
        var item = document.createElement("article");
        item.className = "feed-item";
        var d = u.date ? new Date(u.date) : new Date();
        item.innerHTML =
          "<p class='feed-date'>" + esc(d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })) + "</p>" +
          "<p class='feed-text'>" + esc(u.text).replace(/\n/g, "<br>") + "</p>";
        feed.appendChild(item);
      });
      if (!(data.updates || []).length) {
        feed.innerHTML = "<p class='feed-loading'>The build log is empty — check back soon.</p>";
      }
    } catch (e) {
      feed.innerHTML = "<p class='feed-loading'>Couldn't load the build log.</p>";
    }
  }

  /* ---- Gemma's voice ---- */
  var voiceToggle = document.getElementById("voice-toggle");
  var gemmaAudio = null;

  function getAudio() {
    if (!gemmaAudio) {
      gemmaAudio = new Audio("assets/gemma-welcome.mp3");
      gemmaAudio.preload = "auto";
      gemmaAudio.addEventListener("ended", function () { setToggle(false); });
    }
    return gemmaAudio;
  }

  function setToggle(playing) {
    if (!voiceToggle) return;
    voiceToggle.textContent = playing ? "🔊" : "🔇";
    voiceToggle.classList.toggle("off", !playing);
    voiceToggle.setAttribute("aria-label", playing ? "Stop Gemma's voice" : "Hear Gemma's welcome");
  }

  if (voiceToggle) {
    voiceToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var a = getAudio();
      if (a.paused) {
        a.currentTime = 0;
        a.play().catch(function () {});
        setToggle(true);
      } else {
        a.pause();
        a.currentTime = 0;
        setToggle(false);
      }
    });
  }

  // Seed greeting
  addMsg("ai", "Hi, I'm Gemma. Ask me about DeanWay Labs — the work, the brains behind it, or how personal AI you own actually works.");
  refreshOpUI();
  loadFeed();
})();
