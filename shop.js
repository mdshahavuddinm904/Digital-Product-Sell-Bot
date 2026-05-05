const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);
const DB_FILE = "./db.json";

/* ================= DB ================= */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, deposits: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* ================= STATES ================= */
const depositState = {};

/* ================= START ================= */
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome!\n\nUse commands:\n/balance\n/deposit"
  );
});

/* ================= BALANCE COMMAND ================= */
bot.command("balance", (ctx) => {
  const db = loadDB();
  const user = db.users[ctx.from.id] || { balance: 0 };

  ctx.reply(`📊 Account Info

🆔 ID: ${ctx.from.id}
💰 Balance: $${user.balance}`);
});

/* ================= DEPOSIT COMMAND ================= */
bot.command("deposit", (ctx) => {
  ctx.reply(
    "💰 Select Method:",
    Markup.inlineKeyboard([
      [Markup.button.callback("📱 BKash", "dep_bkash")],
      [Markup.button.callback("📱 Nagad", "dep_nagad")],
      [Markup.button.callback("💰 Binance", "dep_binance")]
    ])
  );
});

/* ================= METHOD SELECT ================= */
bot.action(/dep_(.+)/, (ctx) => {
  const method = ctx.match[1];

  depositState[ctx.from.id] = {
    step: "amount",
    method
  };

  let number = "";
  if (method === "bkash") number = config.BKASH;
  if (method === "nagad") number = config.NAGAD;
  if (method === "binance") number = config.BINANCE_ID;

  ctx.reply(
    `💳 Send Money to:\n${number}\n\n💰 Now send amount:`
  );
});

/* ================= TEXT FLOW ================= */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  if (!depositState[id]) return;

  const state = depositState[id];

  /* STEP 1: AMOUNT */
  if (state.step === "amount") {
    state.amount = Number(ctx.message.text);
    state.step = "proof";

    return ctx.reply(
      "📤 After payment click button below:",
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Payment Success", "pay_done")]
      ])
    );
  }

  /* STEP 2: PROOF */
  if (state.step === "proof_wait") {
    const depId = Date.now();

    db.deposits[depId] = {
      userId: id,
      method: state.method,
      amount: state.amount,
      proof: ctx.message.text,
      status: "pending"
    };

    saveDB(db);
    delete depositState[id];

    await bot.telegram.sendMessage(
      config.ADMIN_ID,
      `💰 NEW DEPOSIT

User: ${id}
Method: ${state.method}
Amount: $${state.amount}
Proof: ${ctx.message.text}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Approve", `dep_appr_${depId}`),
          Markup.button.callback("❌ Reject", `dep_rej_${depId}`)
        ]
      ])
    );

    return ctx.reply("⏳ Deposit request sent, wait for approval.");
  }
});

/* ================= PAYMENT BUTTON ================= */
bot.action("pay_done", (ctx) => {
  const id = ctx.from.id;

  if (!depositState[id]) return;

  depositState[id].step = "proof_wait";

  ctx.reply("📤 Please send transaction ID or screenshot text:");
});

/* ================= APPROVE ================= */
bot.action(/dep_appr_(.+)/, (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const dep = db.deposits[id];

  if (!dep) return;

  dep.status = "approved";

  if (!db.users[dep.userId]) db.users[dep.userId] = { balance: 0 };
  db.users[dep.userId].balance += dep.amount;

  saveDB(db);

  bot.telegram.sendMessage(
    dep.userId,
    `✅ Deposit Approved!\n💰 $${dep.amount} added to your balance`
  );

  ctx.reply("Approved");
});

/* ================= REJECT ================= */
bot.action(/dep_rej_(.+)/, (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const dep = db.deposits[id];

  if (!dep) return;

  dep.status = "rejected";
  saveDB(db);

  bot.telegram.sendMessage(
    dep.userId,
    "❌ Deposit rejected"
  );

  ctx.reply("Rejected");
});

bot.launch();
console.log("🚀 Bot Running");
