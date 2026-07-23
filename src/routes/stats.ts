import express, { Request, Response } from "express";
import { db } from "../db/index.js";
import { sql, eq } from "drizzle-orm";
import {
  departments,
  classes,
  enrollments,
  subjects,
} from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
const router = express.Router();

router.get("/overview", async (request: Request, response: Response) => {
  const { role } = request.query;

  if (role === "admin") {
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
  } else {
    response.status(403).json({ success: false, message: "Forbidden" });
  }
});

export default router;
