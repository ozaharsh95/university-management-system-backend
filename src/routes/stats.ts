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

      const classesPerDepartment = await db
        .select({
          departmentId: departments.id,
          departmentName: departments.name,
          totalClasses: sql<number>`count(${classes.id})`,
        })
        .from(departments)
        .leftJoin(subjects, eq(subjects.departmentId, departments.id))
        .leftJoin(classes, eq(classes.subjectId, subjects.id))
        .groupBy(departments.id, departments.name);

      const classesStatusWise = await db
        .select({
          status: classes.status,
          count: sql<number>`count(${classes.id})`,
        })
        .from(classes)
        .groupBy(classes.status);

      const topTeachers = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          classCount: sql<number>`count(${classes.id})`,
        })
        .from(user)
        .leftJoin(classes, eq(classes.teacherId, user.id))
        .where(eq(user.role, "teacher"))
        .groupBy(user.id, user.name, user.email, user.image)
        .orderBy(desc(sql`count(${classes.id})`))
        .limit(5);

      response.status(200).json({
        success: true,
        data: {
          studentsPerDepartment,
          classesPerDepartment,
          classesStatusWise,
          topTeachers,
        },
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

// GET admin dashboard table activity
router.get(
  "/activity",
  requireAuth(["admin"]),
  async (request: Request, response: Response) => {
    try {
      const recentUsers = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(desc(user.createdAt))
        .limit(10);

      const recentClasses = await db
        .select({
          id: classes.id,
          name: classes.name,
          description: classes.description,
          capacity: classes.capacity,
          status: classes.status,
          inviteCode: classes.inviteCode,
          subjectName: subjects.name,
          teacherName: user.name,
          createdAt: classes.createdAt,
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .orderBy(desc(classes.createdAt))
        .limit(10);

      const latestEnrollments = await db
        .select({
          id: enrollments.id,
          studentName: user.name,
          studentEmail: user.email,
          className: classes.name,
          classInviteCode: classes.inviteCode,
          createdAt: enrollments.createdAt,
        })
        .from(enrollments)
        .leftJoin(user, eq(enrollments.studentId, user.id))
        .leftJoin(classes, eq(enrollments.classId, classes.id))
        .orderBy(desc(enrollments.createdAt))
        .limit(10);

      const topFilledClasses = await db
        .select({
          id: classes.id,
          name: classes.name,
          inviteCode: classes.inviteCode,
          capacity: classes.capacity,
          subjectName: subjects.name,
          enrolledCount: sql<number>`count(${enrollments.id})`,
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .groupBy(classes.id, classes.name, classes.inviteCode, classes.capacity, subjects.name)
        .orderBy(desc(sql`count(${enrollments.id})`))
        .limit(10);

      response.status(200).json({
        success: true,
        data: {
          recentUsers,
          recentClasses,
          latestEnrollments,
          topFilledClasses,
        },
      });
    } catch (error) {
      console.error(`GET /stats/activity error: ${error}`);
      response.status(500).json({
        success: false,
        message: "Failed to fetch admin activity stats",
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
