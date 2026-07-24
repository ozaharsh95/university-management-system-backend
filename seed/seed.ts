import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inArray } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { auth } from "../src/lib/auth.js";
import {
  account,
  classes,
  departments,
  enrollments,
  session,
  subjects,
  user,
} from "../src/db/schema/index.js";

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
  password: string;
  image: string;
};

type SeedDepartment = {
  code: string;
  name: string;
  description: string;
};

type SeedSubject = {
  code: string;
  name: string;
  description: string;
  departmentCode: string;
};

type SeedClass = {
  name: string;
  description: string;
  capacity: number;
  status: "active" | "inactive" | "archived";
  inviteCode: string;
  subjectCode: string;
  teacherId: string;
  bannerUrl: string;
};

type SeedEnrollment = {
  classInviteCode: string;
  studentId: string;
};

type SeedData = {
  users: SeedUser[];
  departments: SeedDepartment[];
  subjects: SeedSubject[];
  classes: SeedClass[];
  enrollments: SeedEnrollment[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadSeedData = async (): Promise<SeedData> => {
  const dataPath = path.join(__dirname, "data.json");
  const raw = await readFile(dataPath, "utf-8");
  return JSON.parse(raw) as SeedData;
};

const ensureMapValue = <T>(map: Map<string, T>, key: string, label: string) => {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${label} for key: ${key}`);
  }
  return value;
};

const seed = async () => {
  const isProduction = process.env.NODE_ENV === "production";
  const isOptedIn = process.env.DB_SEED === "true" || process.env.SEED === "true";

  if (isProduction || !isOptedIn) {
    if (isProduction) {
      console.log("Database seeding rejected in production environment.");
    } else {
      console.log("Database seeding skipped. Explicit opt-in required (set DB_SEED=true).");
    }
    process.exit(0);
  }

  const data = await loadSeedData();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in the .env file");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const wsDb = drizzle(pool);

  // Backup original records in case we need to roll back manually
  const originalUsers = await wsDb.select().from(user);
  const originalAccounts = await wsDb.select().from(account);
  const originalSessions = await wsDb.select().from(session);
  const originalDepartments = await wsDb.select().from(departments);
  const originalSubjects = await wsDb.select().from(subjects);
  const originalClasses = await wsDb.select().from(classes);
  const originalEnrollments = await wsDb.select().from(enrollments);

  try {
    await wsDb.transaction(async (tx) => {
      // Delete sequence in deletion order
      await tx.delete(enrollments);
      await tx.delete(classes);
      await tx.delete(subjects);
      await tx.delete(departments);
      await tx.delete(session);
      await tx.delete(account);
      await tx.delete(user);

      if (data.users.length) {
        await tx
          .insert(user)
          .values(
            data.users.map((seedUser) => ({
              id: seedUser.id,
              name: seedUser.name,
              email: seedUser.email,
              emailVerified: true,
              image: seedUser.image,
              role: seedUser.role,
            })),
          )
          .onConflictDoNothing({ target: user.id });

        const ctx = await auth.$context;
        const accountValues = await Promise.all(
          data.users.map(async (seedUser) => {
            const hashedPassword = await ctx.password.hash(seedUser.password);
            return {
              id: `acc_${seedUser.id}`,
              userId: seedUser.id,
              accountId: seedUser.email,
              providerId: "credential",
              password: hashedPassword,
            };
          }),
        );

        await tx
          .insert(account)
          .values(accountValues)
          .onConflictDoNothing({ target: [account.providerId, account.accountId] });
      }

      if (data.departments.length) {
        await tx
          .insert(departments)
          .values(
            data.departments.map((dept) => ({
              code: dept.code,
              name: dept.name,
              description: dept.description,
            })),
          )
          .onConflictDoNothing({ target: departments.code });
      }

      const departmentCodes = data.departments.map((dept) => dept.code);
      const departmentRows =
        departmentCodes.length === 0
          ? []
          : await tx
              .select({ id: departments.id, code: departments.code })
              .from(departments)
              .where(inArray(departments.code, departmentCodes));
      const departmentMap = new Map(
        departmentRows.map((row) => [row.code, row.id]),
      );

      if (data.subjects.length) {
        const subjectsToInsert = data.subjects.map((subject) => ({
          code: subject.code,
          name: subject.name,
          description: subject.description,
          departmentId: ensureMapValue(
            departmentMap,
            subject.departmentCode,
            "department",
          ),
        }));

        await tx
          .insert(subjects)
          .values(subjectsToInsert)
          .onConflictDoNothing({ target: subjects.code });
      }

      const subjectCodes = data.subjects.map((subject) => subject.code);
      const subjectRows =
        subjectCodes.length === 0
          ? []
          : await tx
              .select({ id: subjects.id, code: subjects.code })
              .from(subjects)
              .where(inArray(subjects.code, subjectCodes));
      const subjectMap = new Map(subjectRows.map((row) => [row.code, row.id]));

      if (data.classes.length) {
        const classesToInsert = data.classes.map((classItem) => ({
          name: classItem.name,
          description: classItem.description,
          capacity: classItem.capacity,
          status: classItem.status,
          inviteCode: classItem.inviteCode,
          subjectId: ensureMapValue(subjectMap, classItem.subjectCode, "subject"),
          teacherId: classItem.teacherId,
          bannerUrl: classItem.bannerUrl,
          bannerCldPubId: null,
          schedules: [],
        }));

        await tx
          .insert(classes)
          .values(classesToInsert)
          .onConflictDoNothing({ target: classes.inviteCode });
      }

      const classInviteCodes = data.classes.map(
        (classItem) => classItem.inviteCode,
      );
      const classRows =
        classInviteCodes.length === 0
          ? []
          : await tx
              .select({ id: classes.id, inviteCode: classes.inviteCode })
              .from(classes)
              .where(inArray(classes.inviteCode, classInviteCodes));
      const classMap = new Map(classRows.map((row) => [row.inviteCode, row.id]));

      if (data.enrollments && data.enrollments.length) {
        const enrollmentsToInsert = data.enrollments.map((enrollment) => ({
          studentId: enrollment.studentId,
          classId: ensureMapValue(classMap, enrollment.classInviteCode, "class"),
        }));

        await tx.insert(enrollments).values(enrollmentsToInsert);
      }
    });
  } catch (error) {
    console.error("Seed failed, performing manual rollback/restore...", error);
    try {
      // Clear tables in deletion order to delete any partially seeded data
      await wsDb.delete(enrollments);
      await wsDb.delete(classes);
      await wsDb.delete(subjects);
      await wsDb.delete(departments);
      await wsDb.delete(session);
      await wsDb.delete(account);
      await wsDb.delete(user);

      // Re-insert original records in reverse deletion order (parent tables first)
      if (originalUsers.length) {
        await wsDb.insert(user).values(originalUsers);
      }
      if (originalAccounts.length) {
        await wsDb.insert(account).values(originalAccounts);
      }
      if (originalSessions.length) {
        await wsDb.insert(session).values(originalSessions);
      }
      if (originalDepartments.length) {
        await wsDb.insert(departments).overridingSystemValue().values(originalDepartments);
      }
      if (originalSubjects.length) {
        await wsDb.insert(subjects).overridingSystemValue().values(originalSubjects);
      }
      if (originalClasses.length) {
        await wsDb.insert(classes).overridingSystemValue().values(originalClasses);
      }
      if (originalEnrollments.length) {
        await wsDb.insert(enrollments).overridingSystemValue().values(originalEnrollments);
      }
      console.log("Original records restored successfully.");
    } catch (restoreError) {
      console.error("Failed to restore original records during rollback:", restoreError);
    }
    throw error;
  } finally {
    await pool.end();
  }
};

seed()
  .then(() => {
    console.log("Seed completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
