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
      deposits: {}
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* ================= JOIN ================= */
async function isJoined(ctx) {
  try {
    const res = await bot.telegram.getChatMember("@Global_Method_Channel", ctx.from.id);
    return ["member","administrator","creator"].includes(res.status);
  } catch {
    return false;
  }
}

async function forceJoin(ctx){
  if (!(await isJoined(ctx))){
    await ctx.reply(
`🚫 Access Denied!

📢 Bot ব্যবহার করতে হলে আগে চ্যানেলে জয়েন করুন 👇`,
Markup.inlineKeyboard([
[Markup.button.url("📢 Join Channel","https://t.me/Global_Method_Channel")],
[Markup.button.callback("✅ Joined","check_join")]
])
    );
    return false;
  }
  return true;
}

/* ================= STATES ================= */
const userSelect = {};
const depositState = {};
const setPriceState = {};
const vpnState = {};
const rejectState = {};

/* ================= START ================= */
bot.start(async (ctx)=>{
  if (!(await forceJoin(ctx))) return;
  return showVPN(ctx);
});

/* ================= VPN UI ================= */
function showVPN(ctx){
  ctx.reply(
"🌐 Select VPN:",
Markup.inlineKeyboard([
[
Markup.button.callback("Nord VPN","vpn_nord"),
Markup.button.callback("Express VPN","vpn_express")
],
[
Markup.button.callback("HMA VPN","vpn_hma"),
Markup.button.callback("Sharf VPN","vpn_sharf")
]
])
);
}

/* ================= SELECT VPN ================= */
bot.action(/vpn_(.+)/, async (ctx)=>{
  if (!(await forceJoin(ctx))) return;

  userSelect[ctx.from.id] = { vpn: ctx.match[1] };

  ctx.reply("📅 Select Duration:",
Markup.inlineKeyboard([
[
Markup.button.callback("7 Day","day_7"),
Markup.button.callback("30 Day","day_30")
]
])
);
});

/* ================= DAY ================= */
bot.action(/day_(.+)/, (ctx)=>{
  const db = loadDB();
  const u = userSelect[ctx.from.id];
  if (!u) return;

  u.day = ctx.match[1];
  const price = db.prices[u.vpn]?.[u.day] || "Not Set";

  ctx.reply(
`💰 Price: ${price}

💳 Choose Payment`,
Markup.inlineKeyboard([
[
Markup.button.callback("💰 Balance","pay_balance"),
Markup.button.callback("💳 Manual","pay_manual")
]
])
);
});

/* ================= BALANCE ================= */
bot.command("balance", async (ctx)=>{
  if (!(await forceJoin(ctx))) return;

  const db = loadDB();
  const u = db.users[ctx.from.id] || { balance: 0 };

  ctx.reply(`💰 Balance: ${u.balance}`);
});

/* ================= BUY WITH BALANCE ================= */
bot.action("pay_balance", async (ctx)=>{
  const db = loadDB();
  const id = ctx.from.id;
  const u = userSelect[id];
  if (!u) return;

  const price = db.prices[u.vpn]?.[u.day];
  if (!price) return ctx.reply("❌ Price not set");

  if (!db.users[id]) db.users[id] = { balance: 0 };

  if (db.users[id].balance < price){
    return ctx.reply("❌ Not enough balance");
  }

  db.users[id].balance -= price;

  const data = db.vpndata[u.vpn]?.[u.day];

  if (data){
    saveDB(db);
    return ctx.reply(
`🎉 Order Delivered

VPN: ${u.vpn}
📧 Gmail: ${data.gmail}
🔑 Pass: ${data.pass}
🔐 Key: ${data.key}`
    );
  }

  saveDB(db);
  ctx.reply("❌ VPN not set by admin");
});

/* ================= MANUAL ================= */
bot.action("pay_manual",(ctx)=>{
  ctx.reply(
"💳 Select Method",
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

bot.action(/m_(.+)/,(ctx)=>{
  let msg="";
  if (ctx.match[1]==="bkash") msg="📱 01890XXXXXX";
  if (ctx.match[1]==="nagad") msg="📱 01911XXXXXX";
  if (ctx.match[1]==="binance") msg="💰 985568941";

  ctx.reply(`Send Payment:\n${msg}\n\nThen send proof`);
});

/* ================= DEPOSIT ================= */
bot.command("deposit", async (ctx)=>{
  if (!(await forceJoin(ctx))) return;

  ctx.reply(
"💰 Select Method",
Markup.inlineKeyboard([
[
Markup.button.callback("BKash","d_bkash"),
Markup.button.callback("Nagad","d_nagad")
],
[
Markup.button.callback("Binance","d_binance")
]
])
);
});

bot.action(/d_(.+)/,(ctx)=>{
  let number="";
  if (ctx.match[1]==="bkash") number="01890XXXXXX";
  if (ctx.match[1]==="nagad") number="01911XXXXXX";
  if (ctx.match[1]==="binance") number="985568941";

  depositState[ctx.from.id] = { step:"amount", method:ctx.match[1], number };

  ctx.reply(`💳 ${number}\n\nEnter Amount:`);
});

/* ================= TEXT ================= */
bot.on("text", async (ctx)=>{
  const db = loadDB();
  const id = ctx.from.id;

  /* SET PRICE ONLY */
  if (setPriceState[id]){
    const s = setPriceState[id];

    if (!db.prices[s.vpn]) db.prices[s.vpn]={};
    db.prices[s.vpn][s.day] = Number(ctx.message.text);

    saveDB(db);
    delete setPriceState[id];

    return ctx.reply("✅ Price Set Done");
  }

  /* SET VPN ONLY */
  if (vpnState[id]){
    const v = vpnState[id];

    if (v.step==="gmail"){ v.gmail=ctx.message.text; v.step="pass"; return ctx.reply("Send Password"); }
    if (v.step==="pass"){ v.pass=ctx.message.text; v.step="key"; return ctx.reply("Send Key"); }

    if (v.step==="key"){
      if (!db.vpndata[v.vpn]) db.vpndata[v.vpn]={};
      db.vpndata[v.vpn][v.day] = {
        gmail:v.gmail,
        pass:v.pass,
        key:ctx.message.text
      };

      saveDB(db);
      delete vpnState[id];

      return ctx.reply("✅ VPN Saved Successfully");
    }
  }

  /* DEPOSIT FLOW */
  if (depositState[id]){
    const d = depositState[id];

    if (d.step==="amount"){
      d.amount = Number(ctx.message.text);
      d.step="proof";
      return ctx.reply("📤 Send Payment Proof");
    }

    if (d.step==="proof"){
      const did = Date.now();

      db.deposits[did] = {
        userId:id,
        amount:d.amount,
        method:d.method,
        proof:ctx.message.text
      };

      saveDB(db);
      delete depositState[id];

      await bot.telegram.sendMessage(
        config.ADMIN_ID,
`💰 Deposit Request

User: ${id}
Amount: ${d.amount}
Method: ${d.method}`,
Markup.inlineKeyboard([
[
Markup.button.callback("✅ Approve",`dep_appr_${did}`),
Markup.button.callback("❌ Reject",`dep_rej_${did}`)
]
])
      );

      return ctx.reply("⏳ Request sent to admin");
    }
  }

  /* REJECT REASON */
  if (rejectState[id]){
    const data = rejectState[id];

    await bot.telegram.sendMessage(
      data.userId,
`❌ Rejected

Reason: ${ctx.message.text}`
    );

    delete rejectState[id];
    return ctx.reply("Done");
  }
});

/* ================= ADMIN ================= */
bot.command("setprice",(ctx)=>{
  if (ctx.from.id !== config.ADMIN_ID) return;

  ctx.reply("Select VPN",
Markup.inlineKeyboard([
[Markup.button.callback("Nord","sp_nord"),Markup.button.callback("Express","sp_express")],
[Markup.button.callback("HMA","sp_hma"),Markup.button.callback("Sharf","sp_sharf")]
])
);
});

bot.action(/sp_(.+)/,(ctx)=>{
  setPriceState[ctx.from.id]={vpn:ctx.match[1]};
  ctx.reply("Select Day",
Markup.inlineKeyboard([
[Markup.button.callback("7","spd_7"),Markup.button.callback("30","spd_30")]
])
);
});

bot.action(/spd_(.+)/,(ctx)=>{
  setPriceState[ctx.from.id].day=ctx.match[1];
  ctx.reply("Enter Price:");
});

bot.command("setvpn",(ctx)=>{
  if (ctx.from.id !== config.ADMIN_ID) return;

  ctx.reply("Select VPN",
Markup.inlineKeyboard([
[Markup.button.callback("Nord","sv_nord"),Markup.button.callback("Express","sv_express")],
[Markup.button.callback("HMA","sv_hma"),Markup.button.callback("Sharf","sv_sharf")]
])
);
});

bot.action(/sv_(.+)/,(ctx)=>{
  vpnState[ctx.from.id]={vpn:ctx.match[1]};
  ctx.reply("Select Day",
Markup.inlineKeyboard([
[Markup.button.callback("7","svd_7"),Markup.button.callback("30","svd_30")]
])
);
});

bot.action(/svd_(.+)/,(ctx)=>{
  vpnState[ctx.from.id].day=ctx.match[1];
  vpnState[ctx.from.id].step="gmail";
  ctx.reply("Send Gmail:");
});

/* ================= APPROVE ================= */
bot.action(/dep_appr_(.+)/,(ctx)=>{
  const db=loadDB();
  const dep=db.deposits[ctx.match[1]];
  if (!dep) return;

  if (!db.users[dep.userId]) db.users[dep.userId]={balance:0};
  db.users[dep.userId].balance += dep.amount;

  saveDB(db);

  bot.telegram.sendMessage(dep.userId,"✅ Balance Added");
});

/* ================= REJECT ================= */
bot.action(/dep_rej_(.+)/,(ctx)=>{
  const db=loadDB();
  const dep=db.deposits[ctx.match[1]];
  if (!dep) return;

  rejectState[ctx.from.id]={userId:dep.userId};
  ctx.reply("Write reject reason:");
});

/* ================= JOIN BTN ================= */
bot.action("check_join", async (ctx)=>{
  if (!(await isJoined(ctx))) return forceJoin(ctx);
  showVPN(ctx);
});

bot.launch();
console.log("🚀 Bot Running");
