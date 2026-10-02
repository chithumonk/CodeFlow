import { gql } from "./graphql";

/**
 * Typed project operations. The only place GraphQL documents live, so the
 * components stay free of query strings.
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  language: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface Me {
  id: string;
  email: string | null;
  displayName: string;
  createdAt: string | null;
}

export type ProjectSort = "UPDATED_DESC" | "CREATED_DESC" | "NAME_ASC";

const PROJECT_FIELDS = `
  id
  name
  description
  language
  code
  createdAt
  updatedAt
`;

export async function fetchMe(): Promise<Me | null> {
  const data = await gql<{ me: Me | null }>(
    `query Me { me { id email displayName createdAt } }`,
  );
  return data.me;
}

export async function fetchProjects(
  options: {
    search?: string;
    sort?: ProjectSort;
    limit?: number;
  } = {},
): Promise<Project[]> {
  const data = await gql<{ projects: Project[] }>(
    `query Projects($search: String, $sort: ProjectSort, $limit: Int) {
       projects(search: $search, sort: $sort, limit: $limit) { ${PROJECT_FIELDS} }
     }`,
    options,
  );
  return data.projects;
}

export async function fetchProject(id: string): Promise<Project | null> {
  const data = await gql<{ project: Project | null }>(
    `query Project($id: ID!) { project(id: $id) { ${PROJECT_FIELDS} } }`,
    { id },
  );
  return data.project;
}

export async function createProject(
  input: { name?: string; language?: string; code?: string } = {},
): Promise<Project> {
  const data = await gql<{ createProject: Project }>(
    `mutation CreateProject($input: CreateProjectInput) {
       createProject(input: $input) { ${PROJECT_FIELDS} }
     }`,
    { input },
  );
  return data.createProject;
}

/**
 * Create a project that is ready to run in a chosen language.
 *
 * Two steps rather than one because the database seeds every new project with
 * a file called `main.js`, whatever the project's language. The content is
 * right — it comes from `code` — so only the name needs correcting, and the
 * name is what decides which engine runs the file.
 *
 * If the rename fails the project still exists and still holds the sample, so
 * this reports the project rather than throwing the whole thing away.
 */
export async function createProjectInLanguage(language: {
  id: string;
  label: string;
  sample: string;
  starterFileName: string;
}): Promise<Project> {
  const { createFile, fetchProjectFiles, renameFile } = await import("./files");

  const project = await createProject({
    name: `Untitled ${language.label}`,
    language: language.id,
    code: language.sample,
  });

  const loaded = await fetchProjectFiles(project.id).catch(() => null);
  const seeded = loaded?.files[0];

  if (!seeded) {
    // No trigger ran, so make the file outright.
    await createFile(project.id, language.starterFileName, language.sample);
    return project;
  }

  if (seeded.name !== language.starterFileName) {
    await renameFile(seeded.id, language.starterFileName).catch(() => undefined);
  }

  return project;
}

export async function updateProject(input: {
  id: string;
  name?: string;
  description?: string;
  code?: string;
}): Promise<Project> {
  const data = await gql<{ updateProject: Project }>(
    `mutation UpdateProject($input: UpdateProjectInput!) {
       updateProject(input: $input) { ${PROJECT_FIELDS} }
     }`,
    { input },
  );
  return data.updateProject;
}

export async function renameProject(
  id: string,
  name: string,
): Promise<Project> {
  const data = await gql<{ renameProject: Project }>(
    `mutation RenameProject($id: ID!, $name: String!) {
       renameProject(id: $id, name: $name) { ${PROJECT_FIELDS} }
     }`,
    { id, name },
  );
  return data.renameProject;
}

export async function deleteProject(id: string): Promise<string> {
  const data = await gql<{ deleteProject: string }>(
    `mutation DeleteProject($id: ID!) { deleteProject(id: $id) }`,
    { id },
  );
  return data.deleteProject;
}
