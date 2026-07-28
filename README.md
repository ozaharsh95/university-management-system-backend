# 🖥️ EduHub Backend: Express, Drizzle, Better-Auth & Arcjet

The core REST API server and security gateway for the EduHub University Management System.

---

## 🛠️ Technology Stack
* **Runtime**: Node.js (with ESM modules enabled)
* **Framework**: Express.js (v5.2+) using TypeScript transpiled on the fly via `tsx watch` for rapid development.
* **ORM**: Drizzle ORM (type-safe SQL schema definition and queries).
* **Database**: Serverless PostgreSQL via Neon DB.
* **Identity Management**: Better-Auth (Node SDK) using the Drizzle PostgreSQL adapter for active session storage.
* **Security & Inspection**: Arcjet SDK (incorporating sliding-window rate limiting, bot protection, and WAF shield protection).
* **Telemetry**: ManageEngine APM Insight node agent.

---

## 🗂️ Project Directory Structure
```
├── drizzle/              # Generated SQL migrations files
├── seed/                 # Database seed script for test datasets
│   └── seed.ts
└── src/
    ├── config/           # App-wide configuration (Arcjet client setup)
    ├── db/               # DB connection client and Drizzle schemas
    │   ├── index.ts
    │   └── schema/
    │       ├── app.ts    # Application logic schemas (departments, subjects, classes, etc.)
    │       └── auth.ts   # Better-Auth tables schema (users, sessions, accounts)
    ├── lib/              # Shared library definitions (Better-Auth instance setup)
    │   └── auth.ts
    ├── middleware/       # Custom Express request middlewares
    │   ├── auth.ts       # Session decoder and role verification middleware
    │   └── security.ts   # Arcjet bot blocking & role-based rate limits
    ├── routes/           # REST API routes (CRUD resources & dashboards metrics)
    │   ├── announcements.ts
    │   ├── classes.ts
    │   ├── departments.ts
    │   ├── enrollments.ts
    │   ├── stats.ts
    │   └── users.ts
    └── index.ts          # Main Express server entry point
```

---

## ⚙️ Key Configuration & Implementations

### 1. Unified Authentication Integration (`src/lib/auth.ts`)
We instantiate `betterAuth` with:
* **Drizzle Adapter**: Maps session records, OAuth credentials, and tokens directly to the Postgres database.
* **Custom User Fields**: Adds custom database fields (`role`, `imageCldPubId`) dynamically into the session payload:
  ```typescript
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "student", input: true },
      imageCldPubId: { type: "string", required: false, input: true }
    }
  }
  ```

### 2. Custom Role-Based Authentication Middleware (`src/middleware/auth.ts`)
* **`sessionMiddleware`**: Reads headers, retrieves the session via Better-Auth node API, and populates `req.user` with context if valid.
* **`requireAuth(['role1', 'role2'])`**: A curried Express middleware that blocks requests if the session is invalid, or if the user's role is not included in the allowed list (returning `401 Unauthorized` or `403 Forbidden`).

### 3. Role-Based Sliding Window Rate Limiting (`src/middleware/security.ts`)
Arcjet executes rules on a per-request basis. Using the session role parsed from `req.user`, the rate limits apply dynamically:
```typescript
switch (role) {
  case "admin":
    limit = 20; // 20 requests per minute
    break;
  case "teacher":
  case "student":
    limit = 10; // 10 requests per minute
    break;
  default:
    limit = 5;  // Guests: 5 requests per minute
}
```

---

## 💻 Available Scripts

Run the following commands inside the backend root folder:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs the server in development mode using `tsx watch` |
| `npm run build` | Transpiles TypeScript files into JavaScript using `tsc` |
| `npm run start` | Runs the production-compiled JS build in `/dist` |
| `npm run db:generate` | Inspects schema definitions and generates SQL migrations inside `/drizzle` |
| `npm run db:migrate` | Runs SQL migrations to synchronize database schemas with your live PostgreSQL instance |
| `npm run db:seed` | Runs the seeding script in `seed/seed.ts` to populate mock database rows |
