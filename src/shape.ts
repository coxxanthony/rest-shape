import { QueryDirective, QueryObject } from "./types";
import {
  isDirectiveObject,
  autoResolve,
  getByPath,
  evalNestedField,
  mergeDeep,
} from "./utils";
import { parseQuery } from "./parser";

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

      if (field.skipIf) {
        const shouldSkip = !!evalNestedField(field.skipIf, safeTarget, root);
        if (shouldSkip) {
          result[key] = null;
          continue;
        }
      }

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
