export type QueryField<T = any> = string | ((data: T) => any) | QueryObject;

export interface QueryObject {
  [key: string]: QueryField | QueryDirective | null;
}

export type QueryDirective = {
  path?: string;
  skipIf?: string;
  includeIf?: string;
  nested?: QueryObject;
  filter?: string;
  default?: any;
  transform?: string;
  limit?: number; // added limit support
};

/** Type guard for directive objects */
function isDirectiveObject(field: any): field is QueryDirective {
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
      "limit" in field)
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

/** Parse query string into QueryObject with directives and nested blocks */
export function parseQuery(queryStr: string): QueryObject {
  const lines = queryStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const obj: QueryObject = {};
  const stack: { obj: QueryObject }[] = [{ obj }];

  for (let line of lines) {
    line = line.replace(/,$/, "");

    // Fragment spread
    if (line.startsWith("...")) {
      const fragName = line.slice(3).trim();
      stack[stack.length - 1].obj[`...${fragName}`] = null;
      continue;
    }

    // Inline block: user { name } or posts(limit: 2) { title }
    const inlineBlockMatch = line.match(
      /^(\w+)(\([^)]*\))?\s*\{\s*([^}]*)\s*\}$/
    );
    if (inlineBlockMatch) {
      const [, key, argsPart, innerFields] = inlineBlockMatch;
      const nested: QueryObject = {};
      if (innerFields.trim()) {
        innerFields
          .split(/\s+/)
          .filter(Boolean)
          .forEach((f) => (nested[f] = f));
      }
      const directive: QueryDirective = { nested };

      if (argsPart) {
        const limitMatch = argsPart.match(/limit:\s*(\d+)/);
        if (limitMatch) directive.limit = parseInt(limitMatch[1], 10);
        const filterMatch = argsPart.match(/filter:\s*["'](.+)["']/);
        if (filterMatch) directive.filter = filterMatch[1];
      }
      stack[stack.length - 1].obj[key] = directive;
      continue;
    }

    // End block
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // Multi-line nested block
    if (line.endsWith("{")) {
      let header = line.slice(0, -1).trim();

      const skipMatch = header.match(/@skip\(if:\s*"(.*)"\)/);
      let skipIf: string | undefined;
      if (skipMatch) {
        skipIf = skipMatch[1];
        header = header.replace(skipMatch[0], "").trim();
      }

      const includeMatch = header.match(/@include\(if:\s*"(.*)"\)/);
      let includeIf: string | undefined;
      if (includeMatch) {
        includeIf = includeMatch[1];
        header = header.replace(includeMatch[0], "").trim();
      }

      const filterMatch = header.match(
        /^(\w+)\(\s*filter:\s*["'](.+)["']\s*\)$/
      );
      const limitMatch = header.match(/^(\w+)\(\s*limit:\s*(\d+)\s*\)$/);

      let key: string | undefined;
      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };

      if (filterMatch) {
        key = filterMatch[1];
        directive.filter = filterMatch[2]?.trim();
      } else if (limitMatch) {
        key = limitMatch[1];
        directive.limit = parseInt(limitMatch[2], 10);
      } else {
        const m = header.match(/^(\w+)$/);
        if (!m) continue;
        key = m[1];
      }

      if (skipIf) directive.skipIf = skipIf;
      if (includeIf) directive.includeIf = includeIf;

      stack[stack.length - 1].obj[key!] = directive;
      stack.push({ obj: nested });
      continue;
    }

    // Single-line field
    let skipIfSingle: string | undefined;
    let includeIfSingle: string | undefined;
    let defaultValue: any = undefined;
    let transformValue: string | undefined;

    const skipMatchSingle = line.match(/@skip\(if:\s*"(.*)"\)/);
    const includeMatchSingle = line.match(/@include\(if:\s*"(.*)"\)/);
    const defaultMatch = line.match(/@default\(value:\s*["'](.+)["']\)/);
    const transformMatch = line.match(/@transform\(fn:\s*"(.*)"\)/);

    let fieldLine = line;

    if (skipMatchSingle) {
      skipIfSingle = skipMatchSingle[1];
      fieldLine = fieldLine.replace(skipMatchSingle[0], "").trim();
    }
    if (includeMatchSingle) {
      includeIfSingle = includeMatchSingle[1];
      fieldLine = fieldLine.replace(includeMatchSingle[0], "").trim();
    }
    if (defaultMatch) {
      defaultValue = defaultMatch[1];
      fieldLine = fieldLine.replace(defaultMatch[0], "").trim();
    }
    if (transformMatch) {
      transformValue = transformMatch[1];
      fieldLine = fieldLine.replace(transformMatch[0], "").trim();
    }

    // Alias
    const aliasMatch = fieldLine.match(/^(\w+)\s*:\s*(.+)$/);
    if (aliasMatch) {
      const alias = aliasMatch[1];
      const expr = aliasMatch[2];
      stack[stack.length - 1].obj[alias] = {
        path: expr,
        skipIf: skipIfSingle,
        includeIf: includeIfSingle,
        default: defaultValue,
        transform: transformValue,
      };
      continue;
    }

    // Normal field
    if (
      skipIfSingle ||
      includeIfSingle ||
      defaultValue !== undefined ||
      transformValue
    ) {
      stack[stack.length - 1].obj[fieldLine] = {
        path: fieldLine,
        skipIf: skipIfSingle,
        includeIf: includeIfSingle,
        default: defaultValue,
        transform: transformValue,
      };
    } else {
      stack[stack.length - 1].obj[fieldLine] = fieldLine;
    }
  }

  return obj;
}

/** Shape data according to query with full directive support including limit */
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
    const safeTarget = targetData ?? {};

    // Fragment spread
    if (key.startsWith("...") && fragments) {
      const fragName = key.slice(3).trim();
      if (fragments[fragName]) {
        const fragResult = shape(
          safeTarget,
          fragments[fragName],
          fragments,
          root,
          contextKey
        );
        Object.assign(result, fragResult);
      }
      continue;
    }

    // Directive object
    if (isDirectiveObject(field)) {
      const evalScope = { ...root, ...safeTarget, this: safeTarget };
      if (contextKey) evalScope[contextKey] = safeTarget;

      if (field.skipIf && !!evalExpression(field.skipIf, evalScope)) {
        result[key] = null;
        continue;
      }
      if (field.includeIf && !evalExpression(field.includeIf, evalScope)) {
        result[key] = null;
        continue;
      }

      // Resolve value
      let value: any = null;
      if (field.path) {
        const parts = field.path.split("||").map((p) => p.trim());
        for (const part of parts) {
          const stringLiteralMatch = part.match(/^["'](.*)["']$/);
          if (stringLiteralMatch) {
            value = stringLiteralMatch[1];
            break;
          }
          value =
            getByPath(safeTarget, part) ??
            autoResolve(root, part) ??
            evalExpression(part, evalScope);
          if (value != null) break;
        }
      } else {
        value = safeTarget[key] ?? autoResolve(root, key);
      }

      // Apply @default
      if (
        (value === null || value === undefined) &&
        field.default !== undefined
      ) {
        value = field.default;
      }

      // Apply @transform
      if (field.transform && value != null) {
        try {
          value = Function(
            "value",
            "data",
            `with(data){ return ${field.transform} }`
          )(value, safeTarget);
        } catch {}
      }

      // Arrays
      if (Array.isArray(value)) {
        let arrData = value;
        if (field.filter) {
          arrData = arrData.filter(
            (item) => evalExpression(field.filter!, item) === true
          );
        }
        if (field.limit !== undefined) {
          arrData = arrData.slice(0, field.limit);
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

    // Nested object
    if (typeof field === "object" && field !== null) {
      const nestedValue = safeTarget[key] ?? autoResolve(root, key) ?? {};
      result[key] = shape(
        nestedValue,
        field as QueryObject,
        fragments,
        root,
        key
      );
      continue;
    }

    // String field with || fallback
    if (typeof field === "string") {
      const evalScope = { ...root, ...safeTarget, this: safeTarget };
      const parts = field.split("||").map((p) => p.trim());
      let value: any = null;
      for (const part of parts) {
        const stringLiteralMatch = part.match(/^["'](.*)["']$/);
        if (stringLiteralMatch) {
          value = stringLiteralMatch[1];
          break;
        }
        value =
          getByPath(safeTarget, part) ??
          autoResolve(root, part) ??
          evalExpression(part, evalScope);
        if (value != null) break;
      }
      result[key] = value ?? null;
      continue;
    }

    // Function field
    if (typeof field === "function") {
      result[key] = field(safeTarget);
      continue;
    }

    result[key] = safeTarget[key] ?? null;
  }

  return result;
}
