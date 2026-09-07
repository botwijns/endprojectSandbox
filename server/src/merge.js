export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Deep-merge `patch` into `target` and return a new object.
//  - plain objects merge recursively
//  - arrays and primitives from `patch` replace the target value
//  - an explicit `null` in `patch` deletes that key
export function deepMerge(target, patch) {
  if (!isPlainObject(target) || !isPlainObject(patch)) return patch;
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete out[key];
    } else if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
