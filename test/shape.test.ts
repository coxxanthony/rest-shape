import { describe, it, expect } from "vitest";
import { shape, parseQuery } from "../src/index";

describe("rest-shape (GraphQL-like features)", () => {
  const data = {
    user: {
      id: 1,
      name: "John",
      lastName: "Doe",
      email: "john@example.com",
      isGuest: false,
      department: {
        name: "Engineering",
        manager: { name: "Alex", email: "alex@example.com" },
      },
    },
    posts: [
      { title: "Post 1", status: "published", likes: 120 },
      { title: "Post 2", status: "draft", likes: 30 },
      { title: "Post 3", status: "published", likes: 50 },
    ],
  };

  // ======================================================
  // 🟩 BASIC
  // ======================================================
  it("should select basic fields", () => {
    const query = `
      user {
        name
        email
      }
    `;
    const result = shape(data, query);
    expect(result).toEqual({
      user: { name: "John", email: "john@example.com" },
    });
  });

  it("should handle aliases", () => {
    const query = `
      user {
        fullName: name
        mail: email
      }
    `;
    const result = shape(data, query);
    expect(result).toEqual({
      user: { fullName: "John", mail: "john@example.com" },
    });
  });

  // ======================================================
  // 🟨 NESTED
  // ======================================================
  it("should select deeply nested fields", () => {
    const query = `
      user {
        department {
          name
          manager {
            name
          }
        }
      }
    `;
    const result = shape(data, query);
    expect(result).toEqual({
      user: {
        department: {
          name: "Engineering",
          manager: { name: "Alex" },
        },
      },
    });
  });

  it("should support nested arrays when present", () => {
    const dataWithProjects = {
      ...data,
      user: {
        ...data.user,
        projects: [{ title: "API Migration" }, { title: "Frontend Rewrite" }],
      },
    };
    const query = `
      user {
        projects {
          title
        }
      }
    `;
    const result = shape(dataWithProjects, query);
    expect(result.user.projects).toEqual([
      { title: "API Migration" },
      { title: "Frontend Rewrite" },
    ]);
  });

  // ======================================================
  // 🟦 ADVANCED
  // ======================================================
  it("should handle computed fields", () => {
    const query = `
      fullName: user.name + " " + user.lastName
    `;
    const result = shape(data, query);
    expect(result).toEqual({ fullName: "John Doe" });
  });

  it("should handle nested computed fields", () => {
    const query = `
      user {
        department {
          manager {
            emailDomain: email.split("@")[1]
          }
        }
      }
    `;
    const result = shape(data, query);
    expect(result.user.department.manager.emailDomain).toBe("example.com");
  });

  it("should handle computed fields inside arrays", () => {
    const query = `
      posts {
        title
        isPopular: likes > 100
      }
    `;
    const result = shape(data, query);
    expect(result.posts).toEqual([
      { title: "Post 1", isPopular: true },
      { title: "Post 2", isPopular: false },
      { title: "Post 3", isPopular: false },
    ]);
  });

  it("should filter arrays using filter directive", () => {
    const query = `
      posts(filter: "status === 'published'") {
        title
      }
    `;
    const result = shape(data, query);
    expect(result).toEqual({
      posts: [{ title: "Post 1" }, { title: "Post 3" }],
    });
  });

  it("should support ternary and chained expressions", () => {
    const query = `
      user {
        status: isGuest ? "Guest" : "Member"
        initials: name[0] + "." + lastName[0] + "."
      }
    `;
    const result = shape(data, query);
    expect(result.user.status).toBe("Member");
    expect(result.user.initials).toBe("J.D.");
  });

  it("should support safe optional chaining in computed fields", () => {
    const query = `
      user {
        managerEmail: department?.manager?.email
      }
    `;
    const result = shape(data, query);
    expect(result.user.managerEmail).toBe("alex@example.com");
  });

  it("should handle skip directive", () => {
    const query = `
      user {
        email @skip(if: "user.isGuest === true")
        name
      }
    `;
    const result = shape(
      { ...data, user: { ...data.user, isGuest: true } },
      query
    );
    expect(result.user).toEqual({
      email: null,
      name: "John",
    });
  });

  it("should skip nested fields", () => {
    const query = `
      user {
        department {
          manager @skip(if: "user.isGuest") {
            name
          }
        }
      }
    `;
    const result = shape(
      { ...data, user: { ...data.user, isGuest: true } },
      query
    );
    expect(result.user.department.manager).toBeNull();
  });

  it("should handle multiple root objects", () => {
    const query = `
      user { name }
      posts(filter: "status === 'published'") { title }
    `;
    const result = shape(data, query);
    expect(result).toEqual({
      user: { name: "John" },
      posts: [{ title: "Post 1" }, { title: "Post 3" }],
    });
  });

  it("should access root fields inside nested computed fields", () => {
    const dataWithSettings = {
      user: { name: "John" },
      settings: { app: "Demo" },
    };
    const query = `
      user {
        description: name + " uses " + settings.app
      }
    `;
    const result = shape(dataWithSettings, query);
    expect(result.user.description).toBe("John uses Demo");
  });

  // ======================================================
  // 🟪 FRAGMENTS (GraphQL-like)
  // ======================================================
  it("should merge fragments correctly (when supported)", () => {
    const fragments = {
      managerFields: { name: "name", email: "email" },
    };
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
    expect(result.user.department.manager).toEqual({
      name: "Alex",
      email: "alex@example.com",
    });
  });

  it("should support multiple fragment merges", () => {
    const fragments = {
      managerFields: { name: "name" },
      contactFields: { email: "email" },
    };
    const query = `
      user {
        department {
          manager {
            ...managerFields
            ...contactFields
          }
        }
      }
    `;
    const result = shape(data, query, fragments);
    expect(result.user.department.manager).toEqual({
      name: "Alex",
      email: "alex@example.com",
    });
  });

  // ======================================================
  // 🟥 EDGE CASES
  // ======================================================
  it("should resolve deeply via autoResolve", () => {
    const nested = { profile: { info: { email: "deep@example.com" } } };
    const query = `email`;
    const result = shape(nested, query);
    expect(result.email).toBe("deep@example.com");
  });

  it("should not crash on invalid expressions", () => {
    const query = `
      broken: user.nonexistent.prop
    `;
    const result = shape(data, query);
    expect(result.broken).toBeNull();
  });

  it("should handle empty arrays gracefully", () => {
    const query = `
      posts { title }
    `;
    const result = shape({ ...data, posts: [] }, query);
    expect(result.posts).toEqual([]);
  });

  it("should handle undefined fields as null", () => {
    const query = `
      user { nonExistent }
    `;
    const result = shape(data, query);
    expect(result.user.nonExistent).toBeNull();
  });

  it("should return empty object for malformed query", () => {
    const query = `
      user {
        name
      `; // missing brace
    const result = shape(data, query);
    expect(typeof result).toBe("object");
  });

  // ======================================================
  // 🧩 REST-ONLY ENHANCEMENTS
  // ======================================================
  it("should allow inline JavaScript helpers", () => {
    const query = `
      user {
        formatted: name.toUpperCase() + " <" + email + ">"
      }
    `;
    const result = shape(data, query);
    expect(result.user.formatted).toBe("JOHN <john@example.com>");
  });

  it("should allow default fallback values using ||", () => {
    const query = `
      user {
        phone: phone || "N/A"
      }
    `;
    const result = shape(data, query);
    expect(result.user.phone).toBe("N/A");
  });
});
