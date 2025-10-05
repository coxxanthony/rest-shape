# REST Shape

Shape REST API responses using **GraphQL-style queries** in plain JavaScript.

`rest-shape` allows you to **pick, transform, reshape, and compute** API responses declaratively, with full support for directives, default values, filters, transformations, fragments, and nested objects/arrays.

---

## Features

- Auto-resolve nested fields by key
- Explicit mapping using **dot-paths**
- Computed fields with functions or inline JS expressions
- Recursive shaping of nested objects and arrays
- Conditional skip fields with `@skip(if: "...")`
- Conditional include fields with `@include(if: "...")`
- Filter arrays via `filter: "..."` expressions
- Limit / skip array results using `limit` and `skip`
- Default values using `||` or `@default(value: "...")`
- Apply transformations using `@transform(fn: "...")`
- Support for **fragments** (`...fragmentName`)
- 🆕 Combine multiple data sources by merging into a single object
- Graceful fallback: missing fields return `null`

---

## Installation

```bash
npm install rest-shape
# or
yarn add rest-shape
# or
pnpm add rest-shape
```

```js
// CommonJS
const { shape } = require("rest-shape");

// ES Modules
import { shape } from "rest-shape";
```

---

## Basic Usage

```js
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
fullName: user.firstName + " " + user.lastName
`;

const result = shape(data, query);
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

## Combining Multiple Data Sources 🆕

Since `shape` accepts `data`, `query`, and an optional `helpers` object (e.g., fragments), you can **merge multiple data sources** into a single object before passing it as `data`.

### Example 1: Simple Merge 🆕

```js
const github = { user: { login: "octocat", followers: 1000 } };
const sample = "sample";

const data = {
  ...github,
  user: { ...github.user, sample },
};

const query = `
user { name: login followers sample }
`;

const result = shape(data, query);

console.log(result.user);
// Output:
// { name: "octocat", followers: 1000, sample: "sample" }
```

---

### Example 2: Merge with Computed Fields 🆕

```js
const github = { user: { login: "octocat", followers: 1000 } };
const linkedin = { user: { connections: 500 } };
const extra = { user: { bonus: 42 } };

const data = {
  user: { ...github.user, ...linkedin.user, ...extra.user },
};

const query = `
user {
  username: login
  followers
  connections
  total: followers + connections + bonus
}
`;

const result = shape(data, query);

console.log(result.user);
// Output:
// { username: "octocat", followers: 1000, connections: 500, total: 1542 }
```

---

### Example 3: Skip/Include and Transform

```js
const mainData = { user: { firstName: "John", lastName: "Doe", age: 30 } };
const extraData = { user: { isActive: false, role: "admin" } };

const data = { user: { ...mainData.user, ...extraData.user } };

const query = `
user {
  fullName: firstName + " " + lastName @transform(fn: "value.toUpperCase()")
  age
  role @include(if: "user.isActive")
}
`;

const result = shape(data, query);

console.log(result.user);
// Output:
// { fullName: "JOHN DOE", age: 30, role: null }
```

---

## Examples with Input Data and Output

### Nested Objects

```js
const data = {
  user: {
    department: {
      name: "Engineering",
      manager: { name: "Alex Johnson", email: "alex.johnson@example.com" },
      location: "New York",
    },
    age: 30,
  },
};
```

**Query:**

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

**Output:**

```json
{
  "user": {
    "department": {
      "name": "Engineering",
      "manager": { "name": "Alex Johnson", "email": "alex.johnson@example.com" }
    }
  }
}
```

---

### Default Fallbacks

```js
const data = {
  user: { phone: null, backupPhone: "987-654", email: undefined },
};
```

**Query:**

```graphql
phone: phone || backupPhone || "N/A"
email @default(value: "no-email@example.com")
```

**Output:**

```json
{
  "phone": "987-654",
  "email": "no-email@example.com"
}
```

---

### Arrays with Filters, Limit, and Skip

```js
const data = {
  posts: [
    { title: "Post 1", status: "published", likes: 120 },
    { title: "Post 2", status: "published", likes: 50 },
    { title: "Post 3", status: "draft", likes: 10 },
  ],
};

const query = `
posts(filter: "status === 'published'", limit: 2, skip: 1) {
  title
  likes
}
`;

const result = shape(data, query);

console.log(result.posts);
// Output: [{ "title": "Post 2", "likes": 50 }]
```

---

### Fragments

```js
const data = {
  user: {
    department: {
      manager: { name: "Alex", email: "alex@example.com", role: "CTO" },
    },
  },
};

const fragments = { managerFields: { name: "name", email: "email" } };

const query = `
user {
  department {
    manager {
      ...managerFields
    }
  }
}
`;

const result = shape(data, query, fragments);

console.log(result);
// Output: { user: { department: { manager: { name: "Alex", email: "alex@example.com" } } } }
```

---

### Computed Fields and Optional Chaining

```js
const data = {
  firstName: "John",
  lastName: "Doe",
  department: { manager: { email: "alex@example.com" } },
};

const query = `
initials: firstName[0] + "." + lastName[0] + "."
managerEmail: department?.manager?.email
`;

const result = shape(data, query);

console.log(result);
// Output: { initials: "J.D.", managerEmail: "alex@example.com" }
```

---

### Edge Cases

- Missing Fields → defaults to `null`
- Empty Arrays → returns `[]`
- Malformed Queries → returns `{}`
- Invalid expressions → returns `null`

---

### Query Syntax Cheat Sheet

| Syntax / Directive                      | Example Data                                | Query / Directive                                  | Output                                |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `fieldName`                             | `{ name: "John" }`                          | `name`                                             | `{ "name": "John" }`                  |
| `alias: path`                           | `{ firstName: "John" }`                     | `fullName: firstName`                              | `{ "fullName": "John" }`              |
| `{ ... }`                               | `{ department: { name: "Eng" } }`           | `department { name }`                              | `{ "department": { "name": "Eng" } }` |
| `filter: "expression"`                  | `{ posts: [...] }`                          | `posts(filter: "status==='published") { title }`   | Only published posts                  |
| `limit: n`                              | Array of 5 items                            | `items(limit: 2) { id }`                           | First 2 items                         |
| `skip: n`                               | Array of 5 items                            | `items(skip: 2) { id }`                            | Items from index 2                    |
| `@skip(if: "...")`                      | `{ isGuest: true }`                         | `email @skip(if: "isGuest")`                       | `email: null`                         |
| `@include(if: "...")`                   | `{ isActive: false }`                       | `phone @include(if: "isActive")`                   | `phone: null`                         |
| `@default(value: "...")`                | `{ email: undefined }`                      | `email @default(value: "no-email@example.com")`    | `"no-email@example.com"`              |
| `@transform(fn: "...")`                 | `{ firstName: "John" }`                     | `firstName @transform(fn: "value.toUpperCase()")`  | `"JOHN"`                              |
| `...fragmentName`                       | `{ manager: { name:"Alex" } }`              | `manager { ...managerFields }`                     | `{ "manager": { "name":"Alex" } }`    |
| Computed fields / inline JS expressions | `{ firstName: "John" }`                     | `initials: firstName[0] + "." + lastName[0] + "."` | `"J.D."`                              |
| Optional chaining                       | `{ department: { manager: { email: "x" }}}` | `managerEmail: department?.manager?.email`         | `"x"`                                 |

---

## Notes

- Works in **Node.js** and **browser**
- Fully supports computed fields, filters, skip/include directives, fragments, transformations, and default fallbacks
- Missing fields return `null` by default

---

## License

MIT License
