/**
 * The GraphQL surface.
 *
 * Execution is intentionally absent. It will need its own shape (streaming
 * events, cancellation, resource limits) and bolting it onto project CRUD
 * now would mean redesigning both later.
 */
export const typeDefs = /* GraphQL */ `
  scalar DateTime

  "The signed-in account."
  type Me {
    id: ID!
    email: String
    displayName: String!
    createdAt: DateTime
  }

  "One source file inside a project."
  type ProjectFile {
    id: ID!
    name: String!
    content: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Project {
    id: ID!
    name: String!
    description: String!
    "Default language for new files; per-file language comes from the extension."
    language: String!
    "DEPRECATED — read files instead. Kept so older clients keep working."
    code: String!
    createdAt: DateTime!
    updatedAt: DateTime!

    files: [ProjectFile!]!
  }

  input CreateProjectInput {
    name: String
    description: String
    language: String
    code: String
  }

  input UpdateProjectInput {
    id: ID!
    name: String
    description: String
    language: String
    code: String
  }

  enum ProjectSort {
    UPDATED_DESC
    CREATED_DESC
    NAME_ASC
  }

  "Result of running a file in a language CodeFlow cannot trace."
  type ExecutionOutput {
    stdout: String!
    stderr: String!
    exitCode: Int
    signal: String
    "True when the program failed to compile and never ran."
    compileFailed: Boolean!
  }

  "A run that also recorded what the program did, step by step."
  type TracedRun {
    """
    Normalized execution events, JSON-encoded.

    Deliberately a string: the event union has ten shapes and lives in the
    frontend, so restating it in SDL would give it two definitions to drift
    apart. The client parses this into the same events its own engines emit.
    """
    events: String!
    "True when a budget stopped the recording before the program finished."
    truncated: Boolean!
    "Set when the file could not be instrumented and was run unchanged."
    note: String
    compileFailed: Boolean!
  }

  type Query {
    "Null when the request is unauthenticated."
    me: Me

    "Projects belonging to the caller. Never returns anyone else's."
    projects(search: String, limit: Int, sort: ProjectSort): [Project!]!

    project(id: ID!): Project
  }

  type Mutation {
    createProject(input: CreateProjectInput): Project!
    updateProject(input: UpdateProjectInput!): Project!
    renameProject(id: ID!, name: String!): Project!

    "Returns the id of the deleted project."
    deleteProject(id: ID!): ID!

    createFile(projectId: ID!, name: String!, content: String): ProjectFile!
    updateFile(id: ID!, content: String!): ProjectFile!
    renameFile(id: ID!, name: String!): ProjectFile!

    "Returns the id of the deleted file. A project must keep at least one."
    deleteFile(id: ID!): ID!

    """
    Run source remotely and return its output.

    Output only — no trace. Languages CodeFlow can instrument are executed in
    the browser instead and never reach this mutation.
    """
    executeCode(
      language: String!
      version: String!
      source: String!
      stdin: String
    ): ExecutionOutput!

    """
    Run source remotely AND record a step-by-step trace.

    Only for languages CodeFlow can instrument at the source level. The file
    is rewritten to report each statement, the call stack and local variables,
    then compiled and run; the rewrite never leaves the server.
    """
    traceCode(language: String!, source: String!): TracedRun!
  }
`;
