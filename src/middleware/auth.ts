import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";
import logger from "../lib/logger.js";

export const sessionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session) {
      logger.debug("Session retrieved", {
        userId: session.user.id,
        role: session.user.role,
      });
      req.user = {
        id: session.user.id,
        role: session.user.role as "admin" | "teacher" | "student",
      };
    } else {
      logger.warn(`session is undefined`);
    }
  } catch (error) {
    logger.error("Session middleware error", error);
  }
  next();
};

export const requireAuth = (
  allowedRoles?: ("admin" | "teacher" | "student")[],
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn(
        `401 - Unauthorized | requireAuth | ${req.method} ${req.originalUrl} | IP: ${req.ip}`,
      );
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Please log in",
      });
    }
    logger.info(
      `SESSION MIDDLEWARE | requireAuth | ${req.method} | ${req.originalUrl} | ${JSON.stringify(req.user)}`,
    );

    if (
      allowedRoles &&
      (!req.user.role || !allowedRoles.includes(req.user.role))
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Forbidden - You do not have permission to access this resource",
      });
    }

    next();
  };
};
