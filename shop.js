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
const rejectReasonState = {};

/* ================= JOIN CHECK ================= */
async function checkJoin(ctx) {
  try {
    const res = await bot.telegram.getChatMember(
      "@Global_Method_Channel",
      ctx.from.id
    );
    return ["creator", "administrator", "member"].includes(res.status);
  } catch {
    return false;
  }
}

/* ================= JOIN MESSAGE ================= */
function joinMsg(ctx) {
  return ctx.reply(
    "❌ Join first to continue",
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ Joined", "check_join")]
    ])
  );
}

/* ================= START ================= */
bot.start(async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  ctx.reply(
`👋 Welcome to Bot

💰 Deposit System Active
📊 Use /balance`
  );
});

/* ================= DEPOSIT ================= */
bot.command("deposit", (ctx) => {
  ctx.reply(
    "💰 Select Payment Method:",
    Markup.inlineKeyboard([
      [Markup.button.callback("📱 BKash", "dep_bkash")],
      [Markup.button.callback("📱 Nagad", "dep_nagad")],
      [Markup.button.callback("💰 Binance", "dep_binance")]
    ])
  );
});

/* ================= METHOD CLICK ================= */
bot.action(/dep_(.+)/, (ctx) => {
  const method = ctx.match[1];

  let number = "";
  if (method === "bkash") number = "📱 BKash: 01890XXXXXX";
  if (method === "nagad") number = "📱 Nagad: 01911XXXXXX";
  if (method === "binance") number = "💰 Binance ID: 985568941";

  depositState[ctx.from.id] = {
    step: "amount",
    method
  };

  ctx.reply(
`💳 Method Selected: ${method.toUpperCase()}

${number}

💰 Now send amount:`
  );
});

/* ================= TEXT FLOW ================= */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  /* ================= DEPOSIT FLOW ================= */
  if (depositState[id]) {
    const state = depositState[id];

    /* AMOUNT */
    if (state.step === "amount") {
      state.amount = Number(ctx.message.text);
      state.step = "proof";

      return ctx.reply(
        "📤 Payment done?",
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Payment Success", "pay_success")]
        ])
      );
    }

    /* PROOF */
    if (state.step === "proof") {
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
Amount: ${state.amount}
Proof: ${ctx.message.text}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("🟢 Approve", `dep_appr_${depId}`),
            Markup.button.callback("🔴 Reject", `dep_rej_${depId}`)
          ]
        ])
      );

      return ctx.reply(
`⏳ Request sent to admin

🟢 Support: @Smart_Method_Owner`
      );
    }
  }

  /* ================= REJECT REASON ================= */
  if (rejectReasonState[id]) {
    const depId = rejectReasonState[id].depId;
    const userId = rejectReasonState[id].userId;

    await bot.telegram.sendMessage(
      userId,
`❌ Deposit Rejected

Reason: ${ctx.message.text}`
    );

    delete rejectReasonState[id];
    return ctx.reply("Sent reason to user");
  }
});

/* ================= PAYMENT SUCCESS ================= */
bot.action("pay_success", (ctx) => {
  depositState[ctx.from.id].step = "proof";

  ctx.reply("📤 Please send transaction ID / screenshot text:");
});

/* ================= APPROVE ================= */
bot.action(/dep_appr_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const dep = db.deposits[id];

  if (!dep) return;

  dep.status = "approved";

  if (!db.users[dep.userId]) db.users[dep.userId] = { balance: 0 };
  db.users[dep.userId].balance += dep.amount;

  saveDB(db);

  await bot.telegram.sendMessage(
    dep.userId,
`✅ Deposit Approved

💰 $${dep.amount} added to your balance`
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

  rejectReasonState[ctx.from.id] = {
    depId: id,
    userId: dep.userId
  };

  ctx.reply("❌ লিখুন কেন reject করবেন:");
});

/* ================= JOIN BUTTON ================= */
bot.action("check_join", async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  ctx.reply(
`✅ Welcome Back!

💰 Deposit Ready
📊 /balance`
  );
});

bot.launch();
console.log("🚀 Bot Running");
