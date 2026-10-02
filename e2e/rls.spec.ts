import { test, expect, request } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * Ownership enforcement, asserted directly against the API.
 *
 * The browser journey only proves one user cannot *open* another's project.
 * This proves the stronger thing: that read, update and delete are all
 * refused, in both directions, at the layer an attacker would actually use.
 * A UI check alone would pass even if the API were wide open.
 *
 * Requires the same prerequisites as journey.spec.ts.
 */

const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ?? "https://nzrfwgkhsopkpqeuoitl.supabase.co";
const SUPABASE_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ??
  "sb_publishable_5Y8igb2AgXusMCjk-dJj8g_Qn7r0fjR";
const API = process.env.E2E_GRAPHQL_URL ?? "http://localhost:4000/";

const password = "test-password-123";

function uniqueEmail(tag: string): string {
  return `codeflow-rls-${tag}-${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}@example.com`;
}

/** Sign a throwaway user up and return their access token. */
async function newUser(ctx: APIRequestContext, tag: string): Promise<string> {
  const res = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    data: {
      email: uniqueEmail(tag),
      password,
      data: { display_name: `RLS ${tag}` },
    },
  });
  const body = await res.json();
  expect(
    body.access_token,
    "sign-up must return a session — is 'Confirm email' off?",
  ).toBeTruthy();
  return body.access_token as string;
}

interface GraphQLResult {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

async function gql(
  ctx: APIRequestContext,
  token: string | null,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResult> {
  const res = await ctx.post(API, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: { query, variables },
  });
  return (await res.json()) as GraphQLResult;
}

const CREATE = `mutation($input: CreateProjectInput) {
  createProject(input: $input) { id name }
}`;

test.describe("project ownership", () => {
  test("neither user can read, update or delete the other's project", async () => {
    const ctx = await request.newContext();

    const tokenA = await newUser(ctx, "a");
    const tokenB = await newUser(ctx, "b");

    // Each user creates a project of their own.
    const a = await gql(ctx, tokenA, CREATE, { input: { name: "A secret" } });
    const b = await gql(ctx, tokenB, CREATE, { input: { name: "B secret" } });

    const projectA = (a.data?.createProject as { id: string }).id;
    const projectB = (b.data?.createProject as { id: string }).id;
    expect(projectA).toBeTruthy();
    expect(projectB).toBeTruthy();

    // --- READ ------------------------------------------------------------
    const readAsB = await gql(
      ctx,
      tokenB,
      `query($id: ID!) { project(id: $id) { id name code } }`,
      { id: projectA },
    );
    expect(readAsB.data?.project ?? null).toBeNull();

    const readAsA = await gql(
      ctx,
      tokenA,
      `query($id: ID!) { project(id: $id) { id name code } }`,
      { id: projectB },
    );
    expect(readAsA.data?.project ?? null).toBeNull();

    // --- LIST: each user sees only their own ------------------------------
    const listA = await gql(ctx, tokenA, `{ projects { id name } }`);
    const idsA = (listA.data?.projects as Array<{ id: string }>).map(
      (p) => p.id,
    );
    expect(idsA).toContain(projectA);
    expect(idsA).not.toContain(projectB);

    const listB = await gql(ctx, tokenB, `{ projects { id name } }`);
    const idsB = (listB.data?.projects as Array<{ id: string }>).map(
      (p) => p.id,
    );
    expect(idsB).toContain(projectB);
    expect(idsB).not.toContain(projectA);

    // --- UPDATE -----------------------------------------------------------
    const updateAsB = await gql(
      ctx,
      tokenB,
      `mutation($input: UpdateProjectInput!) {
         updateProject(input: $input) { id code }
       }`,
      { input: { id: projectA, code: "// pwned" } },
    );
    expect(updateAsB.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");

    // ...and A's project is genuinely untouched.
    const stillA = await gql(
      ctx,
      tokenA,
      `query($id: ID!) { project(id: $id) { code } }`,
      { id: projectA },
    );
    expect((stillA.data?.project as { code: string }).code).not.toContain(
      "pwned",
    );

    // --- RENAME -----------------------------------------------------------
    const renameAsB = await gql(
      ctx,
      tokenB,
      `mutation($id: ID!, $name: String!) {
         renameProject(id: $id, name: $name) { id name }
       }`,
      { id: projectA, name: "stolen" },
    );
    expect(renameAsB.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");

    // --- DELETE -----------------------------------------------------------
    const deleteAsB = await gql(
      ctx,
      tokenB,
      `mutation($id: ID!) { deleteProject(id: $id) }`,
      { id: projectA },
    );
    expect(deleteAsB.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");

    // A's project survived every attempt.
    const survived = await gql(
      ctx,
      tokenA,
      `query($id: ID!) { project(id: $id) { id name } }`,
      { id: projectA },
    );
    expect((survived.data?.project as { name: string }).name).toBe("A secret");

    await ctx.dispose();
  });

  test("the API derives the owner from the token, not from the request", async () => {
    const ctx = await request.newContext();
    const tokenA = await newUser(ctx, "owner");
    const tokenB = await newUser(ctx, "forger");

    // The schema has no user_id field at all, so a forged owner cannot even
    // be expressed. That is the point: it is not validated away, it is
    // unrepresentable.
    const forged = await gql(
      ctx,
      tokenB,
      `mutation($input: CreateProjectInput) { createProject(input: $input) { id } }`,
      { input: { name: "forged", user_id: "00000000-0000-0000-0000-000000000000" } },
    );
    expect(forged.errors?.[0]?.message ?? "").toMatch(/user_id|not defined/i);

    // And a project created by B never shows up for A.
    const real = await gql(ctx, tokenB, CREATE, { input: { name: "B owns this" } });
    const id = (real.data?.createProject as { id: string }).id;

    const asA = await gql(
      ctx,
      tokenA,
      `query($id: ID!) { project(id: $id) { id } }`,
      { id },
    );
    expect(asA.data?.project ?? null).toBeNull();

    await ctx.dispose();
  });

  test("an unauthenticated caller reaches nothing", async () => {
    const ctx = await request.newContext();

    const me = await gql(ctx, null, `{ me { id } }`);
    expect(me.data?.me ?? null).toBeNull();

    for (const [name, query] of [
      ["projects", `{ projects { id } }`],
      ["createProject", `mutation { createProject(input: {name: "x"}) { id } }`],
      [
        "deleteProject",
        `mutation { deleteProject(id: "00000000-0000-0000-0000-000000000000") }`,
      ],
    ] as const) {
      const result = await gql(ctx, null, query);
      expect(
        result.errors?.[0]?.extensions?.code,
        `${name} must be rejected`,
      ).toBe("UNAUTHENTICATED");
    }

    // A forged token is no better than none.
    const forged = await gql(ctx, "not.a.real.token", `{ projects { id } }`);
    expect(forged.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");

    await ctx.dispose();
  });
});
