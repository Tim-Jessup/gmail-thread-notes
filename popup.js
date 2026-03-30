// Gmail Thread Notes - popup script
// Lists all saved notes with subject and preview, and allows deletion.

// Subset of theme colors needed for the dot indicators.
const THEMES = {
  yellow:   { bg: "#fef9e7", border: "#e8c84a" },
  blue:     { bg: "#e8f0fe", border: "#93b6f5" },
  green:    { bg: "#e6f4ea", border: "#7ec898" },
  rose:     { bg: "#fce8e6", border: "#f28b82" },
  lavender: { bg: "#f3e8fd", border: "#c47cf9" },
  neutral:  { bg: "#f8f9fa", border: "#dadce0" },
};

// Returns the first line of a note with markdown syntax stripped,
// for use as a one-line preview in the list.
function getPreview(text) {
  const firstLine = (text || "").split("\n")[0] || "";
  return firstLine
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/\*\*?|__|`/g, "")              // **bold**, *italic*, `code`
    .trim();
}

function updateCount(n) {
  document.getElementById("count").textContent = n === 1 ? "1 note" : `${n} notes`;
}

async function render() {
  // Load everything from storage; notes are the entries prefixed "note:".
  const items = await new Promise((resolve) => chrome.storage.sync.get(null, resolve));

  const notes = Object.entries(items)
    .filter(([key]) => key.startsWith("note:"))
    .map(([key, value]) => ({
      key,
      // Backward compatibility: old notes were plain strings.
      ...(typeof value === "string" ? { text: value, theme: "yellow", subject: "" } : value),
    }))
    .sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));

  const list = document.getElementById("list");
  updateCount(notes.length);

  if (notes.length === 0) {
    list.innerHTML = `<div class="empty">No notes saved yet.</div>`;
    return;
  }

  for (const note of notes) {
    const theme = THEMES[note.theme] || THEMES.yellow;

    const item = document.createElement("div");
    item.className = "note-item";

    // Colored dot reflects the note's theme.
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.background = theme.bg;
    dot.style.borderColor = theme.border;

    const textEl = document.createElement("div");
    textEl.className = "note-text";

    const subject = document.createElement("div");
    subject.className = "subject";
    // Fall back to the raw thread ID if no subject was captured yet.
    subject.textContent = note.subject || note.key.slice(5);

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.textContent = getPreview(note.text);

    textEl.appendChild(subject);
    textEl.appendChild(preview);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.title = "Delete note";
    deleteBtn.addEventListener("click", async () => {
      await new Promise((resolve) => chrome.storage.sync.remove(note.key, resolve));
      item.remove();
      const remaining = list.querySelectorAll(".note-item").length;
      updateCount(remaining);
      if (remaining === 0) {
        list.innerHTML = `<div class="empty">No notes saved yet.</div>`;
      }
    });

    item.appendChild(dot);
    item.appendChild(textEl);
    item.appendChild(deleteBtn);
    list.appendChild(item);
  }
}

render();
