const DIMS = 32;

/** FNV-1a, stable across processes so the same email maps to the same vector. */
function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/)
    .filter((token) => token.length > 1);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Hashing embedder. It is not a semantic model. Structured lane tokens are
 * repeated so two emails for the same equipment and states land near each
 * other in pgvector, which is the property the desk actually retrieves on.
 */
export function embedText(text: string): number[] {
  const vector = Array.from({ length: DIMS }, () => 0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    const index = Math.abs(hash) % DIMS;
    const sign = hash & 1 ? 1 : -1;
    const weight =
      token.startsWith("equip:") ||
      token.startsWith("state:") ||
      token.startsWith("lane:")
        ? 4
        : 1;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function embedCase(input: {
  rawText: string;
  equipment: string;
  originState: string;
  destinationState: string;
}): number[] {
  const tags = [
    `equip:${input.equipment}`,
    `state:${input.originState.toLowerCase()}`,
    `state:${input.destinationState.toLowerCase()}`,
    `lane:${input.originState.toLowerCase()}${input.destinationState.toLowerCase()}`,
  ];
  return embedText([input.rawText, ...tags, ...tags, ...tags].join(" \n "));
}
