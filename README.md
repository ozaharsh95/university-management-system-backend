# 🎓 EduHub Backend: University Management System

The core REST API server and security gateway for the **EduHub University Management System**. This backend is built to handle user identities, role-based access control, academic hierarchies, real-time statistics, and robust security.

---

## ✨ Key Features
- **Role-Based Authentication**: Secure access via `better-auth`, supporting `Admin`, `Teacher`, and `Student` roles.
- **Academic Hierarchy Management**: Complete CRUD capabilities for Departments, Subjects, and Classes.
- **Student Enrollments**: Students can join classes via unique invite codes.
- **Announcements System**: Broadcast messages tagged by category (General, Academic, Urgent, Holiday).
- **Dashboard Statistics**: Specialized statistical endpoints returning aggregated data tailored to Admins, Teachers, and Students.
- **Robust Security**: Rate-limiting, bot protection, and WAF shield via Arcjet SDK.
- **Type-Safe ORM**: Complete database integrity and schema validation using Drizzle ORM.

---

## 🛠️ Technology Stack
* **Runtime**: Node.js (ESM modules enabled)
* **Framework**: Express.js (v5.2+)
* **Language**: TypeScript (transpiled on the fly via `tsx`)
* **Database**: Serverless PostgreSQL via [Neon DB](https://neon.tech)
* **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
* **Identity Management**: [Better-Auth](https://better-auth.com/) (Node SDK with Drizzle Postgres adapter)
* **Security**: [Arcjet SDK](https://arcjet.com/) (Sliding-window rate limiting, bot protection, WAF)
* **Telemetry**: ManageEngine APM Insight node agent

---

## 🗂️ Project Directory Structure
```text
├── drizzle/              # Generated SQL migration files
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
    │   ├── studentStats.ts
    │   ├── teacherStats.ts
    │   └── users.ts
    └── index.ts          # Main Express server entry point
```

---

## 🗄️ Database Schemas & Relations

The database uses PostgreSQL and is managed by Drizzle ORM. Schemas are strictly typed and divided into Application entities and Authentication entities.

### Application Entities (`app.ts`)
1. **Departments**: Top-level academic unit.
   - Fields: `id`, `code`, `name`, `description`
   - Relations: 1 Department has Many **Subjects**.
2. **Subjects**: Academic courses belonging to departments.
   - Fields: `id`, `departmentId`, `name`, `code`, `description`
   - Relations: 1 Subject has Many **Classes**.
3. **Classes**: Specific instances of a subject taught by a teacher.
   - Fields: `id`, `subjectId`, `teacherId`, `inviteCode`, `name`, `capacity`, `status`, `schedules`, `bannerUrl`
   - Relations: 1 Class belongs to 1 Subject, 1 Teacher, and has Many **Enrollments**.
4. **Enrollments**: Links Students to Classes.
   - Fields: `id`, `studentId`, `classId`
   - Note: Unique constraint on `(studentId, classId)`.
5. **Announcements**: System-wide or class-specific alerts.
   - Fields: `id`, `title`, `content`, `category`, `authorId`

### Authentication Entities (`auth.ts` via Better-Auth)
- **User**: Stores basic identity, `role` (`admin`, `teacher`, `student`), and profile image IDs.
- **Session**, **Account**, **Verification**: Standard tables for active sessions, OAuth, and verification tokens.

---

## 📡 API Routes

All endpoints (except basic health checks) are prefixed with `/api`. Authentication is required for most routes using the session cookie provided by Better-Auth.

| Route Prefix | Purpose | Security / Access |
| :--- | :--- | :--- |
| **`/api/auth/*`** | Better-Auth built-in routes (Login, Signup, Session) | Public |
| **`/api/departments`** | CRUD for Departments | GET: Public/Auth, POST/PATCH/DELETE: Admin |
| **`/api/subjects`** | CRUD for Subjects | GET: Public/Auth, POST/PATCH/DELETE: Admin |
| **`/api/classes`** | Class creation, listing, updates, deletion | Mixed (Admins & Teachers have higher access) |
| **`/api/enrollments`** | Joining and leaving classes via invite codes | Students |
| **`/api/announcements`** | System alerts creation and reading | Creation: Admin/Teacher, Read: All |
| **`/api/users`** | User management & Role adjustments | Admin |
| **`/api/stats/admin`** | Platform-wide aggregates & metrics | Admin only |
| **`/api/stats/teacher`**| Teacher-specific class & student metrics | Teacher only |
| **`/api/stats/student`**| Student-specific enrollment metrics | Student only |

---

## 🔐 How Security & Auth Works

### 1. Unified Authentication (`src/lib/auth.ts`)
We use `better-auth` mapped directly to Postgres via Drizzle Adapter. Custom fields (`role`, `imageCldPubId`) are dynamically injected into the active session payload, making role-based checks extremely fast.

### 2. Role-Based Middleware (`src/middleware/auth.ts`)
The `requireAuth(['admin', 'teacher'])` middleware intercepts requests, decodes the session, and rejects `401 Unauthorized` or `403 Forbidden` if the user's role isn't authorized for that endpoint.

### 3. Dynamic Rate Limiting (`src/middleware/security.ts`)
Arcjet handles request analysis and bot-protection. Depending on the `req.user.role`, sliding window rate limits adjust dynamically:
- **Admin**: 20 requests/min
- **Teacher / Student**: 10 requests/min
- **Guest (No Auth)**: 5 requests/min

---

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js v18+
- PostgreSQL database (e.g., Neon DB)
- An Arcjet account for security keys

### 2. Environment Variables
Create a `.env` file in the root based on `.env.example`:
```env
DATABASE_URL="postgres://username:password@hostname/db_name"
FRONTEND_URL="http://localhost:3000"

ARCJET_KEY="your_arcjet_key"
ARCJET_ENV="development"

NODE_ENV="development"

BETTER_AUTH_SECRET="random_secure_string"
BETTER_AUTH_URL="http://localhost:8000/api/auth"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup
Push the Drizzle schemas to your Neon DB instance:
```bash
npm run db:generate
npm run db:migrate
```
*(Optional) Seed the database with mock data:*
```bash
npm run db:seed
```

### 5. Run the Server
```bash
# Development Mode (auto-reloads)
npm run dev
```
Server will start on `http://localhost:8000`.

---

## 💻 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs the server in development mode using `tsx watch` |
| `npm run build` | Transpiles TypeScript files into JavaScript using `tsc` |
| `npm run start` | Runs the production-compiled JS build in `/dist` |
| `npm run db:generate` | Inspects schema definitions and generates SQL migrations inside `/drizzle` |
| `npm run db:migrate` | Runs SQL migrations to synchronize database schemas with your live PostgreSQL instance |
| `npm run db:seed` | Runs the seeding script in `seed/seed.ts` to populate mock database rows |
