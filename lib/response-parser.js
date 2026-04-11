// lib/response-parser.js - LLM response parsing

import { agentLogger as logger } from './logger.js';

/**
 * ResponseParser - Parse and validate LLM responses
 */
export class ResponseParser {
  /**
   * Parse LLM response to extract action
   * @param {string} text - LLM response text
   * @returns {Object} Parsed action object
   * @throws {Error} If parsing fails
   */
  parse(text) {
    // Try to extract JSON from code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        return this.validate(parsed);
      } catch (e) {
        logger.debug('Failed to parse code block JSON', { error: e.message });
      }
    }

    // Try to parse entire response as JSON
    try {
      const parsed = JSON.parse(text.trim());
      return this.validate(parsed);
    } catch (e) {
      logger.debug('Failed to parse response as JSON', { error: e.message });
    }

    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validate(parsed);
      } catch (e) {
        logger.debug('Failed to parse embedded JSON', { error: e.message });
      }
    }

    throw new Error('Could not parse LLM response as JSON');
  }

  /**
   * Validate parsed action object
   * @param {Object} action - Parsed action
   * @returns {Object} Validated action
   */
  validate(action) {
    if (!action || typeof action !== 'object') {
      throw new Error('Response must be a JSON object');
    }

    if (!action.action) {
      throw new Error('Response must have an "action" field');
    }

    const validActions = ['execute', 'complete', 'error'];
    if (!validActions.includes(action.action)) {
      throw new Error(`Invalid action: ${action.action}. Must be one of: ${validActions.join(', ')}`);
    }

    // Validate based on action type
    switch (action.action) {
      case 'execute':
        if (!action.code || typeof action.code !== 'string') {
          throw new Error('Execute action requires a "code" string');
        }
        break;
      case 'complete':
        if (!action.result) {
          throw new Error('Complete action requires a "result" field');
        }
        break;
      case 'error':
        if (!action.error) {
          throw new Error('Error action requires an "error" field');
        }
        break;
    }

    return action;
  }

  /**
   * Generate correction prompt for invalid response
   * @param {Error} error - The parsing error
   * @returns {string} Correction prompt
   */
  getCorrectionPrompt(error) {
    return `Your previous response could not be parsed: ${error.message}

Please provide a valid response in the required JSON format:
{
  "action": "execute" | "complete" | "error",
  "code": "JavaScript code" (if action is execute),
  "result": "result message" (if action is complete),
  "error": "error message" (if action is error),
  "explanation": "brief explanation"
}

Respond ONLY with the JSON object, no additional text.`;
  }
}

// Singleton instance
export const responseParser = new ResponseParser();
