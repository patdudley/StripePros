import { ZodError } from "zod";

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function apiError(error: unknown): Response {
  if (error instanceof ZodError) {
    return json({ error: error.issues[0]?.message ?? "Invalid input." }, 400);
  }
  if (error instanceof Error && error.message.includes("DATABASE_URL")) {
    return json({ error: "The database connection has not been configured yet." }, 503);
  }
  if (error instanceof Error && error.message.includes("SESSION_SECRET")) {
    return json({ error: "Secure sessions have not been configured yet." }, 503);
  }
  if (error instanceof Error && error.message.includes("STRIPE_")) {
    return json({ error: "Stripe billing has not been configured yet." }, 503);
  }
  console.error(error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
