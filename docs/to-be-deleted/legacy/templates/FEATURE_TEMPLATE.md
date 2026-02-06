# Feature Documentation Template

> **Use this template when documenting a new feature**

---

## Feature Name

Brief one-line description of what this feature does.

---

## Overview

1-2 paragraph description explaining:
- What the feature is
- Why it was added
- What problem it solves
- Who will use it

---

## Status

- **Phase:** Phase X
- **Status:** ✅ Complete / 🔄 In Progress / ⏳ Planned
- **Version:** Added in v1.x.x
- **Dependencies:** List any required features/systems

---

## Features

### Core Functionality
- Feature 1
- Feature 2
- Feature 3

### Additional Capabilities
- Advanced feature 1
- Advanced feature 2

---

## Usage

### Basic Usage

```typescript
// Simple example
import { useFeature } from "@/core/feature";

function MyComponent() {
  const feature = useFeature();
  
  return (
    <button onClick={() => feature.doSomething()}>
      Click Me
    </button>
  );
}
```

### Advanced Usage

```typescript
// More complex example with options
import { useFeature } from "@/core/feature";

function AdvancedComponent() {
  const feature = useFeature({
    option1: true,
    option2: "value"
  });
  
  const handleAction = async () => {
    const result = await feature.complexOperation();
    // Handle result
  };
  
  return (
    <div>
      <h1>Advanced Feature Usage</h1>
      {/* UI */}
    </div>
  );
}
```

---

## API Reference

### Main Function/Hook

#### `useFeature(options?)`

Description of what it does.

**Parameters:**
- `options`: `FeatureOptions` (optional) - Configuration options
  - `option1`: boolean - Description
  - `option2`: string - Description

**Returns:** `FeatureInstance`
- `property1`: type - Description
- `method1()`: type - Description

**Example:**
```typescript
const feature = useFeature({ option1: true });
```

### Supporting Functions

#### `helperFunction(param1, param2)`

Description.

**Parameters:**
- `param1`: type - Description
- `param2`: type - Description

**Returns:** type - Description

---

## Type Definitions

```typescript
interface FeatureOptions {
  option1?: boolean;
  option2?: string;
}

interface FeatureInstance {
  property1: string;
  method1: () => void;
  method2: (param: string) => Promise<Result>;
}

type Result = {
  success: boolean;
  data?: any;
  error?: Error;
};
```

---

## Architecture

### Component Structure
```
FeatureSystem
├── Core Logic (src/core/feature/)
│   ├── feature.context.tsx
│   ├── feature.hooks.tsx
│   ├── feature.types.ts
│   └── feature.utils.ts
│
└── UI Components (src/core/components/feature/)
    ├── feature-panel.tsx
    ├── feature-item.tsx
    └── feature-dialog.tsx
```

### Data Flow
```
User Action
  → Hook/Context
  → Business Logic
  → State Update
  → UI Re-render
```

### State Management

**Context:** `FeatureContext`
```typescript
interface FeatureState {
  items: Item[];
  selectedItem: Item | null;
  isLoading: boolean;
}
```

**Store:** `featureStore` (if using Zustand)
```typescript
interface FeatureStore {
  settings: FeatureSettings;
  updateSettings: (settings: Partial<FeatureSettings>) => void;
}
```

---

## Integration

### With Window System
How this feature integrates with windows:
- Per-window state vs global state
- Window communication
- Cleanup on window close

### With File System
How this feature uses/interacts with files (if applicable):
- What files it creates/reads
- File structure
- OPFS integration

### With Other Features
Dependencies and interactions:
- Feature A: Description of interaction
- Feature B: Description of interaction

---

## Examples

### Example 1: Basic Use Case

```typescript
// Description of what this example does
import { useFeature } from "@/core/feature";

export function BasicExample() {
  const feature = useFeature();
  
  return (
    <div>
      {/* Implementation */}
    </div>
  );
}
```

### Example 2: Advanced Use Case

```typescript
// Description of advanced scenario
import { useFeature } from "@/core/feature";

export function AdvancedExample() {
  const feature = useFeature({
    advanced: true
  });
  
  // Complex logic
  
  return (
    <div>
      {/* Advanced implementation */}
    </div>
  );
}
```

### Example 3: Real-World Application

See complete implementation in: `src/apps/example-app/`

---

## Implementation Details

### Technical Decisions

**Why X over Y?**
- Reason 1
- Reason 2
- Performance considerations
- Compatibility concerns

**Trade-offs:**
- Pro: Benefit 1
- Pro: Benefit 2
- Con: Limitation 1
- Con: Limitation 2

### Performance Characteristics

- Operation X: ~Nms
- Memory usage: ~NMB
- Scales to: N items
- Bottlenecks: Description

### Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Core functionality | 86+ | 111+ | 15.2+ | 86+ |
| Advanced feature | 90+ | 115+ | 16+ | 90+ |

**Requirements:**
- HTTPS required? Yes/No
- Secure context? Yes/No
- Storage quota? Amount
- Special permissions? List

---

## Configuration

### Settings

Available configuration options:

```typescript
interface FeatureSettings {
  enabled: boolean;
  option1: string;
  option2: number;
  advanced: {
    nested1: boolean;
    nested2: string;
  };
}
```

**Defaults:**
```typescript
const DEFAULT_SETTINGS: FeatureSettings = {
  enabled: true,
  option1: "default",
  option2: 42,
  advanced: {
    nested1: false,
    nested2: "value"
  }
};
```

### Persistence

- Settings stored in: localStorage / OPFS / IndexedDB
- Key/path: `key-name`
- Format: JSON / Binary / Text
- Rehydration: On app load / On feature use

---

## Testing

### Manual Testing Checklist

- [ ] Basic functionality works
- [ ] Edge cases handled
- [ ] Error states shown correctly
- [ ] Multi-window scenarios work
- [ ] Performance is acceptable
- [ ] Settings persist correctly
- [ ] Works in all supported browsers

### Test Scenarios

**Scenario 1: Happy Path**
1. User does X
2. System does Y
3. Result is Z

**Scenario 2: Edge Case**
1. User attempts unusual action
2. System handles gracefully
3. User sees helpful message

**Scenario 3: Error Handling**
1. Error occurs
2. System catches error
3. User can recover

---

## Troubleshooting

### Common Issues

#### Issue 1: Feature Not Working
**Symptom:** Description
**Cause:** Root cause
**Solution:** How to fix

#### Issue 2: Performance Problems
**Symptom:** Description
**Cause:** Root cause
**Solution:** How to fix

#### Issue 3: Data Not Persisting
**Symptom:** Description
**Cause:** Root cause
**Solution:** How to fix

### Debug Mode

Enable debug logging:
```typescript
const feature = useFeature({ debug: true });
```

Check console for:
- Feature initialization logs
- Operation timing
- Error details

---

## Future Enhancements

### Planned Improvements
- [ ] Enhancement 1 (Phase X)
- [ ] Enhancement 2 (Phase Y)
- [ ] Enhancement 3 (Phase Z)

### Potential Features
- Idea 1 - Description
- Idea 2 - Description
- Idea 3 - Description

### Known Limitations
1. Limitation 1 - Explanation and potential solution
2. Limitation 2 - Explanation and potential solution
3. Limitation 3 - Explanation and potential solution

---

## Related Documentation

- [Main Documentation](./DOCUMENTATION.md)
- [API Reference](./src/core/api/README.md) (if relevant)
- [Related Feature](./path/to/related-doc.md)
- [PLAN.md](./PLAN.md) - Phase X.Y section

---

## Migration Guide

### From Legacy Implementation

If replacing old code:

**Before:**
```typescript
// Old way
oldFeature.doSomething();
```

**After:**
```typescript
// New way
const feature = useFeature();
feature.doSomething();
```

**Breaking Changes:**
- Change 1: Description and migration path
- Change 2: Description and migration path

**Migration Steps:**
1. Step 1
2. Step 2
3. Step 3

---

## Changelog

### Version 1.x.x (Date)
- ✨ Initial implementation
- ✨ Feature A added
- ✨ Feature B added

### Version 1.y.y (Date)
- 🐛 Fixed bug X
- ⚡ Performance improvement Y
- 📝 Documentation updated

---

## Credits

**Implemented by:** Name/Team  
**Design by:** Name (if applicable)  
**Inspired by:** External project/concept (if applicable)

**Dependencies:**
- Library A - Purpose
- Library B - Purpose

---

## Questions & Support

### Common Questions

**Q: Can I use this feature with X?**
A: Answer

**Q: What's the difference between X and Y?**
A: Answer

**Q: Is this feature stable?**
A: Answer

### Getting Help

- Read this documentation first
- Check [DOCUMENTATION.md](./DOCUMENTATION.md)
- Search existing issues
- Open new issue if needed

---

**Last Updated:** Date  
**Version:** 1.x.x  
**Status:** Complete/In Progress/Planned  
**Phase:** Phase X

---

## Documentation Maintenance

When updating this feature:

1. Update this document
2. Update [DOCUMENTATION.md](./DOCUMENTATION.md) relevant sections
3. Update [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) if major feature
4. Update [TODO.md](./TODO.md) to mark tasks complete
5. Update API docs if API changed
6. Update type definitions if types changed

---

**Template Version:** 1.0  
**Last Template Update:** October 20, 2025

