const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);
const DB_FILE = "./db.json";

/* ========= DB ========= */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: {},
      prices: {},
      vpns: {},
      orders: {}
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}
function saveDB(d) {
  fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
}

/* ========= DATA ========= */
const VPN = {
  nord: "Nord VPN",
  express: "Express VPN",
  hma: "HMA VPN",
  sharf: "Sharfshak VPN"
};

/* ========= STATE ========= */
const userState = {};
const adminSetPrice = {};
const adminSetVpn = {};

/* ========= JOIN ========= */
async function checkJoin(ctx) {
  try {
    const res = await bot.telegram.getChatMember("@Global_Method_Channel", ctx.from.id);
    return ["member","administrator","creator"].includes(res.status);
  } catch { return false; }
}
function joinMsg(ctx){
  return ctx.reply("❌ Join first", Markup.inlineKeyboard([
    [Markup.button.url("Join", "https://t.me/Global_Method_Channel")],
    [Markup.button.callback("Joined", "check")]
  ]));
}

/* ========= START ========= */
bot.start(async ctx=>{
  if(!(await checkJoin(ctx))) return joinMsg(ctx);
  return showVPN(ctx);
});

/* ========= VPN LIST ========= */
function showVPN(ctx){
  return ctx.reply("🔐 Please Select your VPN",
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

/* ========= SELECT VPN ========= */
bot.action(/vpn_(.+)/, async ctx=>{
  if(!(await checkJoin(ctx))) return joinMsg(ctx);

  const key = ctx.match[1];
  userState[ctx.from.id] = { vpn:key };

  ctx.reply("⏳ Select duration",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("7 Day",`day_${key}_7`),
        Markup.button.callback("30 Day",`day_${key}_30`)
      ]
    ])
  );
});

/* ========= SELECT DAY ========= */
bot.action(/day_(.+)_(.+)/, ctx=>{
  const db = loadDB();
  const vpn = ctx.match[1];
  const day = ctx.match[2];

  const price = db.prices?.[vpn]?.[day] || 0;

  userState[ctx.from.id] = { vpn, day, price };

  ctx.reply(`💰 Price: $${price}\nChoose payment`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Main Balance","pay_balance"),
        Markup.button.callback("Manual","pay_manual")
      ]
    ])
  );
});

/* ========= BALANCE PAY ========= */
bot.action("pay_balance", ctx=>{
  const db = loadDB();
  const u = db.users[ctx.from.id] || { balance:0 };
  const s = userState[ctx.from.id];

  if(u.balance < s.price){
    return ctx.reply("❌ Not enough balance");
  }

  u.balance -= s.price;
  db.users[ctx.from.id] = u;

  const id = Date.now();
  db.orders[id] = { user:ctx.from.id, ...s };

  saveDB(db);

  bot.telegram.sendMessage(config.ADMIN_ID,
`🛒 Order

User: ${ctx.from.id}
VPN: ${VPN[s.vpn]}
Day: ${s.day}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("Approve",`ok_${id}`)]
    ])
  );

  ctx.reply("✅ Order sent to admin");
});

/* ========= MANUAL ========= */
bot.action("pay_manual", ctx=>{
  ctx.reply("💳 Select method",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("BKash","m_bkash"),
        Markup.button.callback("Nagad","m_nagad")
      ],
      [
        Markup.button.callback("Binance","m_binance"),
        Markup.button.url("Support","https://t.me/Smart_Method_Owner")
      ]
    ])
  );
});

/* ========= METHOD ========= */
bot.action(/m_(.+)/, ctx=>{
  const method = ctx.match[1];
  const s = userState[ctx.from.id];

  let num = "";
  if(method==="bkash") num="01890XXXXXX";
  if(method==="nagad") num="01911XXXXXX";
  if(method==="binance") num="ID:985568941";

  userState[ctx.from.id].method = method;
  userState[ctx.from.id].step = "proof";

  ctx.reply(
`💳 ${method.toUpperCase()}
Send $${s.price} to:
${num}

Send proof after payment`
  );
});

/* ========= PROOF ========= */
bot.on("text", ctx=>{
  const db = loadDB();
  const s = userState[ctx.from.id];

  if(!s || s.step!=="proof") return;

  const id = Date.now();

  db.orders[id] = {
    user: ctx.from.id,
    ...s,
    proof: ctx.message.text
  };

  saveDB(db);

  bot.telegram.sendMessage(config.ADMIN_ID,
`🛒 Manual Order

User:${ctx.from.id}
VPN:${VPN[s.vpn]}
Day:${s.day}
Proof:${ctx.message.text}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("Approve",`ok_${id}`)]
    ])
  );

  delete userState[ctx.from.id];

  ctx.reply("✅ Order sent, wait admin");
});

/* ========= APPROVE ========= */
bot.action(/ok_(.+)/, ctx=>{
  if(ctx.from.id!=config.ADMIN_ID) return;

  const id = ctx.match[1];
  const db = loadDB();
  const order = db.orders[id];

  const data = db.vpns?.[order.vpn]?.[order.day];

  bot.telegram.sendMessage(order.user,
`🎉 Order Delivered

VPN: ${VPN[order.vpn]}
📧 Gmail: ${data?.gmail}
🔑 Pass: ${data?.pass}
🔐 Key: ${data?.key}`
  );

  ctx.editMessageText("Done");
});

/* ========= SET PRICE ========= */
bot.command("setprice", ctx=>{
  if(ctx.from.id!=config.ADMIN_ID) return;

  ctx.reply("Select VPN",
    Markup.inlineKeyboard([
      [Markup.button.callback("Nord","sp_nord"),Markup.button.callback("Express","sp_express")],
      [Markup.button.callback("HMA","sp_hma"),Markup.button.callback("Sharf","sp_sharf")]
    ])
  );
});

bot.action(/sp_(.+)/, ctx=>{
  adminSetPrice[ctx.from.id] = { vpn: ctx.match[1] };

  ctx.reply("Select day",
    Markup.inlineKeyboard([
      [Markup.button.callback("7","spd_7"),Markup.button.callback("30","spd_30")]
    ])
  );
});

bot.action(/spd_(.+)/, ctx=>{
  adminSetPrice[ctx.from.id].day = ctx.match[1];
  adminSetPrice[ctx.from.id].step="price";

  ctx.reply("Enter price:");
});

bot.on("text", ctx=>{
  const db = loadDB();

  /* SET PRICE */
  if(adminSetPrice[ctx.from.id]?.step==="price"){
    const s = adminSetPrice[ctx.from.id];

    if(!db.prices[s.vpn]) db.prices[s.vpn]={};
    db.prices[s.vpn][s.day] = Number(ctx.message.text);

    saveDB(db);
    delete adminSetPrice[ctx.from.id];

    return ctx.reply("✅ Price Set");
  }

  /* SET VPN */
  if(adminSetVpn[ctx.from.id]){
    const s = adminSetVpn[ctx.from.id];

    if(s.step==="gmail"){
      s.gmail = ctx.message.text;
      s.step="pass";
      return ctx.reply("Password:");
    }
    if(s.step==="pass"){
      s.pass = ctx.message.text;
      s.step="key";
      return ctx.reply("Login Key:");
    }
    if(s.step==="key"){
      const db = loadDB();

      if(!db.vpns[s.vpn]) db.vpns[s.vpn]={};
      db.vpns[s.vpn][s.day] = {
        gmail:s.gmail,
        pass:s.pass,
        key:ctx.message.text
      };

      saveDB(db);
      delete adminSetVpn[ctx.from.id];

      return ctx.reply("✅ VPN Set Done");
    }
  }
});

/* ========= SET VPN ========= */
bot.command("setvpn", ctx=>{
  if(ctx.from.id!=config.ADMIN_ID) return;

  ctx.reply("Select VPN",
    Markup.inlineKeyboard([
      [Markup.button.callback("Nord","sv_nord"),Markup.button.callback("Express","sv_express")],
      [Markup.button.callback("HMA","sv_hma"),Markup.button.callback("Sharf","sv_sharf")]
    ])
  );
});

bot.action(/sv_(.+)/, ctx=>{
  adminSetVpn[ctx.from.id] = { vpn:ctx.match[1] };

  ctx.reply("Select day",
    Markup.inlineKeyboard([
      [Markup.button.callback("7","svd_7"),Markup.button.callback("30","svd_30")]
    ])
  );
});

bot.action(/svd_(.+)/, ctx=>{
  adminSetVpn[ctx.from.id].day = ctx.match[1];
  adminSetVpn[ctx.from.id].step="gmail";

  ctx.reply("Send Gmail:");
});

/* ========= JOIN BTN ========= */
bot.action("check", async ctx=>{
  if(!(await checkJoin(ctx))) return joinMsg(ctx);
  showVPN(ctx);
});

bot.launch();
console.log("🔥 VPN BOT READY");
