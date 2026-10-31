import test from "node:test";
import assert from "node:assert/strict";
import {
  connectionHeaderError,
  connectionUpstreamHeaders,
  validateModelConnection,
} from "./model-connections.ts";
import type { ModelConnection } from "./model-connections.ts";

const connection: ModelConnection = {
  id: "local",
  name: " Local ",
  baseUrl: " http://192.168.1.10:8080/v1/// ",
  apiKey: "",
  model: " test-model ",
  customHeaders: {},
};

test("connection validation preserves LAN HTTP and path prefixes while trimming form fields", () => {
  assert.deepEqual(validateModelConnection(connection), {
    ...connection,
    name: "Local",
    model: "test-model",
    baseUrl: "http://192.168.1.10:8080/v1",
  });
  for (const patch of [
    { id: "" },
    { name: " " },
    { model: " " },
    { baseUrl: "not a URL" },
    { baseUrl: "https:example.com/v1" },
    { baseUrl: "ftp://example.com/v1" },
    { baseUrl: "https://user:secret@example.com/v1" },
    { baseUrl: "https://example.com/v1?key=secret" },
    { baseUrl: "https://example.com/v1#fragment" },
    { baseUrl: "https://example.com/v1/chat/completions/" },
    { apiKey: "key\r\nheader: value" },
  ])
    assert.throws(() => validateModelConnection({ ...connection, ...patch }));
});

test("header validation rejects duplicates and protocol-owned fields before converting rows", () => {
  assert.match(
    connectionHeaderError([
      ["X-Test", "a"],
      ["x-test", "b"],
    ])!,
    /重复/,
  );
  assert.match(connectionHeaderError([["Bad Header", "a"]])!, /名称不合法/);
  assert.match(connectionHeaderError([["X-Test", "a\nb"]])!, /换行/);
  for (const name of ["Content-Type", "Host", "Content-Length", "Connection", "Transfer-Encoding"])
    assert.ok(connectionHeaderError([[name.toUpperCase(), "value"]]));
  assert.equal(
    connectionHeaderError([
      ["X-Test", ""],
      ["authorization", " raw value "],
    ]),
    undefined,
  );
});

test("upstream headers explicitly isolate the ST key and custom Authorization overrides API Key", () => {
  assert.deepEqual(JSON.parse(connectionUpstreamHeaders(connection)), { Authorization: "" });
  assert.deepEqual(JSON.parse(connectionUpstreamHeaders({ ...connection, apiKey: "phone-key" })), {
    Authorization: "Bearer phone-key",
  });
  assert.deepEqual(
    JSON.parse(
      connectionUpstreamHeaders({
        ...connection,
        apiKey: "phone-key",
        customHeaders: { authorization: "", "X-Tag": " raw value " },
      }),
    ),
    { Authorization: "", "X-Tag": " raw value " },
  );
  assert.throws(
    () =>
      connectionUpstreamHeaders({
        ...connection,
        customHeaders: { Authorization: "a", AUTHORIZATION: "b" },
      }),
    /重复/,
  );
});
