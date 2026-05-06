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
const adminFlow = {};
const rejectState = {};

/* ================= JOIN CHECK ================= */
async function checkJoin(ctx) {
  try {
    const res = await bot.telegram.getChatMember("@Global_Method_Channel", ctx.from.id);
    return ["creator", "administrator", "member"].includes(res.status);
  } catch {
    return false;
  }
}

/* ================= JOIN MSG ================= */
function joinMsg(ctx) {
  return ctx.reply(
    "❌ Please join channel first",
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ Joined", "check_join")]
    ])
  );
}

/* ================= MIDDLEWARE ================= */
async function mustJoin(ctx, next) {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);
  return next();
}

/* ================= START ================= */
bot.start(async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  ctx.reply(`👋 Welcome!

💰 Deposit System Active
📊 Use /balance`);
});

/* ================= BALANCE ================= */
bot.command("balance", mustJoin, (ctx) => {
  const db = loadDB();
  const user = db.users[ctx.from.id] || { balance: 0 };

  ctx.reply(`📊 Account Info

🆔 ID: ${ctx.from.id}
💰 Balance: $${user.balance}`);
});

/* ================= DEPOSIT ================= */
bot.command("deposit", mustJoin, (ctx) => {
  ctx.reply(
    "💰 Select Payment Method:",
    Markup.inlineKeyboard([
      [Markup.button.callback("📱 BKash", "dep_bkash")],
      [Markup.button.callback("📱 Nagad", "dep_nagad")],
      [Markup.button.callback("💰 Binance", "dep_binance")]
    ])
  );
});

/* ================= METHOD ================= */
bot.action(/dep_(.+)/, mustJoin, (ctx) => {
  const method = ctx.match[1];

  let number = "";
  if (method === "bkash") number = "📱 BKash: 01890XXXXXX";
  if (method === "nagad") number = "📱 Nagad: 01911XXXXXX";
  if (method === "binance") number = "💰 Binance ID: 985568941";

  depositState[ctx.from.id] = {
    step: "amount",
    method,
    number
  };

  ctx.reply(`💰 Enter amount:`);
});

/* ================= TEXT FLOW ================= */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  /* ================= DEPOSIT ================= */
  if (depositState[id]) {
    const state = depositState[id];

    if (state.step === "amount") {
      state.amount = Number(ctx.message.text);
      state.step = "wait_click";

      return ctx.reply(
`${state.number}

💰 After payment click button below`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Payment Success", "pay_success")]
        ])
      );
    }

    if (state.step === "proof") {
      const depId = Date.now();

      db.deposits[depId] = {
        userId: id,
        amount: state.amount,
        method: state.method,
        proof: ctx.message.text,
        status: "pending"
      };

      saveDB(db);
      delete depositState[id];

      await bot.telegram.sendMessage(
        config.ADMIN_ID,
`💰 Deposit Request

User: ${id}
Amount: $${state.amount}
Method: ${state.method}
Proof: ${ctx.message.text}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Approve", `ap_${depId}`),
            Markup.button.callback("❌ Reject", `rej_${depId}`)
          ]
        ])
      );

      return ctx.reply(
`⏳ Your request sent to admin

🟢 Support`,
        Markup.inlineKeyboard([
          [Markup.button.url("🟢 Support ID", "https://t.me/Smart_Method_Owner")]
        ])
      );
    }
  }

  /* ================= ADMIN APPROVE FLOW ================= */
  if (adminFlow[id]) {
    const f = adminFlow[id];

    if (f.step === "gmail") {
      f.gmail = ctx.message.text;
      f.step = "pass";
      return ctx.reply("🔑 Send Password:");
    }

    if (f.step === "pass") {
      f.pass = ctx.message.text;
      f.step = "login";
      return ctx.reply("🔐 Send Login Key:");
    }

    if (f.step === "login") {
      f.login = ctx.message.text;

      await bot.telegram.sendMessage(
        f.userId,
`🎉 Product Delivered

📧 Gmail: ${f.gmail}
🔑 Password: ${f.pass}
🔐 Login: ${f.login}`
      );

      delete adminFlow[id];
      return ctx.reply("✅ Delivered");
    }
  }

  /* ================= REJECT REASON ================= */
  if (rejectState[id]) {
    const userId = rejectState[id];

    await bot.telegram.sendMessage(
      userId,
`❌ Deposit Rejected

Reason: ${ctx.message.text}`
    );

    delete rejectState[id];
    return ctx.reply("Rejected with reason");
  }
});

/* ================= PAYMENT SUCCESS ================= */
bot.action("pay_success", (ctx) => {
  depositState[ctx.from.id].step = "proof";

  ctx.reply("📤 Send transaction ID / proof:");
});

/* ================= APPROVE ================= */
bot.action(/ap_(.+)/, (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const dep = db.deposits[id];

  if (!dep) return;

  dep.status = "approved";

  if (!db.users[dep.userId]) db.users[dep.userId] = { balance: 0 };
  db.users[dep.userId].balance += dep.amount;

  saveDB(db);

  adminFlow[ctx.from.id] = {
    step: "gmail",
    userId: dep.userId
  };

  ctx.reply("📧 Send Gmail:");
});

/* ================= REJECT ================= */
bot.action(/rej_(.+)/, (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const dep = db.deposits[id];

  if (!dep) return;

  rejectState[ctx.from.id] = dep.userId;

  ctx.reply("❌ Write reason:");
});

/* ================= JOIN BUTTON ================= */
bot.action("check_join", async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  ctx.reply("✅ Welcome!");
});

bot.launch();
console.log("🚀 Bot Running");
