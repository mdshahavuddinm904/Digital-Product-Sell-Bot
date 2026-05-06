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

/* ================= STATE ================= */
const depositState = {};
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

function joinMsg(ctx) {
  return ctx.reply(
    "❌ Join channel first!",
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ Joined", "check_join")]
    ])
  );
}

async function mustJoin(ctx, next) {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);
  return next();
}

/* ================= START ================= */
bot.start(async (ctx) => {
  if (!(await checkJoin(ctx))) return joinMsg(ctx);

  ctx.reply("👋 Welcome!\n\n💰 Use /deposit\n📊 Use /balance");
});

/* ================= BALANCE ================= */
bot.command("balance", mustJoin, (ctx) => {
  const db = loadDB();
  const user = db.users[ctx.from.id] || { balance: 0 };

  ctx.reply(`📊 Account Info\n\nID: ${ctx.from.id}\nBalance: $${user.balance}`);
});

/* ================= DEPOSIT ================= */
bot.command("deposit", mustJoin, (ctx) => {
  ctx.reply(
    "💰 Choose Method:",
    Markup.inlineKeyboard([
      [Markup.button.callback("BKash", "bkash")],
      [Markup.button.callback("Nagad", "nagad")],
      [Markup.button.callback("Binance", "binance")]
    ])
  );
});

/* ================= METHOD ================= */
bot.action(/(bkash|nagad|binance)/, mustJoin, (ctx) => {
  const method = ctx.match[1];

  let number = "";
  if (method === "bkash") number = "01890XXXXXX";
  if (method === "nagad") number = "01911XXXXXX";
  if (method === "binance") number = "985568941";

  depositState[ctx.from.id] = {
    step: "amount",
    method,
    number
  };

  ctx.reply("💰 Enter amount:");
});

/* ================= TEXT ================= */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  /* ===== DEPOSIT ===== */
  if (depositState[id]) {
    const s = depositState[id];

    if (s.step === "amount") {
      s.amount = Number(ctx.message.text);
      s.step = "proof";

      return ctx.reply(
`💳 Send money to:
${s.number}

Then send TXID / Screenshot`
      );
    }

    if (s.step === "proof") {
      const depId = Date.now();

      db.deposits[depId] = {
        userId: id,
        amount: s.amount,
        method: s.method,
        proof: ctx.message.text,
        status: "pending"
      };

      saveDB(db);
      delete depositState[id];

      await bot.telegram.sendMessage(
        config.ADMIN_ID,
`💰 Deposit Request

User: ${id}
Amount: $${s.amount}
Method: ${s.method}
Proof: ${ctx.message.text}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Approve", `ok_${depId}`),
            Markup.button.callback("❌ Reject", `no_${depId}`)
          ]
        ])
      );

      return ctx.reply(
        "⏳ Request sent to admin\n\nContact Support:",
        Markup.inlineKeyboard([
          [Markup.button.url("Support", "https://t.me/Smart_Method_Owner")]
        ])
      );
    }
  }

  /* ===== REJECT REASON ===== */
  if (rejectState[id]) {
    const userId = rejectState[id];

    await bot.telegram.sendMessage(
      userId,
`❌ Deposit Rejected

Reason: ${ctx.message.text}`
    );

    delete rejectState[id];
    return ctx.reply("Done");
  }
});

/* ================= APPROVE ================= */
bot.action(/ok_(.+)/, (ctx) => {
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
`✅ Deposit Approved

💰 $${dep.amount} added to your balance`
  );

  ctx.editMessageText("✅ Approved");
});

/* ================= REJECT ================= */
bot.action(/no_(.+)/, (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const dep = db.deposits[id];

  if (!dep) return;

  rejectState[ctx.from.id] = dep.userId;

  ctx.reply("❌ Write reject reason:");
});

/* ================= JOIN BUTTON ================= */
bot.action("check_join", async (ctx) => {
  if (!(await checkJoin(ctx))) return joinMsg(ctx);

  ctx.reply("✅ Welcome!");
});

bot.launch();
console.log("🚀 Running...");
