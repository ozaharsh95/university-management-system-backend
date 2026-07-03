type Schedule = {
  day: string;
  startTime: string;
  endTime: string;
};

type UserRoles = "admin" | "teacher" | "student";

type RateLimitRole = UserRoles | "guest";
