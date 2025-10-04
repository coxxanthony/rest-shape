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

    // End of nested object
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // Ignore fragment spreads
    if (line.startsWith("...")) continue;

    // If this is a nested start (ends with "{"), we must handle possible @skip and filter on the same header line
    if (line.endsWith("{")) {
      // Remove trailing "{"
      let header = line.slice(0, -1).trim();

      // Extract @skip(if: "...")
      const skipMatch = header.match(/@skip\(if:\s*"(.*)"\)/);
      let skipIf: string | undefined;
      if (skipMatch) {
        skipIf = skipMatch[1];
        header = header.replace(skipMatch[0], "").trim();
      }

      // Extract filter in parentheses: key(filter: "expr")
      const filterMatch = header.match(
        /^(\w+)\(\s*filter:\s*["'](.+)["']\s*\)$/
      );
      let key: string | undefined;
      let filter: string | undefined;
      if (filterMatch) {
        key = filterMatch[1];
        filter = filterMatch[2]?.trim();
      } else {
        // simple "key {"
        const m = header.match(/^(\w+)$/);
        if (!m) {
          // unrecognized header — skip to be safe
          continue;
        }
        key = m[1];
      }

      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };
      if (filter) directive.filter = filter;
      if (skipIf) directive.skipIf = skipIf;

      // attach directive to current stack object
      stack[stack.length - 1].obj[key!] = directive;
      stack.push({ obj: nested });
      continue;
    }

    // Field with optional skip (single-line field)
    const skipMatch = line.match(/@skip\(if:\s*"(.*)"\)/);
    let skipIfSingle: string | undefined;
    let fieldLine = line;
    if (skipMatch) {
      skipIfSingle = skipMatch[1];
      fieldLine = line.replace(skipMatch[0], "").trim();
    }

    // Alias / computed field
    const aliasMatch = fieldLine.match(/^(\w+)\s*:\s*(.+)$/);
    if (aliasMatch) {
      const alias = aliasMatch[1];
      const expr = aliasMatch[2];
      if (skipIfSingle) {
        stack[stack.length - 1].obj[alias] = {
          path: expr,
          skipIf: skipIfSingle,
        };
      } else {
        stack[stack.length - 1].obj[alias] = expr;
      }
      continue;
    }

    // Simple field
    if (skipIfSingle) {
      stack[stack.length - 1].obj[fieldLine] = {
        path: fieldLine,
        skipIf: skipIfSingle,
      };
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
  contextKey?: string // 👈 keep to propagate parent key for evalScope
): any {
  const queryObj: QueryObject =
    typeof query === "string" ? parseQuery(query) : query;

  const result: any = {};
  const root = rootData ?? data;

  for (const key in queryObj) {
    const field = queryObj[key];

    if (isDirectiveObject(field)) {
      // --- SAFE @skip(if:) evaluation, using propagated contextKey or detecting parent in root
      if (field.skipIf) {
        const evalScope = { ...root, ...data };
        evalScope.this = data;

        const parentKey =
          contextKey ||
          Object.keys(root || {}).find(
            (k) => (root as Record<string, any>)[k] === data
          );
        if (parentKey) evalScope[parentKey] = data;

        let shouldSkip = false;
        try {
          shouldSkip = !!evalExpression(field.skipIf, evalScope);
        } catch {
          shouldSkip = true;
        }

        if (shouldSkip) {
          // ensure property exists as null even for nested cases
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
        result[key] = field.nested
          ? arrData.map((item) =>
              shape(item, field.nested as QueryObject, root, key)
            )
          : arrData;
      } else if (typeof value === "object" && value !== null) {
        result[key] = field.nested
          ? shape(value, field.nested as QueryObject, root, key)
          : value;
      } else {
        result[key] = value ?? null;
      }

      continue;
    }

    // --- Computed or aliased fields
    if (typeof field === "string") {
      const simplePathRegex = /^[\w.]+$/;

      if (simplePathRegex.test(field)) {
        result[key] = getByPath(data, field) ?? null;
      } else {
        const evalScope = { ...root, ...data };
        if (contextKey) evalScope[contextKey] = data;
        evalScope.this = data;
        result[key] = evalExpression(field, evalScope);
      }
      continue;
    }

    // --- Function fields
    if (typeof field === "function") {
      result[key] = field(data);
      continue;
    }

    // --- Nested object fields (when the query specified a nested QueryObject directly)
    if (typeof field === "object" && field !== null) {
      let nestedValue = (data as Record<string, any>)[key];
      if (nestedValue === undefined && root !== data)
        nestedValue = (root as Record<string, any>)[key];
      if (nestedValue === undefined) nestedValue = autoResolve(root, key);
      result[key] = shape(nestedValue, field as QueryObject, root, key);
      continue;
    }

    // --- Fallback
    result[key] = (data as Record<string, any>)[key] ?? null;
  }

  return result;
}
