import { describe, it, expect } from "vitest";
import type { Document, QueryFilter } from "./db.js";

/**
 * COMPILE-TIME REGRESSION TESTS for Document<T> and QueryFilter<T>
 * These tests verify that metadata fields preserve their correct types
 * and are accessible in filters.
 */

describe("Database Types", () => {
  it("should have correct Document<T> and QueryFilter<T> inference", () => {
    // We use top-level type assertions, so this test block just ensures
    // Vitest identifies this file as a valid test.
    expect(true).toBe(true);
  });
});

export type Assert<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

// 1. Explicit Schema Inference
interface User {
  name: string;
  age: number;
}
export type UserDoc = Document<User>;
export const testUser_Id: Assert<UserDoc["_id"], string> = true;
export const testUser_Name: Assert<UserDoc["name"], string> = true;
export const testUser_Age: Assert<UserDoc["age"], number> = true;

// 2. Metadata Filter Support
export type UserFilter = QueryFilter<User>;
export const testFilter_Id: Assert<keyof UserFilter & "_id", "_id"> = true;
export const testFilter_CreatedAt: Assert<keyof UserFilter & "_createdAt", "_createdAt"> = true;

// 3. Schemaless Collection Behavior (Defaults)
export type AnonDoc = Document;
export const testAnon_Id: Assert<AnonDoc["_id"], string> = true;
export const testAnon_Name: Assert<AnonDoc["anything"], any> = true;

// 4. Optional Field Preservation
export type PartialUser = { nickname?: string };
export type PartialDoc = Document<PartialUser>;
export const testPartial_Nickname: Assert<PartialDoc["nickname"], string | undefined> = true;

/**
 * The following assignments verify that valid filters are accepted
 * and invalid ones are rejected at compile time.
 */

export const validFilter: QueryFilter<User> = {
  _id: "abc",
  _createdAt: { $gt: Date.now() },
  name: "Alice",
};

export const validRegexFilter: QueryFilter<User> = {
  name: { $regex: /ali/i },
};

export const validRegexStringFilter: QueryFilter<User> = {
  name: { $regex: "ali", $flags: "i" },
};

export const validRegexOptionsFilter: QueryFilter<User> = {
  name: { $regex: "ali", $options: "i" },
};

// @ts-expect-error - Invalid field type
export const invalidFieldType: QueryFilter<User> = { age: "wrong" };

// @ts-expect-error - Invalid operator type
export const invalidOperatorType: QueryFilter<User> = { age: { $gt: "not-a-number" } };
