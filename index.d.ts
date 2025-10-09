// index.d.ts
declare module "rest-shape";
import { QueryObject, QueryDirective } from "./src/types";

export function shape<T>(
  data: T,
  query: string | QueryObject,
  fragments?: Record<string, QueryObject>,
  rootData?: any,
  contextKey?: string
): any;

export { parseQuery } from "./src/parser";
export * from "./src/types";
