const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);
const DB_FILE = "./db.json";

/* ================= DB ================= */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: {},
      prices: {},
      vpndata: {},
      deposits: {},
      orders: {}
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ================= JOIN ================= */
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

📢 Bot use korte hole age channel join korte hobe`,
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ I Joined", "check_join")]
    ])
  );
}

/* ================= MIDDLEWARE ================= */
bot.use(async (ctx, next) => {
  if (ctx.updateType === "callback_query" && ctx.callbackQuery.data === "check_join") {
    return next();
  }

  const ok = await isJoined(ctx);
  if (!ok) return joinMsg(ctx);

  return next();
});

/* ================= STATES ================= */
const userState = {};
const depositState = {};
const setPriceState = {};
const vpnState = {};
const rejectState = {};

/* ================= START ================= */
bot.start((ctx) => {
  showMenu(ctx);
});

function showMenu(ctx) {
  ctx.reply(
`🌐 Welcome!

Please select VPN:`,
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
}

/* ================= BALANCE ================= */
bot.action("balance", (ctx) => {
  const db = loadDB();
  const u = db.users[ctx.from.id] || { balance: 0 };

  ctx.reply(
`📊 Account Information

👤 ID: ${ctx.from.id}
💰 Balance: ${u.balance}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("💳 Deposit", "deposit")]
    ])
  );
});

/* ================= VPN SELECT ================= */
bot.action(/vpn_(.+)/, (ctx) => {
  userState[ctx.from.id] = { vpn: ctx.match[1] };

  ctx.reply(
"📅 Select Duration:",
Markup.inlineKeyboard([
  [
    Markup.button.callback("7 Day", "day_7"),
    Markup.button.callback("30 Day", "day_30")
  ]
])
  );
});

/* ================= DAY SELECT ================= */
bot.action(/day_(.+)/, (ctx) => {
  const db = loadDB();
  const u = userState[ctx.from.id];
  if (!u) return;

  u.day = ctx.match[1];

  const price = db.prices?.[u.vpn]?.[u.day];

  if (!price) {
    return ctx.reply(
`⚠️ Price not set yet

Please wait for admin update`,
Markup.inlineKeyboard([
  [Markup.button.url("🟢 Support", "https://t.me/Smart_Method_Owner")]
])
    );
  }

  ctx.reply(
`💰 Price: ${price}

Choose Payment Method`,
Markup.inlineKeyboard([
  [
    Markup.button.callback("💰 Main Balance", "pay_balance"),
    Markup.button.callback("💳 Manual Pay", "pay_manual")
  ]
])
  );
});

/* ================= MAIN BALANCE BUY ================= */
bot.action("pay_balance", (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;
  const u = userState[id];
  if (!u) return;

  const price = db.prices?.[u.vpn]?.[u.day];

  if (!db.users[id]) db.users[id] = { balance: 0 };

  if (db.users[id].balance < price) {
    return ctx.reply("❌ Not enough balance");
  }

  db.users[id].balance -= price;
  saveDB(db);

  const data = db.vpndata?.[u.vpn]?.[u.day];

  if (data) {
    return ctx.reply(
`🎉 Order Delivered

VPN: ${u.vpn}
📧 Gmail: ${data.gmail}
🔑 Pass: ${data.pass}
🔐 Key: ${data.key}`
    );
  }

  const oid = Date.now();
  db.orders[oid] = { userId: id, vpn: u.vpn, day: u.day };
  saveDB(db);

  bot.telegram.sendMessage(
    config.ADMIN_ID,
`🛒 VPN Order

User: ${id}
VPN: ${u.vpn}
Day: ${u.day}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Approve", `appr_${oid}`)],
      [Markup.button.callback("❌ Reject", `rej_${oid}`)]
    ])
  );

  ctx.reply("⏳ Sent to admin");
});

/* ================= MANUAL DEPOSIT ================= */
bot.action("deposit", (ctx) => {
  ctx.reply(
`💳 Select Method

Min: 10
Max: 1000`,
Markup.inlineKeyboard([
  [
    Markup.button.callback("BKash", "dep_bkash"),
    Markup.button.callback("Nagad", "dep_nagad")
  ],
  [
    Markup.button.callback("Binance", "dep_binance")
  ]
])
  );
});

bot.action(/dep_(.+)/, (ctx) => {
  const method = ctx.match[1];

  depositState[ctx.from.id] = { method, step: "amount" };

  let num = "01890XXXXXX";
  if (method === "nagad") num = "01911XXXXXX";
  if (method === "binance") num = "BINANCE_ID_XXX";

  ctx.reply(
`💳 Send Money To:

${num}

💰 Send Amount (numbers only)`
  );
});

/* ================= TEXT HANDLER ================= */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;
  const text = ctx.message.text;

  /* ---------- DEPOSIT FLOW ---------- */
  if (depositState[id]) {
    const d = depositState[id];

    if (d.step === "amount") {
      if (!/^\d+$/.test(text)) {
        return ctx.reply("❌ Only numbers allowed");
      }

      d.amount = Number(text);
      d.step = "proof";

      return ctx.reply(
"✅ Payment done?",
Markup.inlineKeyboard([
  [Markup.button.callback("✔ Payment Success", "pay_done")]
])
      );
    }

    if (d.step === "proof_wait") {
      const did = Date.now();

      db.deposits[did] = {
        userId: id,
        method: d.method,
        amount: d.amount,
        proof: text,
        status: "pending"
      };

      saveDB(db);
      delete depositState[id];

      await bot.telegram.sendMessage(
        config.ADMIN_ID,
`💰 NEW DEPOSIT

User: ${id}
Method: ${d.method}
Amount: ${d.amount}
Proof: ${text}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Approve", `dep_appr_${did}`)],
          [Markup.button.callback("❌ Reject", `dep_rej_${did}`)]
        ])
      );

      return ctx.reply(
`📩 Request sent to admin

🟢 Support: @Smart_Method_Owner`
      );
    }
  }

  /* ---------- REJECT REASON ---------- */
  if (rejectState[id]) {
    const r = rejectState[id];

    await bot.telegram.sendMessage(
      r.userId,
`❌ Rejected

Reason: ${text}`
    );

    delete rejectState[id];
    return ctx.reply("Sent");
  }
});

/* ================= PAYMENT DONE BUTTON ================= */
bot.action("pay_done", (ctx) => {
  const id = ctx.from.id;
  if (!depositState[id]) return;

  depositState[id].step = "proof_wait";

  ctx.reply("📤 Send Transaction ID / Screenshot text");
});

/* ================= ADMIN APPROVE DEPOSIT ================= */
bot.action(/dep_appr_(.+)/, (ctx) => {
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

/* ================= REJECT DEPOSIT ================= */
bot.action(/dep_rej_(.+)/, (ctx) => {
  const db = loadDB();
  const dep = db.deposits[ctx.match[1]];
  if (!dep) return;

  rejectState[ctx.from.id] = {
    userId: dep.userId
  };

  ctx.reply("❌ Write reject reason:");
});

/* ================= CHECK JOIN ================= */
bot.action("check_join", async (ctx) => {
  if (!(await isJoined(ctx))) return joinMsg(ctx);
  showMenu(ctx);
});

bot.launch();
console.log("🚀 Bot Running");
