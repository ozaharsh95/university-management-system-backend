import express from "express";
import { db } from "../db/index.js";
import {
  classes,
  departments,
  subjects,
  enrollments,
} from "../db/schema/app.js";
import {
  and,
  desc,
  eq,
  getTableColumns,
  ilike,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { user } from "../db/schema/auth.js";
import { requireAuth } from "../middleware/auth.js";
import logger from "../lib/logger.js";

const router = express.Router();

function parseClassId(id: string | string[] | undefined): number | null {
  if (typeof id !== "string") {
    return null;
  }
  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

router.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const [createdClass] = await db
      .insert(classes)
      .values({
        ...req.body,
        inviteCode: Math.random().toString(36).substring(2, 9),
        schedules: [],
      })
      .returning({ id: classes.id });

    if (!createdClass) {
      throw Error;
    }

    res.status(201).json({
      data: createdClass,
    });
  } catch (error) {
    logger.error("POST /classes error", error);
    res.status(500).json({
      error,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      search,
      subject,
      teacher,
      teacherId,
      studentId,
      page = 1,
      limit = 10,
    } = req.query;

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

    // If search query exists, filter by class name OR invite code
    if (search) {
      filterConditions.push(
        or(
          ilike(classes.name, `%${search}%`),
          ilike(classes.inviteCode, `%${search}%`),
        ),
      );
    }

    // If subject filter exists, match subject name
    if (subject) {
      const subjectPattern = `%${String(subject).replace(/[%_]/g, "\\$&")}%`;

      filterConditions.push(ilike(subjects.name, subjectPattern));
    }

    // If teacher filter exists, match teacher name
    if (teacher) {
      const teacherPattern = `%${String(teacher).replace(/[%_]/g, "\\$&")}%`;

      filterConditions.push(ilike(user.name, teacherPattern));
    }

    // Filter by specific teacherId if provided
    if (teacherId) {
      filterConditions.push(eq(classes.teacherId, String(teacherId)));
    }

    if (studentId) {
      filterConditions.push(eq(enrollments.studentId, String(studentId)));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    let countQuery = db
      .select({ count: sql<number>`count(distinct ${classes.id})` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id));

    const listQueryFields = {
      ...getTableColumns(classes),
      subject: { ...getTableColumns(subjects) },
      teacher: { ...getTableColumns(user) },
    };

    let listQuery = studentId
      ? db
          .selectDistinct(listQueryFields)
          .from(classes)
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .leftJoin(user, eq(classes.teacherId, user.id))
      : db
          .select(listQueryFields)
          .from(classes)
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .leftJoin(user, eq(classes.teacherId, user.id));

    if (studentId) {
      countQuery = countQuery.innerJoin(
        enrollments,
        eq(classes.id, enrollments.classId),
      ) as any;
      listQuery = listQuery.innerJoin(
        enrollments,
        eq(classes.id, enrollments.classId),
      ) as any;
    }

    const countResult = await countQuery.where(whereClause);
    const totalCount = countResult[0]?.count ?? 0;

    const classesList = await listQuery
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    logger.error("GET /classes error", error);

    res.status(500).json({
      error: "Failed to get classes",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const classId = parseClassId(req.params.id);

    if (classId === null) {
      return res.status(400).json({
        error: "No class found",
      });
    }

    const whereClause = eq(classes.id, classId);

    const [classDetails] = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        department: { ...getTableColumns(departments) },
        teacher: { ...getTableColumns(user) },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);

    if (!classDetails) {
      return res.status(404).json({
        error: "No class found",
      });
    }

    res.status(200).json({
      data: classDetails,
    });
  } catch (error) {
    logger.error("GET /classes/:id error", error);

    res.status(500).json({
      error: "Failed to get classes",
    });
  }
});

// PATCH update a class by id (Admin and Teacher)
router.patch("/:id", requireAuth(["admin", "teacher"]), async (req, res) => {
  try {
    const classId = parseClassId(req.params.id);

    if (classId === null) {
      return res.status(400).json({
        error: "Invalid class ID",
      });
    }

    // Verify class exists
    const [existingClass] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existingClass) {
      return res.status(404).json({
        error: "Class not found",
      });
    }

    // Authorization check: Teachers can only edit classes they teach
    if (
      req.user!.role === "teacher" &&
      existingClass.teacherId !== req.user!.id
    ) {
      return res.status(403).json({
        error: "Forbidden - You do not have permission to modify this class",
      });
    }

    const {
      name,
      subjectId,
      teacherId,
      inviteCode,
      bannerCldPubId,
      bannerUrl,
      capacity,
      description,
      status,
      schedules,
    } = req.body;

    const updateData: Partial<typeof classes.$inferInsert> = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (bannerCldPubId !== undefined) {
      updateData.bannerCldPubId = bannerCldPubId || null;
    }

    if (bannerUrl !== undefined) {
      updateData.bannerUrl = bannerUrl || null;
    }

    if (subjectId !== undefined) {
      const parsedSubId = Number(subjectId);
      if (isNaN(parsedSubId)) {
        return res.status(400).json({
          error: "Invalid subjectId format. It must be a number.",
        });
      }

      // Verify subject exists
      const [sub] = await db
        .select()
        .from(subjects)
        .where(eq(subjects.id, parsedSubId));

      if (!sub) {
        return res.status(400).json({
          error: "Subject not found",
        });
      }
      updateData.subjectId = parsedSubId;
    }

    if (teacherId !== undefined) {
      // Only Admin can change a class's teacher
      if (req.user!.role !== "admin" && teacherId !== existingClass.teacherId) {
        return res.status(403).json({
          error: "Only admins can reassign classes to a different teacher",
        });
      }

      // Verify teacher exists and has the role of a teacher
      const [t] = await db
        .select()
        .from(user)
        .where(eq(user.id, String(teacherId)));

      if (!t) {
        return res.status(400).json({
          error: "Teacher not found",
        });
      }

      if (t.role !== "teacher") {
        return res.status(400).json({
          error: "Selected user is not a teacher",
        });
      }

      updateData.teacherId = String(teacherId);
    }

    if (inviteCode !== undefined) {
      if (
        typeof inviteCode !== "string" ||
        inviteCode.trim().length === 0 ||
        inviteCode.length > 50
      ) {
        return res.status(400).json({
          error:
            "inviteCode must be a non-empty string of at most 50 characters",
        });
      }

      // Verify invite code is unique
      const [existingWithCode] = await db
        .select()
        .from(classes)
        .where(
          and(eq(classes.inviteCode, inviteCode), ne(classes.id, classId)),
        );

      if (existingWithCode) {
        return res.status(400).json({
          error: `Invite code '${inviteCode}' is already in use`,
        });
      }
      updateData.inviteCode = inviteCode;
    }

    if (capacity !== undefined) {
      const parsedCapacity = Number(capacity);
      if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({
          error: "Capacity must be a positive number",
        });
      }
      updateData.capacity = parsedCapacity;
    }

    if (status !== undefined) {
      const validStatuses = ["active", "inactive", "archived"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid status. Must be 'active', 'inactive', or 'archived'.",
        });
      }
      updateData.status = status as any;
    }

    if (schedules !== undefined) {
      if (!Array.isArray(schedules)) {
        return res.status(400).json({
          error: "Schedules must be an array",
        });
      }
      for (const s of schedules) {
        if (
          typeof s !== "object" ||
          s === null ||
          !s.day ||
          !s.startTime ||
          !s.endTime
        ) {
          return res.status(400).json({
            error: "Each schedule must have 'day', 'startTime', and 'endTime'.",
          });
        }
      }
      updateData.schedules = schedules;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: "No fields to update provided.",
      });
    }

    const [updatedClass] = await db
      .update(classes)
      .set(updateData)
      .where(eq(classes.id, classId))
      .returning();

    res.status(200).json({
      data: updatedClass,
    });
  } catch (error) {
    logger.error("PATCH /classes/:id error", error);
    res.status(500).json({
      error: "Failed to update class",
    });
  }
});

// DELETE a class by id (Admin and Teacher)
router.delete("/:id", requireAuth(["admin", "teacher"]), async (req, res) => {
  try {
    const classId = parseClassId(req.params.id);

    if (classId === null) {
      return res.status(400).json({
        error: "Invalid class ID",
      });
    }

    // Verify class exists
    const [existingClass] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existingClass) {
      return res.status(404).json({
        error: "Class not found",
      });
    }

    // Authorization check: Teachers can only delete classes they teach
    if (
      req.user!.role === "teacher" &&
      existingClass.teacherId !== req.user!.id
    ) {
      return res.status(403).json({
        error: "Forbidden - You do not have permission to delete this class",
      });
    }

    const [deletedClass] = await db
      .delete(classes)
      .where(eq(classes.id, classId))
      .returning();

    res.status(200).json({
      message: "Class deleted successfully",
      data: deletedClass,
    });
  } catch (error) {
    logger.error("DELETE /classes/:id error", error);
    res.status(500).json({
      error: "Failed to delete class",
    });
  }
});

export default router;
