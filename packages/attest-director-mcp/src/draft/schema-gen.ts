/**
 * Schema generator — Phase 3 artifact.
 *
 * Produces a JSON Schema the generated expert can validate its I/O
 * against. Input fields come from the role brief's `typical_inputs`,
 * outputs from `typical_outputs`. The schema is `ajv`-ready.
 */
import type { RoleBrief } from "../schema/role-brief.js";
import type { SchemaArtifact } from "../schema/draft.js";

export function generateSchema(brief: RoleBrief): SchemaArtifact {
  const inputProperties: Record<string, unknown> = {};
  const inputRequired: string[] = [];
  for (const io of brief.typical_inputs) {
    inputProperties[io.name] = jsonSchemaFromTypical(io.type);
    inputRequired.push(io.name);
  }

  const outputProperties: Record<string, unknown> = {};
  const outputRequired: string[] = [];
  for (const io of brief.typical_outputs) {
    outputProperties[io.name] = jsonSchemaFromTypical(io.type);
    outputRequired.push(io.name);
  }

  const jsonSchema: Record<string, unknown> = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: brief.title,
    description: brief.mission,
    type: "object",
    properties: {
      input: {
        type: "object",
        properties: inputProperties,
        required: inputRequired,
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: outputProperties,
        required: outputRequired,
        additionalProperties: false,
      },
    },
    required: ["input", "output"],
  };

  return {
    jsonSchema,
    inputFields: inputRequired,
    outputFields: outputRequired,
  };
}

/**
 * Map a "typical IO" type hint to a JSON Schema entry. Handles the
 * common cases from the role-brief examples (string, number, integer,
 * boolean, array, object, markdown, URL, JQL, ISO-date).
 */
export function jsonSchemaFromTypical(typeHint: string): Record<string, unknown> {
  const t = typeHint.trim().toLowerCase();
  switch (t) {
    case "string":
    case "markdown":
    case "jql":
    case "sql":
    case "uri":
    case "url":
      return { type: "string" };
    case "number":
    case "float":
    case "double":
      return { type: "number" };
    case "int":
    case "integer":
      return { type: "integer" };
    case "boolean":
    case "bool":
      return { type: "boolean" };
    case "array":
      return { type: "array", items: {} };
    case "object":
    case "json":
      return { type: "object", additionalProperties: true };
    case "iso-date":
    case "date":
    case "datetime":
      return { type: "string", format: "date-time" };
  }
  // array<string> / object<string, number> fallbacks
  if (t.startsWith("array<")) {
    const inner = t.slice("array<".length, -1);
    return { type: "array", items: jsonSchemaFromTypical(inner) };
  }
  return { type: "string", description: `(generated from brief type hint: ${typeHint})` };
}
