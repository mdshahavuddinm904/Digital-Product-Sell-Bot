const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);
const DB_FILE = "./db.json";

/* DB */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, orders: {} }, null, 2));
  }
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

/* FORCE JOIN */
function joinMsg(ctx) {
  return ctx.reply(
    "❌ Please join first to continue",
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

/* START */
bot.start(async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  if (!db.users[id]) db.users[id] = { joined: false };

  const joined = await checkJoin(ctx);

  if (!joined) {
    saveDB(db);
    return joinMsg(ctx);
  }

  db.users[id].joined = true;
  saveDB(db);

  return showProducts(ctx);
});

/* PRODUCT UI (2 per row) */
function showProducts(ctx) {
  const keys = Object.keys(products);
  const buttons = [];

  for (let i = 0; i < keys.length; i += 2) {
    buttons.push([
      Markup.button.callback(products[keys[i]], `buy_${keys[i]}`),
      keys[i + 1]
        ? Markup.button.callback(products[keys[i + 1]], `buy_${keys[i + 1]}`)
        : Markup.button.callback(" ", "noop")
    ]);
  }

  ctx.reply("🛒 Select Product:", Markup.inlineKeyboard(buttons));
}

/* ORDER TEMP */
const orderState = {};

/* BUY */
bot.action(/buy_(.+)/, (ctx) => {
  const key = ctx.match[1];
  orderState[ctx.from.id] = key;

  ctx.reply(`💳 Send payment proof for:
👉 ${products[key]}`);
});

/* RECEIVE ORDER */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const id = ctx.from.id;

  if (!orderState[id]) return;

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

  await bot.telegram.sendMessage(
    config.ADMIN_ID,
    `🛒 New Order

ID: ${orderId}
User: ${id}
Product: ${products[key]}
Proof: ${ctx.message.text}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Approve", `approve_${orderId}`),
        Markup.button.callback("❌ Reject", `reject_${orderId}`)
      ]
    ])
  );

  ctx.reply("✅ Order sent to admin");
});

/* APPROVE */
bot.action(/approve_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const orderId = ctx.match[1];
  const db = loadDB();
  const order = db.orders[orderId];

  if (!order) return;

  order.status = "approved";
  saveDB(db);

  ctx.editMessageText("✅ Approved - send delivery message now");

  bot.once("text", async (msgCtx) => {
    await bot.telegram.sendMessage(
      order.userId,
      `🎉 Your Product Delivered:

${msgCtx.message.text}`
    );
  });
});

/* REJECT */
bot.action(/reject_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const orderId = ctx.match[1];
  const db = loadDB();
  const order = db.orders[orderId];

  if (!order) return;

  order.status = "rejected";
  saveDB(db);

  await bot.telegram.sendMessage(
    order.userId,
    "❌ Your order was rejected"
  );

  ctx.editMessageText("❌ Rejected");
});

/* JOIN BUTTON */
bot.action("check_join", async (ctx) => {
  const ok = await checkJoin(ctx);
  if (!ok) return joinMsg(ctx);

  showProducts(ctx);
});

bot.launch();
console.log("🚀 Bot Running");
