export type QueryField<T = any> = string | ((data: T) => any) | QueryObject;

export interface QueryObject {
  [key: string]: QueryField | QueryDirective | null | any;
  __fragments?: string[];
}

export type QueryDirective = {
  path?: string;
  skipIf?: string;
  includeIf?: string;
  nested?: QueryObject;
  filter?: string;
  default?: any;
  transform?: string;
  limit?: number;
  skip?: number;
};

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
      "limit" in field ||
      "skip" in field)
  );
}

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
function evalNestedField(expr: string, data: any, root: any) {
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

function mergeDeep(target: any, source: any) {
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

function parseArgs(argsStr: string): Record<string, any> {
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

  // handle last argument
  if (current) {
    const [k, v] = current.split(":").map((s) => s.trim());
    if (k) {
      if (["limit", "skip"].includes(k)) args[k] = parseInt(v, 10);
      else args[k] = v.replace(/^["']|["']$/g, "");
    }
  }

  return args;
}

/** Parse query into QueryObject with fragment detection */
/** Parse query into QueryObject with fragment and directive support */
export function parseQuery(queryStr: string, rootData?: any): QueryObject {
  const lines = queryStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const root: QueryObject = {};
  const stack: { obj: QueryObject }[] = [{ obj: root }];

  for (let line of lines) {
    line = line.replace(/,$/, "").trim();

    // --- Inline @skip directive ---
    const skipMatch = line.match(/(\w+)\s+@skip\(if:\s*"(.*)"\)/);
    if (skipMatch) {
      const [, fieldName, skipExpr] = skipMatch;
      const current = stack[stack.length - 1].obj;
      current[fieldName] = { skipIf: skipExpr };
      continue;
    }

    // --- Inline @include directive ---
    const includeMatch = line.match(/(\w+)\s+@include\(if:\s*"(.*)"\)/);
    if (includeMatch) {
      const [, fieldName, includeExpr] = includeMatch;
      const current = stack[stack.length - 1].obj;
      current[fieldName] = { includeIf: includeExpr };
      continue;
    }

    // --- Inline @default directive ---
    const inlineDefaultMatch = line.match(/@default\(value:\s*["'](.*)["']\)/);
    if (inlineDefaultMatch) {
      const defaultValue = inlineDefaultMatch[1];
      line = line.replace(inlineDefaultMatch[0], "").trim();
      const current = stack[stack.length - 1].obj;
      current[line] = { default: defaultValue };
      continue;
    }

    // --- Inline @transform directive ---
    const transformMatchInline = line.match(
      /^(\w+)\s*:\s*(\w+)\s+@transform\(fn:\s*"(.*)"\)/
    );
    if (transformMatchInline) {
      const [, alias, path, transformFn] = transformMatchInline;
      const current = stack[stack.length - 1].obj;
      current[alias] = { path, transform: transformFn };
      continue;
    }

    const inlineMatch = line.match(/^(\w+)(\([^)]*\))?\s*\{\s*([^}]*)\s*\}$/);
    if (inlineMatch) {
      const [, key, argsPart, innerFields] = inlineMatch;
      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };

      // --- Parse arguments like limit, skip, filter ---
      if (argsPart) {
        const argsStr = argsPart.slice(1, -1).trim(); // remove surrounding ()
        const args = parseArgs(argsStr);
        Object.assign(directive, args);
      }

      // --- Process inner fields normally ---
      if (innerFields.trim()) {
        const fieldRegex = /(\.\.\.\w+|\w+\s*:\s*[\w.@\[\]]+|\w+)/g;
        const matches = innerFields.match(fieldRegex) ?? [];
        matches.forEach((f) => {
          if (f.startsWith("...")) {
            nested.__fragments = nested.__fragments || [];
            nested.__fragments.push(f.slice(3));
            return;
          }
          const aliasMatch = f.match(/^(\w+)\s*:\s*(.+)$/);
          if (aliasMatch) {
            const [_, alias, expr] = aliasMatch;
            if (expr.includes(".") || expr.includes("[")) {
              nested[alias] = (data: any, root: any) =>
                evalNestedField(expr, data, root);
            } else {
              nested[alias] = { path: expr };
            }
          } else {
            nested[f.trim()] = f.trim();
          }
        });
      }

      const current = stack[stack.length - 1].obj;
      current[key] = directive; // attach limit/skip/filter here
      continue;
    }

    // --- Fragment spread ---
    if (line.startsWith("...")) {
      const fragName = line.slice(3).trim();
      const current = stack[stack.length - 1].obj;
      current.__fragments = current.__fragments || [];
      current.__fragments.push(fragName);
      continue;
    }

    // --- Block start handling ---
    if (line.endsWith("{")) {
      let header = line.slice(0, -1).trim();
      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };
      // Handle inline @skip / @include
      const skipMatch = header.match(/@skip\(if:\s*"(.*)"\)/);
      if (skipMatch) {
        directive.skipIf = skipMatch[1];
        header = header.replace(skipMatch[0], "").trim();
      }
      const includeMatch = header.match(/@include\(if:\s*"(.*)"\)/);
      if (includeMatch) {
        directive.includeIf = includeMatch[1];
        header = header.replace(includeMatch[0], "").trim();
      }

      let key = "";
      const parenMatch = header.match(/^(\w+)\((.*)\)/);
      if (parenMatch) {
        key = parenMatch[1].trim();
        const argsStr = parenMatch[2].trim();
        const args = parseArgs(argsStr);
        Object.assign(directive, args); // attach limit, skip, filter
      } else {
        key = header;
      }

      const current = stack[stack.length - 1].obj;
      current[key] = directive;

      stack.push({ obj: nested });
      continue;
    }

    // --- Block end ---
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // --- Inline block or normal fields ---
    const current = stack[stack.length - 1].obj;

    if (line.includes("{")) {
      const inlineMatch = line.match(/^(\w+)(\([^)]*\))?\s*\{\s*([^}]*)\s*\}$/);
      if (inlineMatch) {
        const [, key, , innerFields] = inlineMatch;
        const nested: QueryObject = {};
        if (innerFields.trim()) {
          const fieldRegex = /(\.\.\.\w+|\w+\s*:\s*[\w.@\[\]]+|\w+)/g;
          const matches = innerFields.match(fieldRegex) ?? [];
          matches.forEach((f) => {
            if (f.startsWith("...")) {
              nested.__fragments = nested.__fragments || [];
              nested.__fragments.push(f.slice(3));
              return;
            }
            const aliasMatch = f.match(/^(\w+)\s*:\s*(.+)$/);
            if (aliasMatch) {
              const [_, alias, expr] = aliasMatch;
              if (expr.includes(".") || expr.includes("[")) {
                nested[alias] = (data: any, root: any) =>
                  evalNestedField(expr, data, root);
              } else {
                nested[alias] = { path: expr };
              }
            } else {
              nested[f.trim()] = f.trim();
            }
          });
        }
        current[key] = { nested };
        continue;
      }
    }

    // --- Normal field or alias ---
    const aliasMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (aliasMatch) {
      const [_, alias, expr] = aliasMatch;
      if (expr.includes(".") || expr.includes("[")) {
        current[alias] = (data: any) =>
          evalNestedField(expr, data, rootData ?? data);
      } else {
        current[alias] = { path: expr };
      }
    } else {
      current[line] = line;
    }
  }

  return root;
}

/** Shape data according to query with fragment support */
export function shape<T>(
  data: T,
  query: string | QueryObject,
  fragments?: Record<string, QueryObject>,
  rootData?: any,
  contextKey?: string
): any {
  const queryObj: QueryObject =
    typeof query === "string" ? parseQuery(query, rootData ?? data) : query;

  let result: any = {};
  const root = rootData ?? data;

  if (queryObj.__fragments && fragments) {
    queryObj.__fragments.forEach((fragName) => {
      const fragQuery = fragments[fragName];
      if (!fragQuery) return;

      const fragResult = shape(data, fragQuery, fragments, root, contextKey);
      if (Array.isArray(result)) {
        result = result.map((item, idx) => mergeDeep(item, fragResult[idx]));
      } else {
        mergeDeep(result, fragResult);
      }
    });
  }

  for (const key in queryObj) {
    if (key === "__fragments") continue;

    const field = queryObj[key];
    const safeTarget = data ?? {};

    if (typeof field === "function") {
      result[key] = field(safeTarget, root);
      continue;
    }

    if (isDirectiveObject(field)) {
      let value: any = null;

      // Evaluate skipIf
      if (field.skipIf) {
        const shouldSkip = !!evalNestedField(field.skipIf, safeTarget, root);
        if (shouldSkip) {
          result[key] = null;
          continue;
        }
      }

      // Evaluate includeIf
      if (field.includeIf) {
        const shouldInclude = !!evalNestedField(
          field.includeIf,
          safeTarget,
          root
        );
        if (!shouldInclude) {
          result[key] = null;
          continue;
        }
      }

      // Existing logic for path, nested, defaults, transform, arrays...
      if (field.path) {
        const parts = field.path.split("||").map((p) => p.trim());
        for (const part of parts) {
          value =
            getByPath(safeTarget as Record<string, any>, part) ??
            getByPath(root, part) ??
            autoResolve(root, part) ??
            evalNestedField(part, safeTarget, root);
          if (value != null) break;
        }
      } else {
        value =
          (safeTarget as Record<string, any>)[key] ?? autoResolve(root, key);
      }

      if (
        (value === null || value === undefined) &&
        field.default !== undefined
      )
        value = field.default;

      if (field.transform && value != null) {
        try {
          value = Function(
            "value",
            "data",
            `with(data){ return ${field.transform} }`
          )(value, safeTarget);
        } catch {}
      }

      if (Array.isArray(value)) {
        let arrData = value;
        if (field.filter)
          arrData = arrData.filter(
            (item) => !!evalNestedField(field.filter!, item, root)
          );

        if (field.skip !== undefined) arrData = arrData.slice(field.skip);
        if (field.limit !== undefined) arrData = arrData.slice(0, field.limit);
        result[key] = field.nested
          ? arrData.map((item) =>
              shape(item, field.nested!, fragments, root, key)
            )
          : arrData;
      } else if (typeof value === "object" && value !== null) {
        result[key] = field.nested
          ? shape(value, field.nested!, fragments, root, key)
          : value;
      } else {
        result[key] = value ?? null;
      }
      continue;
    }

    if (typeof field === "object" && field !== null) {
      const nestedValue = (safeTarget as Record<string, any>)[key] ?? {};
      result[key] = shape(
        nestedValue,
        field as QueryObject,
        fragments,
        root,
        key
      );
      continue;
    }

    if (typeof field === "string") {
      result[key] =
        evalNestedField(field, safeTarget, root) ??
        getByPath(safeTarget, field) ??
        autoResolve(root, field) ??
        null;
      continue;
    }

    result[key] = (safeTarget as Record<string, any>)[key] ?? null;
  }

  return result;
}
