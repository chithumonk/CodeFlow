import { gql } from "./graphql";
import { ALL_EXTENSIONS, languageForFile } from "../execution/languages";

/** One source file inside a project. */
export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const FILE_FIELDS = `
  id
  name
  content
  createdAt
  updatedAt
`;

export async function fetchProjectFiles(
  projectId: string,
): Promise<{ name: string; files: ProjectFile[] } | null> {
  const data = await gql<{
    project: { name: string; files: ProjectFile[] } | null;
  }>(
    `query ProjectFiles($id: ID!) {
       project(id: $id) { name files { ${FILE_FIELDS} } }
     }`,
    { id: projectId },
  );
  return data.project;
}

export async function createFile(
  projectId: string,
  name: string,
  content = "",
): Promise<ProjectFile> {
  const data = await gql<{ createFile: ProjectFile }>(
    `mutation CreateFile($projectId: ID!, $name: String!, $content: String) {
       createFile(projectId: $projectId, name: $name, content: $content) {
         ${FILE_FIELDS}
       }
     }`,
    { projectId, name, content },
  );
  return data.createFile;
}

export async function updateFile(
  id: string,
  content: string,
): Promise<ProjectFile> {
  const data = await gql<{ updateFile: ProjectFile }>(
    `mutation UpdateFile($id: ID!, $content: String!) {
       updateFile(id: $id, content: $content) { ${FILE_FIELDS} }
     }`,
    { id, content },
  );
  return data.updateFile;
}

export async function renameFile(
  id: string,
  name: string,
): Promise<ProjectFile> {
  const data = await gql<{ renameFile: ProjectFile }>(
    `mutation RenameFile($id: ID!, $name: String!) {
       renameFile(id: $id, name: $name) { ${FILE_FIELDS} }
     }`,
    { id, name },
  );
  return data.renameFile;
}

export async function deleteFile(id: string): Promise<string> {
  const data = await gql<{ deleteFile: string }>(
    `mutation DeleteFile($id: ID!) { deleteFile(id: $id) }`,
    { id },
  );
  return data.deleteFile;
}

/**
 * Client-side mirror of the server's rule, so a bad name is rejected before a
 * round-trip. The server and the database remain the real guarantees.
 */
export function validateFileName(
  name: string,
  existing: string[] = [],
): string | undefined {
  const trimmed = name.trim();

  if (!trimmed) return "Give the file a name.";
  if (trimmed.length > 60) return "Use at most 60 characters.";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    return "Use letters, numbers, dots, dashes and underscores, starting with a letter or number.";
  }
  if (!languageForFile(trimmed)) {
    return `File names must end in ${ALL_EXTENSIONS.join(", ")}.`;
  }
  if (existing.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
    return "This project already has a file with that name.";
  }
  return undefined;
}
