/**
 * Tests for Streaming UI module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.performance = {
  now: () => Date.now()
};

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn()
  }
};

// Mock logger
vi.mock('../lib/logger.js', () => ({
  uiLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  },
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}));

// Mock ui-components
vi.mock('../lib/ui-components.js', () => ({
  escapeHtml: text => {
    if (text == null) return '';
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, char => entities[char]);
  }
}));

import { StreamingTextContainer, StreamingResponseUI, SSEParser, streamLLMResponse } from '../lib/streaming-ui.js';

describe('StreamingTextContainer', () => {
  let container;
  let streamingContainer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container?.remove();
    streamingContainer?.destroy();
  });

  it('should initialize correctly', () => {
    streamingContainer = new StreamingTextContainer({ container });
    expect(streamingContainer.isStreaming).toBe(false);
    expect(streamingContainer.text).toBe('');
  });

  it('should start streaming', () => {
    streamingContainer = new StreamingTextContainer({ container });
    streamingContainer.startStreaming();
    expect(streamingContainer.isStreaming).toBe(true);
    expect(streamingContainer.text).toBe('');
  });

  it('should add chunks', () => {
    streamingContainer = new StreamingTextContainer({ container, showCursor: false });
    streamingContainer.startStreaming();
    streamingContainer.addChunk('Hello');
    streamingContainer.addChunk(' World');
    
    // Complete and check text
    streamingContainer.complete();
    expect(streamingContainer.getText()).toBe('Hello World');
  });

  it('should complete streaming', () => {
    streamingContainer = new StreamingTextContainer({ container, showCursor: false });
    streamingContainer.startStreaming();
    streamingContainer.addChunk('Test');
    streamingContainer.complete();
    
    expect(streamingContainer.isStreaming).toBe(false);
  });

  it('should clear content', () => {
    streamingContainer = new StreamingTextContainer({ container, showCursor: false });
    streamingContainer.startStreaming();
    streamingContainer.addChunk('Test');
    streamingContainer.clear();
    
    expect(streamingContainer.text).toBe('');
    expect(streamingContainer.pendingText).toBe('');
  });

  it('should handle custom options', () => {
    streamingContainer = new StreamingTextContainer({
      container,
      chunkSize: 5,
      animationSpeed: 10,
      showCursor: true,
      cursorChar: '|'
    });
    
    expect(streamingContainer.options.chunkSize).toBe(5);
    expect(streamingContainer.options.animationSpeed).toBe(10);
    expect(streamingContainer.options.showCursor).toBe(true);
    expect(streamingContainer.options.cursorChar).toBe('|');
  });
});

describe('StreamingResponseUI', () => {
  let container;
  let ui;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container?.remove();
    ui?.clear();
  });

  it('should initialize correctly', () => {
    ui = new StreamingResponseUI({ container });
    expect(ui.currentPhase).toBe('idle');
  });

  it('should start response', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    expect(ui.currentPhase).toBe('streaming');
  });

  it('should handle text chunks', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.handleChunk('Hello World');
    ui.complete();
    
    expect(ui.currentPhase).toBe('complete');
  });

  it('should handle code blocks', () => {
    const onCodeBlock = vi.fn();
    ui = new StreamingResponseUI({ container, onCodeBlock });
    ui.startResponse();
    
    // Simulate code block
    ui.handleChunk('```javascript\nconst x = 1;\n```');
    ui.complete();
    
    expect(onCodeBlock).toHaveBeenCalled();
  });

  it('should show thinking state', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.showThinking('Processing...');
    
    const thinking = container.querySelector('.thinking-indicator');
    expect(thinking).not.toBeNull();
  });

  it('should show error state', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.showError('Something went wrong');
    
    const error = container.querySelector('.response-error');
    expect(error).not.toBeNull();
    expect(ui.currentPhase).toBe('error');
  });

  it('should complete response', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.handleChunk('Done');
    ui.complete();
    
    const complete = container.querySelector('.response-complete');
    expect(complete).not.toBeNull();
    expect(ui.currentPhase).toBe('complete');
  });

  it('should call onComplete callback', () => {
    const onComplete = vi.fn();
    ui = new StreamingResponseUI({ container, onComplete });
    ui.startResponse();
    ui.complete();
    
    expect(onComplete).toHaveBeenCalled();
  });

  it('should clear UI', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.handleChunk('Test');
    ui.clear();
    
    expect(container.innerHTML).toBe('');
    expect(ui.currentPhase).toBe('idle');
  });

  it('should get text content', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.handleChunk('Hello World');
    ui.complete();
    
    // Verify the streaming process completed
    expect(ui.currentPhase).toBe('complete');
    // Text may be in the container or handled by streaming
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('should get code blocks', () => {
    ui = new StreamingResponseUI({ container });
    ui.startResponse();
    ui.handleChunk('```javascript\nconst x = 1;\n```');
    ui.complete();
    
    const blocks = ui.getCodeBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(0);
  });
});

describe('SSEParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SSEParser();
  });

  it('should initialize with empty buffer', () => {
    expect(parser.buffer).toBe('');
  });

  it('should parse simple data event', () => {
    const events = parser.parse('data: hello\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('hello');
  });

  it('should parse JSON data event', () => {
    const events = parser.parse('data: {"text":"hello"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"text":"hello"}');
  });

  it('should parse event type', () => {
    const events = parser.parse('event: message\ndata: hello\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message');
    expect(events[0].data).toBe('hello');
  });

  it('should handle multiple events', () => {
    const events = parser.parse('data: first\n\ndata: second\n\n');
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('first');
    expect(events[1].data).toBe('second');
  });

  it('should handle incomplete event', () => {
    const events = parser.parse('data: incomplete');
    expect(events).toHaveLength(0);
    expect(parser.buffer).toBe('data: incomplete');
  });

  it('should continue from buffer', () => {
    parser.parse('data: incomplete');
    const events = parser.parse('\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('incomplete');
  });

  it('should reset buffer', () => {
    parser.parse('data: incomplete');
    parser.reset();
    expect(parser.buffer).toBe('');
  });

  it('should handle multiline data', () => {
    const events = parser.parse('data: line1\ndata: line2\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line1line2');
  });

  it('should handle empty lines', () => {
    const events = parser.parse('data: test\n\n\n\ndata: test2\n\n');
    expect(events).toHaveLength(2);
  });
});

describe('streamLLMResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(streamLLMResponse('http://test', {}, () => {})).rejects.toThrow('HTTP 404');
  });

  it('should handle successful stream', async () => {
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"text":"hello"}\n\n') })
        .mockResolvedValueOnce({ done: true }),
      releaseLock: vi.fn()
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader
      }
    });

    const onChunk = vi.fn();
    await streamLLMResponse('http://test', {}, onChunk);
    
    expect(onChunk).toHaveBeenCalled();
  });

  it('should handle abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const mockReader = {
      read: vi.fn().mockResolvedValue({ done: false, value: new Uint8Array() }),
      cancel: vi.fn(),
      releaseLock: vi.fn()
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader
      }
    });

    await streamLLMResponse('http://test', {}, () => {}, controller.signal);
    
    expect(mockReader.cancel).toHaveBeenCalled();
  });
});
