import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BaselineField, BaselineNode } from './types.js';

/** Reads the committed baseline for one endpoint, or `null` if it's never been captured. */
export function loadBaseline(filePath: string): BaselineNode | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as BaselineNode;
}

/** Writes a baseline with deterministically sorted keys, so real changes are the only diff noise. */
export function saveBaseline(filePath: string, node: BaselineNode): void {
  writeFileSync(filePath, `${JSON.stringify(canonicalize(node), null, 2)}\n`, 'utf-8');
}

function canonicalize(node: BaselineNode): BaselineNode {
  if (node.kind === 'array') {
    return { kind: 'array', items: canonicalize(node.items) };
  }
  if (node.kind === 'object') {
    const fields: Record<string, BaselineField> = {};
    for (const key of Object.keys(node.fields).sort()) {
      const field = node.fields[key]!;
      fields[key] = { ...field, node: canonicalize(field.node) };
    }
    return { kind: 'object', fields };
  }
  return node;
}
