const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);
const DB_FILE = "./db.json";

/* ================= DB ================= */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, orders: {}, deposit: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

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
    "❌ Join first to use bot",
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ I Joined", "check_join")]
    ])
  );
}

/* ================= PRODUCTS ================= */
const products = {
  nord: { name: "Nord VPN", price: 5 },
  express: { name: "Express VPN", price: 6 },
  hma: { name: "HMA VPN", price: 4 },
  abc: { name: "ABC IP", price: 3 }
};

/* ================= STATE ================= */
const orderState = {};
const depositState = {};
const adminFlow = {};

/* ================= START ================= */
bot.start(async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  if (!db.users[id]) {
    db.users[id] = { balance: 0 };
  }

  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  saveDB(db);
  return showProducts(ctx);
});

/* ================= PRODUCTS UI ================= */
function showProducts(ctx) {
  const buttons = Object.keys(products).map((k) => [
    Markup.button.callback(`${products[k].name} - $${products[k].price}`, `buy_${k}`)
  ]);

  buttons.push([Markup.button.callback("💰 Deposit", "deposit")]);
  buttons.push([Markup.button.callback("📊 Balance", "balance")]);

  ctx.reply("🛒 Products:", Markup.inlineKeyboard(buttons));
}

/* ================= BUY ================= */
bot.action(/buy_(.+)/, (ctx) => {
  const key = ctx.match[1];
  orderState[ctx.from.id] = key;

  ctx.reply(
    `💳 Choose payment method:
1️⃣ Main Balance
2️⃣ Manual Payment`
  );
});

/* ================= DEPOSIT ================= */
bot.action("deposit", (ctx) => {
  ctx.reply(
    "💰 Select Method:",
    Markup.inlineKeyboard([
      [Markup.button.callback("BKash", "d_bkash")],
      [Markup.button.callback("Nagad", "d_nagad")],
      [Markup.button.callback("Binance", "d_binance")]
    ])
  );
});

/* ================= DEPOSIT FLOW ================= */
bot.action(/d_(.+)/, (ctx) => {
  const method = ctx.match[1];

  depositState[ctx.from.id] = { method, step: "amount" };

  let id = "";
  if (method === "binance") id = config.BINANCE_ID;
  if (method === "bkash") id = config.BKASH;
  if (method === "nagad") id = config.NAGAD;

  ctx.reply(`Send money to: ${id}\nNow enter amount:`);
});

/* ================= TEXT HANDLER ================= */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  /* DEPOSIT */
  if (depositState[id]) {
    const d = depositState[id];

    if (d.step === "amount") {
      d.amount = Number(ctx.message.text);
      d.step = "trx";
      return ctx.reply("Send Transaction ID:");
    }

    if (d.step === "trx") {
      const orderId = Date.now();

      db.deposit[orderId] = {
        userId: id,
        method: d.method,
        amount: d.amount,
        trx: ctx.message.text,
        status: "pending"
      };

      saveDB(db);
      delete depositState[id];

      return bot.telegram.sendMessage(
        config.ADMIN_ID,
        `💰 Deposit Request

User: ${id}
Amount: ${d.amount}
Method: ${d.method}
TRX: ${ctx.message.text}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Approve", `dap_${orderId}`),
            Markup.button.callback("❌ Reject", `drej_${orderId}`)
          ]
        ])
      );
    }
  }

  /* ORDER FLOW */
  if (orderState[id]) {
    const key = orderState[id];
    const orderId = Date.now();

    db.orders[orderId] = {
      userId: id,
      product: key,
      proof: ctx.message.text,
      status: "pending"
    };

    saveDB(db);
    delete orderState[id];

    return bot.telegram.sendMessage(
      config.ADMIN_ID,
      `🛒 New Order

Product: ${products[key].name}
User: ${id}
Proof: ${ctx.message.text}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Approve", `appr_${orderId}`),
          Markup.button.callback("❌ Reject", `rej_${orderId}`)
        ]
      ])
    );
  }

  /* ADMIN DELIVERY */
  if (adminFlow[id]) {
    const f = adminFlow[id];

    await bot.telegram.sendMessage(
      f.userId,
      `🎉 Order Delivered

Product: ${f.product}
Details:
${ctx.message.text}`
    );

    delete adminFlow[id];
    return ctx.reply("✅ Delivered");
  }
});

/* ================= APPROVE ORDER ================= */
bot.action(/appr_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const order = db.orders[id];

  if (!order) return;

  order.status = "approved";
  saveDB(db);

  adminFlow[ctx.from.id] = {
    userId: order.userId,
    product: products[order.product].name
  };

  ctx.reply("✍ Send delivery message");
});

/* ================= REJECT ORDER ================= */
bot.action(/rej_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();

  db.orders[id].status = "rejected";
  saveDB(db);

  bot.telegram.sendMessage(db.orders[id].userId, "❌ Order rejected");
  ctx.reply("Rejected");
});

/* ================= BALANCE ================= */
bot.action("balance", (ctx) => {
  const db = loadDB();
  const u = db.users[ctx.from.id];

  ctx.reply(`📊 Account Info

User ID: ${ctx.from.id}
Balance: $${u?.balance || 0}`);
});

/* ================= JOIN CHECK ================= */
bot.action("check_join", async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);
  showProducts(ctx);
});

bot.launch();
console.log("🚀 Bot Running");
