/**
 * Reading a missing JavaScript property returns undefined. TypeScript's built-in
 * PromiseFulfilledResult omits `reason` entirely, which prevents safe narrowing
 * when multiple Promise.allSettled results are combined in one guard. This
 * declaration is type-only and emits no runtime JavaScript.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- declaration merging must preserve the built-in generic signature
interface PromiseFulfilledResult<T> {
  readonly reason?: never;
}
