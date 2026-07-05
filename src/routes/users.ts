import express from "express";
import { or, ilike, and, sql, getTableColumns, desc, eq } from "drizzle-orm";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";

const router = express.Router();

// GET ALL USERS
router.get("/", async (req, res) => {
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

    // If role exists, match role name
    if (role) {
      filterConditions.push(eq(user.role, role as UserRoles));
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
    console.error(`GET /teachers error: ${error}`);
    res.status(500).json({
      error: "Failed to get teachers",
    });
  }
});

export default router;
