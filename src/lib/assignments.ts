import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

export type AssignmentTarget = {
  id: string;
  email: string;
  name: string | null;
  company_id: string;
  role: "admin" | "member";
  access_mode: "all" | "assigned";
};

/** The employee being managed in the admin portal (never the admin-portal account itself). */
export async function loadAssignmentTarget(db: Queryable, userId: string | number): Promise<AssignmentTarget | null> {
  const result = await db.query<AssignmentTarget>(
    `SELECT id, email, name, company_id, role, access_mode
     FROM auth_users WHERE id = $1 AND NOT is_super_admin`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/** A tiny parameter builder: returns "$n" for each value added. */
export function paramBuilder(initial: unknown[] = []) {
  const values = [...initial];
  return {
    values,
    param: (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    },
  };
}
