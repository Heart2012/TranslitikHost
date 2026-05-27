const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

const translitMap = {
  'а':'a',
  'б':'b',
  'в':'v',
  'г':'g',
  'д':'d',
  'е':'e',
  'ё':'e',
  'ж':'zh',
  'з':'z',
  'и':'i',
  'к':'k',
  'л':'l',
  'м':'m',
  'н':'n',
  'о':'o',
  'п':'p',
  'р':'r',
  'с':'s',
  'т':'t',
  'у':'u',
  'ф':'f',
  'х':'kh',
  'ц':'ts',
  'ч':'ch',
  'ш':'sh',
  'щ':'shch',
  'ы':'y',
  'э':'e',
  'ю':'yu',
  'я':'ya',
  'ь':'',
  'ъ':''
};

function telegramTranslit(text) {
  text = text.toLowerCase();

  const unknown = new Set();

  // кс = x
  text = text.replace(/кс/g, '§');

  let variants = [''];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // placeholder для кс=x
    if (ch === '§') {
      variants = variants.map(v => v + 'x');
      continue;
    }

    // пробел -> _
    if (/\s/.test(ch)) {
      variants = variants.map(v => v + '_');
      continue;
    }

    // й = y / i
    if (ch === 'й') {
      let next = [];

      for (const v of variants) {
        next.push(v + 'y');
        next.push(v + 'i');
      }

      variants = next;
      continue;
    }

    // и = i / y если последняя
    if (ch === 'и') {
      const isLast = i === text.length - 1;

      if (isLast) {
        let next = [];

        for (const v of variants) {
          next.push(v + 'i');
          next.push(v + 'y');
        }

        variants = next;
      } else {
        variants = variants.map(v => v + 'i');
      }

      continue;
    }

    // к = k / x если последняя
    if (ch === 'к') {
      const isLast = i === text.length - 1;

      if (isLast) {
        let next = [];

        for (const v of variants) {
          next.push(v + 'k');
          next.push(v + 'x');
        }

        variants = next;
      } else {
        variants = variants.map(v => v + 'k');
      }

      continue;
    }

    // обычный словарь
    if (translitMap.hasOwnProperty(ch)) {
      variants = variants.map(v => v + translitMap[ch]);
      continue;
    }

    // латиница и цифры
    if (/[a-z0-9]/.test(ch)) {
      variants = variants.map(v => v + ch);
      continue;
    }

    // неизвестные символы
    if (!/[^\w\s]/.test(ch)) {
      unknown.add(ch);
    }
  }

  variants = variants.map(v =>
    v
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
  );

  variants = [...new Set(variants)];

  return {
    variants,
    unknown: [...unknown]
  };
}

bot.start((ctx) => {
  ctx.reply(
`🔎 Telegram Search Translit

Кожен рядок = окрема задача.

Приклад:
Штат
Завершено
Репозиторій
Розгорнуто`
  );
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (!text) {
    return ctx.reply('🤔 Введи текст.');
  }

  // каждая строка = отдельная задача
  const lines = text
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);

  for (const line of lines) {
    const result = telegramTranslit(line);

    let msg = '';

    if (result.unknown.length) {
      msg +=
`⚠️ Невідомі символи:
${result.unknown.join(' ')}

`;
    }

    msg += '🎯 Telegram username:\n\n';

    result.variants.forEach((v) => {
      msg += `${v}\n`;
    });

    await ctx.reply(msg);
  }
});

bot.launch();

console.log('Telegram Search Bot started');
