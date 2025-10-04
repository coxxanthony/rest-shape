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
    ],
    user: { firstName: "John", lastName: "Doe" },
  };

  const query = `
departments {
  name
  manager {
    name
    email
  }
}
  fullName
`;

  const shaped = shape(data, query, {
    fullName: (d) => `${d.user.firstName} ${d.user.lastName}`,
  });

  console.log(shaped);

  it("should shape data correctly", () => {
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
      ],
      fullName: "John Doe",
    });
  });

  it("should return null for missing fields", () => {
    const queryMissing: QueryObject = { nonExist: "foo.bar" };
    const result = shape(data, queryMissing);

    expect(result.nonExist).toBeNull();
  });
});
