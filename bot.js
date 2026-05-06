const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);

/* ================= ADMIN ================= */
const ADMIN_ID = 8136997138;

/* ================= DB ================= */
const DB_FILE = "./db.json";

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: {},
      prices: {},
      vpndata: {},
      deposits: {}
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ================= JOIN CHECK ================= */
async function isJoined(ctx) {
  try {
    const res = await bot.telegram.getChatMember(
      "@Global_Method_Channel",
      ctx.from.id
    );
    return ["member", "administrator", "creator"].includes(res.status);
  } catch {
    return false;
  }
}

function joinMsg(ctx) {
  return ctx.reply(
`🚫 Access Denied!

📢 আগে আমাদের চ্যানেলে join করুন`,
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ Joined", "check_join")]
    ])
  );
}

/* ================= FORCE JOIN ================= */
bot.use(async (ctx, next) => {
  if (!ctx.from) return;

  const ok = await isJoined(ctx);
  if (!ok) return joinMsg(ctx);

  return next();
});

/* ================= STATES ================= */
const setPriceState = {};
const vpnState = {};
const depositState = {};
const userState = {};

/* ================= START ================= */
bot.start((ctx) => {
  return ctx.reply(
`🌐 Welcome

Please select VPN`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Nord VPN", "vpn_nord"),
        Markup.button.callback("Express VPN", "vpn_express")
      ],
      [
        Markup.button.callback("HMA VPN", "vpn_hma"),
        Markup.button.callback("Sharf VPN", "vpn_sharf")
      ],
      [
        Markup.button.callback("💰 Balance", "balance"),
        Markup.button.callback("💳 Deposit", "deposit")
      ]
    ])
  );
});

/* ================= BALANCE ================= */
bot.command("balance", (ctx) => {
  const db = loadDB();
  const u = db.users[ctx.from.id] || { balance: 0 };

  return ctx.reply(
`📊 Account Info

👤 ID: ${ctx.from.id}
💰 Balance: ${u.balance}`
  );
});

/* ================= DEPOSIT COMMAND ================= */
bot.command("deposit", (ctx) => {
  return ctx.reply(
`💳 Deposit Method

Min: 10 | Max: 1000`,
Markup.inlineKeyboard([
  [
    Markup.button.callback("BKash", "dep_bkash"),
    Markup.button.callback("Nagad", "dep_nagad")
  ],
  [Markup.button.callback("Binance", "dep_binance")]
])
  );
});

/* ================= VPN SELECT ================= */
bot.action(/vpn_(.+)/, (ctx) => {
  userState[ctx.from.id] = { vpn: ctx.match[1] };

  ctx.reply(
"📅 Select Duration",
Markup.inlineKeyboard([
  [
    Markup.button.callback("7 Day", "day_7"),
    Markup.button.callback("30 Day", "day_30")
  ]
])
  );
});

/* ================= SET PRICE ================= */
bot.command("setprice", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Admin only");

  ctx.reply(
"📌 Select VPN",
Markup.inlineKeyboard([
  [
    Markup.button.callback("Nord", "sp_nord"),
    Markup.button.callback("Express", "sp_express")
  ],
  [
    Markup.button.callback("HMA", "sp_hma"),
    Markup.button.callback("Sharf", "sp_sharf")
  ]
])
  );
});

bot.action(/sp_(.+)/, (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  setPriceState[ctx.from.id] = { vpn: ctx.match[1] };

  ctx.reply(
"📅 Select Day",
Markup.inlineKeyboard([
  [
    Markup.button.callback("7", "spd_7"),
    Markup.button.callback("30", "spd_30")
  ]
])
  );
});

bot.action(/spd_(.+)/, (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  setPriceState[ctx.from.id].day = ctx.match[1];

  ctx.reply("💰 Send Price (numbers only)");
});

/* ================= SET PRICE TEXT ================= */
bot.on("text", (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  /* PRICE SET */
  if (setPriceState[id]) {
    const s = setPriceState[id];

    if (!/^\d+$/.test(ctx.message.text)) {
      return ctx.reply("❌ Only numbers allowed");
    }

    if (!db.prices[s.vpn]) db.prices[s.vpn] = {};
    db.prices[s.vpn][s.day] = Number(ctx.message.text);

    saveDB(db);
    delete setPriceState[id];

    return ctx.reply("✅ Price Set Done");
  }

  /* DEPOSIT FLOW */
  if (depositState[id]) {
    const d = depositState[id];

    if (d.step === "amount") {
      if (!/^\d+$/.test(ctx.message.text)) {
        return ctx.reply("❌ Only numbers allowed");
      }

      d.amount = Number(ctx.message.text);
      d.step = "proof";

      return ctx.reply(
"✔ Payment done?",
Markup.inlineKeyboard([
  [Markup.button.callback("✅ Payment Success", "pay_success")]
])
      );
    }

    if (d.step === "proof") {
      const did = Date.now();

      db.deposits[did] = {
        userId: id,
        method: d.method,
        amount: d.amount,
        proof: ctx.message.text,
        status: "pending"
      };

      saveDB(db);
      delete depositState[id];

      bot.telegram.sendMessage(
        ADMIN_ID,
`💰 NEW DEPOSIT

User: ${id}
Method: ${d.method}
Amount: ${d.amount}
Proof: ${ctx.message.text}`,
Markup.inlineKeyboard([
  [
    Markup.button.callback("✅ Approve", `dep_appr_${did}`),
    Markup.button.callback("❌ Reject", `dep_rej_${did}`)
  ]
])
      );

      return ctx.reply("📩 Deposit sent to admin");
    }
  }
});

/* ================= PAYMENT SUCCESS ================= */
bot.action("pay_success", (ctx) => {
  depositState[ctx.from.id].step = "proof";

  ctx.reply("📤 Send Transaction ID / Screenshot text");
});

/* ================= DEPOSIT SELECT ================= */
bot.action(/dep_(.+)/, (ctx) => {
  const method = ctx.match[1];

  let number = "01890XXXXXX";
  if (method === "nagad") number = "01911XXXXXX";
  if (method === "binance") number = "BINANCE_ID";

  depositState[ctx.from.id] = {
    method,
    step: "amount"
  };

  ctx.reply(
`💳 Send Money To:

${number}

💰 Enter Amount`
  );
});

/* ================= APPROVE ================= */
bot.action(/dep_appr_(.+)/, (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const db = loadDB();
  const dep = db.deposits[ctx.match[1]];

  if (!dep) return;

  if (!db.users[dep.userId]) db.users[dep.userId] = { balance: 0 };

  db.users[dep.userId].balance += dep.amount;
  dep.status = "approved";

  saveDB(db);

  bot.telegram.sendMessage(dep.userId,
`✅ Deposit Approved
💰 Balance Added: ${dep.amount}`
  );

  ctx.reply("Approved");
});

/* ================= REJECT ================= */
bot.action(/dep_rej_(.+)/, (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const db = loadDB();
  const dep = db.deposits[ctx.match[1]];

  if (!dep) return;

  bot.telegram.sendMessage(
    dep.userId,
"❌ Deposit Rejected"
  );

  ctx.reply("Rejected");
});

/* ================= JOIN CHECK ================= */
bot.action("check_join", async (ctx) => {
  if (!(await isJoined(ctx))) return joinMsg(ctx);

  ctx.reply("✅ Welcome back!");
});

/* ================= START BOT ================= */
bot.launch();
console.log("🚀 Bot Running with Admin:", ADMIN_ID);
