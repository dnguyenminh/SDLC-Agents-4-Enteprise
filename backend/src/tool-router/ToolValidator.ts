import { z } from 'zod';
import type { ToolDefinition } from '../types/tool.js';

const JSON_SCHEMA_TYPE_MAP: Record<string, z.ZodType> = {
  string: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  object: z.record(z.unknown()),
  array: z.array(z.unknown()),
};

export class ToolValidator {
  validate(tool: ToolDefinition, args: Record<string, unknown>): string | null {
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== 'object') return null;

    try {
      const zodSchema = this.jsonSchemaToZod(schema as Record<string, unknown>);
      zodSchema.parse(args);
      return null;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      }
      return 'Invalid arguments';
    }
  }

  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
    if (schema.type === 'object' && schema.properties) {
      const properties = schema.properties as Record<string, unknown>;
      const required = (Array.isArray(schema.required) ? schema.required : []) as string[];
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, prop] of Object.entries(properties)) {
        const propSchema = prop as Record<string, unknown>;
        let zodProp = this.jsonSchemaToZod(propSchema);
        if (!required.includes(key)) {
          zodProp = zodProp.optional();
        }
        shape[key] = zodProp;
      }

      return z.object(shape);
    }

    if (schema.type === 'array' && schema.items) {
      const items = this.jsonSchemaToZod((schema as Record<string, unknown>).items as Record<string, unknown>);
      return z.array(items);
    }

    const typeName = schema.type as string | undefined;
    if (typeName && typeName in JSON_SCHEMA_TYPE_MAP) {
      return JSON_SCHEMA_TYPE_MAP[typeName];
    }

    return z.unknown();
  }
}
