import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";

export const sessionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    console.log(session);

    if (session) {
      req.user = {
        id: session.user.id,
        role: session.user.role as "admin" | "teacher" | "student",
      };
    }
  } catch (error) {
    console.error("Session middleware error:", error);
  }
  next();
};

export const requireAuth = (
  allowedRoles?: ("admin" | "teacher" | "student")[],
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Please log in",
      });
    }

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
