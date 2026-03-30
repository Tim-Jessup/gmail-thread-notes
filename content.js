// Gmail Thread Notes - content script
// Injects a note panel below the subject line of Gmail threads.
// Notes are stored in chrome.storage.sync keyed by thread ID.
(() => {
  "use strict";

  // -------------------------------------------------------------------------
  // Storage helpers
  // -------------------------------------------------------------------------

  // Storage keys are prefixed "note:" to avoid collisions with any future keys.
  function storageKey(threadId) {
    return "note:" + threadId;
  }

  // Returns null if no note exists, otherwise { text, theme, subject }.
  function loadNote(threadId) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(storageKey(threadId), (result) => {
        const raw = result[storageKey(threadId)];
        if (!raw) return resolve(null);
        // Backward compatibility: notes saved before v1.1 were plain strings.
        if (typeof raw === "string") return resolve({ text: raw, theme: "yellow", subject: "" });
        resolve(raw);
      });
    });
  }

  // Passing empty/whitespace-only text deletes the note from storage.
  function saveNote(threadId, text, theme, subject) {
    return new Promise((resolve) => {
      if (!text || !text.trim()) {
        chrome.storage.sync.remove(storageKey(threadId), resolve);
      } else {
        chrome.storage.sync.set(
          { [storageKey(threadId)]: { text: text.trim(), theme, subject: subject || "" } },
          resolve
        );
      }
    });
  }

  // -------------------------------------------------------------------------
  // Markdown renderer
  // Supports: **bold**, *italic*, [text](url), newlines.
  // Input is HTML-escaped first to prevent XSS.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Themes
  // Each theme defines colors for the panel, header, text, buttons, and
  // textarea border. The base CSS defaults to yellow; all themes (including
  // yellow) are applied via .gtn-theme-{key} classes injected at startup,
  // which take precedence over the base CSS.
  // -------------------------------------------------------------------------
  const THEMES = {
    yellow:   { label: "Yellow",   bg: "#fef9e7", border: "#e8c84a", header: "#fdf4cd", text: "#3c3c00", btnHover: "#f5e88a" },
    blue:     { label: "Blue",     bg: "#e8f0fe", border: "#93b6f5", header: "#d2e3fc", text: "#1a3561", btnHover: "#c5d8fc" },
    green:    { label: "Green",    bg: "#e6f4ea", border: "#7ec898", header: "#ceead6", text: "#1e4620", btnHover: "#b5dfc1" },
    rose:     { label: "Rose",     bg: "#fce8e6", border: "#f28b82", header: "#f9cfcc", text: "#6b2c27", btnHover: "#f9cfcc" },
    lavender: { label: "Lavender", bg: "#f3e8fd", border: "#c47cf9", header: "#e9d0fc", text: "#4a1d76", btnHover: "#deb5fc" },
    neutral:  { label: "Neutral",  bg: "#f8f9fa", border: "#dadce0", header: "#f1f3f4", text: "#3c4043", btnHover: "#e8eaed" },
  };

  // Injects a <style> block with per-theme CSS rules scoped to light mode.
  // Dark mode colors are handled separately in content.css.
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

  // -------------------------------------------------------------------------
  // Icon (Phosphor note-pencil, MIT license, https://phosphoricons.com)
  // -------------------------------------------------------------------------
  const NOTE_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 256 256" fill="#444746" xmlns="http://www.w3.org/2000/svg"><path d="M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z"/></svg>`;

  // -------------------------------------------------------------------------
  // Note panel
  // -------------------------------------------------------------------------

  // Creates the full note panel (header + content + editor) for a saved note.
  // noteData: { text, theme, subject }
  function createNotePanel(threadId, noteData) {
    const noteText = noteData.text || "";
    const noteTheme = noteData.theme || "yellow";

    const panel = document.createElement("div");
    panel.className = "gtn-panel gtn-theme-" + noteTheme;
    panel.dataset.gtnThreadId = threadId;
    // gtnRawText holds the last saved text; absence means the note is unsaved.
    panel.dataset.gtnRawText = noteText;
    panel.dataset.gtnSubject = noteData.subject || "";

    // Header row: icon/label on the left, Edit and Hide buttons on the right.
    const header = document.createElement("div");
    header.className = "gtn-header";

    const label = document.createElement("span");
    label.className = "gtn-label";
    label.innerHTML = `${NOTE_ICON_SVG} Note`;
    label.querySelector("svg").style.cssText = "vertical-align:-2px;margin-right:5px";

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

    // Collapse/expand toggles the content area and hides the editor if open.
    let collapsed = false;
    collapseBtn.addEventListener("click", () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? "none" : "block";
      editor.style.display = "none";
      collapseBtn.textContent = collapsed ? "Show" : "Hide";
      editBtn.style.display = collapsed ? "none" : "";
    });

    // Edit button toggles between view and edit mode.
    // If Cancel is clicked on an unsaved note (no gtnRawText), remove the panel.
    editBtn.addEventListener("click", () => {
      const isEditing = editor.style.display === "block";
      if (isEditing) {
        if (!panel.dataset.gtnRawText) {
          panel.remove();
          return;
        }
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

    return panel;
  }

  // Creates the editor section (textarea, color swatches, Save/Delete buttons).
  function createEditor(threadId, initialText, initialTheme, panel, contentEl, editBtn) {
    const editor = document.createElement("div");
    editor.className = "gtn-editor";
    editor.style.display = "none";

    const textarea = document.createElement("textarea");
    textarea.className = "gtn-textarea";
    textarea.value = initialText || "";
    textarea.placeholder = "Write your note here...\n\n**bold**, *italic*, [link text](https://...)";
    textarea.rows = 5;

    // Color theme swatches — clicking one updates the panel immediately as a preview.
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

    // Wraps the current textarea selection (or cursor position) with markdown markers.
    // If nothing is selected, places the cursor between the markers ready to type.
    function wrapSelection(before, after) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.slice(start, end);
      textarea.setRangeText(before + selected + after, start, end, "select");
      if (start === end) {
        textarea.setSelectionRange(start + before.length, start + before.length);
      }
      textarea.focus();
    }

    // Keyboard shortcuts:
    //   Ctrl+Enter  Save
    //   Ctrl+B      Bold (**text**)
    //   Ctrl+I      Italic (*text*)
    //   Ctrl+K      Insert link ([text](url))
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

    // Save: update storage and switch back to view mode.
    // If the textarea is empty, delete the note and remove the panel.
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
        await saveNote(threadId, "", selectedTheme, panel.dataset.gtnSubject || "");
        panel.remove();
      }
    });

    return editor;
  }

  // -------------------------------------------------------------------------
  // Add note button
  // -------------------------------------------------------------------------

  // Creates the small icon button that appears in the subject row when no note
  // exists. Clicking it removes itself and opens a new note panel in edit mode.
  function createAddButton(threadId, h2El) {
    const btn = document.createElement("button");
    btn.className = "gtn-add-btn";
    btn.title = "Add a note to this thread";
    btn.innerHTML = `${NOTE_ICON_SVG}<span>Add note</span>`;
    btn.dataset.gtnThreadId = threadId;

    btn.addEventListener("click", () => {
      btn.remove();

      const subject = h2El.textContent.trim();
      const panel = createNotePanel(threadId, { text: "", theme: "yellow", subject });

      // Open directly in edit mode.
      const editor = panel.querySelector(".gtn-editor");
      const content = panel.querySelector(".gtn-content");
      const editBtn = panel.querySelector(".gtn-btn");
      editor.style.display = "block";
      content.style.display = "none";
      editBtn.textContent = "Cancel";

      const insertTarget = h2El.closest(".ha") || h2El.parentElement;
      insertTarget.after(panel);

      editor.querySelector(".gtn-textarea").focus();
    });

    return btn;
  }

  // -------------------------------------------------------------------------
  // DOM watching
  // Gmail is a single-page app — we watch for the thread subject heading
  // (h2.hP[data-thread-perm-id]) to appear in the DOM and inject UI then.
  // -------------------------------------------------------------------------

  // Processes a single subject heading element: injects a note panel if a note
  // exists, or an add-note button if not. Skips if UI already exists for this
  // thread to avoid duplicates during re-scans.
  async function processSubjectHeading(h2) {
    const threadId = h2.getAttribute("data-thread-perm-id");
    if (!threadId) return;

    // Check for existing UI by thread ID to avoid injecting twice.
    const alreadyInjected =
      document.querySelector(`.gtn-panel[data-gtn-thread-id="${CSS.escape(threadId)}"]`) ||
      document.querySelector(`.gtn-add-btn[data-gtn-thread-id="${CSS.escape(threadId)}"]`);
    if (alreadyInjected) return;

    const noteData = await loadNote(threadId);
    const subjectRow = h2.closest(".ha"); // Gmail wraps the subject h2 in a div.ha

    if (noteData) {
      // Merge the current subject text in case the thread was renamed.
      const panel = createNotePanel(threadId, { subject: h2.textContent.trim(), ...noteData });
      (subjectRow || h2.parentElement).after(panel);
    } else {
      const btn = createAddButton(threadId, h2);
      (subjectRow || h2.parentElement).appendChild(btn);
    }
  }

  function scanForThreads() {
    document.querySelectorAll("h2.hP[data-thread-perm-id]").forEach(processSubjectHeading);
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------
  injectThemeStyles();
  scanForThreads();

  // Debounced MutationObserver catches thread opens and Gmail navigation.
  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanForThreads, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // hashchange fires when navigating between threads in some Gmail views.
  window.addEventListener("hashchange", () => setTimeout(scanForThreads, 500));
})();
