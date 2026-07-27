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
import express from "express";
import { departments, subjects } from "../db/schema/app.js";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET all departments with optional search and pagination
router.get("/", async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

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

    // Filter by name or code if search query exists
    if (search) {
      filterConditions.push(
        or(
          ilike(departments.name, `%${search}%`),
          ilike(departments.code, `%${search}%`),
        ),
      );
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(departments)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const departmentsList = await db
      .select({
        ...getTableColumns(departments),
      })
      .from(departments)
      .where(whereClause)
      .orderBy(desc(departments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: departmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`GET /departments error: ${e}`);
    res.status(500).json({
      error: "Failed to get departments",
    });
  }
});

// POST create a department (Admin Only)
router.post("/", requireAuth(["admin"]), async (req, res) => {
  const { name, code, description } = req.body;
  try {
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.length > 255
    ) {
      return res.status(400).json({
        error: "Name must be a non-empty string of at most 255 characters",
      });
    }

    if (
      typeof code !== "string" ||
      code.trim().length === 0 ||
      code.length > 50
    ) {
      return res.status(400).json({
        error: "Code must be a non-empty string of at most 50 characters",
      });
    }

    // Verify code is unique
    const [existingDept] = await db
      .select()
      .from(departments)
      .where(eq(departments.code, code));

    if (existingDept) {
      return res.status(400).json({
        error: `Department code '${code}' already exists`,
      });
    }

    const [createdDept] = await db
      .insert(departments)
      .values({
        name,
        code,
        description: description || null,
      })
      .returning();

    res.status(201).json({
      data: createdDept,
    });
  } catch (e: any) {
    if (e && e.code === "23505") {
      return res.status(400).json({
        error: `Department code '${code}' already exists`,
      });
    }
    console.error(`POST /departments error: ${e}`);
    res.status(500).json({
      error: "Failed to create department",
    });
  }
});

// PATCH update a department details (Admin Only)
router.patch("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        error: "Invalid department ID",
      });
    }

    // Verify department exists
    const [dept] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, parsedId));

    if (!dept) {
      return res.status(404).json({
        error: "Department not found",
      });
    }

    const { name, code, description } = req.body;
    const updateData: Partial<typeof departments.$inferInsert> = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (code !== undefined) {
      // Verify department code is unique
      const [existingDept] = await db
        .select()
        .from(departments)
        .where(and(eq(departments.code, code), ne(departments.id, parsedId)));

      if (existingDept) {
        return res.status(400).json({
          error: `Department code '${code}' already exists`,
        });
      }
      updateData.code = code;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error:
          "No fields to update provided. Please provide name, code, or description.",
      });
    }

    const [updatedDept] = await db
      .update(departments)
      .set(updateData)
      .where(eq(departments.id, parsedId))
      .returning();

    res.status(200).json({
      data: updatedDept,
    });
  } catch (e) {
    console.error(`PATCH /departments/:id error: ${e}`);
    res.status(500).json({
      error: "Failed to update department",
    });
  }
});

// DELETE a department (Admin Only)
router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        error: "Invalid department ID",
      });
    }

    // Check if department is referenced by subjects
    const [referencingSubject] = await db
      .select()
      .from(subjects)
      .where(eq(subjects.departmentId, parsedId))
      .limit(1);

    if (referencingSubject) {
      return res.status(400).json({
        error:
          "Cannot delete department because it is referenced by one or more subjects",
      });
    }

    const [deletedDept] = await db
      .delete(departments)
      .where(eq(departments.id, parsedId))
      .returning();

    if (!deletedDept) {
      return res.status(404).json({
        error: "Department not found",
      });
    }

    res.status(200).json({
      message: "Department deleted successfully",
      data: deletedDept,
    });
  } catch (e) {
    console.error(`DELETE /departments/:id error: ${e}`);
    res.status(500).json({
      error: "Failed to delete department",
    });
  }
});

export default router;
