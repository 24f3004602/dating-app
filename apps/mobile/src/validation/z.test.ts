/**
 * BUG-002: the web build's policy refuses eval, so Zod must never make code
 * with `new Function`. The e2e suite fails on any policy violation in the real
 * build; this checks the setting itself, with the app's own schemas.
 */
test("the app's schemas are built and parse without making code at run time (BUG-002)", () => {
  const original = globalThis.Function;
  const made: unknown[][] = [];
  // Each `new Function(...)` or `Function(...)` is recorded, then made as usual.
  globalThis.Function = new Proxy(original, {
    construct: (target, args, newTarget) => (made.push(args), Reflect.construct(target, args, newTarget)),
    apply: (target, self, args) => (made.push(args), Reflect.apply(target, self, args)),
  });
  try {
    // A fresh copy of Zod and the schemas, so no schema has run Zod's probe already.
    jest.isolateModules(() => {
      const { z } = require("./z") as typeof import("./z");
      const { signInSchema } = require("./schemas") as typeof import("./schemas");
      expect(signInSchema.parse({ email: " Asha@Example.com ", password: "x" })).toEqual({ email: "asha@example.com", password: "x" });
      expect(signInSchema.safeParse({ email: "asha@example.com", password: "" }).success).toBe(false);
      const person = z.object({ name: z.string(), age: z.number().int() });
      expect(person.parse({ name: "Asha", age: 27 })).toEqual({ name: "Asha", age: 27 });
    });
  } finally {
    globalThis.Function = original;
  }
  expect(made).toEqual([]);
});
