# Security Specification & Threat Model for TaskFlow

## 1. Data Invariants
1. **Identity Isolation**: A task document must strictly belong to the user who created it (`userId == request.auth.uid`). Users can never query, read, edit, or delete another user's tasks.
2. **Path Hardening**: Document IDs for `/tasks/{taskId}` must conform to safe alphanumeric ID patterns (`isValidId(taskId)`).
3. **Schema Integrity**:
   - `title`: String, length between 1 and 120 characters.
   - `description`: Optional string, maximum 1000 characters.
   - `status`: Strictly one of `['todo', 'in_progress', 'completed']`.
   - `priority`: Strictly one of `['low', 'medium', 'high', 'urgent']`.
   - `dueDate`: String matching `YYYY-MM-DD` pattern, length <= 20.
   - `userId`: Immutable once created; must equal `request.auth.uid`.
4. **Temporal Integrity**:
   - `createdAt`: Must be set upon creation (`incoming().createdAt == request.time`) and immutable during updates.
   - `updatedAt`: Must be refreshed upon every update (`incoming().updatedAt == request.time`).
5. **No Shadow Keys**: Payloads must not contain injected unauthorized properties (e.g., `role`, `isAdmin`, `systemFlag`).

---

## 2. The "Dirty Dozen" Threat Payloads (Must Return PERMISSION_DENIED)

1. **Payload 1: Unauthenticated Read/List**
   - Operation: `list /tasks` with `request.auth == null`
   - Target: Bypassing authentication entirely.
2. **Payload 2: Cross-Tenant Data Access (ID Spoofing)**
   - Operation: `get /tasks/{otherUserTaskId}` where `resource.data.userId != request.auth.uid`
   - Target: Reading another user's private task.
3. **Payload 3: Unauthenticated Task Creation**
   - Operation: `create /tasks/{taskId}` without an active auth session.
   - Target: Anonymous spam injection.
4. **Payload 4: Identity Forgery on Create**
   - Operation: `create /tasks/{taskId}` with payload `{ userId: 'victim-uid-999', ... }` by user `attacker-uid-123`
   - Target: Forging author ownership.
5. **Payload 5: Path Traversal / Poisoned Document ID**
   - Operation: `create /tasks/../../secrets` or 2000-character ID.
   - Target: Document ID injection and storage exhaustion.
6. **Payload 6: Shadow Key Injection (Ghost Property)**
   - Operation: `create /tasks/{taskId}` with `{ ..., isAdmin: true, bypassQuota: 1 }`
   - Target: Inserting unmapped metadata fields into database document.
7. **Payload 7: Empty Title (Boundary Violation)**
   - Operation: `create /tasks/{taskId}` with `{ title: "", ... }`
   - Target: Creating invalid zero-length task title.
8. **Payload 8: Massive Description (Denial-of-Wallet / Storage Attack)**
   - Operation: `create /tasks/{taskId}` with 1MB string in `description`
   - Target: Resource and bandwidth exhaustion.
9. **Payload 9: Invalid Status Enum**
   - Operation: `create /tasks/{taskId}` with `{ status: "deleted_forever" }`
   - Target: Breaking application state machine with illegal enum values.
10. **Payload 10: Ownership Hijacking on Update**
    - Operation: `update /tasks/{taskId}` with `{ userId: 'new-owner-uid' }`
    - Target: Reassigning task ownership to bypass owner restrictions.
11. **Payload 11: Immutable Timestamp Alteration**
    - Operation: `update /tasks/{taskId}` with altered `createdAt` timestamp.
    - Target: Retroactively spoofing task creation records.
12. **Payload 12: Cross-Tenant Deletion**
    - Operation: `delete /tasks/{taskId}` owned by another user (`resource.data.userId != request.auth.uid`).
    - Target: Malicious destructive deletion of competitor/victim data.
