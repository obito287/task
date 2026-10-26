# TaskFlow — Production-Oriented Task Management Web Application
*Internship Submission & Architectural Specification*

TaskFlow is a production-grade, enterprise-ready task management dashboard built with semantic **HTML5**, responsive **CSS3**, and reactive **vanilla JavaScript/TypeScript**, backed by **Firebase Authentication** and **Google Cloud Firestore**.

---

## 1. Project Structure

```
├── firebase-applet-config.json    # Auto-provisioned Firebase client keys & DB ID
├── firebase-blueprint.json        # Formal JSON-schema intermediate representation (IR)
├── firestore.rules                # Production ABAC security rules
├── firestore.rules.test.ts        # Threat model & Dirty Dozen validation test cases
├── security_spec.md               # Security specification & threat vectors
├── index.html                     # Semantic HTML5 entry point, accessible modals & views
├── package.json                   # Dependencies, build & lint scripts
├── tsconfig.json                  # Strict TypeScript configuration
├── vite.config.ts                 # Vite bundler & development server configuration
├── src/
│   ├── firebase/
│   │   └── config.ts              # Firebase initialization, connection test & audit error handler
│   ├── services/
│   │   ├── auth-service.ts        # Google OAuth popup, Email/Password auth, reset & session tracking
│   │   └── task-service.ts        # Firestore CRUD, onSnapshot real-time sync & statistics computation
│   ├── ui/
│   │   ├── modal.ts               # Accessible modal controller (focus trap, keybindings)
│   │   └── toast.ts               # Non-blocking animated toast notification banners
│   ├── styles/
│   │   └── app.css                # Custom CSS3 variables, glassmorphism, badges & animations
│   ├── types.ts                   # Domain models, TaskStatus, TaskPriority, FilterState & stats
│   ├── index.css                  # Tailwind CSS + custom app styles import
│   └── main.ts                    # Core vanilla JS/TS application bootstrapper & event listeners
```

---

## 2. Core Features & Capabilities

- **Modern Dashboard UI**: Clean dark theme with fluid sidebar, header, interactive statistics cards, and customizable views.
- **Dual View Modes**:
  - **Kanban Board**: Drag-and-drop tasks across *To Do*, *In Progress*, and *Completed* columns, with quick column add and status dropdown shifts.
  - **Structured List View**: Prioritized rows with priority left-border markers, status selectors, due date badges, and action buttons.
- **Real-Time Cloud Firestore Sync**: Uses Firestore `onSnapshot` listeners to reactively synchronize tasks across tabs and devices without page refreshes.
- **Firebase Authentication**:
  - 1-Click Google OAuth Popup Sign-In.
  - Email/Password login and registration with validation.
  - Password recovery flow via `sendPasswordResetEmail`.
  - Protected sessions with reactive `onAuthStateChanged`.
- **Search, Filters & Sorting**:
  - Live search across task titles and descriptions with `/` hotkey.
  - Filter by workspace status (*All, To Do, In Progress, Completed, Overdue*).
  - Filter by priority (*Urgent, High, Medium, Low*).
  - Sort by due date, priority weight, title, or creation time (Ascending/Descending).
- **Dashboard Analytics**:
  - Real-time counters for Total, To Do, In Progress, Completed, and Overdue tasks.
  - Dynamic SVG circular progress ring visualizing completion percentage.
- **UX & Accessibility**:
  - Form validation with live character counters (Title: max 120, Description: max 1000).
  - Confirmation modals for destructive deletions.
  - Toast notifications with icons for success, info, warning, and error states.
  - Built-in Internship Guide modal available from anywhere in the app.

---

## 3. Database Schema (`firebase-blueprint.json`)

The Firestore database schema is strictly scoped under `/tasks/{taskId}`:

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | Yes | Min: 1 char, Max: 120 chars |
| `description` | string | No | Max: 1000 chars |
| `status` | string | Yes | Enum: `'todo'`, `'in_progress'`, `'completed'` |
| `priority` | string | Yes | Enum: `'low'`, `'medium'`, `'high'`, `'urgent'` |
| `dueDate` | string | Yes | Regex: `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` |
| `userId` | string | Yes | Matches `request.auth.uid`, Max: 128 chars |
| `createdAt` | timestamp | Yes | Set to `request.time` upon document creation |
| `updatedAt` | timestamp | Yes | Refreshed to `request.time` upon every update |

---

## 4. Firestore Security Rules (ABAC)

Zero-trust rules are defined in `firestore.rules` and deployed to the provisioned database:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default Deny
    match /{document=**} {
      allow read, write: if false;
    }

    match /tasks/{taskId} {
      // Read access strictly restricted to the document owner
      allow get: if isSignedIn() && isValidId(taskId) && existing().userId == request.auth.uid;
      allow list: if isSignedIn() && resource.data.userId == request.auth.uid;

      // Create enforces schema shape, owner UID, and server timestamps
      allow create: if isSignedIn() &&
        isValidId(taskId) &&
        isValidTask(incoming()) &&
        incoming().userId == request.auth.uid &&
        incoming().createdAt == request.time &&
        incoming().updatedAt == request.time &&
        incoming().keys().hasAll(['title', 'status', 'priority', 'dueDate', 'userId', 'createdAt', 'updatedAt']) &&
        incoming().keys().hasOnly(['title', 'description', 'status', 'priority', 'dueDate', 'userId', 'createdAt', 'updatedAt']);

      // Update enforces immutability of userId and createdAt
      allow update: if isSignedIn() &&
        isValidId(taskId) &&
        existing().userId == request.auth.uid &&
        isValidTask(incoming()) &&
        incoming().userId == existing().userId &&
        incoming().createdAt == existing().createdAt &&
        incoming().updatedAt == request.time &&
        incoming().diff(existing()).affectedKeys().hasOnly(['title', 'description', 'status', 'priority', 'dueDate', 'updatedAt']);

      // Delete only by authenticated document owner
      allow delete: if isSignedIn() && isValidId(taskId) && existing().userId == request.auth.uid;
    }
  }
}
```

---

## 5. Centralized Error Handling Protocol

All Firestore and Auth operations are wrapped in centralized error catch blocks conforming to the audit specification:

```typescript
export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}
```

If an unauthorized write or read is attempted, `handleFirestoreError` logs the structured JSON error and throws it for diagnostic trace.

---

## 6. How to Run and Test Locally

### Prerequisites
- Node.js 18+ or 20+
- npm or bun

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3000`. Open the URL in any modern browser.

### Step 3: Run Type Checking & Linting
```bash
npm run lint
```

### Step 4: Build for Production
```bash
npm run build
```
Generates optimized static bundles in the `/dist` directory.

---

## 7. Firebase Deployment Instructions

1. **Deploying Security Rules**:
   Rules can be deployed using the Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. **Hosting Deployment**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
