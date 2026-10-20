function okJson(payload) {
  return {
    content: [
      { type: "text", text: JSON.stringify(payload, null, 2) }
    ]
  };
}
function errJson(message, payload) {
  return {
    isError: true,
    content: [
      { type: "text", text: JSON.stringify({ error: message, payload }, null, 2) }
    ]
  };
}
export {
  errJson,
  okJson
};
//# sourceMappingURL=_shared.js.map
