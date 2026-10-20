function generateSchema(brief) {
  const inputProperties = {};
  const inputRequired = [];
  for (const io of brief.typical_inputs) {
    inputProperties[io.name] = jsonSchemaFromTypical(io.type);
    inputRequired.push(io.name);
  }
  const outputProperties = {};
  const outputRequired = [];
  for (const io of brief.typical_outputs) {
    outputProperties[io.name] = jsonSchemaFromTypical(io.type);
    outputRequired.push(io.name);
  }
  const jsonSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: brief.title,
    description: brief.mission,
    type: "object",
    properties: {
      input: {
        type: "object",
        properties: inputProperties,
        required: inputRequired,
        additionalProperties: false
      },
      output: {
        type: "object",
        properties: outputProperties,
        required: outputRequired,
        additionalProperties: false
      }
    },
    required: ["input", "output"]
  };
  return {
    jsonSchema,
    inputFields: inputRequired,
    outputFields: outputRequired
  };
}
function jsonSchemaFromTypical(typeHint) {
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
  if (t.startsWith("array<")) {
    const inner = t.slice("array<".length, -1);
    return { type: "array", items: jsonSchemaFromTypical(inner) };
  }
  return { type: "string", description: `(generated from brief type hint: ${typeHint})` };
}
export {
  generateSchema,
  jsonSchemaFromTypical
};
//# sourceMappingURL=schema-gen.js.map
