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
function getByPath(obj: any, path: string) {
  return (
    path
      .split(".")
      .reduce((acc, key) => (acc as Record<string, any>)?.[key], obj) ?? null
  );
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
    line = line.replace(/,$/, "");

    // Start of nested object
    if (line.endsWith("{")) {
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

    // End of nested object
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // Ignore fragment spreads
    if (line.startsWith("...")) continue;

    // Field with optional skip
    const skipMatch = line.match(/@skip\(if:\s*"(.*)"\)/);
    let skipIf: string | undefined;
    let fieldLine = line;
    if (skipMatch) {
      skipIf = skipMatch[1];
      fieldLine = line.replace(/@skip\(if:\s*".*"\)/, "").trim();
    }

    // Alias / computed field
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
  rootData?: any,
  contextKey?: string // 👈 Added to handle nested computed fields
): any {
  const queryObj: QueryObject =
    typeof query === "string" ? parseQuery(query) : query;

  const result: any = {};
  const root = rootData ?? data;

  for (const key in queryObj) {
    const field = queryObj[key];

    // --- 1️⃣ Directives (nested, filter, skip)
    // --- 1️⃣ Directives (nested, filter, skip)
    if (isDirectiveObject(field)) {
      if (field.skipIf) {
        const evalScope = { ...root, ...data };
        if (contextKey) evalScope[contextKey] = data;
        evalScope.this = data;

        if (evalExpression(field.skipIf, evalScope)) {
          result[key] = null;
          continue;
        }
      }

      let value = field.path
        ? evalExpression(field.path, { ...root, ...data })
        : (data as Record<string, any>)[key];

      if (value === undefined && root !== data)
        value = (root as Record<string, any>)[key];
      if (value === undefined) value = autoResolve(root, key);

      if (Array.isArray(value)) {
        let arrData = value;
        if (field.filter) {
          arrData = arrData.filter(
            (item) => evalExpression(field.filter!, item) === true
          );
        }
        result[key] = arrData.map((item) =>
          shape(item, field.nested || {}, root, key)
        );
      } else if (typeof value === "object" && value !== null) {
        result[key] = shape(value, field.nested || {}, root, key);
      } else {
        result[key] = value ?? null;
      }
      continue;
    }

    // --- 2️⃣ Computed or aliased fields
    if (typeof field === "string") {
      const simplePathRegex = /^[\w.]+$/;

      if (simplePathRegex.test(field)) {
        result[key] = getByPath(data, field) ?? null;
      } else {
        const evalScope = { ...root, ...data };

        // 👇 Inject current context (e.g. manager)
        if (contextKey) evalScope[contextKey] = data;

        // 👇 Allow access via "this"
        evalScope.this = data;

        result[key] = evalExpression(field, evalScope);
      }
      continue;
    }

    // --- 3️⃣ Function fields
    if (typeof field === "function") {
      result[key] = field(data);
      continue;
    }

    // --- 4️⃣ Nested object fields
    if (typeof field === "object" && field !== null) {
      let nestedValue = (data as Record<string, any>)[key];
      if (nestedValue === undefined && root !== data)
        nestedValue = (root as Record<string, any>)[key];
      if (nestedValue === undefined) nestedValue = autoResolve(root, key);
      result[key] = shape(nestedValue, field, root, key);
      continue;
    }

    // --- 5️⃣ Fallback
    result[key] = (data as Record<string, any>)[key] ?? null;
  }

  return result;
}
