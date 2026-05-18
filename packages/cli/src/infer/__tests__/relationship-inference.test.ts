import { describe, it, expect } from "vitest";
import { scan } from "../scanner.js";
import { inferTypes } from "../type-inference.js";
import { inferRelationships } from "../relationship-inference.js";

describe("relationship-inference", () => {
  it("infers belongsTo relationships based on heuristics", () => {
    const raw = scan({ id: 1, userId: 2, post_id: 3 });
    const schema = inferTypes(raw);
    const withRels = inferRelationships(schema);

    expect(withRels.fields["userId"].relationship).toBeDefined();
    expect(withRels.fields["userId"].relationship?.targetModel).toBe("user");
    expect(withRels.fields["userId"].relationship?.targetField).toBe("id");

    expect(withRels.fields["post_id"].relationship).toBeDefined();
    expect(withRels.fields["post_id"].relationship?.targetModel).toBe("post");
  });

  it("does not infer relationship for primary id", () => {
    const raw = scan({ id: 1, _id: "abc" });
    const schema = inferTypes(raw);
    const withRels = inferRelationships(schema);

    expect(withRels.fields["id"].relationship).toBeUndefined();
    expect(withRels.fields["_id"].relationship).toBeUndefined();
  });
});
