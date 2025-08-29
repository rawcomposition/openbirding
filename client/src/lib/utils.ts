import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Params = {
  [key: string]: string | number | boolean;
};

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
    if (res.status === 401) throw new Error("Unauthorized");
    if (res.status === 403) throw new Error("Forbidden");
    if (res.status === 404) throw new Error("Route not found");
    if (res.status === 405) throw new Error("Method not allowed");
    if (res.status === 504) throw new Error("Operation timed out. Please try again.");
    throw new Error((json.message as string) || "An error occurred");
  }
  return json;
};

export const mutate = async (method: "POST" | "PUT" | "DELETE" | "PATCH", url: string, data?: unknown) => {
  const fullUrl = `${import.meta.env.VITE_API_URL}${url}`;
  const res = await fetch(fullUrl, {
    method,
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
    if (res.status === 401) throw new Error((json.error as string) || "Unauthorized");
    if (res.status === 403) throw new Error("Forbidden");
    if (res.status === 404) throw new Error("Route not found");
    if (res.status === 405) throw new Error("Method not allowed");
    if (res.status === 504) throw new Error("Operation timed out. Please try again.");
    throw new Error((json.message as string) || (json.error as string) || "An error occurred");
  }

  return json;
};
