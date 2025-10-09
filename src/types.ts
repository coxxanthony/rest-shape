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
