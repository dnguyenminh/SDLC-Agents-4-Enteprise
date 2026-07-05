/**
 * LLM connection test result interfaces.
 */

export interface LlmTestResult {
  success: boolean;
  message?: string;
  error?: string;
}
