const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// настройки пользователей
const userSettings = new Map();

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
  const original = text.toLowerCase();
  let textWork = original;

  const unknown = new Set();
  const unknownChars = [];

  // кс = x
  textWork = textWork.replace(/кс/g, '§');

  let variants = [''];

  for (let i = 0; i < textWork.length; i++) {
    const ch = textWork[i];

    // кс=x
    if (ch === '§') {
      variants = variants.map(v => v + 'x');
      continue;
    }

    // пробел
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
      const isLast = i === textWork.length - 1;

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
      const isLast = i === textWork.length - 1;

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

    // словарь
    if (translitMap.hasOwnProperty(ch)) {
      variants = variants.map(v => v + translitMap[ch]);
      continue;
    }

    // латиница и цифры
    if (/[a-z0-9]/.test(ch)) {
      variants = variants.map(v => v + ch);
      continue;
    }

    // неизвестный символ
    unknown.add(ch);
    unknownChars.push(ch);
  }

  variants = variants.map(v =>
    v
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
  );

  variants = [...new Set(variants)];

  // подсветка в слове
  let highlighted = text;

  for (const ch of [...unknown]) {
    highlighted = highlighted.replaceAll(ch, `[${ch}]`);
  }

  return {
    variants,
    unknown: [...unknown],
    highlighted
  };
}

bot.start((ctx) => {
  ctx.reply(
`🔎 Telegram Search Translit

Кожен рядок = окрема задача
Один результат одним повідомленням

⚙️ /settings — налаштування`
  );
});

// настройки
bot.command('settings', (ctx) => {
  const userId = ctx.from.id;
  const withBot = userSettings.get(userId)?.withBot || false;

  ctx.reply(
    '⚙️ Налаштування',
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          `${!withBot ? '✅' : '⬜'} Без bot`,
          'mode_nobot'
        ),
        Markup.button.callback(
          `${withBot ? '✅' : '⬜'} bot в кінці`,
          'mode_bot'
        )
      ]
    ])
  );
});

bot.action('mode_nobot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: false });
  ctx.answerCbQuery('Без bot');
  ctx.editMessageReplyMarkup({
    inline_keyboard: [
      [
        { text: '✅ Без bot', callback_data: 'mode_nobot' },
        { text: '⬜ bot в кінці', callback_data: 'mode_bot' }
      ]
    ]
  });
});

bot.action('mode_bot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: true });
  ctx.answerCbQuery('bot в кінці');
  ctx.editMessageReplyMarkup({
    inline_keyboard: [
      [
        { text: '⬜ Без bot', callback_data: 'mode_nobot' },
        { text: '✅ bot в кінці', callback_data: 'mode_bot' }
      ]
    ]
  });
});

bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();

  if (!text) {
    return ctx.reply('🤔 Введи текст.');
  }

  const userId = ctx.from.id;
  const withBot = userSettings.get(userId)?.withBot || false;

  const lines = text
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);

  let finalMsg = '';

  for (const line of lines) {
    const result = telegramTranslit(line);

    if (result.unknown.length) {
      finalMsg += `${result.highlighted}   ⚠️ ${result.unknown.join(' ')}\n`;
    }

    result.variants.forEach(v => {
      finalMsg += `${v}\n`;

      if (withBot) {
        finalMsg += `${v}bot\n`;
      }
    });

    finalMsg += '\n';
  }

  ctx.reply(finalMsg.trim());
});

bot.launch();

console.log('Telegram Search Bot started');
