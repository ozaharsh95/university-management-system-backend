import express from "express";
import { or, ilike, and, sql, getTableColumns, desc, eq } from "drizzle-orm";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import logger, { getErrorMetadata } from "../lib/logger.js";

const router = express.Router();

// GET ALL USERS
router.get("/", requireAuth(["admin", "teacher"]), async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // If search query exists, filter by subject name or subject code
    if (search) {
      filterConditions.push(
        or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)),
      );
    }

    // Determine target role (Teachers are restricted to seeing students only)
    const targetRole = req.user!.role === "teacher" ? "student" : role;

    // If role exists, match role name
    if (targetRole) {
      filterConditions.push(eq(user.role, targetRole as any));
    }

    // Combine all filters using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(user)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const userResult = await db
      .select({ ...getTableColumns(user) })
      .from(user)
      .where(whereClause)
      .orderBy(desc(user.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: userResult,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    logger.error("GET /users error", getErrorMetadata(error));
    res.status(500).json({
      error: "Failed to get users",
    });
  }
});

// GET SINGLE USER BY ID
router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.params.id as string;

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required",
      });
    }

    const [userDetail] = await db
      .select({ ...getTableColumns(user) })
      .from(user)
      .where(eq(user.id, userId));

    if (!userDetail) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.status(200).json({
      data: userDetail,
    });
  } catch (error) {
    logger.error("GET /users/:id error", getErrorMetadata(error));
    res.status(500).json({
      error: "Failed to get user details",
    });
  }
});

// PATCH UPDATE USER BY ID (ADMIN ONLY)
router.patch("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const userId = req.params.id as string;
    const { role, name, email } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required",
      });
    }

    const updateData: Partial<typeof user.$inferInsert> = {};

    if (role !== undefined) {
      const validRoles = ["admin", "teacher", "student"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          error:
            "Invalid role value. Must be 'admin', 'teacher', or 'student'.",
        });
      }
      updateData.role = role;
    }

    if (name !== undefined) {
      updateData.name = name;
    }

    if (email !== undefined) {
      updateData.email = email;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error:
          "No fields to update provided. Please provide role, name, or email.",
      });
    }

    const [updatedUser] = await db
      .update(user)
      .set(updateData)
      .where(eq(user.id, userId))
      .returning({ ...getTableColumns(user) });

    if (!updatedUser) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.status(200).json({
      data: updatedUser,
    });
  } catch (error) {
    logger.error("PATCH /users/:id error", getErrorMetadata(error));
    res.status(500).json({
      error: "Failed to update user",
    });
  }
});

export default router;
