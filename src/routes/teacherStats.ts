import express, { Request, Response } from "express";
import { db } from "../db/index.js";
import { sql, eq, desc, and } from "drizzle-orm";
import {
  departments,
  classes,
  enrollments,
  subjects,
} from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import logger from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET teacher overview stats
router.get(
  "/overview",
  requireAuth(["teacher"]),
  async (request: Request, response: Response) => {
    try {
      const teacherId = request.user?.id;
      if (!teacherId) {
        return response.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      // 1. My Classes: Total classes assigned
      const [totalClassesRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(eq(classes.teacherId, teacherId));
      const totalClasses = Number(totalClassesRes?.count || 0);

      // 2. Active Classes: Active classes only
      const [activeClassesRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(
          and(eq(classes.teacherId, teacherId), eq(classes.status, "active")),
        );
      const activeClasses = Number(activeClassesRes?.count || 0);

      // 3. Total Students: Unique students across all my classes
      const [totalStudentsRes] = await db
        .select({
          count: sql<number>`count(distinct ${enrollments.studentId})`,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, teacherId));
      const totalStudents = Number(totalStudentsRes?.count || 0);

      // 4. Total Enrollments (non-distinct) for average calculation
      const [totalEnrollmentsRes] = await db
        .select({ count: sql<number>`count(${enrollments.id})` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, teacherId));
      const totalEnrollments = Number(totalEnrollmentsRes?.count || 0);

      // Average Class Size: Total enrollments / total classes
      const averageClassSize =
        totalClasses > 0
          ? parseFloat((totalEnrollments / totalClasses).toFixed(2))
          : 0;

      const statData = {
        myClasses: totalClasses,
        totalStudents: totalStudents,
        activeClasses: activeClasses,
        averageClassSize: averageClassSize,
      };

      response.status(200).json({
        success: true,
        data: statData,
      });
    } catch (error) {
      logger.error("GET /stats/teacher/overview error", error);
      response.status(500).json({
        success: false,
        message: "Failed to fetch teacher overview stats",
      });
    }
  },
);

// GET teacher charts stats
router.get(
  "/charts",
  requireAuth(["teacher"]),
  async (request: Request, response: Response) => {
    try {
      const teacherId = request.user?.id;
      if (!teacherId) {
        return response.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      // 1. Students per Class (Bar Chart)
      const studentsPerClass = await db
        .select({
          className: classes.name,
          studentsEnrolled: sql<number>`count(${enrollments.id})`,
        })
        .from(classes)
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, teacherId))
        .groupBy(classes.id, classes.name);

      // 2. Class Status Distribution (Pie Chart)
      const classStatusDistribution = await db
        .select({
          status: classes.status,
          count: sql<number>`count(${classes.id})`,
        })
        .from(classes)
        .where(eq(classes.teacherId, teacherId))
        .groupBy(classes.status);

      // 3. Enrollment by Subject (Horizontal Bar Chart)
      const enrollmentBySubject = await db
        .select({
          subjectName: subjects.name,
          studentsEnrolled: sql<number>`count(${enrollments.id})`,
        })
        .from(subjects)
        .innerJoin(classes, eq(classes.subjectId, subjects.id))
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, teacherId))
        .groupBy(subjects.id, subjects.name);

      // 4. Capacity Utilization (Bar Chart)
      const capacityUtilizationData = await db
        .select({
          className: classes.name,
          capacity: classes.capacity,
          studentsEnrolled: sql<number>`count(${enrollments.id})`,
        })
        .from(classes)
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, teacherId))
        .groupBy(classes.id, classes.name, classes.capacity);

      const capacityUtilization = capacityUtilizationData.map((c) => {
        const enrolled = Number(c.studentsEnrolled || 0);
        const capacity = Number(c.capacity || 0);
        const utilization =
          capacity > 0
            ? parseFloat(((enrolled / capacity) * 100).toFixed(2))
            : 0;
        return {
          className: c.className,
          utilization,
        };
      });

      response.status(200).json({
        success: true,
        data: {
          studentsPerClass,
          classStatusDistribution,
          enrollmentBySubject,
          capacityUtilization,
        },
      });
    } catch (error) {
      logger.error("GET /stats/teacher/charts error", error);
      response.status(500).json({
        success: false,
        message: "Failed to fetch teacher charts stats",
      });
    }
  },
);

// GET teacher table activity stats
router.get(
  "/activity",
  requireAuth(["teacher"]),
  async (request: Request, response: Response) => {
    try {
      const teacherId = request.user?.id;
      if (!teacherId) {
        return response.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      // 1. My Classes Table: Class, Subject, Capacity, Students, Status
      const myClasses = await db
        .select({
          id: classes.id,
          name: classes.name,
          subjectName: subjects.name,
          capacity: classes.capacity,
          studentsCount: sql<number>`count(${enrollments.id})`,
          status: classes.status,
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .where(eq(classes.teacherId, teacherId))
        .groupBy(
          classes.id,
          classes.name,
          subjects.name,
          classes.capacity,
          classes.status,
        )
        .orderBy(desc(classes.createdAt));

      // 2. Recent Enrollments: Student, Class, Joined On
      const recentEnrollments = await db
        .select({
          id: enrollments.id,
          studentName: user.name,
          studentEmail: user.email,
          studentImage: user.image,
          className: classes.name,
          createdAt: enrollments.createdAt,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .leftJoin(user, eq(enrollments.studentId, user.id))
        .where(eq(classes.teacherId, teacherId))
        .orderBy(desc(enrollments.createdAt))
        .limit(10);

      response.status(200).json({
        success: true,
        data: {
          myClasses,
          recentEnrollments,
        },
      });
    } catch (error) {
      logger.error("GET /stats/teacher/activity error", error);
      response.status(500).json({
        success: false,
        message: "Failed to fetch teacher activity stats",
      });
    }
  },
);

export default router;
