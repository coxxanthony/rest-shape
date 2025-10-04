import { describe, it, expect } from "vitest";
import { shape, QueryObject } from "../src/index";

describe("rest-shape", () => {
  const data = {
    departments: [
      {
        name: "Engineering",
        manager: { name: "Alex", email: "alex@example.com" },
      },
      {
        name: "Design",
        manager: { name: "Maria", email: "maria@example.com" },
      },
      {
        name: "HR",
        manager: null, // test @skip
      },
    ],
    user: { firstName: "John", lastName: "Doe" },
    posts: [
      { title: "Post 1", status: "published" },
      { title: "Post 2", status: "draft" },
      { title: "Post 3", status: "draft" },
    ],
  };

  // --- 1️⃣ Computed field --- - Done
  it("should handle computed fields correctly", () => {
    const query1 = `
fullName: user.firstName + " " + user.lastName
`;
    const result = shape(data, query1);
    expect(result).toEqual({ fullName: "John Doe" });
  });

  // --- 2️⃣ Nested departments with skip directive --- - Done
  it("should shape nested departments with skip directive correctly", () => {
    const query2 = `
departments {
  name
  manager {
    name
    email @skip(if: "manager === null")
  }
}
`;
    const result = shape(data, query2);
    expect(result).toEqual({
      departments: [
        {
          name: "Engineering",
          manager: { name: "Alex", email: "alex@example.com" },
        },
        {
          name: "Design",
          manager: { name: "Maria", email: "maria@example.com" },
        },
        {
          name: "HR",
          manager: null, // email skipped because manager is null
        },
      ],
    });
  });

  // --- 3️⃣ Array filtering --- - Done
  it("should filter arrays correctly", () => {
    const query3 = `
posts(filter: "status === 'draft'") {
  title
}
`;
    const result = shape(data, query3);
    expect(result).toEqual({
      posts: [{ title: "Post 2" }, { title: "Post 3" }],
    });
  });

  // --- 4️⃣ Nested user with computed field + department info --- - Done
  it("should shape nested user with computed fields correctly", () => {
    const query4 = `
  user {
    fullName: user.firstName + " " + user.lastName
    department {
      name
      manager {
        name
        email @skip(if: "manager === null")
      }
    }
  }
  `;
    // For this test, we use only the first department for demonstration
    const shaped = shape(
      { user: data.user, department: data.departments[0] },
      query4
    );
    expect(shaped).toEqual({
      user: {
        fullName: "John Doe",
        department: {
          name: "Engineering",
          manager: {
            name: "Alex",
            email: "alex@example.com",
          },
        },
      },
    });
  });

  // --- 5️⃣ Missing fields --- - Done
  it("should return null for missing fields", () => {
    const queryMissing: QueryObject = { nonExist: "foo.bar" };
    const result = shape(data, queryMissing);
    expect(result.nonExist).toBeNull();
  });

  // --- 6️⃣ computed fields inside array ---
  it("should handle computed fields inside arrays", () => {
    const query = `
  posts {
    title
    isPublished: status === "published"
  }
  `;
    const result = shape(data, query);
    expect(result).toEqual({
      posts: [
        { title: "Post 1", isPublished: true },
        { title: "Post 2", isPublished: false },
        { title: "Post 3", isPublished: false },
      ],
    });
  });

  // --- 7️⃣ handle deeply nested structures --- - Done
  it("should handle deeply nested structures", () => {
    const deepData = { company: { departments: data.departments } };
    const query = `
  company {
    departments {
      name
      manager {
        name
        email
      }
    }
  }
  `;
    const result = shape(deepData, query);
    expect(result).toEqual(deepData);
  });

  // --- 8️⃣ handle fragments ---
  it("should handle fragments correctly", () => {
    const query = `
  fragment managerFields {
    name
    email
  }
  manager { ...managerFields }
  `;
    const shaped = shape(data.departments[0], query);
    expect(shaped).toEqual({
      manager: { name: "Alex", email: "alex.@example.com" },
    });
  });

  // --- 9️⃣ handle multiple levels of fragments ---
  it("should handle multiple levels of fragments", () => {
    const query = `
  fragment managerFields {
    name
    email
  }
  fragment departmentFields {
    name
    manager { ...managerFields }
  }
  departments { ...departmentFields }
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({
      departments: [
        {
          name: "Engineering",
          manager: { name: "Alex", email: "alex@example.com" },
        },
        {
          name: "Design",
          manager: { name: "Maria", email: "maria@example.com" },
        },
        {
          name: "HR",
          manager: null,
        },
      ],
    });
  });

  // --- 🔟 handle aliasing with root-level fields ---
  it("should handle aliasing with root-level fields", () => {
    const query = `
  posts {
    summary: title + " (" + status + ")"
  }
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({
      posts: [
        { summary: "Post 1 (published)" },
        { summary: "Post 2 (draft)" },
        { summary: "Post 3 (draft)" },
      ],
    });
  });
  // --- 1️⃣1️⃣ handle aliasing with root-level fields and nested data ---
  it("should handle aliasing with root-level fields and nested data", () => {
    const query = `
  { user: data.user, department: data.departments[0] }
  `;
    const shaped = shape(data, query, { data });
    expect(shaped).toEqual({
      user: data.user,
      department: data.departments[0],
    });
  });

  // --- 1️⃣2️⃣ handle deeply nested computed fields ---
  it("should handle deeply nested computed fields", () => {
    const query = `
  user {
    fullName: user.firstName + " " + user.lastName
    department {
      name
      manager {
        name
        emailDomain: email.split("@")[1] @skip(if: "manager === null")
      }
    }
  }
  `;
    const shaped = shape(
      { user: data.user, department: data.departments[0] },
      query,
      { data }
    );
    expect(shaped).toEqual({
      user: {
        fullName: "John Doe",
        department: {
          name: "Engineering",
          manager: {
            name: "Alex",
            emailDomain: "example.com",
          },
        },
      },
    });
  });

  // --- 1️⃣3️⃣ handle missing nested objects gracefully ---
  it("should handle missing nested objects gracefully", () => {
    const query = `
  user {
    fullName: user.firstName + " " + user.lastName
    department {
      name
      manager {
        name
        email @skip(if: "manager === null")
      }
    }
  }
  `;
    const shaped = shape(
      { user: data.user, department: data.departments[2] },
      query,
      { data }
    );
    expect(shaped).toEqual({
      user: {
        fullName: "John Doe",
        department: { name: "HR", manager: null },
      },
    });
  });

  // --- 1️⃣4️⃣ handle arrays of nested objects with computed fields ---
  it("should handle arrays of nested objects with computed fields", () => {
    const query = `
  departments {
    name
    manager {
      name
      emailDomain: email.split("@")[1] @skip(if: "manager === null")
    }
  }
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({
      departments: [
        {
          name: "Engineering",
          manager: { name: "Alex", emailDomain: "example.com" },
        },
        {
          name: "Design",
          manager: { name: "Maria", emailDomain: "example.com" },
        },
        { name: "HR", manager: null },
      ],
    });
  });

  // --- 1️⃣5️⃣ handle complex filtering with computed fields ---
  it("should handle complex filtering with computed fields", () => {
    const query = `
  posts(filter: "status === 'draft'") {
    title
    isLongTitle: title.length > 5
  }
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({
      posts: [
        { title: "Post 2", isLongTitle: false },
        { title: "Post 3", isLongTitle: false },
      ],
    });
  });

  // --- 1️⃣6️⃣ handle empty arrays and null values ---
  it("should handle empty arrays and null values", () => {
    const query = `
  emptyArray { name
  }
  nullField { name }
  `;
    const shaped = shape({ emptyArray: [], nullField: null }, query);
    expect(shaped).toEqual({ emptyArray: [], nullField: null });
  });

  // --- 1️⃣7️⃣ handle root-level computed fields with nested data ---
  it("should handle root-level computed fields with nested data", () => {
    const query = `
  { user: data.user, department: data.departments[0] }
  `;
    const shaped = shape(data, query, { data });
    expect(shaped).toEqual({
      user: data.user,
      department: data.departments[0],
    });
  });

  // --- 1️⃣8️⃣ handle aliasing with nested computed fields ---
  it("should handle aliasing with nested computed fields", () => {
    const query = `
  user {
    fullName: user.firstName + " " + user.lastName
    department { name }
  }
  `;
    const shaped = shape(
      { user: data.user, department: data.departments[0] },
      query,
      { data }
    );
    expect(shaped).toEqual({
      user: {
        fullName: "John Doe",
        department: { name: "Engineering" },
      },
    });
  });

  // --- 1️⃣9️⃣ handle fragments with nested computed fields ---
  it("should handle fragments with nested computed fields", () => {
    const query = `
  fragment managerFields {
    name
    emailDomain: email.split("@")[1] @skip(if: "manager === null")
  }
  manager { ...managerFields }
  `;
    const shaped = shape(data.departments[0], query);
    expect(shaped).toEqual({
      manager: { name: "Alex", emailDomain: "example.com" },
    });
  });

  // --- 2️⃣0️⃣ handle multiple fragments with nested computed fields ---
  it("should handle multiple fragments with nested computed fields", () => {
    const query = `
  fragment managerFields {
    name
    emailDomain: email.split("@")[1] @skip(if: "manager === null")
  }
  fragment departmentFields {
    name
    manager { ...managerFields }
  }
  departments { ...departmentFields }
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({
      departments: [
        {
          name: "Engineering",
          manager: { name: "Alex", emailDomain: "example.com" },
        },
        {
          name: "Design",
          manager: { name: "Maria", emailDomain: "example.com" },
        },
        { name: "HR", manager: null },
      ],
    });
  });

  // --- 2️⃣1️⃣ handle complex queries with all features combined ---
  it("should handle complex queries with all features combined", () => {
    const query = `
  fragment managerFields {
    name
    emailDomain: email.split("@")[1] @skip(if: "manager === null"
  }
  fragment departmentFields {
    name
    manager { ...managerFields }
  }
  user {
    fullName: user.firstName + " " + user.lastName
    department { ...departmentFields }
  }
  posts(filter: "status === 'draft'") {
    title
    isLongTitle: title.length > 5
  }
  `;
    const shaped = shape(
      { user: data.user, department: data.departments[0], posts: data.posts },
      query,
      { data }
    );
    expect(shaped).toEqual({
      user: {
        fullName: "John Doe",
        department: {
          name: "Engineering",
          manager: { name: "Alex", emailDomain: "example.com" },
        },
      },
      posts: [
        { title: "Post 2", isLongTitle: false },
        { title: "Post 3", isLongTitle: false },
      ],
    });
  });

  // --- 2️⃣2️⃣ handle edge cases with invalid paths and expressions ---
  it("should handle edge cases with invalid paths and expressions", () => {
    const query = `
  invalidField: nonExistent.path
  computedField: user.firstName + unknownVar
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({ invalidField: null, computedField: null });
  });

  // --- 2️⃣3️⃣ handle large datasets efficiently ---
  it("should handle large datasets efficiently", () => {
    const largeData = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: `Item ${i}`,
      })),
    };
    const query = `
  items { id, value
  }
  `;
    const start = Date.now();
    const shaped = shape(largeData, query);
    const duration = Date.now() - start;
    expect(shaped.items.length).toBe(1000);
    expect(duration).toBeLessThan(100); // Expect shaping to be efficient (less than 100ms
  });

  // --- 2️⃣4️⃣ handle deeply nested arrays and objects ---
  it("should handle deeply nested arrays and objects", () => {
    const deepData = { level1: { level2: { level3: { value: "deep" } } } };
    const query = `
  level1 { level2 { level3 { value
  } } }
  `;
    const shaped = shape(deepData, query);
    expect(shaped).toEqual(deepData);
  });

  // --- 2️⃣5️⃣ handle circular references gracefully ---
  it("should handle circular references gracefully", () => {
    const circularData: any = { name: "root" };
    circularData.self = circularData; // Create circular reference
    const query = `
  name
  self { name }
  `;
    const shaped = shape(circularData, query);
    expect(shaped).toEqual({ name: "root", self: { name: "root" } });
  });

  // --- 2️⃣6️⃣ handle special characters in field names ---
  it("should handle special characters in field names", () => {
    const specialData = {
      "field-with-dash": "dash",
      "field with space": "space",
    };
    const query = `
  field-with-dash
  field with space
  `;
    const shaped = shape(specialData, query);
    expect(shaped).toEqual({
      "field-with-dash": "dash",
      "field with space": "space",
    });
  });

  // --- 2️⃣7️⃣ handle null and undefined values correctly ---
  it("should handle null and undefined values correctly", () => {
    const nullData = {
      definedField: "value",
      nullField: null,
      undefinedField: undefined,
    };
    const query = `
  definedField
  nullField
  undefinedField
  `;
    const shaped = shape(nullData, query);
    expect(shaped).toEqual({
      definedField: "value",
      nullField: null,
      undefinedField: null,
    });
  });

  // --- 2️⃣8️⃣ handle boolean and numeric fields correctly ---
  it("should handle boolean and numeric fields correctly", () => {
    const boolNumData = { boolField: true, numField: 42 };
    const query = `
  boolField
  numField
  `;
    const shaped = shape(boolNumData, query);
    expect(shaped).toEqual({ boolField: true, numField: 42 });
  });

  // --- 2️⃣9️⃣ handle empty queries gracefully ---
  it("should handle empty queries gracefully", () => {
    const emptyQuery: QueryObject = {};
    const shaped = shape(data, emptyQuery);
    expect(shaped).toEqual({});
  });

  // --- 3️⃣0️⃣ handle queries with only comments ---
  it("should handle queries with only comments", () => {
    const commentQuery = `
  # This is a comment
  # Another comment line
  `;
    const shaped = shape(data, commentQuery);
    expect(shaped).toEqual({});
  });

  // --- 3️⃣1️⃣ handle queries with only whitespace ---
  it("should handle queries with only whitespace", () => {
    const whitespaceQuery = `
  `;
    const shaped = shape(data, whitespaceQuery);
    expect(shaped).toEqual({});
  });

  // --- 3️⃣2️⃣ handle queries with invalid syntax gracefully ---
  it("should handle queries with invalid syntax gracefully", () => {
    const invalidQuery = `
  user {
    fullName: user.firstName + " " + user.lastName
    department { name
  `;
    expect(() => shape(data, invalidQuery)).toThrow();
  });

  // --- 3️⃣3️⃣ handle queries with deeply nested fragments ---
  it("should handle queries with deeply nested fragments", () => {
    const query = `
  fragment emailFields {
    email
  }
  fragment managerFields {
    name
    ...emailFields
  }
  fragment departmentFields {
    name
    manager { ...managerFields }
  }
  departments { ...departmentFields }
  `;
    const shaped = shape(data, query);
    expect(shaped).toEqual({
      departments: [
        {
          name: "Engineering",
          manager: { name: "Alex", email: "alex@example.com" },
        },
        {
          name: "Design",
          manager: { name: "Maria", email: "maria@example.com" },
        },
        { name: "HR", manager: null },
      ],
    });
  });

  // --- 3️⃣4️⃣ handle queries with overlapping field names ---
  it("should handle queries with overlapping field names", () => {
    const overlappingData = {
      user: { name: "John", details: { name: "Johnny" } },
    };
    const query = `
  user {
    name 
    details { name }
  }
  `;
    const shaped = shape(overlappingData, query);
    expect(shaped).toEqual({
      user: { name: "John", details: { name: "Johnny" } },
    });
  });

  // --- 3️⃣5️⃣ handle queries with large number of fields ---
  it("should handle queries with large number of fields", () => {
    const largeFieldData = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const query = `
  a
  b
  c
  d
  e
  `;
    const shaped = shape(largeFieldData, query);
    expect(shaped).toEqual(largeFieldData);
  });

  // --- 3️⃣6️⃣ handle queries with deeply nested arrays ---
  it("should handle queries with deeply nested arrays", () => {
    const nestedArrayData = { nested: { arr: [[[{ value: "deep" }]]] } };
    const query = `
  nested { arr { value
  } }
  `;
    const shaped = shape(nestedArrayData, query);
    expect(shaped).toEqual(nestedArrayData);
  });

  // --- 3️⃣7️⃣ handle queries with special characters in expressions ---
  it("should handle queries with special characters in expressions", () => {
    const specialCharData = { user: { name: "John", age: 30 } };
    const query = `
  user { isAdult: age >= 18 }
  `;
    const shaped = shape(specialCharData, query);
    expect(shaped).toEqual({ user: { isAdult: true } });
  });

  // --- 3️⃣8️⃣ handle queries with mixed data types ---
  it("should handle queries with mixed data types", () => {
    const mixedData = {
      strField: "string",
      numField: 42,
      boolField: false,
      nullField: null,
      arrField: [1, 2, 3],
      objField: { key: "value" },
    };
    const query = `
  strField
  numField
  boolField
  nullField
  arrField
  objField { key }
  `;
    const shaped = shape(mixedData, query);
    expect(shaped).toEqual(mixedData);
  });

  // --- 3️⃣9️⃣ handle queries with large nested structures ---
  it("should handle queries with large nested structures", () => {
    const largeNestedData = {
      level1: { level2: { level3: { level4: { value: "deep" } } } },
    };
    const query = `
  level1 { level2 { level3 { level4 { value
  } } } }
  `;
    const shaped = shape(largeNestedData, query);
    expect(shaped).toEqual(largeNestedData);
  });
});
