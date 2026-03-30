# PITFALLS Research — Common Migration Mistakes

## Pitfall 1: Big Bang Migration
**Problem**: Converting everything at once causes massive debugging.

**Prevention**: Incremental approach — convert one file, verify, move on.

## Pitfall 2: Type Hoisting
**Problem**: Defining types in wrong order causing circular dependencies.

**Prevention**: 
- Create `types/` directory first
- Define interfaces before implementations
- Use `type` for simple types, `interface` for extendable types

## Pitfall 3: Losing Type Safety on Config
**Problem**: Config loaded via `JSON.parse()` returns `any`.

**Prevention**:
```typescript
const config = JSON.parse(data) as Config;
```

## Pitfall 4: Test Database/Mocking Overhead
**Problem**: Over-mocking causes tests to not reflect reality.

**Prevention**: 
- Use integration tests for command flow
- Mock only external systems (Discord, Telegram APIs)
- Prefer real objects with test data

## Pitfall 5: Breaking Existing Functionality
**Problem**: Refactoring changes behavior, not just structure.

**Prevention**:
- Test before refactoring
- Commit after each small change
- Use feature flags if needed

## Pitfall 6: Forgetting ESM Compatibility
**Problem**: TypeScript defaults to CommonJS.

**Prevention**:
- Set `"module": "ESNext"` in tsconfig
- Use `.js` extensions in imports
- Test with `--experimental-vm-modules` if needed
