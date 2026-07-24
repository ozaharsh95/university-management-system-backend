import express, { Request, Response } from "express";
import { db } from "../db/index.js";
import { sql, eq, desc } from "drizzle-orm";
import {
  departments,
  classes,
  enrollments,
  subjects,
} from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET admin overview stats
router.get(
  "/overview",
  requireAuth(["admin"]),
  async (request: Request, response: Response) => {
    try {
      const [departmentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(departments);
      const [subjectCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(subjects);
      const [classesCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(classes);
      const [enrollmentsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments);
      const [studentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, "student"));
      const [teacherCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, "teacher"));

      const statData = {
        departmentCount: departmentCount?.count || 0,
        subjectCount: subjectCount?.count || 0,
        classesCount: classesCount?.count || 0,
        enrollmentsCount: enrollmentsCount?.count || 0,
        studentCount: studentCount?.count || 0,
        teacherCount: teacherCount?.count || 0,
      };

      response.status(200).json({
        success: true,
        data: statData,
      });
    } catch (error) {
      console.error(`GET /stats/overview error: ${error}`);
      response.status(500).json({
        success: false,
        message: "Failed to fetch admin overview stats",
      });
    }
  },
);

router.get(
  "/charts",
  requireAuth(["admin"]),
  async (request: Request, response: Response) => {
    try {
      const studentsPerDepartment = await db
        .select({
          departmentId: departments.id,
          departmentName: departments.name,
          totalStudents: sql<number>`count(DISTINCT ${enrollments.studentId})`,
        })
        .from(departments)
        .leftJoin(subjects, eq(subjects.departmentId, departments.id))
        .leftJoin(classes, eq(classes.subjectId, subjects.id))
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .groupBy(departments.id, departments.name);

      response.status(200).json({
        success: true,
        data: studentsPerDepartment,
      });
    } catch (error) {
      console.error(`GET /stats/charts error: ${error}`);
      response.status(500).json({
        success: false,
        message: "Failed to fetch admin charts stats",
      });
    }
  },
);

// GET /admin stats (admin only)
router.get(
  "/admin",
  requireAuth(["admin"]),
  async (request: Request, response: Response) => {
    try {
      response.status(200).json({
        success: true,
        message: "Welcome Admin! Here are your administrative statistics.",
        data: {
          role: "admin",
        },
      });
    } catch (error) {
      response.status(500).json({
        success: false,
        message: "Failed to fetch admin stats",
      });
    }
  },
);

// GET /teacher stats (teacher only)
router.get(
  "/teacher",
  requireAuth(["teacher"]),
  async (request: Request, response: Response) => {
    try {
      response.status(200).json({
        success: true,
        message: "Welcome Teacher! Here are your class and subject statistics.",
        data: {
          role: "teacher",
        },
      });
    } catch (error) {
      response.status(500).json({
        success: false,
        message: "Failed to fetch teacher stats",
      });
    }
  },
);

// GET /student stats (student only)
router.get(
  "/student",
  requireAuth(["student"]),
  async (request: Request, response: Response) => {
    try {
      response.status(200).json({
        success: true,
        message:
          "Welcome Student! Here are your enrollment and grade statistics.",
        data: {
          role: "student",
        },
      });
    } catch (error) {
      response.status(500).json({
        success: false,
        message: "Failed to fetch student stats",
      });
    }
  },
);

export default router;
