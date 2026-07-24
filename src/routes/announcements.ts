import express from "express";
import { db } from "../db/index.js";
import { announcements } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET ALL ANNOUNCEMENTS (Accessible by all logged-in roles)
router.get("/", async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.min(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    );

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (category) {
      filterConditions.push(eq(announcements.category, category as any));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const list = await db
      .select({
        ...getTableColumns(announcements),
        author: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      })
      .from(announcements)
      .leftJoin(user, eq(announcements.authorId, user.id))
      .where(whereClause)
      .orderBy(desc(announcements.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: list,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /announcements error:", error);
    res.status(500).json({
      error: "Failed to get announcements",
    });
  }
});

// POST CREATE ANNOUNCEMENT (Admin Only)
router.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { title, content, category } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({
        error: "Title, content, and category are required",
      });
    }

    const validCategories = ["holiday", "urgent", "academic", "general"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error:
          "Invalid category. Must be 'holiday', 'urgent', 'academic', or 'general'.",
      });
    }

    const [createdAnnouncement] = await db
      .insert(announcements)
      .values({
        title,
        content,
        category,
        authorId: req.user!.id as string,
      })
      .returning();

    res.status(201).json({
      data: createdAnnouncement,
    });
  } catch (error) {
    console.error("POST /announcements error:", error);
    res.status(500).json({
      error: "Failed to create announcement",
    });
  }
});

// DELETE ANNOUNCEMENT BY ID (Admin Only)
router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const announcementId = Number(req.params.id);

    if (!Number.isFinite(announcementId)) {
      return res.status(400).json({
        error: "Invalid announcement ID",
      });
    }

    const [deletedAnnouncement] = await db
      .delete(announcements)
      .where(eq(announcements.id, announcementId))
      .returning();

    if (!deletedAnnouncement) {
      return res.status(404).json({
        error: "Announcement not found",
      });
    }

    res.status(200).json({
      message: "Announcement deleted successfully",
      data: deletedAnnouncement,
    });
  } catch (error) {
    console.error("DELETE /announcements/:id error:", error);
    res.status(500).json({
      error: "Failed to delete announcement",
    });
  }
});

export default router;
