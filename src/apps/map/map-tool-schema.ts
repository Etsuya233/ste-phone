import { Type } from "typebox";

const text = Type.String({ maxLength: 4000 });
const id = Type.String({ minLength: 1, maxLength: 160 });
const point = Type.Tuple([
  Type.Number({ minimum: -100000, maximum: 100000 }),
  Type.Number({ minimum: -100000, maximum: 100000 }),
]);
const nullableId = Type.Union([id, Type.Null()]);
const landuse = Type.Optional(
  Type.Union([
    Type.Literal("residential"),
    Type.Literal("commercial"),
    Type.Literal("civic"),
    Type.Literal("industrial"),
    Type.Literal("forest"),
    Type.Literal("farmland"),
    Type.Literal("meadow"),
    Type.Literal("sand"),
    Type.Literal("rock"),
  ]),
);
const cartography = Type.Union([
  Type.Object(
    { layer: Type.Literal("terrain"), landuse, seed: Type.Optional(id) },
    { additionalProperties: false },
  ),
  Type.Object(
    { layer: Type.Literal("building"), landuse, seed: Type.Optional(id) },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      layer: Type.Literal("district"),
      landuse,
      seed: Type.Optional(id),
      density: Type.Optional(
        Type.Union([Type.Literal("sparse"), Type.Literal("medium"), Type.Literal("dense")]),
      ),
      buildingSize: Type.Optional(Type.Number({ minimum: 2, maximum: 1000 })),
    },
    { additionalProperties: false },
  ),
]);
const feature = Type.Object(
  {
    id,
    name: id,
    kind: Type.Union([Type.Literal("place"), Type.Literal("region"), Type.Literal("road")]),
    aliases: Type.Array(id, { maxItems: 30 }),
    description: text,
    source: id,
    memoryId: nullableId,
    parentId: Type.Optional(nullableId),
    geometry: Type.Union([Type.Array(point, { maxItems: 300 }), Type.Null()]),
    terrain: Type.Union([
      Type.Literal("land"),
      Type.Literal("water"),
      Type.Literal("park"),
      Type.Literal("building"),
    ]),
    connects: Type.Array(id, { maxItems: 30 }),
    cartography: Type.Optional(cartography),
    roadClass: Type.Optional(
      Type.Union([
        Type.Literal("arterial"),
        Type.Literal("street"),
        Type.Literal("path"),
        Type.Literal("bridge"),
      ]),
    ),
  },
  { additionalProperties: false },
);
const event = Type.Object(
  {
    id,
    title: id,
    placeIds: Type.Array(id, { maxItems: 30 }),
    storyTime: Type.Union([text, Type.Null()]),
    description: text,
    source: id,
  },
  { additionalProperties: false },
);

export const mapToolSchemas = {
  empty: Type.Object({}, { additionalProperties: false }),
  read: Type.Object({ query: Type.Optional(id) }, { additionalProperties: false }),
  route: Type.Object({ fromId: id, toId: id }, { additionalProperties: false }),
  records: Type.Object(
    {
      table: id,
      limit: Type.Integer({ minimum: 1, maximum: 50 }),
      offset: Type.Integer({ minimum: 0, maximum: 100000 }),
    },
    { additionalProperties: false },
  ),
  apply: Type.Object(
    {
      title: id,
      upsert: Type.Array(feature, { maxItems: 100 }),
      remove: Type.Array(id, { maxItems: 100 }),
      events: Type.Array(event, { maxItems: 100 }),
    },
    { additionalProperties: false },
  ),
};
