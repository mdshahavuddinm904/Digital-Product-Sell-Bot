const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);
const DB_FILE = "./db.json";

/* DB */
function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* JOIN CHECK */
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

/* FORCE JOIN MSG */
function joinMsg(ctx) {
  return ctx.reply(
    "❌ Join required first!",
    Markup.inlineKeyboard([
      [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
      [Markup.button.callback("✅ I Joined", "check_join")]
    ])
  );
}

/* PRODUCTS */
const products = {
  nord: "Nord VPN",
  express: "Express VPN",
  hma: "HMA VPN",
  abc: "ABC IP",
  sharf: "Sharfshak VPN"
};

/* STATES */
const orderState = {};
const adminState = {};

/* START */
bot.start(async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  if (!db.users[id]) {
    db.users[id] = { joined: false };
  }

  const joined = await checkJoin(ctx);
  if (!joined) {
    saveDB(db);
    return joinMsg(ctx);
  }

  db.users[id].joined = true;
  saveDB(db);

  showProducts(ctx);
});

/* SHOW PRODUCTS */
function showProducts(ctx) {
  const buttons = Object.keys(products).map((k) => [
    Markup.button.callback(products[k], `buy_${k}`)
  ]);

  ctx.reply(
    "🛒 Select Product:",
    Markup.inlineKeyboard(buttons)
  );
}

/* BUY */
bot.action(/buy_(.+)/, async (ctx) => {
  const key = ctx.match[1];

  orderState[ctx.from.id] = key;

  ctx.reply(
    `💳 Send Payment Screenshot / TXID for:
👉 ${products[key]}`
  );
});

/* RECEIVE PAYMENT PROOF */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  if (!orderState[id]) return;

  const productKey = orderState[id];
  const orderId = Date.now();

  db.orders[orderId] = {
    userId: id,
    product: productKey,
    proof: ctx.message.text,
    status: "pending"
  };

  saveDB(db);
  delete orderState[id];

  await bot.telegram.sendMessage(
    config.ADMIN_ID,
    `🛒 New Order

User: ${id}
Product: ${products[productKey]}
Proof: ${ctx.message.text}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Approve", `appr_${orderId}`),
        Markup.button.callback("❌ Reject", `rej_${orderId}`)
      ]
    ])
  );

  ctx.reply("✅ Payment sent to admin, wait for approval!");
});

/* APPROVE */
bot.action(/appr_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const order = db.orders[id];

  if (!order) return;

  order.status = "approved";
  saveDB(db);

  adminState[id] = order.userId;

  await ctx.reply("✍️ Now send delivery message (email/password/key)");

  ctx.editMessageText("✅ Approved - waiting delivery input");
});

/* ADMIN DELIVERY MESSAGE */
bot.on("text", async (ctx) => {
  const orderId = Object.keys(adminState)[0];
  if (!orderId) return;

  const userId = adminState[orderId];

  await bot.telegram.sendMessage(
    userId,
    `🎉 Your Product Delivered:

${ctx.message.text}`
  );

  delete adminState[orderId];
});

/* REJECT */
bot.action(/rej_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const order = db.orders[id];

  if (!order) return;

  order.status = "rejected";
  saveDB(db);

  await bot.telegram.sendMessage(
    order.userId,
    "❌ Your order was rejected!"
  );

  ctx.editMessageText("❌ Rejected");
});

/* JOIN CHECK BUTTON */
bot.action("check_join", async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  showProducts(ctx);
});

bot.launch();
console.log("🚀 Bot Running");
