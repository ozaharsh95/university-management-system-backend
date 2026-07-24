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
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET student overview stats
router.get(
  "/overview",
  requireAuth(["student"]),
  async (request: Request, response: Response) => {
    try {
      const studentId = request.user?.id;
      if (!studentId) {
        return response.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      // 1. My Classes: Number of enrolled classes
      const [myClassesRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .where(eq(enrollments.studentId, studentId));
      const myClasses = Number(myClassesRes?.count || 0);

      // 2. Departments: Distinct departments of enrolled classes
      const [departmentsRes] = await db
        .select({ count: sql<number>`count(distinct ${departments.id})` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(enrollments.studentId, studentId));
      const departmentsCount = Number(departmentsRes?.count || 0);

      // 3. Subjects: Distinct subjects
      const [subjectsRes] = await db
        .select({ count: sql<number>`count(distinct ${subjects.id})` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .where(eq(enrollments.studentId, studentId));
      const subjectsCount = Number(subjectsRes?.count || 0);

      // 4. Active Classes: Active enrolled classes
      const [activeClassesRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .where(
          and(
            eq(enrollments.studentId, studentId),
            eq(classes.status, "active"),
          ),
        );
      const activeClasses = Number(activeClassesRes?.count || 0);

      const statData = {
        myClasses,
        departmentsCount,
        subjectsCount,
        activeClasses,
      };

      response.status(200).json({
        success: true,
        data: statData,
      });
    } catch (error) {
      console.error(`GET /stats/student/overview error: ${error}`);
      response.status(500).json({
        success: false,
        message: "Failed to fetch student overview stats",
      });
    }
  },
);

// GET student charts stats
router.get(
  "/charts",
  requireAuth(["student"]),
  async (request: Request, response: Response) => {
    try {
      const studentId = request.user?.id;
      if (!studentId) {
        return response.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      // 1. My Subjects: Pie Chart (learning distribution: classes count per subject name)
      const mySubjects = await db
        .select({
          subjectName: subjects.name,
          classCount: sql<number>`count(${classes.id})`,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .where(eq(enrollments.studentId, studentId))
        .groupBy(subjects.id, subjects.name);

      // 2. Classes per Department: Bar Chart
      const classesPerDepartment = await db
        .select({
          departmentName: departments.name,
          classCount: sql<number>`count(${classes.id})`,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(enrollments.studentId, studentId))
        .groupBy(departments.id, departments.name);

      // 3. Weekly Schedule (Timetable Grid / Timeline calendar data)
      const activeClassesWithSchedules = await db
        .select({
          classId: classes.id,
          className: classes.name,
          subjectName: subjects.name,
          teacherName: user.name,
          schedules: classes.schedules,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(
          and(
            eq(enrollments.studentId, studentId),
            eq(classes.status, "active"),
          ),
        );

      const weeklySchedule: any[] = [];
      for (const item of activeClassesWithSchedules) {
        if (Array.isArray(item.schedules)) {
          for (const s of item.schedules) {
            weeklySchedule.push({
              day: s.day,
              startTime: s.startTime,
              endTime: s.endTime,
              className: item.className,
              subjectName: item.subjectName,
              teacherName: item.teacherName,
              classId: item.classId,
            });
          }
        }
      }

      const dayOrder: { [key: string]: number } = {
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
        Sunday: 7,
      };

      weeklySchedule.sort((a, b) => {
        const dayDiff = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
        if (dayDiff !== 0) return dayDiff;
        return a.startTime.localeCompare(b.startTime);
      });

      response.status(200).json({
        success: true,
        data: {
          mySubjects,
          classesPerDepartment,
          weeklySchedule,
        },
      });
    } catch (error) {
      console.error(`GET /stats/student/charts error: ${error}`);
      response.status(500).json({
        success: false,
        message: "Failed to fetch student charts stats",
      });
    }
  },
);

// GET student table activity stats
router.get(
  "/activity",
  requireAuth(["student"]),
  async (request: Request, response: Response) => {
    try {
      const studentId = request.user?.id;
      if (!studentId) {
        return response.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      // 1. My Classes: | Class | Teacher | Subject | Status |
      const myClasses = await db
        .select({
          classId: classes.id,
          className: classes.name,
          teacherName: user.name,
          subjectName: subjects.name,
          status: classes.status,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(eq(enrollments.studentId, studentId))
        .orderBy(desc(enrollments.createdAt));

      // 2. Upcoming Classes: | Time | Class | Teacher | (filtered for today's schedule)
      const activeClassesWithSchedules = await db
        .select({
          className: classes.name,
          teacherName: user.name,
          subjectName: subjects.name,
          schedules: classes.schedules,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(
          and(
            eq(enrollments.studentId, studentId),
            eq(classes.status, "active"),
          ),
        );

      const daysOfWeek = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];

      const queryDay = request.query.day as string;
      const todayName = queryDay || daysOfWeek[new Date().getDay()];

      const upcomingClasses = activeClassesWithSchedules.flatMap((item) => {
        if (!Array.isArray(item.schedules)) return [];
        return item.schedules
          .filter((s) => s.day === todayName)
          .map((s) => ({
            time: s.startTime,
            endTime: s.endTime,
            className: item.className,
            teacherName: item.teacherName,
            subjectName: item.subjectName,
          }));
      });

      upcomingClasses.sort((a, b) => a.time.localeCompare(b.time));

      // 3. My Enrollments: | Subject | Department | Joined On |
      const myEnrollments = await db
        .select({
          subjectName: subjects.name,
          departmentName: departments.name,
          joinedOn: enrollments.createdAt,
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(enrollments.studentId, studentId))
        .orderBy(desc(enrollments.createdAt));

      response.status(200).json({
        success: true,
        data: {
          myClasses,
          upcomingClasses,
          myEnrollments,
        },
      });
    } catch (error) {
      console.error(`GET /stats/student/activity error: ${error}`);
      response.status(500).json({
        success: false,
        message: "Failed to fetch student activity stats",
      });
    }
  },
);

export default router;
