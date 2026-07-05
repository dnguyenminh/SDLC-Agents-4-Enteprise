import { Request, Response } from 'express';
import { convertResponseToSSEEvents, extractToolUseIds, validateToolUseId } from './converter';
import { ConversationHistory } from '../history/conversation';
import { KiroQResponse, ContinuationRequest } from './types';
import { logger } from '../logger';

/**
 * Creates a handler with injectable dependencies for testability.
 */
export function createChatCompletionsHandler(
  history: ConversationHistory,
  forwardToKiroQ: (request: ContinuationRequest) => Promise<KiroQResponse>,
) {
  /**
   * Handle POST /chat/completions
   * Implements UC-1 (ReAct Tool Loop) and UC-2 (Diagnostic Error)
   */
  return async function handleChatCompletions(req: Request, res: Response): Promise<void> {
    const body = req.body as ContinuationRequest;

    // --- Step 1: Process continuation (if tool result present) ---
    if (body.toolResult) {
      const { toolUseId, content, isError } = body.toolResult;

      // Validate toolUseId exists in history (BR-2)
      const match = history.findToolUse(toolUseId);
      if (!match) {
        // UC-2: Diagnostic error on mismatch (BR-6, BR-7, BR-8)
        const availableIds = history.getAllToolUseIds();
        const turnNumber = history.getCurrentTurn();

        logger.warn('tool_use_id mismatch', {
          event: 'TOOL_USE_ID_MISMATCH',
          receivedId: toolUseId,
          availableIds,
          turnNumber,
        });

        res.status(400).json({
          error: {
            type: 'tool_use_id_mismatch',
            message: `Tool continuation failed: tool_use_id '${toolUseId}' not found in conversation history. Available IDs: [${availableIds.map(id => `'${id}'`).join(', ')}]`,
            received_id: toolUseId,
            available_ids: availableIds,
            turn_number: turnNumber,
          },
        });
        return;
      }

      // Store tool result in history
      history.addToolResult(toolUseId, content, isError ?? false);
    }

    // --- Step 2: Forward to Kiro Q API ---
    let kiroQResponse: KiroQResponse;
    try {
      kiroQResponse = await forwardToKiroQ(body);
    } catch (err) {
      logger.error('Failed to forward to Kiro Q API', { error: String(err) });
      res.status(502).json({
        error: {
          type: 'upstream_error',
          message: 'AI service unavailable, please retry',
        },
      });
      return;
    }

    // --- Step 3: Validate response (BR-3) ---
    for (const block of kiroQResponse.content) {
      if (block.type === 'tool_use') {
        if (!validateToolUseId(block.id)) {
          logger.error('Invalid tool_use_id from API', { id: block.id });
          res.status(502).json({
            error: {
              type: 'malformed_api_response',
              message: 'Received malformed tool_use response from API (invalid/missing id field)',
            },
          });
          return;
        }
      }
    }

    // --- Step 4: Store in history with SAME IDs (BR-2) ---
    history.addAssistantMessage(kiroQResponse);

    logger.trace('tool_use_ids stored in history', {
      ids: extractToolUseIds(kiroQResponse),
      turn: history.getCurrentTurn(),
    });

    // --- Step 5: Stream SSE response (BR-1 - ID passthrough) ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const events = convertResponseToSSEEvents(kiroQResponse);
    for (const event of events) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    res.end();
  };
}
