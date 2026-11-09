import { type Node, type ParseError, parseTree } from 'jsonc-parser';
import { isMap, isScalar } from 'yaml';

/** Parses strict JSON; comments, trailing commas, and malformed documents fail closed. */
export function jsonTree(source: string): Node | undefined {
  const errors: ParseError[] = [];
  const node = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false });
  return errors.length ? undefined : node;
}

/** Finds a YAML mapping pair by its literal scalar key; aliases are not traversed. */
export function yamlChild(node: unknown, segment: string) {
  if (!segment || segment.includes('<') || !isMap(node)) return;
  return node.items.find(pair => isScalar(pair.key) && String(pair.key.value) === segment);
}

/** Resolves one JSON key or Python-style signed array index, retaining source offsets. */
export function jsonChild(node: Node | undefined, segment: string):
  { value: Node; offset: number } | undefined {
  if (!segment || segment.includes('<')) return;
  if (node?.type === 'array') {
    if (!/^[+-]?\d+$/.test(segment)) return;
    let index = Number(segment);
    if (!Number.isSafeInteger(index)) return;
    const children = node.children ?? [];
    if (index < 0) index += children.length;
    const value = children[index];
    return value ? { value, offset: value.offset } : undefined;
  }
  if (node?.type !== 'object') return;
  const property = node.children?.find(pair => pair.children?.[0].value === segment);
  const key = property?.children?.[0];
  const value = property?.children?.[1];
  return key && value ? { value, offset: key.offset } : undefined;
}
