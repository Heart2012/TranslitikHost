const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required. Set it in environment variables.');
}

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err, ctx) => {
  console.error(`Bot error for update ${ctx.update.update_id}:`, err);
});

const userSettings = new Map();
const MAX_VARIANTS = 50;
const UKRAINIAN_LETTERS = new Set(['і', 'ї', 'є', 'ґ']);

const translitMap = {
  'а':'a',
  'б':'b',
  'в':'v',
  'г':'g',
  'ґ':'g',
  'д':'d',
  'е':'e',
  'є':'ye',
  'ё':'e',
  'ж':'zh',
  'з':'z',
  'и':'i',
  'і':'i',
  'ї':'yi',
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
  'ъ':'',
  '’':'',
  '\'':''
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

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getUkrainianLetters(text) {
  const found = new Set();

  for (const ch of text.toLowerCase()) {
    if (UKRAINIAN_LETTERS.has(ch)) {
      found.add(ch);
    }
  }

  return [...found];
}

function toUsernameTitleCase(username) {
  return username.replace(
    /(^|_)([a-z])/g,
    (_, separator, letter) => separator + letter.toUpperCase()
  );
}

async function checkUsernameAvailability(username) {
  try {
    await bot.telegram.getChat(`@${username}`);
    return '❌ зайнят';
  } catch (err) {
    const description = err?.response?.description || err?.description || err?.message || '';

    if (/chat not found/i.test(description)) {
      return '✅ вільний';
    }

    console.error(`Failed to check @${username}:`, err);
    return '? не проверено';
  }
}

function countTelegramKeys(text) {
  const words = text
    .toLowerCase()
    .split(/[\s_.\-:;,/\\|•]+/)
    .filter(Boolean);

  const shortWords = words.filter(word => /^[a-zа-яіїєґ]{2}$/iu.test(word)).length;
  const longKeys = words.filter(word =>
    word.length >= 3 || /^[a-zа-яіїєґ]{2}\d+$/iu.test(word)
  ).length;

  return longKeys + Math.floor(shortWords / 4);
}

function getHelpText(withBot) {
  return `🔎 Telegram Search Translit

Кожен рядок = окрема задача
Склеєний текст теж підтримується

Команди:
/bot - додавати bot
/nobot - без bot
/help - довідка

Поточний режим:
${withBot ? '✅ + bot' : '✅ без bot'}`;
}

// Каждое слово с большой буквы
function toTitleCase(text) {
  return text.replace(
    /(^|[\s_.\-:;,/\\|•]+)([а-яіїєґa-z])/giu,
    (_, separator, letter) => separator + letter.toUpperCase()
  );
}

// Разделение склеенного текста
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
  const ukrainian = getUkrainianLetters(lower);
  const keyCount = countTelegramKeys(lower);

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
    if (Object.prototype.hasOwnProperty.call(translitMap, ch)) {
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
    unknown: [...unknown],
    ukrainian,
    keyCount
  };
}

const commands = [
  { command: 'start', description: 'старт' },
  { command: 'bot', description: '+ bot' },
  { command: 'nobot', description: 'без bot' },
  { command: 'help', description: 'довідка' }
];

bot.start((ctx) => {
  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  ctx.reply(getHelpText(withBot), getKeyboard());
});

bot.command('help', (ctx) => {
  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  ctx.reply(getHelpText(withBot), getKeyboard());
});

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

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (!text) {
    return ctx.reply('🤔 Введи текст.', getKeyboard());
  }

  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  const lines = splitTasks(text);

  let finalMsg = '';

  for (const rawLine of lines) {
    const line = toTitleCase(rawLine);

    const result = telegramTranslit(line);

    const hasUnknown =
      result.unknown.length > 0;

    const hasMultiple =
      result.variants.length > 1;

    const hasUkrainian =
      result.ukrainian.length > 0;

    const hasTooManyKeys =
      result.keyCount > 5;

    let marks = [];

    if (hasUnknown) marks.push('⚠️');
    if (hasTooManyKeys) marks.push(`5️⃣ ${result.keyCount} ключей`);
    if (hasMultiple) marks.push('🔀');

    finalMsg += `<u>${escapeHtml(line)}</u>`;

    if (marks.length) {
      finalMsg += ` ${marks.join(' ')}`;
    }

    finalMsg += '\n';

    const usernameMarks = hasUkrainian
      ? ` 🇺🇦 ${result.ukrainian.join(', ')}`
      : '';

    for (const v of result.variants) {
      const username = toUsernameTitleCase(v);
      const finalUsername = withBot
        ? `${username}bot`
        : username;
      const availability = await checkUsernameAvailability(finalUsername);

      finalMsg += `@${finalUsername}${usernameMarks} | ${availability}\n`;
    }

    finalMsg += '\n';
  }

  if (finalMsg.length > 4000) {
    finalMsg =
      finalMsg.slice(0, 3900) +
      '\n\n⚡ Показано частину результатів';
  }

  ctx.reply(finalMsg.trim(), {
    parse_mode: 'HTML',
    ...getKeyboard()
  });
});

async function startBot() {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.telegram.setMyCommands(commands);
  await bot.launch();

  console.log('Telegram Search Bot started');
}

startBot().catch((err) => {
  console.error('Failed to start Telegram bot:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
