# 🤖 Agentab

> **Turn any tab into an AI agent.**  
> Agentab is a Chrome extension that lets you control web pages using natural language prompts or JavaScript code — powered by any OpenAI-compatible LLM.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=flat-square)
![License MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-6c5ce7?style=flat-square)

---

## 📸 Screenshots

```
┌─────────────────────────┐    ┌─────────────────────────┐
│  🤖 Agentab             │    │  📋 Saved Tasks          │
│  ─────────────────────  │    │  ─────────────────────   │
│  [ Prompt ] [ Code  ]   │    │  🔍 Search tasks...      │
│                         │    │                          │
│  ┌───────────────────┐  │    │  ┌─────────┐ ┌────────┐ │
│  │ Describe what you │  │    │  │Extract  │ │Fill    │ │
│  │ want the agent    │  │    │  │emails   │ │forms   │ │
│  │ to do...          │  │    │  │💬 prompt│ │⚡ code │ │
│  └───────────────────┘  │    │  └─────────┘ └────────┘ │
│                         │    │                          │
│  [  Save  ] [ Run Agent]│    │  [All] [Prompts] [Code]  │
└─────────────────────────┘    └─────────────────────────┘
```

---

## ✨ Features

### 🧠 AI Agent Mode
- Describe tasks in **natural language** — Agentab figures out the rest
- Multi-step reasoning loop: the agent thinks → executes → observes → repeats
- Automatically analyzes page structure (forms, buttons, links, text)
- Supports up to **10 iterations** per task

### ⚡ Direct Code Mode
- Write and execute **JavaScript** directly on any page
- Full DOM access with `async/await` support
- Built-in helper utilities via `__chromeAgent`
- Real-time execution results

### 💾 Task Management
- Save tasks as **Prompt** type or **Code** type
- Full task list with search and filter
- Edit, duplicate, delete tasks
- Track execution count and last run time

### 🔌 Flexible LLM Support
- Works with **any OpenAI-compatible API**
- OpenAI, Azure OpenAI, Ollama, LM Studio, DeepSeek, and more
- Configurable base URL, API key, and model name

---

## 🚀 Getting Started

### Installation

> Agentab is not yet on the Chrome Web Store.  
> Install it manually in developer mode.

**Step 1 — Clone the repository**

```bash
git clone https://github.com/yourname/agentab.git
cd agentab
```

**Step 2 — Generate icons**

Open `generate-icons.html` in your browser.  
Icons will be automatically downloaded to your `icons/` folder.

**Step 3 — Load the extension**

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `agentab` project folder

**Step 4 — Configure your API**

1. Click the Agentab icon in the Chrome toolbar
2. Click the ⚙️ Settings button
3. Fill in your API details:

| Field | Example |
|-------|---------|
| API Base URL | `https://api.openai.com/v1` |
| API Key | `sk-xxxxxxxxxxxxxxxx` |
| Model | `gpt-4o` |

---

## 📖 Usage

### Prompt Mode (AI Agent)

Switch to the **Prompt** tab and describe what you want:

```
Find all email addresses on this page and list them
```
```
Fill the login form with username "demo" and password "demo123"
```
```
Scroll to the bottom of the page and click the "Load More" button
```
```
Extract the title, price, and rating of every product on this page
```
```
Take all the links in the navigation menu and return them as a JSON array
```

The agent will:
1. 🔍 Analyze the current page structure
2. 🧠 Generate JavaScript code to accomplish the task
3. ⚡ Execute the code on the page
4. 👀 Observe the result
5. 🔄 Repeat until the task is complete

---

### Code Mode (Direct Execution)

Switch to the **Code** tab and write JavaScript:

```javascript
// Extract all image URLs from the page
const images = Array.from(document.querySelectorAll('img'))
  .map(img => ({ src: img.src, alt: img.alt }));
return images;
```

```javascript
// Fill a form and submit it
await __chromeAgent.typeText('#username', 'hello@example.com');
await __chromeAgent.typeText('#password', 'mypassword');
await __chromeAgent.clickElement('#submit-btn');
```

```javascript
// Wait for dynamic content and extract it
const el = await __chromeAgent.waitForElement('.results-container');
return __chromeAgent.getVisibleText('.results-container');
```

---

### Task Management

Click the 📋 icon to open the **Task Manager**:

- **Search** tasks by name, description, or content
- **Filter** by type: All / Prompts / Code
- **Run** any saved task with one click
- **Edit** task name, description, type, and content
- **Duplicate** a task as a starting point for a new one
- **Delete** tasks you no longer need
- View **execution stats** for each task

---

## 🛠️ Built-in Helper API

When writing code, you have access to `__chromeAgent` utilities:

```javascript
// Wait for an element to appear in the DOM (up to 10s by default)
const el = await __chromeAgent.waitForElement('.my-element', 10000);

// Type text character by character (human-like)
await __chromeAgent.typeText('#input-field', 'Hello World', 50);

// Click an element with automatic retry
await __chromeAgent.clickElement('#submit-button', 3);

// Get visible text content
const text = __chromeAgent.getVisibleText('.article-body');

// Sleep / delay
await __chromeAgent.sleep(1000);

// Extract table data as 2D array
const table = __chromeAgent.extractTable('#data-table');

// Fill multiple form fields at once
__chromeAgent.fillForm({
  '#name':  'John Doe',
  '#email': 'john@example.com',
  '#role':  'developer'
});
```

---

## 📁 Project Structure

```
agentab/
├── manifest.json              # Extension manifest (MV3)
├── background/
│   └── background.js          # Service worker, LLM agent loop
├── content/
│   └── content.js             # Content script, helper utilities
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Popup styles
│   └── popup.js               # Popup logic
├── tasks/
│   ├── tasks.html             # Task manager page
│   ├── tasks.css              # Task manager styles
│   └── tasks.js               # Task manager logic
├── lib/
│   └── storage.js             # Chrome storage utilities
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── generate-icons.html        # Icon generator utility
```

---

## ⚙️ Configuration

### Supported LLM Providers

| Provider | Base URL | Notes |
|----------|----------|-------|
| OpenAI | `https://api.openai.com/v1` | Default |
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` | |
| Ollama | `http://localhost:11434/v1` | Local, free |
| LM Studio | `http://localhost:1234/v1` | Local, free |
| DeepSeek | `https://api.deepseek.com/v1` | Affordable |
| Groq | `https://api.groq.com/openai/v1` | Fast inference |
| OpenRouter | `https://openrouter.ai/api/v1` | Multi-model |

### Recommended Models

| Use Case | Model |
|----------|-------|
| Best accuracy | `gpt-4o` |
| Balanced | `gpt-4o-mini` |
| Local / Free | `llama3.2` via Ollama |
| Fast & cheap | `deepseek-chat` |

---

## 🔒 Privacy & Security

- **No data collection** — Agentab never sends your data to any server except the LLM API you configure
- **API keys stored locally** — stored only in `chrome.storage.local` on your device
- **Code review** — all JS code is visible in the UI before execution
- **No background tracking** — the service worker only activates when you use the extension
- **Open source** — audit the full source code yourself

> ⚠️ **Warning:** Be cautious when running agent tasks on pages with sensitive information.  
> Always review the generated code before granting it access to important forms or data.

---

## 🧩 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl / Cmd + Enter` | Run current prompt or code |
| `Tab` | Insert 2-space indent (in code editor) |
| `Esc` | Close modal or dialog |
| Right-click selected text | Run selection as agent prompt |

---

## 🗺️ Roadmap

- [ ] **v1.1** — Syntax highlighting in code editor
- [ ] **v1.2** — Task scheduling (run at interval or on page load)
- [ ] **v1.3** — Import / export task collections
- [ ] **v1.4** — Multi-tab coordination
- [ ] **v1.5** — Visual element picker (click to select DOM element)
- [ ] **v2.0** — Built-in local model support (WebLLM)
- [ ] **v2.1** — Task sharing marketplace

---

## 🤝 Contributing

Contributions are welcome!

```bash
# Fork and clone
git clone https://github.com/yourname/agentab.git

# Create a feature branch
git checkout -b feature/my-feature

# Make your changes, then submit a PR
git push origin feature/my-feature
```

Please follow these guidelines:
- Keep code clean and commented
- Test on Chrome 120+
- Do not introduce external dependencies
- One feature per pull request

---

## 🐛 Known Issues

- Content scripts may not inject on `chrome://` or `chrome-extension://` pages (by design)
- Some SPAs may require a page refresh before the helper utilities are available
- Very long agent tasks (10+ steps) may time out on slow API connections

---

## 📄 License

```
MIT License

Copyright (c) 2024 Agentab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 🙏 Acknowledgements

- Powered by [OpenAI](https://openai.com) compatible APIs
- Built with Chrome Extensions Manifest V3
- Inspired by the browser automation and AI agent community

---

<div align="center">

**Made with ❤️ by the Agentab team**

[Report Bug](https://github.com/yourname/agentab/issues) · 
[Request Feature](https://github.com/yourname/agentab/issues) · 
[Chrome Web Store](#) *(coming soon)*

</div>
