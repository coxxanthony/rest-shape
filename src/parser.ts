import { QueryDirective, QueryObject } from "./types";
import { parseArgs, evalNestedField } from "./utils";

/** Parse query string into QueryObject with directives */
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

    // --- Inline field blocks ---
    const inlineMatch = line.match(/^(\w+)(\([^)]*\))?\s*\{\s*([^}]*)\s*\}$/);
    if (inlineMatch) {
      const [, key, argsPart, innerFields] = inlineMatch;
      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };

      if (argsPart) {
        const argsStr = argsPart.slice(1, -1).trim();
        const args = parseArgs(argsStr);
        Object.assign(directive, args);
      }

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
      current[key] = directive;
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

    // --- Block start ---
    if (line.endsWith("{")) {
      let header = line.slice(0, -1).trim();
      const nested: QueryObject = {};
      const directive: QueryDirective = { nested };

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
        Object.assign(directive, args);
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

    const current = stack[stack.length - 1].obj;

    // --- Normal fields ---
    const aliasMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (aliasMatch) {
      const [_, alias, expr] = aliasMatch;
      if (expr.includes(".") || expr.includes("[")) {
        current[alias] = (data: any, root: any) =>
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
