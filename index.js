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

// нижние кнопки + сохранение меню
function getKeyboard() {
  return Markup.keyboard([
    ['➕ bot', '🚫 bot']
  ])
    .resize()
    .persistent();
}

function telegramTranslit(text) {
  const original = text.trim();
  let lower = original.toLowerCase();

  const unknown = new Set();

  // удалить разделители
  lower = lower.replace(/[|•\-:;,/\\]+/g, ' ');

  // кс=x
  lower = lower.replace(/кс/g, '§');

  let variants = [''];

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];

    // кс=x
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
      const isLast = i === lower.length - 1;

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
      const isLast = i === lower.length - 1;

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

    // неизвестные / укр символы
    unknown.add(ch);
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

// меню команд Telegram
bot.telegram.setMyCommands([
  { command: 'start', description: 'старт' },
  { command: 'bot', description: '+ bot' },
  { command: 'nobot', description: 'без bot' },
  { command: 'help', description: 'довідка' }
]);

bot.start((ctx) => {
  const withBot = userSettings.get(ctx.from.id)?.withBot || false;

  ctx.reply(
`🔎 Telegram Search Translit

Кожен рядок = окрема задача
Один результат одним повідомленням

Поточний режим:
${withBot ? '✅ + bot' : '✅ без bot'}`,
    getKeyboard()
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
`Команди:

/bot — тільки + bot
/nobot — тільки без bot

Кожен рядок = окрема задача`,
    getKeyboard()
  );
});

// команды
bot.command('bot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: true });
  ctx.reply('✅ Режим: + bot', getKeyboard());
});

bot.command('nobot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: false });
  ctx.reply('✅ Режим: без bot', getKeyboard());
});

// нижние кнопки
bot.hears('➕ bot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: true });
  ctx.reply('✅ Режим: + bot', getKeyboard());
});

bot.hears('🚫 bot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: false });
  ctx.reply('✅ Режим: без bot', getKeyboard());
});

bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();

  if (!text) {
    return ctx.reply('🤔 Введи текст.', getKeyboard());
  }

  const withBot = userSettings.get(ctx.from.id)?.withBot || false;

  const lines = text
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);

  let finalMsg = '';

  for (const line of lines) {
    const result = telegramTranslit(line);

    const hasUnknown = result.unknown.length > 0;
    const hasMultiple = result.variants.length > 1;

    let marks = [];

    if (hasUnknown) {
      marks.push('⚠️');
    }

    if (hasMultiple) {
      marks.push('🔀');
    }

    // верхняя строка как на скрине
    if (marks.length) {
      finalMsg += `__${line}__ ${marks.join(' ')}\n`;
    }

    // только +bot или только без bot
    result.variants.forEach(v => {
      finalMsg += withBot
        ? `${v}bot\n`
        : `${v}\n`;
    });

    finalMsg += '\n';
  }

  ctx.reply(finalMsg.trim(), {
    parse_mode: 'Markdown',
    ...getKeyboard()
  });
});

bot.launch();

console.log('Telegram Search Bot started');
