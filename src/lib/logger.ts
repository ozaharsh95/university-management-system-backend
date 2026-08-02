import winston from "winston";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

function normalizeError(val: any): any {
  if (val instanceof Error) {
    return {
      ...val,
      name: val.name,
      message: val.message,
      stack: val.stack,
    };
  }
  if (Array.isArray(val)) {
    return val.map(normalizeError);
  }
  if (val && typeof val === "object") {
    const copy: any = {};
    for (const key of Object.keys(val)) {
      copy[key] = normalizeError(val[key]);
    }
    if (val.name !== undefined) copy.name = val.name;
    if (val.message !== undefined) copy.message = val.message;
    if (val.stack !== undefined) copy.stack = val.stack;
    return copy;
  }
  return val;
}

const normalizeErrors = winston.format((info) => {
  if (info.message instanceof Error) {
    const err = info.message;
    info.message = err.message;
    info.stack = err.stack;
    info.name = err.name;
    Object.assign(info, err);
  }

  for (const key of Object.keys(info)) {
    info[key] = normalizeError(info[key]);
  }

  const splatSymbol = Symbol.for("splat") as any;
  if (Array.isArray(info[splatSymbol])) {
    info[splatSymbol] = info[splatSymbol].map(normalizeError);
  }

  return info;
})();

export const getErrorMetadata = (error: unknown) => {
  if (error instanceof Error) {
    return {
      ...error,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
};

// Custom format for development (colored, readable text)
const devFormat = winston.format.combine(
  normalizeErrors,
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    (info) => `[${info.timestamp}] [${info.level}]: ${info.message}${info.stack ? `\n${info.stack}` : ""}`
  )
);

// Format for production (structured JSON logs)
const prodFormat = winston.format.combine(
  normalizeErrors,
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  }),
];

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels,
  transports,
});

export default logger;
