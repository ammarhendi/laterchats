/**
 * End-to-end PM test: simulates two users connecting via socket,
 * joining rooms, and exchanging private messages.
 * Run with: node scripts/test-pm.mjs
 */
import { io } from "socket.io-client";

const SERVER_URL = "http://127.0.0.1:3000";
const TIMEOUT = 8000;

let passed = 0;
let failed = 0;

function log(label, msg, ok = true) {
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} [${label}] ${msg}`);
  if (ok) passed++; else failed++;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function connectUser(nickname, roomId) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, { transports: ["polling", "websocket"], timeout: 5000 });
    const timer = setTimeout(() => reject(new Error(`${nickname}: connect timeout`)), TIMEOUT);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.emit("join_room", { roomId, nickname, color: "#7B1FA2", font: "Arial", size: 14 });
    });
    socket.on("room_joined", (data) => {
      console.log(`  → ${nickname} joined room ${roomId}, users: ${data.users?.map(u => u.nickname).join(", ")}`);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${nickname}: connect_error: ${err.message}`));
    });
  });
}

async function runTests() {
  console.log("\n========================================");
  console.log("  Later! Chat — PM End-to-End Test");
  console.log("========================================\n");

  // ── Test 1: Both users connect and join rooms ──────────────────────────────
  console.log("TEST 1: Connect two users to the server");
  let alice, bob;
  try {
    alice = await connectUser("Alice_Test", 1);
    log("Alice", "Connected and joined room 1");
  } catch (e) {
    log("Alice", `Failed to connect: ${e.message}`, false);
    process.exit(1);
  }
  try {
    bob = await connectUser("Bob_Test", 1);
    log("Bob", "Connected and joined room 1");
  } catch (e) {
    log("Bob", `Failed to connect: ${e.message}`, false);
    alice.disconnect();
    process.exit(1);
  }

  await wait(500);

  // ── Test 2: Alice sends PM to Bob ──────────────────────────────────────────
  console.log("\nTEST 2: Alice sends PM to Bob (same room)");
  const pmReceived = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PM not received within 5s")), 5000);
    bob.on("private_message", (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });

  alice.emit("send_private_message", {
    recipientNickname: "Bob_Test",
    content: "Hello Bob, this is a test PM!",
    senderPublicKey: null,
  });

  try {
    const msg = await pmReceived;
    log("PM Delivery", `Bob received PM from Alice: "${msg.content}"`);
    if (msg.senderNickname !== "Alice_Test") {
      log("PM Sender", `Expected senderNickname=Alice_Test, got: ${msg.senderNickname}`, false);
    } else {
      log("PM Sender", "senderNickname is correct: Alice_Test");
    }
    if (msg.content !== "Hello Bob, this is a test PM!") {
      log("PM Content", `Content mismatch: got "${msg.content}"`, false);
    } else {
      log("PM Content", "Content matches exactly");
    }
  } catch (e) {
    log("PM Delivery", `FAILED: ${e.message}`, false);
  }

  // ── Test 3: Bob replies to Alice ───────────────────────────────────────────
  console.log("\nTEST 3: Bob replies to Alice");
  const replyReceived = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Reply not received within 5s")), 5000);
    alice.on("private_message", (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });

  bob.emit("send_private_message", {
    recipientNickname: "Alice_Test",
    content: "Hi Alice! Got your message.",
    senderPublicKey: null,
  });

  try {
    const msg = await replyReceived;
    log("PM Reply", `Alice received reply from Bob: "${msg.content}"`);
  } catch (e) {
    log("PM Reply", `FAILED: ${e.message}`, false);
  }

  // ── Test 4: Cross-room PM ──────────────────────────────────────────────────
  console.log("\nTEST 4: Cross-room PM (Alice in room 1, Charlie in room 2)");
  let charlie;
  try {
    charlie = await connectUser("Charlie_Test", 2);
    log("Charlie", "Connected and joined room 2");
  } catch (e) {
    log("Charlie", `Failed to connect: ${e.message}`, false);
  }

  if (charlie) {
    await wait(300);
    const crossPmReceived = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Cross-room PM not received within 5s")), 5000);
      charlie.on("private_message", (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });

    alice.emit("send_private_message", {
      recipientNickname: "Charlie_Test",
      content: "Cross-room PM test!",
      senderPublicKey: null,
    });

    try {
      const msg = await crossPmReceived;
      log("Cross-room PM", `Charlie received PM from Alice: "${msg.content}"`);
    } catch (e) {
      log("Cross-room PM", `FAILED: ${e.message}`, false);
    }
    charlie.disconnect();
  }

  // ── Test 5: PM to non-existent user ───────────────────────────────────────
  console.log("\nTEST 5: PM to non-existent user (should get error event)");
  const errorReceived = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    alice.on("pm_error", (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  alice.emit("send_private_message", {
    recipientNickname: "NonExistentUser_XYZ",
    content: "This should fail",
    senderPublicKey: null,
  });

  const errorData = await errorReceived;
  if (errorData) {
    log("PM Error Event", `Got pm_error for non-existent user: "${errorData.message || JSON.stringify(errorData)}"`);
  } else {
    log("PM Error Event", "No pm_error event received for non-existent user (silent failure)", false);
  }

  // ── Test 6: Case-insensitive nickname matching ─────────────────────────────
  console.log("\nTEST 6: Case-insensitive PM (send to 'bob_test' lowercase)");
  const caseInsensitivePm = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Case-insensitive PM not received within 5s")), 5000);
    bob.once("private_message", (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });

  alice.emit("send_private_message", {
    recipientNickname: "bob_test", // lowercase — should still work
    content: "Case insensitive test",
    senderPublicKey: null,
  });

  try {
    const msg = await caseInsensitivePm;
    log("Case-insensitive PM", `Bob received lowercase-addressed PM: "${msg.content}"`);
  } catch (e) {
    log("Case-insensitive PM", `FAILED: ${e.message}`, false);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  alice.disconnect();
  bob.disconnect();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test runner error:", e);
  process.exit(1);
});
