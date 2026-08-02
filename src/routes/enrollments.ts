import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import express from "express";
import { enrollments, classes } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import logger, { getErrorMetadata } from "../lib/logger.js";

const router = express.Router();

// GET all enrollments (Admin Only) - filterable by studentId or classId with pagination
router.get("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { studentId, classId, page = 1, limit = 10 } = req.query;

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    const currentPage = Number.isFinite(parsedPage)
      ? Math.max(1, Math.trunc(parsedPage))
      : 1;
    const limitPerPage = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, Math.trunc(parsedLimit)))
      : 10;

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (studentId) {
      filterConditions.push(eq(enrollments.studentId, String(studentId)));
    }

    if (classId) {
      const parsedClassId = Number(classId);
      if (!isNaN(parsedClassId)) {
        filterConditions.push(eq(enrollments.classId, parsedClassId));
      }
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const enrollmentsList = await db
      .select({
        ...getTableColumns(enrollments),
        student: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
        class: {
          id: classes.id,
          name: classes.name,
          inviteCode: classes.inviteCode,
        },
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .leftJoin(classes, eq(enrollments.classId, classes.id))
      .where(whereClause)
      .orderBy(desc(enrollments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: enrollmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    logger.error("GET /enrollments error", getErrorMetadata(e));
    res.status(500).json({
      error: "Failed to get enrollments",
    });
  }
});

// POST create manual enrollment (Admin Only)
router.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    if (!studentId || classId === undefined) {
      return res.status(400).json({
        error: "studentId and classId are required",
      });
    }

    const parsedClassId = Number(classId);
    if (isNaN(parsedClassId)) {
      return res.status(400).json({
        error: "Invalid classId format. It must be a number.",
      });
    }

    // Verify student user exists and is actually a student
    const [studentUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, String(studentId)));

    if (!studentUser) {
      return res.status(400).json({
        error: "Student user not found",
      });
    }

    if (studentUser.role !== "student") {
      return res.status(400).json({
        error: "User exists but is not a student",
      });
    }

    // Verify class exists
    const [cls] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, parsedClassId));

    if (!cls) {
      return res.status(400).json({
        error: "Class not found",
      });
    }

    // Verify student is not already enrolled
    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, String(studentId)),
          eq(enrollments.classId, parsedClassId),
        ),
      );

    if (existingEnrollment) {
      return res.status(400).json({
        error: "Student is already enrolled in this class",
      });
    }

    // Create enrollment
    const [createdEnrollment] = await db
      .insert(enrollments)
      .values({
        studentId: String(studentId),
        classId: parsedClassId,
      })
      .returning();

    res.status(201).json({
      data: createdEnrollment,
    });
  } catch (e) {
    logger.error("POST /enrollments error", getErrorMetadata(e));
    res.status(500).json({
      error: "Failed to create enrollment",
    });
  }
});

// DELETE delete enrollment / unregister a student (Admin and Teacher)
router.delete("/:id", requireAuth(["admin", "teacher"]), async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);

    if (isNaN(enrollmentId)) {
      return res.status(400).json({
        error: "Invalid enrollment ID",
      });
    }

    // Verify enrollment exists
    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId));

    if (!existingEnrollment) {
      return res.status(404).json({
        error: "Enrollment not found",
      });
    }

    // If teacher, verify they teach the class of the enrollment
    if (req.user!.role === "teacher") {
      const [cls] = await db
        .select()
        .from(classes)
        .where(eq(classes.id, existingEnrollment.classId));

      if (!cls || cls.teacherId !== req.user!.id) {
        return res.status(403).json({
          error:
            "Forbidden - You do not have permission to delete this enrollment",
        });
      }
    }

    const [deletedEnrollment] = await db
      .delete(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .returning();

    res.status(200).json({
      message: "Enrollment deleted successfully",
      data: deletedEnrollment,
    });
  } catch (e) {
    logger.error("DELETE /enrollments/:id error", getErrorMetadata(e));
    res.status(500).json({
      error: "Failed to delete enrollment",
    });
  }
});

// POST join a class via invite code (Student Only)
router.post("/join", requireAuth(["student"]), async (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({
        error: "Invite code is required",
      });
    }

    // Verify class exists matching invite code
    const [targetClass] = await db
      .select()
      .from(classes)
      .where(eq(classes.inviteCode, inviteCode));

    if (!targetClass) {
      return res.status(404).json({
        error: "Class not found with the provided invite code",
      });
    }

    // Verify student is not already enrolled
    const [existingEnrollment] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, req.user!.id as string),
          eq(enrollments.classId, targetClass.id),
        ),
      );

    if (existingEnrollment) {
      return res.status(400).json({
        error: "You are already enrolled in this class",
      });
    }

    // Verify class capacity has not been reached
    const countRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, targetClass.id));

    const currentEnrollments = countRes[0]?.count ?? 0;
    if (currentEnrollments >= targetClass.capacity) {
      return res.status(400).json({
        error: "Class has reached its maximum capacity",
      });
    }

    // Create enrollment
    const [newEnrollment] = await db
      .insert(enrollments)
      .values({
        studentId: req.user!.id as string,
        classId: targetClass.id,
      })
      .returning();

    res.status(201).json({
      message: "Successfully joined the class",
      data: newEnrollment,
    });
  } catch (e) {
    logger.error("POST /enrollments/join error", getErrorMetadata(e));
    res.status(500).json({
      error: "Failed to join class",
    });
  }
});

export default router;
