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
      vpndata: {}
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* ================= JOIN CHECK ================= */
async function isJoined(ctx) {
  try {
    const res = await bot.telegram.getChatMember("@Global_Method_Channel", ctx.from.id);
    return ["member", "administrator", "creator"].includes(res.status);
  } catch {
    return false;
  }
}

/* ================= FORCE JOIN ================= */
async function forceJoin(ctx) {
  const ok = await isJoined(ctx);
  if (!ok) {
    return ctx.reply(
`🚫 Access Denied!

📢 Bot ব্যবহার করতে হলে আগে আমাদের চ্যানেলে জয়েন করতে হবে।

👉 Join করে আবার "✅ Joined" বাটনে ক্লিক করুন।`,
      Markup.inlineKeyboard([
        [Markup.button.url("📢 Join Channel", "https://t.me/Global_Method_Channel")],
        [Markup.button.callback("✅ Joined", "check_join")]
      ])
    );
  }
  return true;
}

/* ================= VPN LIST ================= */
const vpns = ["nord","express","hma","sharf"];

/* ================= START ================= */
bot.start(async (ctx) => {
  if (!(await forceJoin(ctx))) return;
  showVPN(ctx);
});

/* ================= SHOW VPN ================= */
function showVPN(ctx){
  ctx.reply(
"🌐 Please Select Your VPN:",
Markup.inlineKeyboard([
[
Markup.button.callback("Nord VPN","vpn_nord"),
Markup.button.callback("Express VPN","vpn_express")
],
[
Markup.button.callback("HMA VPN","vpn_hma"),
Markup.button.callback("Sharfshak VPN","vpn_sharf")
]
])
);
}

/* ================= SELECT VPN ================= */
const userSelect = {};

bot.action(/vpn_(.+)/, async (ctx)=>{
  if (!(await forceJoin(ctx))) return;

  const vpn = ctx.match[1];
  userSelect[ctx.from.id] = { vpn };

  ctx.reply(
"📅 Select Duration:",
Markup.inlineKeyboard([
[
Markup.button.callback("7 Day","day_7"),
Markup.button.callback("30 Day","day_30")
]
])
);
});

/* ================= SELECT DAY ================= */
bot.action(/day_(.+)/, async (ctx)=>{
  const db = loadDB();
  const day = ctx.match[1];
  const user = userSelect[ctx.from.id];

  if (!user) return;

  user.day = day;

  const price = db.prices[user.vpn]?.[day] || "Not Set";

  ctx.reply(
`💰 Price: ${price}

💳 Choose Payment:
`,
Markup.inlineKeyboard([
[
Markup.button.callback("💰 Main Balance","pay_balance"),
Markup.button.callback("💳 Manual","pay_manual")
]
])
);
});

/* ================= BALANCE ================= */
bot.command("balance", async (ctx)=>{
  if (!(await forceJoin(ctx))) return;

  const db = loadDB();
  const user = db.users[ctx.from.id] || { balance: 0 };

  ctx.reply(
`📊 Account Info

🆔 ID: ${ctx.from.id}
💰 Balance: ${user.balance}`
  );
});

/* ================= MAIN BALANCE BUY ================= */
bot.action("pay_balance", async (ctx)=>{
  const db = loadDB();
  const id = ctx.from.id;
  const user = userSelect[id];

  if (!user) return;

  const price = db.prices[user.vpn]?.[user.day];
  if (!price) return ctx.reply("❌ Price not set");

  if (!db.users[id]) db.users[id] = { balance: 0 };

  if (db.users[id].balance < price){
    return ctx.reply("❌ Not enough balance");
  }

  db.users[id].balance -= price;
  saveDB(db);

  const data = db.vpndata[user.vpn]?.[user.day];

  if (data){
    return ctx.reply(
`🎉 Order Delivered

VPN: ${user.vpn}
📧 Gmail: ${data.gmail}
🔑 Pass: ${data.pass}
🔐 Key: ${data.key}`
    );
  }

  /* send admin */
  bot.telegram.sendMessage(
    config.ADMIN_ID,
`🛒 Order

User: ${id}
VPN: ${user.vpn}
Day: ${user.day}`,
Markup.inlineKeyboard([
[Markup.button.callback("✅ Approve",`appr_${id}`)]
])
  );

  ctx.reply("⏳ Sent to admin");
});

/* ================= MANUAL ================= */
bot.action("pay_manual", (ctx)=>{
  ctx.reply(
"💳 Select Method:",
Markup.inlineKeyboard([
[
Markup.button.callback("BKash","m_bkash"),
Markup.button.callback("Nagad","m_nagad")
],
[
Markup.button.callback("Binance","m_binance")
]
])
);
});

/* ================= ADMIN SET PRICE ================= */
bot.command("setprice", (ctx)=>{
  if (ctx.from.id !== config.ADMIN_ID) return;

  ctx.reply("Select VPN",
Markup.inlineKeyboard([
[Markup.button.callback("Nord","sp_nord"),
Markup.button.callback("Express","sp_express")],
[Markup.button.callback("HMA","sp_hma"),
Markup.button.callback("Sharf","sp_sharf")]
])
);
});

const setPriceState = {};

bot.action(/sp_(.+)/,(ctx)=>{
  setPriceState[ctx.from.id]={vpn:ctx.match[1]};
  ctx.reply("Select Day",
Markup.inlineKeyboard([
[Markup.button.callback("7 Day","spd_7"),
Markup.button.callback("30 Day","spd_30")]
])
);
});

bot.action(/spd_(.+)/,(ctx)=>{
  setPriceState[ctx.from.id].day=ctx.match[1];
  ctx.reply("Enter Price:");
});

bot.on("text",(ctx)=>{
  const db = loadDB();
  const sp = setPriceState[ctx.from.id];

  if (sp){
    if (!db.prices[sp.vpn]) db.prices[sp.vpn]={};
    db.prices[sp.vpn][sp.day]=Number(ctx.message.text);
    saveDB(db);

    delete setPriceState[ctx.from.id];
    return ctx.reply("✅ Price Set");
  }
});

/* ================= ADMIN SET VPN ================= */
bot.command("setvpn",(ctx)=>{
  if (ctx.from.id !== config.ADMIN_ID) return;

  ctx.reply("Select VPN",
Markup.inlineKeyboard([
[Markup.button.callback("Nord","sv_nord"),
Markup.button.callback("Express","sv_express")],
[Markup.button.callback("HMA","sv_hma"),
Markup.button.callback("Sharf","sv_sharf")]
])
);
});

const vpnState = {};

bot.action(/sv_(.+)/,(ctx)=>{
  vpnState[ctx.from.id]={vpn:ctx.match[1]};
  ctx.reply("Select Day",
Markup.inlineKeyboard([
[Markup.button.callback("7","svd_7"),
Markup.button.callback("30","svd_30")]
])
);
});

bot.action(/svd_(.+)/,(ctx)=>{
  vpnState[ctx.from.id].day=ctx.match[1];
  vpnState[ctx.from.id].step="gmail";
  ctx.reply("Send Gmail:");
});

bot.on("text",(ctx)=>{
  const db = loadDB();
  const vs = vpnState[ctx.from.id];

  if (!vs) return;

  if (vs.step==="gmail"){
    vs.gmail=ctx.message.text;
    vs.step="pass";
    return ctx.reply("Send Password:");
  }

  if (vs.step==="pass"){
    vs.pass=ctx.message.text;
    vs.step="key";
    return ctx.reply("Send Key:");
  }

  if (vs.step==="key"){
    vs.key=ctx.message.text;

    if (!db.vpndata[vs.vpn]) db.vpndata[vs.vpn]={};
    db.vpndata[vs.vpn][vs.day]={
      gmail:vs.gmail,
      pass:vs.pass,
      key:vs.key
    };

    saveDB(db);
    delete vpnState[ctx.from.id];

    return ctx.reply("✅ VPN Set Done");
  }
});

/* ================= JOIN BUTTON ================= */
bot.action("check_join", async (ctx)=>{
  if (!(await isJoined(ctx))) return forceJoin(ctx);
  showVPN(ctx);
});

bot.launch();
console.log("🚀 Bot Running");
