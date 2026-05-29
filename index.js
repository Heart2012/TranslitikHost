const { Telegraf, Markup } = require('telegraf');
const https = require('https');

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
const MAX_USERNAME_LENGTH = 32;
const UA_MARK = '🔅';
const UKRAINIAN_LETTERS = new Set(['і', 'ї', 'є', 'ґ']);

const translitMap = {
  'а':'a','б':'b','в':'v','г':'g','ґ':'g','д':'d','е':'e',
  'є':'ye','ё':'e','ж':'zh','з':'z','и':'i','і':'i',
  'ї':'yi','к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
  'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
  'ы':'y','э':'e','ю':'yu','я':'ya',
  'ь':'','ъ':'','’':'','\'':''
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
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
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
    (_, sep, letter) => sep + letter.toUpperCase()
  );
}

function normalizeUsername(username) {
  return username
    .replace(/[^a-z0-9_]/gi,'_')
    .replace(/_+/g,'_')
    .replace(/^_+|_+$/g,'');
}

function normalizeDisplayUsername(username) {
  return username
    .replace(new RegExp(`[^a-z0-9_${UA_MARK}]`, 'giu'),'_')
    .replace(/_+/g,'_')
    .replace(/^_+|_+$/g,'');
}

function getUkrainianWarning(letters) {
  if (!letters.length) return '';

  return `⚠️ UA-символы: ${letters.map(v => v.toUpperCase()).join(', ')} → ${UA_MARK}`;
}

function checkUsernameOnTelegramWeb(username) {
  return new Promise((resolve) => {
    let settled = false;

    const done = (status) => {
      if (!settled) {
        settled = true;
        resolve(status);
      }
    };

    const req = https.get(
      `https://t.me/${encodeURIComponent(username)}`,
      (res) => {

        const location = res.headers.location || '';

        if ([301,302,303,307,308].includes(res.statusCode)) {
          done(location.includes('telegram.org') ? '✅ вільно' : null);
          res.resume();
          return;
        }

        let html = '';

        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          html += chunk;

          if (html.length > 50000) {
            res.destroy();
            done(null);
            return;
          }
        });

        res.on('end', () => {
          const isProfilePage =
            res.statusCode === 200 &&
            /class="tgme_page_(title|extra)"/i.test(html);

          done(isProfilePage ? '❌ зайнято' : null);
        });

        res.on('error', () => done(null));
      }
    );

    req.setTimeout(4000, () => {
      req.destroy();
      done(null);
    });

    req.on('error', () => done(null));
  });
}

async function checkUsernameAvailability(username) {
  const webStatus =
    await checkUsernameOnTelegramWeb(username);

  if (webStatus) {
    return webStatus;
  }

  try {
    await bot.telegram.getChat(`@${username}`);
    return '❌ зайнято';
  } catch (err) {
    const description =
      err?.response?.description ||
      err?.description ||
      err?.message ||
      '';

    if (/chat not found/i.test(description)) {
      return '✅ вільно';
    }

    console.error(`Failed check @${username}`, err);
    return '? не проверено';
  }
}

function countTelegramKeys(text) {
  const words = text
    .toLowerCase()
    .split(/[\s_.\-:;,/\\|•]+/)
    .filter(Boolean);

  const shortWords =
    words.filter(v =>
      /^[a-zа-яіїєґ]{2}$/iu.test(v)
    ).length;

  const longKeys =
    words.filter(v =>
      v.length >= 3 ||
      /^[a-zа-яіїєґ]{2}\d+$/iu.test(v)
    ).length;

  return longKeys + Math.floor(shortWords / 4);
}

function getHelpText(withBot) {
  return `🔎 Telegram Search Translit

Кожен рядок = окрема задача

Команди:
/bot
/nobot
/help

Поточний режим:
${withBot ? '✅ + bot' : '🚫 - bot'}`;
}

function toTitleCase(text) {
  return text.replace(
    /(^|[\s_.\-:;,/\\|•]+)([а-яіїєґa-z])/giu,
    (_, sep, letter) => sep + letter.toUpperCase()
  );
}

function splitTasks(text) {
  return text
    .replace(/Новини(?=[А-ЯІЇЄҐ])/g,'Новини\n')
    .replace(/Лева(?=[А-ЯІЇЄҐ])/g,'Лева\n')
    .replace(/•\s*Новини/gi,'• Новини\n')
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);
}

function telegramTranslit(text) {

  let lower = text.trim().toLowerCase();

  const unknown = new Set();
  const ukrainian = getUkrainianLetters(lower);
  const keyCount = countTelegramKeys(lower);
  const hasKsRule = /кс/.test(lower);

  lower = lower.replace(/[|•\-:;,/\\]+/g,' ');
  lower = lower.replace(/кс/g,'§');

  let variants = [{ value:'', display:'' }];

  for (let i=0;i<lower.length;i++) {

    const ch = lower[i];

    if (ch === '§') {
      variants = limitVariants(
        variants.map(v => ({
          value: v.value + 'x',
          display: v.display + 'x'
        }))
      );
      continue;
    }

    if (/\s/.test(ch)) {
      variants = limitVariants(
        variants.map(v => ({
          value: v.value + '_',
          display: v.display + '_'
        }))
      );
      continue;
    }

    if (ch === 'й') {

      let next = [];

      for (const v of variants) {
        next.push({
          value: v.value + 'y',
          display: v.display + 'y'
        });

        next.push({
          value: v.value + 'i',
          display: v.display + 'i'
        });
      }

      variants = limitVariants(next);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(translitMap, ch)) {

      const value = translitMap[ch];
      const display =
        UKRAINIAN_LETTERS.has(ch)
          ? UA_MARK
          : value;

      variants = limitVariants(
        variants.map(v => ({
          value: v.value + value,
          display: v.display + display
        }))
      );

      continue;
    }

    if (/[a-z0-9]/.test(ch)) {
      variants = limitVariants(
        variants.map(v => ({
          value: v.value + ch,
          display: v.display + ch
        }))
      );
      continue;
    }

    unknown.add(ch);
  }

  variants = variants.map(v => ({
    value: v.value
      .replace(/_+/g,'_')
      .replace(/^_+|_+$/g,'')
      .toLowerCase(),

    display: v.display
      .replace(/_+/g,'_')
      .replace(/^_+|_+$/g,'')
      .toLowerCase()
  }));

  const seen = new Set();

  variants = variants.filter(v => {
    if (seen.has(v.value)) return false;
    seen.add(v.value);
    return true;
  });

  return {
    variants: variants.map(v => v.value),
    displayVariants: variants.map(v => v.display),
    primaryVariant: variants[0]?.value || '',
    unknown:[...unknown],
    ukrainian,
    keyCount,
    hasKsRule
  };
}

const commands = [
  { command:'start', description:'старт' },
  { command:'bot', description:'+ bot' },
  { command:'nobot', description:'без bot' },
  { command:'help', description:'довідка' }
];

bot.start(ctx => {
  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  ctx.reply(getHelpText(withBot), getKeyboard());
});

bot.command('help', ctx => {
  const withBot =
    userSettings.get(ctx.from.id)?.withBot || false;

  ctx.reply(getHelpText(withBot), getKeyboard());
});

bot.command('bot', ctx => {
  userSettings.set(ctx.from.id,{ withBot:true });
  ctx.reply('Режим: ✅ bot', getKeyboard());
});

bot.command('nobot', ctx => {
  userSettings.set(ctx.from.id,{ withBot:false });
  ctx.reply('Режим: 🚫 bot', getKeyboard());
});

bot.hears('➕ bot', ctx => {
  userSettings.set(ctx.from.id,{ withBot:true });
  ctx.reply('Режим: ✅ bot', getKeyboard());
});

bot.hears('🚫 bot', ctx => {
  userSettings.set(ctx.from.id,{ withBot:false });
  ctx.reply('Режим: 🚫 bot', getKeyboard());
});

bot.on('text', async (ctx) => {

  const waitMsg =
    await ctx.reply('⏳ Перевіряю...', getKeyboard());

  try {

    const text =
      ctx.message.text.trim();

    const withBot =
      userSettings.get(ctx.from.id)?.withBot || false;

    const lines =
      splitTasks(text);

    let finalMsg = '';

    for (const rawLine of lines) {

      const line =
        toTitleCase(rawLine);

      const result =
        telegramTranslit(line);

      finalMsg += `<u>${escapeHtml(line)}</u>\n`;

      const checks =
        await Promise.all(
          result.variants.map(async (v, index) => {

            const username =
              withBot
                ? `${toUsernameTitleCase(normalizeUsername(v))}bot`
                : toUsernameTitleCase(normalizeUsername(v));

            const display =
              withBot
                ? `${toUsernameTitleCase(normalizeDisplayUsername(result.displayVariants[index]))}bot`
                : toUsernameTitleCase(normalizeDisplayUsername(result.displayVariants[index]));

            const availability =
              await checkUsernameAvailability(username);

            return `@${display} | ${availability}`;
          })
        );

      finalMsg += checks.join('\n');
      finalMsg += '\n\n';
    }

    if (finalMsg.length > 4000) {
      finalMsg =
        finalMsg.slice(0,3900) +
        '\n\n⚡ Показано частину';
    }

    await ctx.telegram.deleteMessage(
      ctx.chat.id,
      waitMsg.message_id
    );

    await ctx.reply(
      finalMsg.trim(),
      {
        parse_mode:'HTML',
        ...getKeyboard()
      }
    );

  } catch (err) {

    console.error(err);

    try {
      await ctx.reply(
        '⚠️ Помилка обробки'
      );
    } catch {}
  }

});

async function startBot() {
  await bot.telegram.deleteWebhook({
    drop_pending_updates:true
  });

  await bot.telegram.setMyCommands(commands);
  await bot.launch();

  console.log('Bot started');
}

startBot().catch(err => {
  console.error(err);
  process.exit(1);
});

process.once(
  'SIGINT',
  () => bot.stop('SIGINT')
);

process.once(
  'SIGTERM',
  () => bot.stop('SIGTERM')
);
