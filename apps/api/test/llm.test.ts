import { describe, it, expect } from 'vitest';
import { parseJSON } from '../src/agent/llm/types.js';

describe('LLM layer', () => {
  it('parses JSON even when a model wraps it in fences or prose', () => {
    expect(parseJSON<{ a: number }>('```json\n{"a":1}\n```').a).toBe(1);
    expect(parseJSON<{ a: number }>('Here you go: {"a":2}').a).toBe(2);
    expect(() => parseJSON('no json here')).toThrow();
  });
});
