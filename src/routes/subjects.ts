import { and, desc, eq, getTableColumns, ilike, ne, or, sql } from "drizzle-orm";
import express from "express";
import { departments, subjects } from "../db/schema/app.js";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { validatePatchString, parseRouteId } from "../lib/validators.js";
import logger from "../lib/logger.js";

const router = express.Router();

// GET all subjects with optional search, filtering and pagination
router.get("/", async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // If search query exists, filter by subject name or subject code
    if (search) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`),
        ),
      );
    }

    // If department filter exists, match department name
    if (department) {
      filterConditions.push(ilike(departments.name, `%${department}%`));
    }

    // Combine all filters using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(subjects.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    logger.error("GET /subjects error", e);
    res.status(500).json({
      error: "Failed to get subjects",
    });
  }
});

// GET a single subject by id
router.get("/:id", async (req, res) => {
  try {
    const subjectId = parseRouteId(req.params.id);
    if (subjectId === null) {
      return res.status(400).json({
        error: "Invalid subject ID",
      });
    }

    const [subject] = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, subjectId));

    if (!subject) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    res.status(200).json({
      data: subject,
    });
  } catch (e) {
    logger.error("GET /subjects/:id error", e);
    res.status(500).json({
      error: "Failed to get subject",
    });
  }
});

// POST a new subject (Admin Only)
router.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { name, code, departmentId, description } = req.body;

    if (!name || !code || departmentId === undefined) {
      return res.status(400).json({
        error: "Name, code, and departmentId are required",
      });
    }

    const parsedDeptId = Number(departmentId);
    if (isNaN(parsedDeptId)) {
      return res.status(400).json({
        error: "Invalid departmentId format. It must be a number.",
      });
    }

    // Verify department exists
    const [dept] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, parsedDeptId));

    if (!dept) {
      return res.status(400).json({
        error: "Department not found",
      });
    }

    // Verify subject code is unique
    const [existingSubject] = await db
      .select()
      .from(subjects)
      .where(eq(subjects.code, code));

    if (existingSubject) {
      return res.status(400).json({
        error: `Subject code '${code}' already exists`,
      });
    }

    const [createdSubject] = await db
      .insert(subjects)
      .values({
        name,
        code,
        departmentId: parsedDeptId,
        description: description || null,
      })
      .returning();

    res.status(201).json({
      data: createdSubject,
    });
  } catch (e) {
    logger.error("POST /subjects error", e);
    res.status(500).json({
      error: "Failed to create subject",
    });
  }
});

// PATCH update a subject by id (Admin Only)
router.patch("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        error: "Invalid subject ID",
      });
    }

    // Verify subject exists
    const [subject] = await db
      .select()
      .from(subjects)
      .where(eq(subjects.id, parsedId));

    if (!subject) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    const { name, code, departmentId, description } = req.body;
    const updateData: Partial<typeof subjects.$inferInsert> = {};

    if (name !== undefined) {
      const nameErr = validatePatchString(name, "Name", 255);
      if (nameErr) {
        return res.status(400).json({ error: nameErr });
      }
      updateData.name = name;
    }

    if (code !== undefined) {
      const codeErr = validatePatchString(code, "Code", 50);
      if (codeErr) {
        return res.status(400).json({ error: codeErr });
      }
      // Verify subject code is unique among other subjects
      const [existingSubject] = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.code, code), ne(subjects.id, parsedId)));

      if (existingSubject) {
        return res.status(400).json({
          error: `Subject code '${code}' already exists`,
        });
      }
      updateData.code = code;
    }

    if (departmentId !== undefined) {
      const parsedDeptId = Number(departmentId);
      if (isNaN(parsedDeptId)) {
        return res.status(400).json({
          error: "Invalid departmentId format. It must be a number.",
        });
      }

      // Verify department exists
      const [dept] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, parsedDeptId));

      if (!dept) {
        return res.status(400).json({
          error: "Department not found",
        });
      }
      updateData.departmentId = parsedDeptId;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: "No fields to update provided. Please provide name, code, departmentId, or description.",
      });
    }

    const [updatedSubject] = await db
      .update(subjects)
      .set(updateData)
      .where(eq(subjects.id, parsedId))
      .returning();

    res.status(200).json({
      data: updatedSubject,
    });
  } catch (e) {
    logger.error("PATCH /subjects/:id error", e);
    res.status(500).json({
      error: "Failed to update subject",
    });
  }
});

// DELETE a subject by id (Admin Only)
router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        error: "Invalid subject ID",
      });
    }

    const [deletedSubject] = await db
      .delete(subjects)
      .where(eq(subjects.id, parsedId))
      .returning();

    if (!deletedSubject) {
      return res.status(404).json({
        error: "Subject not found",
      });
    }

    res.status(200).json({
      message: "Subject deleted successfully",
      data: deletedSubject,
    });
  } catch (e) {
    logger.error("DELETE /subjects/:id error", e);
    res.status(500).json({
      error: "Failed to delete subject",
    });
  }
});

export default router;
