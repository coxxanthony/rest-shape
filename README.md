# REST Shape

Shape REST API responses using **GraphQL-style queries** in plain JavaScript/TypeScript.

This utility allows you to **pick, transform, and reshape** API responses in a declarative way.

---

## Features

- Auto-resolve nested fields by key
- Explicit mapping using **dot-paths**
- Computed fields with functions
- Recursive shaping of nested objects
- Support for **arrays of objects**
- Graceful fallback: missing fields return `null`

---

## Installation

```bash
npm install rest-shape
```

---

## Usage

### Basic Example

```ts
import { shape } from "rest-shape";

const data = {
  user: { firstName: "John", lastName: "Doe" },
  department: {
    name: "Engineering",
    manager: {
      name: "Alex Johnson",
      email: "alex.johnson@example.com",
    },
  },
};

// GraphQL-style query
const query = `
departmentName: department.name
manager {
  name
  email: department.manager.email
}
`;

const computedFields = {
  fullName: (d: typeof data) => `${d.user.firstName} ${d.user.lastName}`,
  fullNameExplicit: (d: typeof data) =>
    `${d.user.firstName} ${d.user.lastName}`,
};

const result = shape(data, query, computedFields);

console.log(result);
```

**Output:**

```json
{
  "departmentName": "Engineering",
  "manager": {
    "name": "Alex Johnson",
    "email": "alex.johnson@example.com"
  },
  "fullName": "John Doe",
  "fullNameExplicit": "John Doe"
}
```

---

## Query Syntax

The query is a **string** with GraphQL-style formatting:

- **Auto-resolve key:**

```graphql
manager {
  name
}
```

- **Explicit mapping using dot-paths:**

```graphql
email: department.manager.email
```

- **Top-level fields:**

```graphql
departmentName: department.name
```

- **Computed fields:**
  Passed separately as a `computedFields` object:

```ts
{
  fullName: (data: typeof data) =>
    `${data.user.firstName} ${data.user.lastName}`;
}
```

---

## Array Support

Works with arrays of objects as well:

```ts
const data = {
  users: [
    { id: 1, name: "Alice", role: { title: "Admin" } },
    { id: 2, name: "Bob", role: { title: "User" } },
  ],
};

const query = `
users {
  id
  name
  role: role.title
}
`;

const result = shape(data, query);

console.log(result);
```

**Output:**

```json
{
  "users": [
    { "id": 1, "name": "Alice", "role": "Admin" },
    { "id": 2, "name": "Bob", "role": "User" }
  ]
}
```

---

## Installation Notes

- Works in **Node.js** and **browser**
- Written in **TypeScript**, fully typed
- Missing fields return `null` by default

---

## Types

```ts
export type QueryField<T = any> = string | ((data: T) => any) | QueryObject;
export interface QueryObject {
  [key: string]: QueryField;
}
```

---

## License

MIT License
