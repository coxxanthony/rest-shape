export type QueryField<T = any> = string | ((data: T) => any) | QueryObject;
export interface QueryObject {
  [key: string]: QueryField;
}

/**
 * Auto-resolve a key in nested object (deep search)
 */
function autoResolve(obj: any, key: string): any {
  if (obj == null) return null;
  if (key in obj) return obj[key];
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (typeof val === "object") {
      const found = autoResolve(val, key);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Get value by dot-path
 */
function getByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj) ?? null;
}

/**
 * Shape REST API response according to a query (string or object)
 */
export function shape<T>(
  data: T,
  query: string | QueryObject,
  computedFields?: QueryObject
): any {
  function parseQuery(queryStr: string): QueryObject {
    const lines = queryStr
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const obj: QueryObject = {};
    const stack: { obj: QueryObject }[] = [{ obj }];

    for (const line of lines) {
      if (line.endsWith("{")) {
        const key = line.slice(0, -1).trim();
        const nested: QueryObject = {};
        stack[stack.length - 1].obj[key] = nested;
        stack.push({ obj: nested });
      } else if (line === "}") {
        stack.pop();
      } else {
        const [key, path] = line.split(":").map((s) => s.trim());
        stack[stack.length - 1].obj[key] = path || key;
      }
    }

    return obj;
  }

  const queryObj: QueryObject =
    typeof query === "string" ? parseQuery(query) : query;

  // Merge computed fields if provided
  const finalQuery = { ...queryObj, ...(computedFields ?? {}) };

  const result: any = {};

  for (const key in finalQuery) {
    const field = finalQuery[key];

    if (typeof field === "string") {
      const value = getByPath(data, field);
      result[key] =
        value !== undefined && value !== null ? value : autoResolve(data, key);
    } else if (typeof field === "function") {
      result[key] = field(data);
    } else if (typeof field === "object") {
      let nestedData = getByPath(data, key);
      if (!nestedData) nestedData = autoResolve(data, key);

      if (Array.isArray(nestedData)) {
        result[key] = nestedData.map((item) => shape(item, field));
      } else if (nestedData && typeof nestedData === "object") {
        result[key] = shape(nestedData, field);
      } else {
        result[key] = null;
      }
    } else {
      const val = (data as Record<string, any>)[key];
      result[key] = val !== undefined ? val : null;
    }
  }

  return result;
}
