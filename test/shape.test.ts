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

  // --- 1️⃣ Computed field ---
  it("should handle computed fields correctly", () => {
    const query1 = `
fullName: user.firstName + " " + user.lastName
`;
    const result = shape(data, query1);
    expect(result).toEqual({ fullName: "John Doe" });
  });

  // --- 2️⃣ Nested departments with skip directive ---
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

  // --- 3️⃣ Array filtering ---
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

  // --- 4️⃣ Nested user with computed field + department info ---
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

  // --- 5️⃣ Missing fields ---
  it("should return null for missing fields", () => {
    const queryMissing: QueryObject = { nonExist: "foo.bar" };
    const result = shape(data, queryMissing);
    expect(result.nonExist).toBeNull();
  });
});
