import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Params = {
  [key: string]: string | number | boolean;
};

export class ApiError extends Error {
  status: number;
  userMessage?: string;

  constructor(message: string, status: number, userMessage?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.userMessage = userMessage;
  }
}

const STATUS_FALLBACKS: Record<number, string> = {
  401: "Unauthorized",
  403: "Forbidden",
  404: "Route not found",
  405: "Method not allowed",
  504: "Operation timed out. Please try again.",
};

function throwApiError(res: Response, json: Record<string, unknown>): never {
  const raw = (json.error || json.message || "") as string;
  const userMessage = typeof json.userMessage === "string" ? json.userMessage : undefined;
  throw new ApiError(raw || STATUS_FALLBACKS[res.status] || "An error occurred", res.status, userMessage);
}

export const get = async (url: string, params: Params) => {
  const cleanParams = Object.keys(params).reduce((accumulator: Record<string, string>, key) => {
    if (params[key]) accumulator[key] = String(params[key]);
    return accumulator;
  }, {});

  const queryParams = new URLSearchParams(cleanParams).toString();

  let urlWithParams = url;
  if (queryParams) {
    urlWithParams += url.includes("?") ? `&${queryParams}` : `?${queryParams}`;
  }

  const fullUrl = `${import.meta.env.VITE_API_URL}${urlWithParams}`;

  const res = await fetch(fullUrl, {
    method: "GET",
    credentials: "include",
  });

  let json: Record<string, unknown> = {};

  try {
    json = await res.json();
  } catch {
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    throwApiError(res, json);
  }
  return json;
};

export const mutate = async (method: "POST" | "PUT" | "DELETE" | "PATCH", url: string, data?: unknown) => {
  const fullUrl = `${import.meta.env.VITE_API_URL}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });

  let json: Record<string, unknown> = {};

  try {
    json = await res.json();
  } catch {
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    throwApiError(res, json);
  }

  return json;
};

export const formatPercentage = (value: number) => {
  if (value >= 10) {
    return `${Math.round(value)}%`;
  }
  const oneDecimal = Math.round(value * 10) / 10;
  if (oneDecimal >= 10) {
    return "10%";
  }
  return `${oneDecimal}%`;
};
