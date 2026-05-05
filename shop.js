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

/* PRODUCTS */
const products = {
  netflix: {
    name: "Netflix Premium",
    price: 5,
    delivery: "📧 Email: demo@gmail.com\n🔑 Pass: 123456"
  },
  canva: {
    name: "Canva Pro",
    price: 3,
    delivery: "🎁 Invite link: https://canva.com/xxxx"
  }
};

/* START */
bot.start((ctx) => {
  ctx.reply(
    "🛒 Welcome to Digital Shop",
    Markup.inlineKeyboard([
      [Markup.button.callback("🛍 View Products", "products")]
    ])
  );
});

/* SHOW PRODUCTS */
bot.action("products", (ctx) => {
  const buttons = Object.keys(products).map((key) => {
    return [Markup.button.callback(products[key].name, `buy_${key}`)];
  });

  ctx.editMessageText("🛍 Select Product:", Markup.inlineKeyboard(buttons));
});

/* BUY */
bot.action(/buy_(.+)/, (ctx) => {
  const key = ctx.match[1];
  const product = products[key];

  ctx.reply(
    `🛒 ${product.name}

💰 Price: $${product.price}

💳 Send Payment to:
${config.PAYMENT_NUMBER}

📩 After payment, send TXID / Screenshot`
  );

  const db = loadDB();
  db.users[ctx.from.id] = { buying: key };
  saveDB(db);
});

/* RECEIVE TXID */
bot.on("text", async (ctx) => {
  const db = loadDB();
  const user = db.users[ctx.from.id];

  if (user && user.buying) {
    const orderId = Date.now();

    db.orders[orderId] = {
      userId: ctx.from.id,
      product: user.buying,
      proof: ctx.message.text,
      status: "pending"
    };

    delete user.buying;
    saveDB(db);

    const product = products[db.orders[orderId].product];

    await bot.telegram.sendMessage(
      config.ADMIN_ID,
      `🛒 New Order

ID: ${orderId}
User: ${ctx.from.id}
Product: ${product.name}
Proof: ${ctx.message.text}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Approve", `ok_${orderId}`)]
      ])
    );

    ctx.reply("✅ Order submitted! Wait for approval.");
  }
});

/* APPROVE */
bot.action(/ok_(.+)/, async (ctx) => {
  if (ctx.from.id !== config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const order = db.orders[id];

  if (!order || order.status !== "pending") return;

  order.status = "done";
  saveDB(db);

  const product = products[order.product];

  await bot.telegram.sendMessage(
    order.userId,
    `✅ Payment Confirmed!

🎁 Your Product:
${product.delivery}`
  );

  ctx.editMessageText("✅ Delivered");
});

bot.launch();
console.log("🛒 Shop Bot Running...");
