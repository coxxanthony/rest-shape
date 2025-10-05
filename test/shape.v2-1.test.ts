import { describe, it, expect } from "vitest";
import { shape } from "../src/index";

describe("rest-shape vNext features", () => {
  const data = {
    user: {
      name: "John",
      lastName: "Doe",
      email: "john@example.com",
      isGuest: false,
    },
    posts: [
      { title: "Post 1", status: "published", likes: 120 },
      { title: "Post 2", status: "draft", likes: 30 },
      { title: "Post 3", status: "published", likes: 50 },
    ],
  };

  // ======================================================
  // 🟢 DIRECTIVES
  // ======================================================
  it("should support @include directive", () => {
    const query = `
      user {
        email @include(if: "user.isGuest === false")
        name
      }
    `;
    const result = shape(data, query);
    expect(result.user).toEqual({ email: "john@example.com", name: "John" });
  });

  it("should support @default directive", () => {
    const query = `
      user {
        phone @default(value: "000-000")
      }
    `;
    const result = shape(data, query);
    expect(result.user.phone).toBe("000-000");
  });

  it("should support @transform directive", () => {
    const query = `
      user {
        upperEmail: email @transform(fn: "value.toUpperCase()")
      }
    `;
    const result = shape(data, query);
    expect(result.user.upperEmail).toBe("JOHN@EXAMPLE.COM");
  });

  // ======================================================
  // 🟢 CUSTOM HELPERS
  // ======================================================
  it("should allow custom helpers in queries", () => {
    const helpers = {
      fullName: (user: any) => user.name + " " + user.lastName,
    };
    const query = `fullName: fullName(user)`;
    const result = shape(data, query, {}, helpers);
    expect(result.fullName).toBe("John Doe");
  });

  // ======================================================
  // 🟢 ARRAY ENHANCEMENTS
  // ======================================================
  it("should limit array items using limit directive", () => {
    const query = `posts(limit: 2) { title }`;
    const result = shape(data, query);
    expect(result.posts.length).toBe(2);
    expect(result.posts.map((p: { title: any }) => p.title)).toEqual([
      "Post 1",
      "Post 2",
    ]);
  });

  it("should skip array items using skip directive", () => {
    const query = `posts(skip: 1) { title }`;
    const result = shape(data, query);
    expect(result.posts.map((p: { title: any }) => p.title)).toEqual([
      "Post 2",
      "Post 3",
    ]);
  });

  it("should filter arrays with multiple conditions", () => {
    const query = `posts(filter: "status === 'published' && likes > 100") { title }`;
    const result = shape(data, query);
    expect(result.posts).toEqual([{ title: "Post 1" }]);
  });

  // ======================================================
  // 🟢 FRAGMENT ENHANCEMENTS
  // ======================================================
  it("should merge array fragments correctly", () => {
    const fragments = { postFields: { title: "title", popularity: "likes" } };
    const query = `posts { ...postFields }`;
    const result = shape(data, query, fragments);
    expect(result.posts[0]).toEqual({ title: "Post 1", popularity: 120 });
  });

  // ======================================================
  // 🟢 COMBINED DATA SOURCES
  // ======================================================
  it("should combine multiple data sources", () => {
    const github = { user: { login: "octocat", followers: 1000 } };
    const blog = { posts: [{ title: "Hello World" }] };
    const combined = { ...github, ...blog };

    const query = `
      user { name: login followers }
      posts { title }
    `;
    const result = shape(combined, query);
    expect(result.user).toEqual({ name: "octocat", followers: 1000 });
    expect(result.posts).toEqual([{ title: "Hello World" }]);
  });

  it("should combine data sources", () => {
    const github = { user: { login: "octocat", followers: 1000 } };
    const sample = "sample";
    const data = {
      ...github,
      user: { ...github.user, sample }, // merge sample into user
    };

    const query = `
    user { name: login followers sample }
  `;

    const result = shape(data, query);

    expect(result.user).toEqual({
      name: "octocat",
      followers: 1000,
      sample: "sample",
    });
  });

  // ======================================================
  // 🟢 ERROR HANDLING
  // ======================================================
  it("should handle invalid expressions in dev mode gracefully", () => {
    const query = `broken: user.nonexistent.prop`;
    const result = shape(data, query);
    expect(result.broken).toBeNull();
  });
});
