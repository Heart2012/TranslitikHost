const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

const translitMap = {
  'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh',
  'з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n',
  'о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
  'ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia',
  'А':'a','Б':'b','В':'v','Г':'h','Ґ':'g','Д':'d','Е':'e','Є':'ie','Ж':'zh',
  'З':'z','И':'y','І':'i','Ї':'i','Й':'i','К':'k','Л':'l','М':'m','Н':'n',
  'О':'o','П':'p','Р':'r','С':'s','Т':'t','У':'u','Ф':'f','Х':'kh','Ц':'ts',
  'Ч':'ch','Ш':'sh','Щ':'shch','Ь':'','Ю':'iu','Я':'ia'
};

function transliterate(text) {
  let result = [...text]
    .map(ch => translitMap[ch] ?? ch)
    .join('');

  result = result
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  return result;
}

bot.start((ctx) => {
  ctx.reply(
    '👋 Привіт! Надішли слово українською — я зроблю транслітерацію як у пошуку Telegram. nновини → noviny'
  );
});

bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return ctx.reply('Введи текст.');
  ctx.reply(transliterate(text));
});

bot.launch();

console.log('Bot started');
