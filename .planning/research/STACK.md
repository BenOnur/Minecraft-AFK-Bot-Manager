# STACK Research — TypeScript Migration

## Recommended Stack

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Build Tools
- **tsc** (TypeScript compiler) — No additional bundler needed for ESM
- **tsup** (optional) — For bundle if needed
- **tsx** — For running TypeScript directly during development

### Type Checking
- `tsc --noEmit` — Type check without compiling
- `tsc -w` — Watch mode for development

## Key Recommendations

1. **Start with utility files** — Logger, Auth, CommandParser have simple interfaces
2. **Use `type` over `interface`** — Consistent naming convention
3. **Incremental migration** — Rename .js to .ts, fix errors, verify
4. **Preserve ESM** — Module system doesn't need to change
5. **Keep same build output** — `dist/` mirrors `src/` structure

## Confidence: High
