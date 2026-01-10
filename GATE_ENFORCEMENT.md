# Gate Approval Enforcement Rules

This document describes all validation rules enforced before a gate can be approved in the LayerCake MVP system.

---

## Gate Approval Checklist

Before a gate can transition from `PENDING` or `IN_REVIEW` to `APPROVED`, the following conditions **MUST** be met:

### 1. ✅ Project Ownership
- **Rule**: Only the project owner can approve gates
- **Check**: `project.ownerId === userId`
- **Error**: `"Only project owner can approve gates"`
- **Location**: `canTransitionGate()` - lines 86-98

### 2. ✅ Gate Status
- **Rule**: Gate must not already be approved
- **Check**: `gate.status !== 'APPROVED'`
- **Error**: `"Gate already approved"`
- **Location**: `canTransitionGate()` - lines 109-111

### 3. ✅ Gate Not Blocked
- **Rule**: Gate must not be in blocked status
- **Check**: `gate.status !== 'BLOCKED'`
- **Error**: `"Gate is blocked by dependencies"`
- **Location**: `canTransitionGate()` - lines 113-115

### 4. ✅ Sequential Gate Progression
- **Rule**: Previous gate in sequence must be approved
- **Check**: Previous gate in `GATE_PROGRESSION` array has status `'APPROVED'`
- **Error**: `"Previous gate {gateType} must be approved first"`
- **Location**: `canTransitionGate()` - lines 117-131
- **Progression**:
  ```
  G0_COMPLETE → G1_PENDING → G1_COMPLETE → G2_PENDING → ... → G9_COMPLETE → PROJECT_COMPLETE
  ```

### 5. ✅ Proof Artifacts (If Required)
- **Rule**: If `gate.requiresProof === true`, at least one proof artifact must exist
- **Check**: `proofArtifact.count({ where: { gateId } }) > 0`
- **Error**: `"Gate requires proof artifacts before approval"`
- **Location**: `canTransitionGate()` - lines 133-145
- **Gates Requiring Proof**:
  - G3_COMPLETE (Architecture validation: OpenAPI, Prisma, build output)
  - G5_COMPLETE (Development: build, lint, test outputs)
  - G6_COMPLETE (Testing: coverage reports)
  - G7_COMPLETE (Security: audit scans)
  - G8_COMPLETE (Staging: deployment logs)
  - G9_COMPLETE (Production: deployment logs, health checks)

### 6. ✅ Deliverables Approved (NEW)
- **Rule**: All deliverables associated with the gate must have status `'approved'`
- **Check**: `deliverables.every(d => d.status === 'approved')`
- **Error**: `"Gate has unapproved deliverables: {deliverableNames}. All deliverables must be approved before gate approval."`
- **Location**: `canTransitionGate()` - lines 147-167
- **Deliverable Statuses**:
  - `pending` - Deliverable created but work not started ❌
  - `in_progress` - Work in progress ❌
  - `completed` - Work done but not yet reviewed ❌
  - `approved` - Reviewed and approved ✅

### 7. ✅ Explicit Approval Response
- **Rule**: Approval must use explicit keywords ("approved", "yes", "approve", "accept")
- **Rule**: Invalid keywords rejected ("ok", "sure", "fine", "alright")
- **Check**: Keyword matching in `validateApprovalResponse()`
- **Error**: `"'{response}' is not a clear approval. Please use 'approved' or 'yes' to approve this gate."`
- **Location**: `validateApprovalResponse()` - lines 153-176

---

## Enforcement Flow

```
User Action: POST /gates/:id/approve
     ↓
GatesService.approve()
     ↓
Checks: Proof artifacts (if gate.requiresProof)
     ↓
StateMachine.approveGate()
     ↓
Validates: Approval response keywords
     ↓
StateMachine.canTransitionGate()
     ↓
Validates:
  1. Project ownership
  2. Gate not already approved
  3. Gate not blocked
  4. Previous gate approved
  5. Proof artifacts present
  6. Deliverables all approved ⭐ NEW
     ↓
If all pass: Update gate status to APPROVED
     ↓
Create next gate in sequence
     ↓
Return success with next gate type
```

---

## API Error Responses

### Gate Approval Blocked by Unapproved Deliverables

**Request**:
```http
POST /gates/gate-123/approve
Authorization: Bearer {token}
Content-Type: application/json

{
  "approved": true,
  "reviewNotes": "Looks good!"
}
```

**Response** (403 Forbidden):
```json
{
  "statusCode": 403,
  "message": "Gate has unapproved deliverables: PRD Document, User Stories. All deliverables must be approved before gate approval.",
  "error": "Forbidden"
}
```

### Solution - Approve Deliverables First

**Step 1**: Get deliverables for the gate
```http
GET /api/deliverables?gateId=gate-123
```

**Step 2**: Approve each deliverable
```http
POST /api/deliverables/deliverable-456/approve
Content-Type: application/json

{
  "approvedBy": "user-789"
}
```

**Step 3**: Retry gate approval
```http
POST /gates/gate-123/approve
{
  "approved": true,
  "reviewNotes": "All deliverables approved, proceeding with gate approval"
}
```

---

## Deliverable Approval Workflow

### Creating Deliverables

Deliverables should be created by agents during task execution and attached to gates:

```typescript
// Example: Product Manager creates PRD deliverable for G2
const deliverable = await deliverables.create({
  projectId: 'project-123',
  gateId: 'gate-g2-pending',
  deliverableType: 'document',
  name: 'Product Requirements Document',
  description: 'Complete PRD with user stories and acceptance criteria',
  filePath: 'docs/PRD.md',
  createdBy: 'agent-product-manager',
  status: 'pending'
});
```

### Deliverable Lifecycle

1. **Created** (`pending`) - Agent creates deliverable
2. **Work Started** (`in_progress`) - Agent begins work
3. **Work Completed** (`completed`) - Agent finishes, awaiting review
4. **User Reviews** - User examines deliverable
5. **Approved** (`approved`) - User explicitly approves via API
6. **Gate Ready** - When all deliverables approved, gate can be approved

### Automatic Deliverable Creation

Deliverables can be auto-created by the orchestrator based on gate type:

**G2 (Planning Complete)**:
- PRD Document
- User Stories
- Acceptance Criteria

**G3 (Architecture Complete)**:
- Architecture Document
- OpenAPI Specification
- Prisma Schema
- Tech Stack Document

**G4 (Design Complete)**:
- Design System
- UI Mockups
- Component Library

**G5 (Development Complete)**:
- Source Code
- Unit Tests
- Integration Tests

**G6 (Testing Complete)**:
- Test Plan
- Test Results
- Coverage Report

**G7 (Security Complete)**:
- Security Audit Report
- Vulnerability Scan Results

**G8-G9 (Deployment)**:
- Deployment Plan
- Runbook
- Health Check Results

---

## Best Practices

### For Frontend Developers

1. **Show Deliverable Status in Gate UI**:
   - Display list of deliverables with approval status
   - Highlight unapproved deliverables before gate approval
   - Provide "Approve" button next to each deliverable

2. **Gate Approval Checklist**:
   - Show checkmarks for each validation rule
   - Disable "Approve Gate" button until all checks pass
   - Show helpful error messages for failed checks

3. **Deliverable Review Flow**:
   - Allow users to view deliverable content
   - Provide comments/feedback on deliverables
   - Track approval history

### For Backend Developers

1. **Consistent Error Messages**:
   - List specific deliverable names in error messages
   - Provide actionable guidance
   - Use appropriate HTTP status codes (403 for validation failures)

2. **Atomic Operations**:
   - Gate approval is atomic (all-or-nothing)
   - If any validation fails, no changes are made
   - Rollback on failure

3. **Audit Trail**:
   - Log all approval attempts (success and failure)
   - Track who approved what and when
   - Store rejection reasons

---

## Database Schema

### Gate Table
```prisma
model Gate {
  id              String   @id @default(cuid())
  projectId       String
  gateType        String   // G1_PENDING, G1_COMPLETE, etc.
  status          GateStatus // PENDING, IN_REVIEW, APPROVED, REJECTED, BLOCKED
  requiresProof   Boolean  @default(false)
  approvedById    String?
  approvedAt      DateTime?
  reviewNotes     String?

  deliverables    Deliverable[] // ⭐ Link to deliverables
  proofArtifacts  ProofArtifact[]
}
```

### Deliverable Table
```prisma
model Deliverable {
  id              String   @id @default(cuid())
  projectId       String
  gateId          String?
  deliverableType String
  name            String
  description     String?
  filePath        String?
  status          DeliverableStatus // pending, in_progress, completed, approved
  createdBy       String
  approvedBy      String?
  approvedAt      DateTime?

  gate            Gate?    @relation(fields: [gateId], references: [id])
}
```

---

## Testing

### Manual Testing

**Test Case 1: Gate approval with unapproved deliverables**
```bash
# Create deliverable
curl -X POST http://localhost:3000/api/deliverables \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-123",
    "gateId": "gate-456",
    "deliverableType": "document",
    "name": "PRD",
    "status": "completed",
    "createdBy": "user-789"
  }'

# Try to approve gate (should fail)
curl -X POST http://localhost:3000/gates/gate-456/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# Expected: 403 error with message about unapproved deliverables
```

**Test Case 2: Gate approval with all deliverables approved**
```bash
# Approve deliverable
curl -X POST http://localhost:3000/api/deliverables/deliverable-789/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": "user-789"}'

# Approve gate (should succeed)
curl -X POST http://localhost:3000/gates/gate-456/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# Expected: 200 success with next gate created
```

### Automated Testing

```typescript
describe('Gate Approval with Deliverables', () => {
  it('should reject gate approval when deliverables are unapproved', async () => {
    // Create gate with deliverable
    const gate = await createGate({ requiresProof: false });
    await createDeliverable({ gateId: gate.id, status: 'completed' });

    // Try to approve
    const response = await request(app)
      .post(`/gates/${gate.id}/approve`)
      .send({ approved: true })
      .expect(403);

    expect(response.body.message).toContain('unapproved deliverables');
  });

  it('should approve gate when all deliverables are approved', async () => {
    // Create gate with approved deliverable
    const gate = await createGate({ requiresProof: false });
    await createDeliverable({ gateId: gate.id, status: 'approved' });

    // Approve gate
    const response = await request(app)
      .post(`/gates/${gate.id}/approve`)
      .send({ approved: true })
      .expect(200);

    expect(response.body.status).toBe('APPROVED');
  });
});
```

---

## Changelog

### 2026-01-09
- ✅ **Added**: Deliverable approval enforcement in `canTransitionGate()`
- ✅ **Fixed**: Gates can no longer be approved with pending/in_progress/completed deliverables
- ✅ **Enhanced**: Error messages list specific unapproved deliverable names
- ✅ **Documentation**: Created this comprehensive enforcement guide

---

## Related Documentation

- [WORKFLOW_IMPLEMENTATION.md](file:///Users/tsm/Desktop/Development/LayerCake/WORKFLOW_IMPLEMENTATION.md) - Complete G0-G9 workflow
- [PARITY_COMPLETE_STATUS.md](file:///Users/tsm/Desktop/Development/LayerCake/PARITY_COMPLETE_STATUS.md) - Feature parity analysis
- [backend/src/gates/services/gate-state-machine.service.ts](file:///Users/tsm/Desktop/Development/LayerCake/backend/src/gates/services/gate-state-machine.service.ts) - Implementation
- [backend/src/deliverables/deliverables.service.ts](file:///Users/tsm/Desktop/Development/LayerCake/backend/src/deliverables/deliverables.service.ts) - Deliverables API
