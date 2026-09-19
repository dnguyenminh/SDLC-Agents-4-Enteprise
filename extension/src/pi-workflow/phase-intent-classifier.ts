import { z } from 'zod';
import type { PiProvider } from './pi-provider';
import { createPiProvider } from './pi-provider';
import { logger } from '../logger';
import { PHASE_ORDER, type SDLCPhase } from './sdlc-phases';

export const IntentSchema = z.object({
  type: z.enum(['phase_change', 'continue', 'finish', 'manual_review', 'unknown']),
  target: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

export class IntentClassifier {
  private readonly schema = IntentSchema;
  private piProvider?: PiProvider;
  private piAgentId = 'intent-classifier';

  constructor(piProvider?: PiProvider) {
    this.piProvider = piProvider;
  }

  classify(inputText: string | Record<string, any>): Intent {
    let text = '';
    if (typeof inputText === 'string') {
      text = inputText.toLowerCase();
    } else if (inputText && typeof inputText === 'object') {
      const extracted = inputText.prompt || inputText.text || inputText.content || inputText.message;
      if (typeof extracted === 'string' && extracted.trim()) {
        text = extracted.toLowerCase();
      } else {
        logger.warn('IntentClassifier.classify: received object without valid string content', { keys: Object.keys(inputText) });
        return { type: 'unknown' };
      }
    } else {
      logger.warn('IntentClassifier.classify: received non-string non-object input', { type: typeof inputText });
      return { type: 'unknown' };
    }
    let intent: Intent = { type: 'unknown' };

    if (text.includes('move to') || text.includes('transition to') || text.includes('next phase')) {
      const match = text.match(/to\s+([a-z_]+)/);
      if (match && PHASE_ORDER.includes(match[1] as SDLCPhase)) {
        intent = { type: 'phase_change', target: match[1], confidence: 0.8, reason: 'Heuristic match' };
      } else {
        intent = { type: 'continue', confidence: 0.6, reason: 'Implicit transition' };
      }
    } else if (text.includes('finish') || text.includes('complete')) {
      intent = { type: 'finish', confidence: 0.7, reason: 'Explicit finish' };
    } else if (text.includes('review') || text.includes('manual')) {
      intent = { type: 'manual_review', confidence: 0.6, reason: 'Manual review requested' };
    } else {
      intent = { type: 'continue', confidence: 0.5, reason: 'Default continue' };
    }

    const parsed = this.schema.safeParse(intent);
    if (!parsed.success) {
      logger.error('Intent schema validation failed', { issues: parsed.error.issues, intent });
      return { type: 'unknown' };
    }
    return parsed.data;
  }

  async classifyWithPi(inputText: string | Record<string, any>): Promise<Intent> {
    if (!this.piProvider) {
      try {
        const provider = createPiProvider();
        await provider.initialize({ transportType: 'HTTP' });
        this.piProvider = provider;
      } catch {
        return this.classify(inputText);
      }
    }
    try {
      const agent = await this.piProvider.createAgent(this.piAgentId);
      const prompt = `Classify the user input into SDLC intent. Respond with JSON matching schema: {type:'phase_change'|'continue'|'finish'|'manual_review'|'unknown', target?:string, confidence:number, reason:string}. Input: ${inputText}`;
      const chunks: string[] = [];
      for await (const chunk of agent.stream({ agentId: this.piAgentId, messages: [{ role: 'user', content: prompt }] })) {
        if (chunk.type === 'text' && chunk.content) chunks.push(chunk.content);
      }
      const raw = chunks.join('');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsedJson = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (parsedJson) {
        const validated = IntentSchema.safeParse(parsedJson);
        if (validated.success) {
          logger.info('Intent classified via Pi SDK', { intent: validated.data });
          return validated.data;
        }
      }
      logger.warn('Pi SDK intent parse failed, fallback heuristic', { raw });
    } catch (e) {
      logger.error('Pi SDK intent classification error', { error: (e as Error).message });
    }
    return this.classify(inputText);
  }
}
