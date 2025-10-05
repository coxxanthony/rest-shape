# REST Shape

Shape REST API responses using **GraphQL-style queries** in plain JavaScript.

This utility allows you to **pick, transform, reshape, and compute** API responses declaratively.

---

## Features

- Auto-resolve nested fields by key
- Explicit mapping using **dot-paths**
- Computed fields with functions or inline JS expressions
- Recursive shaping of nested objects and arrays
- Graceful fallback: missing fields return `null`
- Conditional skip fields with `@skip(if: "...")`
- Filter arrays via `filter: "..."` expressions
- Support for **fragments** (`...fragmentName`)
- Default values using `||`

---

## Installation

Install **rest-shape** using your preferred package manager:

### npm

```bash
npm install rest-shape
```

### Yarn

```bash
yarn add rest-shape
```

### pnpm

```bash
pnpm add rest-shape
```

After installation, import it in your project:

```js
// CommonJS
const { shape } = require("rest-shape");

// ES Modules
import { shape } from "rest-shape";
```

---

## Usage

### Basic Example

```js
const { shape } = require("rest-shape");

const data = {
  user: { firstName: "John", lastName: "Doe" },
  department: {
    name: "Engineering",
    manager: { name: "Alex Johnson", email: "alex.johnson@example.com" },
  },
};

const query = `
departmentName: department.name
manager {
  name
  email: department.manager.email
}
`;

const computedFields = {
  fullName: (data) => `${data.user.firstName} ${data.user.lastName}`,
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
  "fullName": "John Doe"
}
```

---

## Query Syntax

REST Shape uses **GraphQL-style queries** to pick, transform, and compute fields from your data. Queries are **plain strings** and can include:

- **Aliases / explicit mapping**
- **Nested objects**
- **Arrays and filters**
- **Computed fields**
- **Skip directives**
- **Fragments**
- **Default fallbacks using `||`**

---

### 1. Selecting Basic Fields

```graphql
user {
  name
  email
}
```

**Result:**

```json
{
  "user": { "name": "John", "email": "john@example.com" }
}
```

---

### 2. Aliases / Explicit Paths

```graphql
fullName: user.firstName + " " + user.lastName
mail: user.email
```

**Result:**

```json
{
  "fullName": "John Doe",
  "mail": "john@example.com"
}
```

---

### 3. Nested Objects

```graphql
user {
  department {
    name
    manager {
      name
      email
    }
  }
}
```

**Result:**

```json
{
  "user": {
    "department": {
      "name": "Engineering",
      "manager": { "name": "Alex", "email": "alex@example.com" }
    }
  }
}
```

---

### 4. Arrays and Filters

```graphql
posts(filter: "status === 'published'") {
  title
  likes
}
```

**Result:**

```json
{
  "posts": [
    { "title": "Post 1", "likes": 120 },
    { "title": "Post 3", "likes": 50 }
  ]
}
```

---

### 5. Computed Fields

#### Inline JS Expressions

```graphql
user {
  initials: firstName[0] + "." + lastName[0] + "."
  managerEmail: department?.manager?.email
}
```

#### Using `computedFields` Object

```js
const computedFields = {
  fullName: (data) => `${data.user.firstName} ${data.user.lastName}`,
};
```

---

### 6. Conditional Skip Fields

```graphql
user {
  email @skip(if: "user.isGuest === true")
}
```

**Result when `user.isGuest === true`:**

```json
{
  "user": { "email": null }
}
```

---

### 7. Default Fallbacks Using `||`

```graphql
user {
  phone: phone || "N/A"
}
```

Supports multiple fallbacks:

```graphql
user {
  phone: phone || backupPhone || "N/A"
}
```

---

### 8. Fragments

```graphql
user {
  department {
    manager {
      ...managerFields
    }
  }
}
```

```js
const fragments = {
  managerFields: { name: "name", email: "email" },
};
```

- Multiple fragments can be merged at the same level.

---

### 9. Full Example (Realistic API Response)

```js
const data = {
  user: {
    id: 1,
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    isGuest: false,
    department: {
      id: 10,
      name: "Engineering",
      manager: {
        id: 100,
        name: "Alex Johnson",
        email: "alex.johnson@example.com",
      },
    },
    projects: [
      { id: 1001, title: "API Migration", status: "active" },
      { id: 1002, title: "Frontend Rewrite", status: "completed" },
    ],
  },
  posts: [
    { id: 501, title: "Post 1", status: "published", likes: 120 },
    { id: 502, title: "Post 2", status: "draft", likes: 30 },
    { id: 503, title: "Post 3", status: "published", likes: 50 },
  ],
  settings: { theme: "dark", app: "DemoApp" },
};

const query = `
user {
  fullName: firstName + " " + lastName
  phone: phone || "N/A"
  department {
    name
    manager {
      name
      email
    }
  }
  projects(filter: "status === 'active'") {
    title
  }
}
posts(filter: "status === 'published'") {
  title
  isPopular: likes > 100
}
`;

const result = shape(data, query);

console.log(result);
```

**Output:**

```json
{
  "user": {
    "fullName": "John Doe",
    "phone": "N/A",
    "department": {
      "name": "Engineering",
      "manager": { "name": "Alex Johnson", "email": "alex.johnson@example.com" }
    },
    "projects": [{ "title": "API Migration" }]
  },
  "posts": [
    { "title": "Post 1", "isPopular": true },
    { "title": "Post 3", "isPopular": false }
  ]
}
```

---

## Handling Edge Cases

- Missing or undefined fields → `null`
- Empty arrays → `[]`
- Malformed queries → returns empty object instead of crashing
- Invalid expressions → evaluated as `null`

---

## Query Syntax Cheat Sheet

| Syntax                    | Description                      | Example                                            |                         |               |     |        |
| ------------------------- | -------------------------------- | -------------------------------------------------- | ----------------------- | ------------- | --- | ------ |
| `fieldName`               | Pick a field directly            | `name` → `{ "name": "John" }`                      |                         |               |     |        |
| `alias: path`             | Rename a field or map via path   | `fullName: user.firstName + " " + user.lastName`   |                         |               |     |        |
| `{ ... }`                 | Nested object selection          | `department { name manager { name } }`             |                         |               |     |        |
| `filter: "expression"`    | Filter arrays with JS expression | `posts(filter: "status === 'published') { title }` |                         |               |     |        |
| `@skip(if: "expression")` | Conditionally skip a field       | `email @skip(if: "user.isGuest")`                  |                         |               |     |        |
| `                         |                                  | `                                                  | Default fallback values | `phone: phone |     | "N/A"` |
| `...fragmentName`         | Merge reusable fragments         | `manager { ...managerFields }`                     |                         |               |     |        |
| `computed fields`         | JS expressions inline            | `initials: firstName[0] + "." + lastName[0] + "."` |                         |               |     |        |
| `?` / optional chaining   | Safe access to nested fields     | `managerEmail: department?.manager?.email`         |                         |               |     |        |

---

## Installation Notes

- Works in **Node.js** and **browser**
- Missing fields return `null` by default
- Fully supports computed fields, filters, skip directives, fragments, and default fallbacks

---

## License

MIT License
