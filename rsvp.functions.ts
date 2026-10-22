import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

const TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Attendance = {
  total: number;
};

async function readTotal(): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ total: number }>`
    select coalesce(sum(guests), 0)::int as total from rsvps
  `;
  return Number(rows[0]?.total ?? 0);
}

export const getAttendance = createServerFn({ method: "GET" }).handler(
  async (): Promise<Attendance> => {
    try {
      return { total: await readTotal() };
    } catch {
      return { total: 0 };
    }
  },
);

export const submitRsvp = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") {
      throw new Error("No pudimos leer tu confirmación.");
    }
    const raw = input as { token?: unknown; guests?: unknown };
    if (typeof raw.token !== "string" || !TOKEN.test(raw.token)) {
      throw new Error("No pudimos identificar tu lugar. Recarga e intenta de nuevo.");
    }
    const guests = typeof raw.guests === "number" ? raw.guests : Number(raw.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 12) {
      throw new Error("Indica entre 1 y 12 personas.");
    }
    return { token: raw.token, guests };
  })
  .handler(async ({ data }): Promise<Attendance & { guests: number }> => {
    const sql = await getSql();
    await sql`
      insert into rsvps (token, guests)
      values (${data.token}, ${data.guests})
      on conflict (token) do update
        set guests = excluded.guests,
            updated_at = now()
    `;
    return { total: await readTotal(), guests: data.guests };
  });
