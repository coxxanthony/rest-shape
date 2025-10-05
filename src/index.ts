export type QueryField<T = any> = string | ((data: T) => any) | QueryObject;

export interface QueryObject {
  [key: string]: QueryField | QueryDirective | null;
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

/** Parse query string into QueryObject with nested, filter, skip, computed fields, and fragment spreads */
export function parseQuery(queryStr: string): QueryObject {
  const lines = queryStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const obj: QueryObject = {};
  const stack: { obj: QueryObject }[] = [{ obj }];

  for (let line of lines) {
    line = line.replace(/,$/, "");

    // Handle fragment spreads
    if (line.startsWith("...")) {
      const fragName = line.slice(3).trim();
      stack[stack.length - 1].obj[`...${fragName}`] = null;
      continue;
    }

    // --- Inline blocks: user { name } or posts(filter: "...") { title }
    const inlineBlockMatch = line.match(
      /^(\w+)(\([^)]*\))?\s*\{\s*([^}]*)\s*\}$/
    );
    if (inlineBlockMatch) {
      const [, key, filterPart, innerFields] = inlineBlockMatch;
      const nested: QueryObject = {};
      if (innerFields.trim()) {
        innerFields
          .split(/\s+/)
          .filter(Boolean)
          .forEach((f) => (nested[f] = f));
      }
      const directive: QueryDirective = { nested };
      if (filterPart) {
        const fm = filterPart.match(/filter:\s*["'](.+)["']/);
        if (fm) directive.filter = fm[1];
      }
      stack[stack.length - 1].obj[key] = directive;
      continue;
    }

    // --- End of nested block
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // --- Start multi-line nested block
    if (line.endsWith("{")) {
      let header = line.slice(0, -1).trim();

      const skipMatch = header.match(/@skip\(if:\s*"(.*)"\)/);
      let skipIf: string | undefined;
      if (skipMatch) {
        skipIf = skipMatch[1];
        header = header.replace(skipMatch[0], "").trim();
      }

      const filterMatch = header.match(
        /^(\w+)\(\s*filter:\s*["'](.+)["']\s*\)$/
      );
      let key: string | undefined;
      let filter: string | undefined;
      if (filterMatch) {
        key = filterMatch[1];
        filter = filterMatch[2]?.trim();
      } else {
        const m = header.match(/^(\w+)$/);
        if (!m) continue;
        key = m[1];
      }

      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };
      if (filter) directive.filter = filter;
      if (skipIf) directive.skipIf = skipIf;

      stack[stack.length - 1].obj[key!] = directive;
      stack.push({ obj: nested });
      continue;
    }

    // --- Single-line field
    const skipMatch = line.match(/@skip\(if:\s*"(.*)"\)/);
    let skipIfSingle: string | undefined;
    let fieldLine = line;
    if (skipMatch) {
      skipIfSingle = skipMatch[1];
      fieldLine = line.replace(skipMatch[0], "").trim();
    }

    // --- Alias / computed field
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

    // --- Simple field
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

/** Shape data according to query, with full fragment support */
export function shape<T>(
  data: T,
  query: string | QueryObject,
  fragments?: Record<string, QueryObject>,
  rootData?: any,
  contextKey?: string
): any {
  const queryObj: QueryObject =
    typeof query === "string" ? parseQuery(query) : query;

  const result: any = {};
  const root = rootData ?? data;

  for (const key in queryObj) {
    const field = queryObj[key];

    const targetData =
      root === data && (data as any)[key] !== undefined
        ? (data as any)[key]
        : data;

    // --- Fragment spread at this level
    if (key.startsWith("...") && fragments) {
      const fragName = key.slice(3).trim();
      if (fragments[fragName]) {
        const fragResult = shape(
          targetData,
          fragments[fragName],
          fragments,
          root,
          contextKey
        );
        Object.assign(result, fragResult);
      }
      continue;
    }

    // --- Directive objects
    if (isDirectiveObject(field)) {
      if (field.skipIf) {
        const evalScope = { ...root, ...targetData, this: targetData };
        const parentKey =
          contextKey ||
          Object.keys(root || {}).find(
            (k) => (root as Record<string, any>)[k] === targetData
          );
        if (parentKey) evalScope[parentKey] = targetData;

        let shouldSkip = false;
        try {
          shouldSkip = !!evalExpression(field.skipIf, evalScope);
        } catch {
          shouldSkip = true;
        }

        if (shouldSkip) {
          result[key] = null;
          continue;
        }
      }

      let value = field.path
        ? evalExpression(field.path, { ...root, ...targetData })
        : (targetData as Record<string, any>)[key];

      if (value === undefined && root !== targetData)
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
              shape(item, field.nested as QueryObject, fragments, root, key)
            )
          : arrData;
      } else if (typeof value === "object" && value !== null) {
        result[key] = field.nested
          ? shape(value, field.nested as QueryObject, fragments, root, key)
          : value;
      } else {
        result[key] = value ?? null;
      }

      continue;
    }

    // --- String fields
    if (typeof field === "string") {
      const simplePathRegex = /^[\w.]+$/;
      if (simplePathRegex.test(field)) {
        const value = getByPath(targetData, field) ?? autoResolve(root, field);
        result[key] = value;
      } else {
        const evalScope = { ...root, ...targetData, this: targetData };
        if (contextKey) evalScope[contextKey] = targetData;
        result[key] = evalExpression(field, evalScope);
      }
      continue;
    }

    // --- Function fields
    if (typeof field === "function") {
      result[key] = field(targetData);
      continue;
    }

    // --- Nested objects
    if (typeof field === "object" && field !== null) {
      // Resolve nested fragment spreads inside object
      const keys = Object.keys(field);
      for (const k of keys) {
        if (k.startsWith("...") && fragments && fragments[k.slice(3).trim()]) {
          const fragName = k.slice(3).trim();
          const fragResult = shape(
            targetData,
            fragments[fragName],
            fragments,
            root,
            contextKey
          );
          Object.assign(field, fragResult);
          delete field[k];
        }
      }

      let nestedValue = (targetData as Record<string, any>)[key];
      if (nestedValue === undefined && root !== targetData)
        nestedValue = (root as Record<string, any>)[key];
      if (nestedValue === undefined) nestedValue = autoResolve(root, key);

      result[key] = shape(
        nestedValue,
        field as QueryObject,
        fragments,
        root,
        key
      );
      continue;
    }

    // --- Fallback
    result[key] = (targetData as Record<string, any>)[key] ?? null;
  }

  return result;
}
