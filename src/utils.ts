import { QueryDirective } from "./types";

/** Check if a field is a QueryDirective object */
export function isDirectiveObject(field: any): field is QueryDirective {
  return (
    typeof field === "object" &&
    field !== null &&
    ("path" in field ||
      "skipIf" in field ||
      "includeIf" in field ||
      "nested" in field ||
      "filter" in field ||
      "default" in field ||
      "transform" in field ||
      "limit" in field ||
      "skip" in field)
  );
}

/** Auto resolve a key from nested objects */
export function autoResolve(obj: any, key: string): any {
  if (obj == null) return null;
  if ((obj as Record<string, any>)[key] !== undefined)
    return (obj as Record<string, any>)[key];
  for (const k of Object.keys(obj)) {
    const val = (obj as Record<string, any>)[k];
    if (typeof val === "object" && val !== null) {
      const found = autoResolve(val, key);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Get value by dot-path */
export function getByPath(obj: any, path: string) {
  return (
    path
      .split(".")
      .reduce((acc, key) => (acc as Record<string, any>)?.[key], obj) ?? null
  );
}

/** Evaluate JS expression safely with `data` in scope */
export function evalNestedField(expr: string, data: any, root: any) {
  try {
    return Function(
      "data",
      "root",
      `
      with(data){
        with(root){
          return ${expr};
        }
      }
    `
    )(data, root);
  } catch {
    return null;
  }
}

/** Deep merge objects */
export function mergeDeep(target: any, source: any) {
  for (const key in source) {
    if (key === "__fragments") continue;
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/** Parse directive arguments */
export function parseArgs(argsStr: string): Record<string, any> {
  const args: Record<string, any> = {};
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < argsStr.length; i++) {
    const c = argsStr[i];
    if ((c === '"' || c === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = c;
      current += c;
    } else if (c === quoteChar && inQuotes) {
      inQuotes = false;
      current += c;
    } else if (c === "," && !inQuotes) {
      const [k, v] = current.split(":").map((s) => s.trim());
      if (k) {
        if (["limit", "skip"].includes(k)) args[k] = parseInt(v, 10);
        else args[k] = v.replace(/^["']|["']$/g, "");
      }
      current = "";
    } else {
      current += c;
    }
  }

  if (current) {
    const [k, v] = current.split(":").map((s) => s.trim());
    if (k) {
      if (["limit", "skip"].includes(k)) args[k] = parseInt(v, 10);
      else args[k] = v.replace(/^["']|["']$/g, "");
    }
  }

  return args;
}
