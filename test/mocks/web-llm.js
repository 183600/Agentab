// test/mocks/web-llm.js - Mock for @mlc-ai/web-llm

/**
 * Mock implementation of WebLLM for testing
 * Since @mlc-ai/web-llm is an optional dependency, we mock it for tests
 */

let mockEngine = null;

export async function CreateMLCEngine(modelId, options = {}) {
  mockEngine = {
    modelId,
    chat: {
      completions: {
        create: async (params) => {
          if (params.stream) {
            // Return async generator for streaming
            return (async function* () {
              const content = 'Mock streaming response from ' + modelId;
              const words = content.split(' ');
              for (const word of words) {
                yield {
                  choices: [{
                    delta: { content: word + ' ' }
                  }]
                };
              }
            })();
          }
          
          // Return regular response
          return {
            choices: [{
              message: {
                content: 'Mock response from ' + modelId
              }
            }]
          };
        }
      }
    },
    unload: async () => {
      mockEngine = null;
    }
  };
  
  // Call progress callback if provided
  if (options.initProgressCallback) {
    options.initProgressCallback({ progress: 0.5, text: 'Loading...' });
    options.initProgressCallback({ progress: 1, text: 'Complete' });
  }
  
  return mockEngine;
}

export function getMockEngine() {
  return mockEngine;
}

export function resetMockEngine() {
  mockEngine = null;
}

export default {
  CreateMLCEngine,
  getMockEngine,
  resetMockEngine
};
