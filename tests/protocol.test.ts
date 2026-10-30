import {describe,it,expect} from "vitest";
import {finalizeEvent,generateSecretKey} from "nostr-tools";
import {isValidEvent} from "../packages/protocol/src/relay";

describe("NARO event validation",()=>{
 it("rejects null and malformed events",()=>{
  expect(isValidEvent(null)).toBe(false);
  expect(isValidEvent({id:"x"})).toBe(false);
 });

 it("rejects malformed tags and invalid hex fields",()=>{
  expect(isValidEvent({id:"a".repeat(64),pubkey:"b".repeat(64),sig:"c".repeat(128),created_at:1,kind:1,tags:[["e",3]],content:"x"})).toBe(false);
 });

 it("accepts a correctly signed Nostr event",()=>{
  const secretKey=generateSecretKey();
  const event=finalizeEvent({kind:1,created_at:1700000000,tags:[],content:"Teste NARO"},secretKey);
  expect(isValidEvent(event)).toBe(true);
 });

 it("rejects an event whose content was changed after signing",()=>{
  const secretKey=generateSecretKey();
  const event=finalizeEvent({kind:1,created_at:1700000000,tags:[],content:"Conteúdo original"},secretKey);
  expect(isValidEvent({...event,content:"Conteúdo adulterado"})).toBe(false);
 });

 it("rejects negative timestamps and event kinds",()=>{
  const secretKey=generateSecretKey();
  const event=finalizeEvent({kind:1,created_at:1700000000,tags:[],content:"Teste"},secretKey);
  expect(isValidEvent({...event,created_at:-1})).toBe(false);
  expect(isValidEvent({...event,kind:-1})).toBe(false);
 });
});
