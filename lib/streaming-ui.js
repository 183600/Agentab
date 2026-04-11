/**
 * Streaming UI - Real-time LLM response display
 * Provides token-by-token streaming display for better UX
 */

// Import escapeHtml from utils to avoid circular dependency
import { escapeHtml } from './utils.js';
import { uiLogger } from './logger.js';

/**
 * StreamingTextContainer - Manages streaming text display
 * Efficiently updates DOM for real-time text streaming
 */
export class StreamingTextContainer {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element
   * @param {number} [options.chunkSize] - Characters per chunk for animation
   * @param {number} [options.animationSpeed] - ms between chunks
   * @param {boolean} [options.showCursor] - Show typing cursor
   * @param {string} [options.cursorChar] - Cursor character
   */
  constructor(options = {}) {
    this.options = {
      chunkSize: 3,
      animationSpeed: 15,
      showCursor: true,
      cursorChar: '▋',
      ...options
    };

    this.container = options.container;
    this.text = '';
    this.pendingText = '';
    this.isStreaming = false;
    this.cursorElement = null;
    this.animationFrame = null;

    if (this.container) {
      this.init();
    }
  }

  /**
   * Initialize the container
   */
  init() {
    this.container.className = 'streaming-text-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'false');

    if (this.options.showCursor) {
      this.cursorElement = document.createElement('span');
      this.cursorElement.className = 'streaming-cursor';
      this.cursorElement.textContent = this.options.cursorChar;
      this.container.appendChild(this.cursorElement);
    }
  }

  /**
   * Start streaming
   */
  startStreaming() {
    this.isStreaming = true;
    this.text = '';
    this.pendingText = '';
    this.container.innerHTML = '';

    if (this.options.showCursor && this.cursorElement) {
      this.container.appendChild(this.cursorElement);
      this.cursorElement.classList.add('active');
    }

    uiLogger.debug('Streaming started');
  }

  /**
   * Add text chunk to the stream
   * @param {string} chunk - Text chunk from stream
   */
  addChunk(chunk) {
    if (!this.isStreaming) return;

    this.pendingText += chunk;

    // Trigger render if not already scheduled
    if (!this.animationFrame) {
      this.animationFrame = requestAnimationFrame(() => {
        this.renderPending();
        this.animationFrame = null;
      });
    }
  }

  /**
   * Render pending text with animation
   */
  renderPending() {
    if (this.pendingText.length === 0) return;

    const chunk = this.pendingText.slice(0, this.options.chunkSize);
    this.pendingText = this.pendingText.slice(this.options.chunkSize);
    this.text += chunk;

    // Create text node before cursor
    const textNode = document.createTextNode(chunk);

    if (this.cursorElement) {
      this.container.insertBefore(textNode, this.cursorElement);
    } else {
      this.container.appendChild(textNode);
    }

    // Auto-scroll if container is scrollable
    this.autoScroll();

    // Continue if more pending
    if (this.pendingText.length > 0) {
      setTimeout(() => this.renderPending(), this.options.animationSpeed);
    }
  }

  /**
   * Complete streaming
   * @param {string} [finalText] - Optional final text to set
   */
  complete(finalText) {
    this.isStreaming = false;

    // Cancel any pending animation
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // If final text provided, set it directly
    if (finalText !== undefined) {
      this.text = finalText;
      this.pendingText = '';
      this.container.innerHTML = escapeHtml(finalText);
    } else {
      // Render any remaining pending text
      this.text += this.pendingText;
      this.pendingText = '';

      if (this.cursorElement) {
        // Remove cursor
        this.cursorElement.classList.remove('active');
        setTimeout(() => {
          this.cursorElement?.remove();
          this.cursorElement = null;
        }, 300);
      }
    }

    uiLogger.debug('Streaming completed', { textLength: this.text.length });
  }

  /**
   * Auto-scroll container
   */
  autoScroll() {
    if (this.container.scrollTop !== undefined) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  /**
   * Get current text
   * @returns {string}
   */
  getText() {
    return this.text + this.pendingText;
  }

  /**
   * Clear the container
   */
  clear() {
    this.text = '';
    this.pendingText = '';
    this.isStreaming = false;
    this.container.innerHTML = '';

    if (this.options.showCursor) {
      this.cursorElement = document.createElement('span');
      this.cursorElement.className = 'streaming-cursor';
      this.cursorElement.textContent = this.options.cursorChar;
      this.container.appendChild(this.cursorElement);
    }
  }

  /**
   * Destroy the container
   */
  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.cursorElement = null;
  }
}

/**
 * StreamingResponseUI - Full streaming response interface
 * Handles code blocks, thinking states, and rich formatting
 */
export class StreamingResponseUI {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Main container
   * @param {Function} [options.onCodeBlock] - Callback when code block is complete
   * @param {Function} [options.onThinking] - Callback for thinking state
   * @param {Function} [options.onComplete] - Callback when stream completes
   */
  constructor(options = {}) {
    this.options = options;
    this.container = options.container;
    this.currentPhase = 'idle';
    this.textContainer = null;
    this.codeBlockContainer = null;
    this.currentCodeBlock = '';
    this.inCodeBlock = false;
    this.codeLanguage = '';

    if (this.container) {
      this.init();
    }
  }

  /**
   * Initialize the UI
   */
  init() {
    this.container.className = 'streaming-response-ui';
  }

  /**
   * Start a new response
   */
  startResponse() {
    this.container.innerHTML = '';
    this.currentPhase = 'streaming';
    this.inCodeBlock = false;
    this.currentCodeBlock = '';
    this.codeLanguage = '';

    // Create main text container
    const textDiv = document.createElement('div');
    textDiv.className = 'response-text';
    this.container.appendChild(textDiv);

    this.textContainer = new StreamingTextContainer({
      container: textDiv,
      showCursor: true
    });
    this.textContainer.startStreaming();
  }

  /**
   * Handle streaming chunk
   * @param {string} chunk
   */
  handleChunk(chunk) {
    if (this.currentPhase !== 'streaming') return;

    // Check for code block boundaries
    this.processChunkForCodeBlocks(chunk);
  }

  /**
   * Process chunk for code block detection
   */
  processChunkForCodeBlocks(chunk) {
    // Simple code block detection
    const codeBlockStart = '```';
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith(codeBlockStart)) {
        if (!this.inCodeBlock) {
          // Start code block
          this.inCodeBlock = true;
          this.codeLanguage = line.slice(3).trim();
          this.currentCodeBlock = '';

          // Create code block container
          this.createCodeBlockContainer();

          // Flush text container
          this.textContainer.complete();
        } else {
          // End code block
          this.inCodeBlock = false;

          // Finalize code block
          this.finalizeCodeBlock();

          // Resume text streaming
          this.resumeTextStreaming();
        }
      } else if (this.inCodeBlock) {
        // Add to code block
        this.currentCodeBlock += line + '\n';
        this.updateCodeBlockDisplay();
      } else {
        // Regular text
        this.textContainer.addChunk(line + '\n');
      }
    }
  }

  /**
   * Create code block container using safe DOM methods
   */
  createCodeBlockContainer() {
    this.codeBlockContainer = document.createElement('div');
    this.codeBlockContainer.className = 'streaming-code-block';

    const header = document.createElement('div');
    header.className = 'code-block-header';

    // Language span
    const langSpan = document.createElement('span');
    langSpan.className = 'code-language';
    langSpan.textContent = this.codeLanguage || 'code';
    header.appendChild(langSpan);

    // Status span
    const statusSpan = document.createElement('span');
    statusSpan.className = 'code-status';
    statusSpan.textContent = 'streaming...';
    header.appendChild(statusSpan);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.title = 'Copy code';
    // SVG is predefined and safe
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    header.appendChild(copyBtn);

    const codeElement = document.createElement('pre');
    codeElement.className = 'code-content';
    codeElement.setAttribute('data-lang', this.codeLanguage);

    const code = document.createElement('code');
    code.className = `language-${this.codeLanguage || 'plaintext'}`;
    codeElement.appendChild(code);

    this.codeBlockContainer.appendChild(header);
    this.codeBlockContainer.appendChild(codeElement);
    this.container.appendChild(this.codeBlockContainer);

    // Setup copy button
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.currentCodeBlock);
      statusSpan.textContent = 'copied!';
      setTimeout(() => {
        statusSpan.textContent = '';
      }, 2000);
    });

    // Notify callback
    if (this.options.onCodeBlock) {
      this.options.onCodeBlock('start', { language: this.codeLanguage });
    }
  }

  /**
   * Update code block display during streaming
   */
  updateCodeBlockDisplay() {
    if (!this.codeBlockContainer) return;

    const code = this.codeBlockContainer.querySelector('code');
    if (code) {
      code.textContent = this.currentCodeBlock;
    }
  }

  /**
   * Finalize code block
   */
  finalizeCodeBlock() {
    if (!this.codeBlockContainer) return;

    const status = this.codeBlockContainer.querySelector('.code-status');
    if (status) {
      status.textContent = 'complete';
    }

    // Notify callback
    if (this.options.onCodeBlock) {
      this.options.onCodeBlock('complete', {
        language: this.codeLanguage,
        code: this.currentCodeBlock
      });
    }
  }

  /**
   * Resume text streaming after code block
   */
  resumeTextStreaming() {
    const textDiv = document.createElement('div');
    textDiv.className = 'response-text';
    this.container.appendChild(textDiv);

    this.textContainer = new StreamingTextContainer({
      container: textDiv,
      showCursor: true
    });
    this.textContainer.startStreaming();
  }

  /**
   * Show thinking state using safe DOM methods
   * @param {string} [message] - Thinking message
   */
  showThinking(message = 'Thinking...') {
    this.currentPhase = 'thinking';

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking-indicator';

    const spinner = document.createElement('div');
    spinner.className = 'thinking-spinner';
    thinkingDiv.appendChild(spinner);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'thinking-message';
    messageSpan.textContent = message;
    thinkingDiv.appendChild(messageSpan);

    this.container.appendChild(thinkingDiv);

    if (this.options.onThinking) {
      this.options.onThinking(message);
    }
  }

  /**
   * Hide thinking state
   */
  hideThinking() {
    const thinking = this.container.querySelector('.thinking-indicator');
    if (thinking) {
      thinking.remove();
    }
    this.currentPhase = 'streaming';
  }

  /**
   * Complete the response using safe DOM methods
   */
  complete() {
    if (this.inCodeBlock) {
      // Force close code block
      this.inCodeBlock = false;
      this.finalizeCodeBlock();
    }

    if (this.textContainer) {
      this.textContainer.complete();
    }

    this.currentPhase = 'complete';

    // Add completion indicator using DOM methods
    const completeDiv = document.createElement('div');
    completeDiv.className = 'response-complete';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'complete-icon';
    iconSpan.textContent = '✓';
    completeDiv.appendChild(iconSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'complete-text';
    textSpan.textContent = 'Response complete';
    completeDiv.appendChild(textSpan);

    this.container.appendChild(completeDiv);

    if (this.options.onComplete) {
      this.options.onComplete();
    }

    uiLogger.info('Streaming response completed');
  }

  /**
   * Show error state using safe DOM methods
   * @param {string} message
   */
  showError(message) {
    this.currentPhase = 'error';

    if (this.textContainer) {
      this.textContainer.complete();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'response-error';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'error-icon';
    iconSpan.textContent = '⚠️';
    errorDiv.appendChild(iconSpan);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'error-message';
    messageSpan.textContent = message;
    errorDiv.appendChild(messageSpan);

    this.container.appendChild(errorDiv);
  }

  /**
   * Clear the UI
   */
  clear() {
    if (this.textContainer) {
      this.textContainer.destroy();
    }
    this.container.innerHTML = '';
    this.currentPhase = 'idle';
    this.inCodeBlock = false;
    this.currentCodeBlock = '';
  }

  /**
   * Get the full response text
   * @returns {string}
   */
  getText() {
    // Get all text content
    let text = '';
    const textElements = this.container.querySelectorAll('.response-text');
    for (const el of textElements) {
      text += el.textContent || '';
    }
    return text;
  }

  /**
   * Get all code blocks
   * @returns {Array<{language: string, code: string}>}
   */
  getCodeBlocks() {
    const blocks = [];
    const codeElements = this.container.querySelectorAll('.code-content code');
    for (const code of codeElements) {
      blocks.push({
        language: code.parentElement?.getAttribute('data-lang') || '',
        code: code.textContent || ''
      });
    }
    return blocks;
  }
}

/**
 * SSEParser - Server-Sent Events parser
 * Parses SSE stream into individual events
 */
export class SSEParser {
  constructor() {
    this.buffer = '';
  }

  /**
   * Parse chunk into events
   * @param {string} chunk - Raw chunk from stream
   * @returns {Array<{event?: string, data: string}>}
   */
  parse(chunk) {
    this.buffer += chunk;
    const events = [];
    const lines = this.buffer.split('\n');

    let currentEvent = null;

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];

      if (line === '') {
        // Empty line signals end of event
        if (currentEvent) {
          events.push(currentEvent);
          currentEvent = null;
        }
      } else if (line.startsWith('event:')) {
        currentEvent = currentEvent || { data: '' };
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent = currentEvent || { data: '' };
        currentEvent.data += line.slice(5).trim();
      }
    }

    // Keep last (potentially incomplete) line in buffer
    this.buffer = lines[lines.length - 1];

    return events;
  }

  /**
   * Reset parser
   */
  reset() {
    this.buffer = '';
  }
}

/**
 * Stream LLM response using fetch
 * @param {string} url - API URL
 * @param {Object} options - Fetch options
 * @param {Function} onChunk - Chunk callback
 * @param {AbortSignal} [signal] - Abort signal
 */
export async function streamLLMResponse(url, options, onChunk, signal) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Accept: 'text/event-stream'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  const parser = new SSEParser();

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const events = parser.parse(chunk);

      for (const event of events) {
        if (event.event === 'error') {
          throw new Error(event.data);
        }

        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            onChunk(data);
          } catch {
            // Not JSON, pass as-is
            onChunk({ content: event.data });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Add streaming UI styles
 */
export function addStreamingUIStyles() {
  if (document.getElementById('streaming-ui-styles')) return;

  const style = document.createElement('style');
  style.id = 'streaming-ui-styles';
  style.textContent = `
    .streaming-text-container {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.6;
    }

    .streaming-cursor {
      display: inline-block;
      color: var(--accent-color, #007acc);
      animation: cursorBlink 0.8s infinite;
      margin-left: 1px;
    }

    .streaming-cursor.active {
      animation: cursorBlink 0.8s infinite;
    }

    @keyframes cursorBlink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    .streaming-response-ui {
      padding: 12px;
      background: var(--bg-primary, #fff);
      border-radius: 8px;
      overflow-x: auto;
    }

    [data-theme="dark"] .streaming-response-ui {
      background: #1e1e1e;
    }

    .response-text {
      color: var(--text-primary, #333);
    }

    [data-theme="dark"] .response-text {
      color: #e0e0e0;
    }

    .streaming-code-block {
      margin: 12px 0;
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-secondary, #f5f5f5);
      border: 1px solid var(--border-color, #e0e0e0);
    }

    [data-theme="dark"] .streaming-code-block {
      background: #252526;
      border-color: #333;
    }

    .code-block-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-tertiary, #e8e8e8);
      font-size: 12px;
    }

    [data-theme="dark"] .code-block-header {
      background: #333;
    }

    .code-language {
      font-weight: 600;
      color: var(--text-primary, #333);
    }

    [data-theme="dark"] .code-language {
      color: #e0e0e0;
    }

    .code-status {
      color: var(--text-muted, #888);
      font-style: italic;
    }

    .copy-code-btn {
      margin-left: auto;
      padding: 4px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--text-muted, #888);
      transition: color 0.2s;
    }

    .copy-code-btn:hover {
      color: var(--text-primary, #333);
    }

    [data-theme="dark"] .copy-code-btn:hover {
      color: #e0e0e0;
    }

    .code-content {
      margin: 0;
      padding: 12px;
      overflow-x: auto;
      font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    .code-content code {
      display: block;
    }

    .thinking-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-secondary, #f5f5f5);
      border-radius: 8px;
      font-size: 13px;
      color: var(--text-muted, #888);
    }

    [data-theme="dark"] .thinking-indicator {
      background: #252526;
    }

    .thinking-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color, #e0e0e0);
      border-top-color: var(--accent-color, #007acc);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .response-complete {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 8px 12px;
      background: rgba(0, 180, 0, 0.1);
      border-radius: 6px;
      font-size: 12px;
      color: #0a0;
    }

    [data-theme="dark"] .response-complete {
      background: rgba(0, 180, 0, 0.2);
    }

    .complete-icon {
      font-size: 14px;
    }

    .response-error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 8px 12px;
      background: rgba(200, 0, 0, 0.1);
      border-radius: 6px;
      font-size: 13px;
      color: #c00;
    }

    [data-theme="dark"] .response-error {
      background: rgba(200, 0, 0, 0.2);
    }

    .error-icon {
      font-size: 16px;
    }
  `;

  document.head.appendChild(style);
}
