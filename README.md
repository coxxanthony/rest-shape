# REST Shape

Shape REST API responses using **GraphQL-style queries** in plain JavaScript.

This utility allows you to **pick, transform, reshape, and compute** API responses declaratively, with full support for directives, default values, filtering, transformations, and fragments.

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

## Examples with Input Data and Output

### 1. Nested Objects

**Data Example:**

```js
const data = {
  user: {
    department: {
      name: "Engineering",
      manager: {
        name: "Alex Johnson",
        email: "alex.johnson@example.com",
        role: "CTO",
      },
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

### 2. Conditional Skip / Include

**Data Example:**

```js
const data = {
  user: {
    email: "john@example.com",
    phone: "123-456",
    isGuest: true,
    isActive: false,
  },
};
```

**Query:**

```graphql
email @skip(if: "user.isGuest")
phone @include(if: "user.isActive")
```

**Output:**

```json
{
  "email": null,
  "phone": null
}
```

---

### 3. Default Fallbacks

**Data Example:**

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

### 4. Transformations

**Data Example:**

```js
const data = { firstName: "John", lastName: "Doe" };
```

**Query:**

```graphql
fullName: firstName + " " + lastName @transform(fn: "value.toUpperCase()")
```

**Output:**

```json
{
  "fullName": "JOHN DOE"
}
```

---

### 5. Arrays with Filters, Limit, and Skip

**Data Example:**

```js
const data = {
  posts: [
    { title: "Post 1", status: "published", likes: 120 },
    { title: "Post 2", status: "published", likes: 50 },
    { title: "Post 3", status: "draft", likes: 10 },
  ],
};
```

**Query:**

```graphql
posts(filter: "status === 'published'", limit: 2, skip: 1) {
  title
  likes
}
```

**Output:**

```json
{
  "posts": [{ "title": "Post 2", "likes": 50 }]
}
```

---

### 6. Fragments

**Data Example:**

```js
const data = {
  user: {
    department: {
      manager: { name: "Alex", email: "alex@example.com", role: "CTO" },
    },
  },
};
```

**Query:**

```graphql
user {
  department {
    manager {
      ...managerFields
    }
  }
}
```

**Fragments Object:**

```js
const fragments = { managerFields: { name: "name", email: "email" } };
```

**Output:**

```json
{
  "user": {
    "department": {
      "manager": { "name": "Alex", "email": "alex@example.com" }
    }
  }
}
```

---

### 7. Computed Fields and Optional Chaining

**Data Example:**

```js
const data = {
  firstName: "John",
  lastName: "Doe",
  department: { manager: { email: "alex@example.com" } },
};
```

**Query:**

```graphql
initials: firstName[0] + "." + lastName[0] + "."
managerEmail: department?.manager?.email
```

**Output:**

```json
{
  "initials": "J.D.",
  "managerEmail": "alex@example.com"
}
```

---

### 8. Full Example (Complex)

**Data Example:**

```js
const data = {
  user: {
    firstName: "John",
    lastName: "Doe",
    phone: null,
    isGuest: false,
    department: {
      name: "Engineering",
      manager: { name: "Alex Johnson", email: "alex@example.com" },
    },
    projects: [
      { title: "API Migration", status: "active" },
      { title: "Frontend Rewrite", status: "completed" },
    ],
  },
  posts: [
    { title: "Post 1", status: "published", likes: 120 },
    { title: "Post 2", status: "draft", likes: 30 },
    { title: "Post 3", status: "published", likes: 50 },
  ],
};
```

**Query:**

```graphql
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
```

**Output:**

```json
{
  "user": {
    "fullName": "John Doe",
    "phone": "N/A",
    "department": {
      "name": "Engineering",
      "manager": { "name": "Alex Johnson", "email": "alex@example.com" }
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

### 9. Handling Edge Cases (with Examples)

#### Missing or Undefined Fields

**Data:**

```js
const data = { user: { name: "John" } };
```

**Query:**

```graphql
user {
  name
  email
}
```

**Output:**

```json
{
  "user": {
    "name": "John",
    "email": null
  }
}
```

---

#### Empty Arrays

**Data:**

```js
const data = { posts: [] };
```

**Query:**

```graphql
posts {
  title
}
```

**Output:**

```json
{
  "posts": []
}
```

---

#### Malformed Queries

**Data:**

```js
const data = { user: { name: "John" } };
```

**Query (malformed):**

```graphql
user {
  name
  invalidSyntax
```

**Output:**

```json
{}
```

---

#### Invalid Expressions

**Data:**

```js
const data = { a: 5 };
```

**Query:**

```graphql
result: a + b
```

**Output:**

```json
{
  "result": null
}
```

---

### 10. Query Syntax Cheat Sheet (with Data → Query → Output)

| Syntax / Directive                      | Example Data                                           | Query / Directive                                  | Output                                |
| --------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- | ------------------------------------- |
| `fieldName`                             | `{ name: "John" }`                                     | `name`                                             | `{ "name": "John" }`                  |
| `alias: path`                           | `{ firstName: "John", lastName: "Doe" }`               | `fullName: firstName + " " + lastName`             | `{ "fullName": "John Doe" }`          |
| `{ ... }`                               | `{ department: { name: "Eng" } }`                      | `department { name }`                              | `{ "department": { "name": "Eng" } }` |
| `filter: "expression"`                  | `{ posts: [{status: "draft"}, {status:"published"}] }` | `posts(filter: "status==='published') { title }`   | Only published posts                  |
| `limit: n`                              | Array of 5 items                                       | `items(limit: 2) { id }`                           | First 2 items                         |
| `skip: n`                               | Array of 5 items                                       | `items(skip: 2) { id }`                            | Items from index 2                    |
| `@skip(if: "...")`                      | `{ isGuest: true, email: "x" }`                        | `email @skip(if: "isGuest")`                       | `email: null`                         |
| `@include(if: "...")`                   | `{ isActive: false, phone: "123" }`                    | `phone @include(if: "isActive")`                   | `phone: null`                         |
| `@default(value: "...")`                | `{ email: undefined }`                                 | `email @default(value: "no-email@example.com")`    | `"no-email@example.com"`              |
| `@transform(fn: "...")`                 | `{ firstName: "John" }`                                | `firstName @transform(fn: "value.toUpperCase()")`  | `"JOHN"`                              |
| `...fragmentName`                       | `{ manager: { name:"Alex" } }`                         | `manager { ...managerFields }`                     | `{ "manager": { "name":"Alex" } }`    |
| Computed fields / inline JS expressions | `{ firstName: "John", lastName: "Doe" }`               | `initials: firstName[0] + "." + lastName[0] + "."` | `"J.D."`                              |
| Optional chaining                       | `{ department: { manager: { email: "x" }}}`            | `managerEmail: department?.manager?.email`         | `"x"`                                 |

## Installation Notes

- Works in **Node.js** and **browser**
- Fully supports computed fields, filters, skip/include directives, fragments, transformations, and default fallbacks
- Missing fields return `null` by default

---

## License

MIT License
