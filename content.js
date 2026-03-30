(() => {
  "use strict";

  // --- Storage helpers ---
  function storageKey(threadId) {
    return "note:" + threadId;
  }

  function loadNote(threadId) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(storageKey(threadId), (result) => {
        const raw = result[storageKey(threadId)];
        if (!raw) return resolve(null);
        // Backward compat: old notes were plain strings
        if (typeof raw === "string") return resolve({ text: raw, theme: "yellow" });
        resolve(raw);
      });
    });
  }

  function saveNote(threadId, text, theme, subject) {
    return new Promise((resolve) => {
      if (!text || !text.trim()) {
        chrome.storage.sync.remove(storageKey(threadId), resolve);
      } else {
        chrome.storage.sync.set({ [storageKey(threadId)]: { text: text.trim(), theme, subject: subject || "" } }, resolve);
      }
    });
  }

  // --- Minimal markdown renderer ---
  function renderMarkdown(text) {
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  // --- Themes ---
  const THEMES = {
    yellow:   { label: "Yellow",   bg: "#fef9e7", border: "#e8c84a", header: "#fdf4cd", text: "#3c3c00", btnHover: "#f5e88a" },
    blue:     { label: "Blue",     bg: "#e8f0fe", border: "#93b6f5", header: "#d2e3fc", text: "#1a3561", btnHover: "#c5d8fc" },
    green:    { label: "Green",    bg: "#e6f4ea", border: "#7ec898", header: "#ceead6", text: "#1e4620", btnHover: "#b5dfc1" },
    rose:     { label: "Rose",     bg: "#fce8e6", border: "#f28b82", header: "#f9cfcc", text: "#6b2c27", btnHover: "#f9cfcc" },
    lavender: { label: "Lavender", bg: "#f3e8fd", border: "#c47cf9", header: "#e9d0fc", text: "#4a1d76", btnHover: "#deb5fc" },
    neutral:  { label: "Neutral",  bg: "#f8f9fa", border: "#dadce0", header: "#f1f3f4", text: "#3c4043", btnHover: "#e8eaed" },
  };

  function injectThemeStyles() {
    const rules = Object.entries(THEMES).map(([key, t]) => `
      .gtn-panel.gtn-theme-${key} { background: ${t.bg}; border-color: ${t.border}; }
      .gtn-panel.gtn-theme-${key} .gtn-header { background: ${t.header}; border-color: ${t.border}; }
      .gtn-panel.gtn-theme-${key} .gtn-label { color: ${t.text}; }
      .gtn-panel.gtn-theme-${key} .gtn-content { color: ${t.text}; }
      .gtn-panel.gtn-theme-${key} .gtn-btn:not(.gtn-btn-save):not(.gtn-btn-delete) { color: ${t.text}; border-color: ${t.border}; }
      .gtn-panel.gtn-theme-${key} .gtn-btn:not(.gtn-btn-save):not(.gtn-btn-delete):hover { background: ${t.btnHover}; }
      .gtn-panel.gtn-theme-${key} .gtn-textarea { border-color: ${t.border}; }
    `).join("");
    const style = document.createElement("style");
    style.textContent = `@media (prefers-color-scheme: light) {\n${rules}\n}`;
    document.head.appendChild(style);
  }

  // --- UI creation ---
  function createNotePanel(threadId, noteData) {
    const noteText = noteData.text || "";
    const noteTheme = noteData.theme || "yellow";

    const panel = document.createElement("div");
    panel.className = "gtn-panel gtn-theme-" + noteTheme;
    panel.dataset.gtnThreadId = threadId;

    const header = document.createElement("div");
    header.className = "gtn-header";

    const label = document.createElement("span");
    label.className = "gtn-label";
    label.innerHTML = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#444746" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><rect x="3.5" y="1.5" width="13" height="17" rx="1.5"/><line x1="6.5" y1="7" x2="13.5" y2="7"/><line x1="6.5" y1="10.5" x2="13.5" y2="10.5"/><line x1="6.5" y1="14" x2="11" y2="14"/></svg>Note`;

    const actions = document.createElement("span");
    actions.className = "gtn-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "gtn-btn";
    editBtn.textContent = "Edit";
    editBtn.title = "Edit note";

    const collapseBtn = document.createElement("button");
    collapseBtn.className = "gtn-btn";
    collapseBtn.textContent = "Hide";
    collapseBtn.title = "Collapse note";

    actions.appendChild(editBtn);
    actions.appendChild(collapseBtn);
    header.appendChild(label);
    header.appendChild(actions);

    const content = document.createElement("div");
    content.className = "gtn-content";
    content.innerHTML = renderMarkdown(noteText);

    const editor = createEditor(threadId, noteText, noteTheme, panel, content, editBtn);

    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(editor);

    // Collapse/expand
    let collapsed = false;
    collapseBtn.addEventListener("click", () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? "none" : "block";
      editor.style.display = "none";
      collapseBtn.textContent = collapsed ? "Show" : "Hide";
      editBtn.style.display = collapsed ? "none" : "";
    });

    // Edit toggle
    editBtn.addEventListener("click", () => {
      const isEditing = editor.style.display === "block";
      if (isEditing) {
        editor.style.display = "none";
        content.style.display = "block";
        editBtn.textContent = "Edit";
      } else {
        const textarea = editor.querySelector(".gtn-textarea");
        textarea.value = panel.dataset.gtnRawText || noteText;
        editor.style.display = "block";
        content.style.display = "none";
        editBtn.textContent = "Cancel";
        textarea.focus();
      }
    });

    panel.dataset.gtnRawText = noteText;
    panel.dataset.gtnSubject = noteData.subject || "";

    return panel;
  }

  function createEditor(threadId, initialText, initialTheme, panel, contentEl, editBtn) {
    const editor = document.createElement("div");
    editor.className = "gtn-editor";
    editor.style.display = "none";

    const textarea = document.createElement("textarea");
    textarea.className = "gtn-textarea";
    textarea.value = initialText || "";
    textarea.placeholder = "Write your note here...\n\n**bold**, *italic*, [link text](https://...)";
    textarea.rows = 5;

    // Color swatches
    const themeRow = document.createElement("div");
    themeRow.className = "gtn-theme-row";
    let selectedTheme = initialTheme || "yellow";

    for (const [key, theme] of Object.entries(THEMES)) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "gtn-swatch" + (key === selectedTheme ? " gtn-swatch-active" : "");
      swatch.style.background = theme.bg;
      swatch.style.borderColor = theme.border;
      swatch.title = theme.label;
      swatch.dataset.theme = key;

      swatch.addEventListener("click", () => {
        selectedTheme = key;
        for (const k of Object.keys(THEMES)) panel.classList.remove("gtn-theme-" + k);
        panel.classList.add("gtn-theme-" + key);
        themeRow.querySelectorAll(".gtn-swatch").forEach((s) =>
          s.classList.toggle("gtn-swatch-active", s.dataset.theme === key)
        );
      });

      themeRow.appendChild(swatch);
    }

    const btnRow = document.createElement("div");
    btnRow.className = "gtn-btn-row";

    const saveBtn = document.createElement("button");
    saveBtn.className = "gtn-btn gtn-btn-save";
    saveBtn.textContent = "Save";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "gtn-btn gtn-btn-delete";
    deleteBtn.textContent = "Delete note";

    btnRow.appendChild(deleteBtn);
    btnRow.appendChild(saveBtn);

    editor.appendChild(textarea);
    editor.appendChild(themeRow);
    editor.appendChild(btnRow);

    function wrapSelection(before, after) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.slice(start, end);
      const replacement = before + selected + after;
      textarea.setRangeText(replacement, start, end, "select");
      if (start === end) {
        textarea.setSelectionRange(start + before.length, start + before.length);
      }
      textarea.focus();
    }

    textarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        saveBtn.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        wrapSelection("**", "**");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        wrapSelection("*", "*");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
        const url = prompt("URL:", "https://");
        if (url) wrapSelection(`[${selected ? "" : "link text"}`, `](${url})`);
      }
    });

    saveBtn.addEventListener("click", async () => {
      const text = textarea.value;
      const subject = panel.dataset.gtnSubject || "";
      await saveNote(threadId, text, selectedTheme, subject);

      if (text.trim()) {
        contentEl.innerHTML = renderMarkdown(text);
        panel.dataset.gtnRawText = text;
        editor.style.display = "none";
        contentEl.style.display = "block";
        editBtn.textContent = "Edit";
      } else {
        panel.remove();
      }
    });

    deleteBtn.addEventListener("click", async () => {
      if (confirm("Delete this note?")) {
        await saveNote(threadId, "", selectedTheme);
        panel.remove();
      }
    });

    return editor;
  }

  function createAddButton(threadId, anchorEl) {
    const btn = document.createElement("button");
    btn.className = "gtn-add-btn";
    btn.title = "Add a note to this thread";
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#444746" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="1.5" width="13" height="17" rx="1.5"/><line x1="6.5" y1="7" x2="13.5" y2="7"/><line x1="6.5" y1="10.5" x2="13.5" y2="10.5"/><line x1="6.5" y1="14" x2="11" y2="14"/></svg><span>Add note</span>`;
    btn.dataset.gtnThreadId = threadId;

    btn.addEventListener("click", () => {
      btn.remove();

      const subject = anchorEl.textContent.trim();
      const panel = createNotePanel(threadId, { text: "", theme: "yellow", subject });
      const editor = panel.querySelector(".gtn-editor");
      const content = panel.querySelector(".gtn-content");
      const editBtn = panel.querySelector(".gtn-btn");

      editor.style.display = "block";
      content.style.display = "none";
      editBtn.textContent = "Cancel";

      const insertTarget = anchorEl.closest(".ha") || anchorEl.parentElement;
      insertTarget.after(panel);

      editor.querySelector(".gtn-textarea").focus();
    });

    return btn;
  }

  // --- DOM watching ---
  async function processSubjectHeading(h2) {
    const threadId = h2.getAttribute("data-thread-perm-id");
    if (!threadId) return;

    const existingPanel = document.querySelector(
      `.gtn-panel[data-gtn-thread-id="${CSS.escape(threadId)}"]`
    );
    const existingBtn = document.querySelector(
      `.gtn-add-btn[data-gtn-thread-id="${CSS.escape(threadId)}"]`
    );
    if (existingPanel || existingBtn) return;

    const noteData = await loadNote(threadId);
    const insertTarget = h2.closest(".ha") || h2.parentElement;

    if (noteData) {
      const panel = createNotePanel(threadId, { subject: h2.textContent.trim(), ...noteData });
      insertTarget.after(panel);
    } else {
      const btn = createAddButton(threadId, h2);
      const subjectRow = h2.closest(".ha");
      if (subjectRow) {
        subjectRow.appendChild(btn);
      } else {
        h2.parentElement.appendChild(btn);
      }
    }
  }

  function scanForThreads() {
    const headings = document.querySelectorAll("h2.hP[data-thread-perm-id]");
    for (const h2 of headings) {
      processSubjectHeading(h2);
    }
  }

  // Init
  injectThemeStyles();
  scanForThreads();

  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanForThreads, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => setTimeout(scanForThreads, 500));
})();
