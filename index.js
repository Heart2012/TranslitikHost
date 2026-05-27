const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

const userSettings = new Map();
const MAX_VARIANTS = 50;

const translitMap = {
  'а':'a','б':'b','в':'v','г':'g','д':'d',
  'е':'e','ё':'e','ж':'zh','з':'z','и':'i',
  'к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u',
  'ф':'f','х':'kh','ц':'ts','ч':'ch',
  'ш':'sh','щ':'shch','ы':'y','э':'e',
  'ю':'yu','я':'ya','ь':'','ъ':''
};

function getKeyboard() {
  return Markup.keyboard([
    ['➕ bot', '🚫 bot']
  ])
    .resize()
    .persistent();
}

function limitVariants(arr) {
  return arr.length > MAX_VARIANTS
    ? arr.slice(0, MAX_VARIANTS)
    : arr;
}

// escape markdownV2
function escapeMd(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// разделение склеенного текста
function splitTasks(text) {
  return text
    .replace(/Новини(?=[А-ЯІЇЄҐ])/g, 'Новини\n')
    .replace(/Лева(?=[А-ЯІЇЄҐ])/g, 'Лева\n')
    .replace(/•\s*Новини/gi, '• Новини\n')
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);
}

function telegramTranslit(text) {
  let lower = text.trim().toLowerCase();

  const unknown = new Set();

  // удалить разделители
  lower = lower.replace(/[|•\-:;,/\\]+/g, ' ');

  // кс=x
  lower = lower.replace(/кс/g, '§');

  let variants = [''];

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];

    if (ch === '§') {
      variants = limitVariants(
        variants.map(v => v + 'x')
      );
      continue;
    }

    // пробел -> _
    if (/\s/.test(ch)) {
      variants = limitVariants(
        variants.map(v => v + '_')
      );
      continue;
    }

    // й = y / i
    if (ch === 'й') {
      let next = [];

      for (const v of variants) {
        next.push(v + 'y');
        next.push(v + 'i');
      }

      variants = limitVariants(next);
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

        variants = limitVariants(next);
      } else {
        variants = limitVariants(
          variants.map(v => v + 'i')
        );
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

        variants = limitVariants(next);
      } else {
        variants = limitVariants(
          variants.map(v => v + 'k')
        );
      }

      continue;
    }

    // словарь
    if (translitMap[ch]) {
      variants = limitVariants(
        variants.map(v => v + translitMap[ch])
      );
      continue;
    }

    // латиница / цифры
    if (/[a-z0-9]/.test(ch)) {
      variants = limitVariants(
        variants.map(v => v + ch)
      );
      continue;
    }

    // неизвестные / укр
    unknown.add(ch);
  }

  variants = variants.map(v =>
    v
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
  );

  variants = [...new Set(variants)];
  variants = limitVariants(variants);

  return {
    variants,
    unknown: [...unknown]
  };
}

// меню
bot.telegram.setMyCommands([
  { command: 'start', description: 'старт' },
  { command: 'bot', description: '+ bot' },
  { command: 'nobot', description: 'без bot' },
  { command: 'help', description: 'довідка' }
]);

bot.start((ctx) => {
  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  ctx.reply(
`🔎 Telegram Search Translit

Кожен рядок = окрема задача
Склеєний текст теж підтримується

Поточний режим:
${withBot ? '✅ + bot' : '✅ без bot'}`,
    getKeyboard()
  );
});

bot.command('bot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: true });
  ctx.reply('✅ Режим: + bot', getKeyboard());
});

bot.command('nobot', (ctx) => {
  userSettings.set(ctx.from.id, { withBot: false });
  ctx.reply('✅ Режим: без bot', getKeyboard());
});

// кнопки
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

  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  const lines = splitTasks(text);

  let finalMsg = '';

  for (const line of lines) {
    const result = telegramTranslit(line);

    const hasUnknown =
      result.unknown.length > 0;

    const hasMultiple =
      result.variants.length > 1;

    let marks = [];

    if (hasUnknown) marks.push('⚠️');
    if (hasMultiple) marks.push('🔀');

    // ПОДЧЁРКНУТОЕ исходное слово
    if (marks.length) {
      finalMsg += `__${escapeMd(line)}__ ${marks.join(' ')}\n`;
    }

    result.variants.forEach(v => {
      finalMsg += withBot
        ? `${escapeMd(v)}bot\n`
        : `${escapeMd(v)}\n`;
    });

    finalMsg += '\n';
  }

  if (finalMsg.length > 4000) {
    finalMsg =
      finalMsg.slice(0, 3900) +
      '\n\n⚡ Показано частину результатів';
  }

  ctx.reply(finalMsg.trim(), {
    parse_mode: 'MarkdownV2',
    ...getKeyboard()
  });
});

bot.launch();

console.log('Telegram Search Bot started');