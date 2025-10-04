export type QueryField<T = any> = string | ((data: T) => any) | QueryObject;
export interface QueryObject {
  [key: string]: QueryField | QueryDirective;
}

export type QueryDirective = {
  path?: string;
  skipIf?: string;
  nested?: QueryObject;
  filter?: string;
};

/** Type guard for directive objects */
function isDirectiveObject(field: any): field is QueryDirective {
  return (
    typeof field === "object" &&
    field !== null &&
    ("path" in field ||
      "skipIf" in field ||
      "nested" in field ||
      "filter" in field)
  );
}

/** Auto-resolve a key in nested object (deep search) */
function autoResolve(obj: any, key: string): any {
  if (obj == null) return null;
  if (key in obj) return obj[key];
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (typeof val === "object" && val !== null) {
      const found = autoResolve(val, key);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Get value by dot-path */
function getByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj) ?? null;
}

/** Evaluate JS expression safely with `data` in scope */
function evalExpression(expr: string, data: any) {
  try {
    return Function("data", `with(data) { return ${expr} }`)(data);
  } catch {
    return null;
  }
}

/** Parse query string into QueryObject with nested, filter, skip, computed fields */
export function parseQuery(queryStr: string): QueryObject {
  const lines = queryStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const obj: QueryObject = {};
  const stack: { obj: QueryObject }[] = [{ obj }];

  for (let line of lines) {
    line = line.replace(/,$/, ""); // Remove trailing comma

    if (line.endsWith("{")) {
      // key with optional filter: key(filter: "...") {
      const match = line.match(
        /^(\w+)(?:\(\s*filter:\s*["'](.+)["']\s*\))?\s*{\s*,?$/
      );
      if (!match) continue;

      const key = match[1];
      const filter = match[2]?.trim();
      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };
      if (filter) directive.filter = filter.trim();

      stack[stack.length - 1].obj[key] = directive;
      stack.push({ obj: nested });
      continue;
    }

    if (line === "}") {
      stack.pop();
      continue;
    }

    // Field with optional skip
    const skipMatch = line.match(/@skip\(if:\s*"(.*)"\)/);
    let skipIf: string | undefined;
    let fieldLine = line;
    if (skipMatch) {
      skipIf = skipMatch[1];
      fieldLine = line.replace(/@skip\(if:\s*".*"\)/, "").trim();
    }

    // Alias or computed field: alias: expr
    const aliasMatch = fieldLine.match(/^(\w+)\s*:\s*(.+)$/);
    if (aliasMatch) {
      const alias = aliasMatch[1];
      const expr = aliasMatch[2];
      if (skipIf) {
        stack[stack.length - 1].obj[alias] = { path: expr, skipIf };
      } else {
        stack[stack.length - 1].obj[alias] = expr;
      }
      continue;
    }

    // Simple field
    if (skipIf) {
      stack[stack.length - 1].obj[fieldLine] = { path: fieldLine, skipIf };
    } else {
      stack[stack.length - 1].obj[fieldLine] = fieldLine;
    }
  }

  return obj;
}

/** Shape data according to query */
export function shape<T>(
  data: T,
  query: string | QueryObject,
  rootData?: any
): any {
  const queryObj: QueryObject =
    typeof query === "string" ? parseQuery(query) : query;

  const result: any = {};
  const root = rootData ?? data;

  for (const key in queryObj) {
    const field = queryObj[key];

    if (isDirectiveObject(field)) {
      if (field.skipIf && evalExpression(field.skipIf, data)) {
        result[key] = null;
        continue;
      }
      // Try local data first, then fallback to root data
      let value = field.path ? getByPath(data, field.path) : (data as any)[key];
      if (value === undefined && root !== data) {
        value = root[key];
      }
      if (value === undefined) {
        value = autoResolve(root, key);
      }
      if (Array.isArray(value)) {
        let arrData = value;
        if (field.filter) {
          arrData = arrData.filter(
            (item) => evalExpression(field.filter!, { ...item }) === true
          );
        }
        result[key] = arrData.map((item) => shape(item, field.nested!, root));
      } else if (typeof value === "object" && value !== null) {
        result[key] = shape(value, field.nested!, root);
      } else {
        result[key] = value ?? null;
      }
      continue;
    }

    // Computed field (expression)
    if (
      typeof field === "string" &&
      (field.includes("+") || field.includes(".") || field.includes("'"))
    ) {
      // If it's a path, get value; otherwise, evaluate as expression
      if (/^[\w.]+$/.test(field)) {
        result[key] = getByPath(data, field) ?? null;
      } else {
        // If the expression references the parent key (e.g. user.), use root data
        if (field.startsWith("user.")) {
          result[key] = evalExpression(field, root);
        } else {
          result[key] = evalExpression(field, data);
        }
      }
      continue;
    }

    if (typeof field === "function") {
      result[key] = field(data);
      continue;
    }

    if (typeof field === "object" && field !== null) {
      // Try local data first, then fallback to root data
      let nestedValue = (data as any)[key];
      if (nestedValue === undefined && root !== data) {
        nestedValue = root[key];
      }
      // If still undefined, try autoResolve (deep search in root)
      if (nestedValue === undefined) {
        nestedValue = autoResolve(root, key);
      }
      result[key] = shape(nestedValue, field, root);
      continue;
    }

    result[key] = (data as Record<string, any>)[key] ?? null;
  }

  return result;
}
