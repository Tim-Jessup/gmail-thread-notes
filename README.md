# Gmail Thread Notes

A Chrome extension that lets you attach private notes to Gmail threads. Notes appear below the subject line and sync across devices via your Google account.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)

## Features

- **Per-thread notes** — attach a note to any Gmail thread; it reappears every time you open that thread
- **6 colour themes** — yellow, blue, green, rose, lavender, or neutral, chosen per note
- **Markdown formatting** — `**bold**`, `*italic*`, `[link text](url)`
- **Keyboard shortcuts** in the editor:
  - `Ctrl+Enter` — save
  - `Ctrl+B` — bold
  - `Ctrl+I` — italic
  - `Ctrl+K` — insert link
- **Note manager** — click the toolbar icon to see all saved notes, with subject and preview, and delete any you no longer need
- **Syncs across devices** via `chrome.storage.sync`
- **Dark mode** compatible

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the repository folder
5. Open Gmail — a note icon will appear in the subject line of any thread

## Usage

### Adding a note
Open a Gmail thread. A small document icon appears at the end of the subject line. Click it to open the editor, write your note, choose a colour, and press **Save** (or `Ctrl+Enter`).

### Editing a note
Notes appear below the subject line when you open a thread. Click **Edit** to modify the text or change the colour.

### Managing notes
Click the Gmail Thread Notes icon in the Chrome toolbar to open the note manager. From there you can review all saved notes and delete any you no longer need.

## Storage limits

Notes are stored in `chrome.storage.sync`, which has a limit of 512 items and 100 KB total per extension. Use the note manager to delete old notes if you're a heavy user.

## License

[GPL-3.0](LICENSE)
