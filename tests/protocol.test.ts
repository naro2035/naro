import {describe,it,expect} from "vitest";
import {isValidEvent} from "../packages/protocol/src/relay";
describe("NARO event validation",()=>{
 it("rejects null and malformed events",()=>{expect(isValidEvent(null)).toBe(false);expect(isValidEvent({id:"x"})).toBe(false);});
 it("rejects malformed tags and invalid hex fields",()=>{expect(isValidEvent({id:"a".repeat(64),pubkey:"b".repeat(64),sig:"c".repeat(128),created_at:1,kind:1,tags:[["e",3]],content:"x"})).toBe(false);});
});
