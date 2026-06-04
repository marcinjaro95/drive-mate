# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Two error contracts in core services

**Context**: src/app/core/ — AuthService vs VehicleService / ServiceRecordService

**Problem**: AuthService.signIn/signUp return the error as a value (AuthError | null); data services throw on error. Callers using both must handle errors two different ways, which creates silent divergence that compounds over time.

**Rule**: [fill in: e.g. 'Data services throw on error; AuthService returns AuthError | null. Do not introduce a third pattern.']

**Applies to**: [fill in: e.g. 'Any new service added under src/app/core/']
